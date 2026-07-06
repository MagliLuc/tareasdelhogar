-- ============================================================
-- 0007: miembros pendientes, tipos de horario, salidas puntuales,
--       puntos por trabajo/estudio, lista de compras y tareas de
--       ejemplo.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Horarios con tipo y salidas puntuales
--    kind: work (trabajo) | study (estudio) | leisure (salida:
--          paseo/visitas — NO suma puntos pero sí marca ausencia)
--    Recurrente semanal → weekday (1-7); puntual → date.
-- ------------------------------------------------------------
alter table public.work_schedules
  add column if not exists kind text not null default 'work'
    check (kind in ('work', 'study', 'leisure')),
  add column if not exists date date;

alter table public.work_schedules alter column weekday drop not null;

alter table public.work_schedules add constraint work_schedules_weekday_or_date
  check ((weekday is not null and date is null) or (weekday is null and date is not null));

-- ------------------------------------------------------------
-- 2) Miembros pendientes: figuran en el hogar antes de registrarse
--    y al unirse la persona elige "soy tal" (hereda nombre y color)
-- ------------------------------------------------------------
create table public.pending_members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null,
  color         text not null default '#0D9488',
  claimed_by    uuid references public.profiles (id) on delete set null,
  claimed_at    timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.pending_members enable row level security;

create policy "household access" on public.pending_members for all
  using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

-- Vista previa del hogar ANTES de unirse (el que se une todavía no
-- es miembro, por eso security definer): nombre + pendientes sin reclamar
create or replace function public.preview_household(p_code text)
returns table (household_name text, pending jsonb)
language sql
stable
security definer set search_path = public
as $$
  select
    h.name,
    coalesce(
      jsonb_agg(jsonb_build_object('id', pm.id, 'name', pm.name, 'color', pm.color))
        filter (where pm.id is not null and pm.claimed_at is null),
      '[]'::jsonb
    )
  from households h
  left join pending_members pm on pm.household_id = h.id
  where h.invite_code = upper(trim(p_code))
  group by h.id, h.name;
$$;

-- join_household ahora acepta la identidad elegida y suma al nuevo
-- miembro a todas las rotaciones activas del hogar
drop function if exists public.join_household(text);

create or replace function public.join_household(
  p_code text,
  p_pending_member uuid default null
)
returns table (id uuid, name text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_id    uuid;
  v_name  text;
  v_color text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select h.id into v_id from households h where h.invite_code = upper(trim(p_code));
  if v_id is null then
    raise exception 'Código de invitación inválido';
  end if;

  update profiles set household_id = v_id where profiles.id = auth.uid();

  -- Reclamar identidad pendiente: hereda nombre y color
  if p_pending_member is not null then
    update pending_members pm
    set claimed_by = auth.uid(), claimed_at = now()
    where pm.id = p_pending_member and pm.household_id = v_id and pm.claimed_at is null
    returning pm.name, pm.color into v_name, v_color;

    if v_name is not null then
      update profiles set name = v_name, color = v_color where profiles.id = auth.uid();
    end if;
  end if;

  -- Sumarse a las rotaciones activas para participar del reparto
  insert into task_rotation_members (task_id, profile_id)
  select t.id, auth.uid()
  from tasks t
  where t.household_id = v_id and t.assignment_type = 'rotative' and t.active
  on conflict do nothing;

  return query select h.id, h.name from households h where h.id = v_id;
end;
$$;

-- ------------------------------------------------------------
-- 3) Reparto equitativo con los nuevos horarios:
--    * carga = tareas pendientes de la semana
--            + obligaciones (trabajo+estudio) de la semana / 4
--            + 240 si está ausente (por CUALQUIER motivo, salidas
--              incluidas) a la hora de vencimiento ese día
-- ------------------------------------------------------------
create or replace function public.pick_rotative_assignee(
  p_task_id  uuid,
  p_due_date date,
  p_due_time time
)
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select rm.profile_id
  from task_rotation_members rm
  left join lateral (
    select coalesce(sum(t.estimated_minutes), 0) as pending_minutes
    from task_instances ti
    join tasks t on t.id = ti.task_id
    where ti.assigned_to = rm.profile_id
      and ti.status = 'pending'
      and ti.due_at >= date_trunc('week', p_due_date::timestamptz)
      and ti.due_at <  date_trunc('week', p_due_date::timestamptz) + interval '7 days'
  ) carga on true
  left join lateral (
    select coalesce(sum(extract(epoch from (ws.end_time - ws.start_time)) / 60), 0) as oblig_minutes
    from work_schedules ws
    where ws.profile_id = rm.profile_id
      and ws.kind in ('work', 'study')
      and (
        ws.weekday is not null -- recurrente semanal
        or (ws.date >= date_trunc('week', p_due_date::timestamptz)::date
            and ws.date < date_trunc('week', p_due_date::timestamptz)::date + 7)
      )
  ) oblig on true
  left join lateral (
    select exists (
      select 1 from work_schedules ws
      where ws.profile_id = rm.profile_id
        and p_due_time between ws.start_time and ws.end_time
        and (ws.weekday = extract(isodow from p_due_date) or ws.date = p_due_date)
    ) as ausente
  ) disp on true
  where rm.task_id = p_task_id
  order by
    carga.pending_minutes
      + oblig.oblig_minutes / 4
      + case when disp.ausente then 240 else 0 end,
    random()
  limit 1;
$$;

-- ------------------------------------------------------------
-- 4) Puntos por trabajo/estudio: 1 punto por hora de obligación
--    del día anterior (las salidas de paseo NO suman). Corre a
--    diario por pg_cron; idempotente por índice único parcial.
-- ------------------------------------------------------------
alter table public.point_entries
  add column if not exists source text not null default 'task'
    check (source in ('task', 'schedule')),
  add column if not exists awarded_date date;

create unique index if not exists point_entries_schedule_uidx
  on public.point_entries (profile_id, awarded_date)
  where source = 'schedule';

create or replace function public.award_schedule_points()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_row   record;
  v_count int := 0;
begin
  for v_row in
    select
      p.id as profile_id,
      p.household_id,
      sum(extract(epoch from (ws.end_time - ws.start_time)) / 60) as minutes
    from profiles p
    join work_schedules ws on ws.profile_id = p.id
    where p.household_id is not null
      and ws.kind in ('work', 'study')
      and (
        (ws.date is null and ws.weekday = extract(isodow from current_date - 1))
        or ws.date = current_date - 1
      )
    group by p.id, p.household_id
  loop
    insert into point_entries (household_id, profile_id, points, source, awarded_date)
    values (
      v_row.household_id,
      v_row.profile_id,
      greatest(1, round(v_row.minutes / 60))::int,
      'schedule',
      current_date - 1
    )
    on conflict (profile_id, awarded_date) where source = 'schedule' do nothing;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

select cron.schedule(
  'puntos-por-obligaciones',
  '30 3 * * *',
  $$ select public.award_schedule_points() $$
);

-- ------------------------------------------------------------
-- 5) Lista de compras compartida (con Realtime)
-- ------------------------------------------------------------
create table public.shopping_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null,
  added_by      uuid references public.profiles (id) on delete set null,
  done          boolean not null default false,
  done_by       uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index shopping_items_household_idx on public.shopping_items (household_id, done, created_at);

alter table public.shopping_items enable row level security;

create policy "household access" on public.shopping_items for all
  using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

alter publication supabase_realtime add table public.shopping_items;
alter table public.shopping_items replica identity full;

-- ------------------------------------------------------------
-- 6) Paquete de tareas de ejemplo (botón en Ajustes).
--    Rotativas entre todos los miembros actuales; los que se unan
--    después entran automáticamente a las rotaciones.
-- ------------------------------------------------------------
create or replace function public.seed_sample_tasks()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_household uuid := public.my_household_id();
  v_task      record;
  v_task_id   uuid;
  v_count     int := 0;
begin
  if v_household is null then
    raise exception 'No pertenecés a un hogar';
  end if;

  -- Evitar duplicados si se aprieta dos veces
  if exists (select 1 from tasks where household_id = v_household and title = 'Lavar los platos') then
    return 0;
  end if;

  for v_task in
    select * from (values
      ('Lavar los platos',            'Incluye secar y guardar',            'Cocina',   'daily'::text,        null::int, 0, '20:30'::time, 15, 10),
      ('Cocinar la cena',             null,                                 'Cocina',   'daily',              null,      0, '19:00',       45, 20),
      ('Poner y levantar la mesa',    null,                                 'Cocina',   'daily',              null,      0, '21:00',       10,  5),
      ('Sacar la basura',             'Antes de que pase el camión',        'Limpieza', 'daily',              null,      0, '21:30',        5,  5),
      ('Barrer y trapear los pisos',  null,                                 'Limpieza', 'every_x_days',       2,         1, '18:00',       30, 20),
      ('Limpiar el baño',             'Inodoro, ducha, lavatorio y espejo', 'Limpieza', 'weekly',             null,      2, '11:00',       30, 30),
      ('Hacer las compras',           'Revisar antes la lista de compras',  'Compras',  'weekly',             null,      3, '17:00',       60, 30),
      ('Lavar la ropa',               null,                                 'Ropa',     'every_x_days',       3,         1, '10:00',       30, 20),
      ('Tender y doblar la ropa',     null,                                 'Ropa',     'every_x_days',       3,         2, '18:30',       20, 10),
      ('Regar las plantas',           null,                                 'Jardín',   'every_x_days',       2,         0, '09:00',       10,  5),
      ('Cambiar las sábanas',         null,                                 'Limpieza', 'weekly',             null,      5, '10:30',       20, 20)
    ) as t(title, description, category, frequency, freq_interval, start_offset, due_time, minutes, points)
  loop
    insert into tasks (
      household_id, title, description, category_id, frequency, frequency_interval,
      start_date, due_time, estimated_minutes, points, assignment_type, created_by
    )
    values (
      v_household,
      v_task.title,
      v_task.description,
      (select id from categories where household_id = v_household and name = v_task.category),
      v_task.frequency,
      v_task.freq_interval,
      current_date + v_task.start_offset,
      v_task.due_time,
      v_task.minutes,
      v_task.points,
      'rotative',
      auth.uid()
    )
    returning id into v_task_id;

    insert into task_rotation_members (task_id, profile_id)
    select v_task_id, p.id from profiles p where p.household_id = v_household;

    perform public.generate_task_instances(7, v_task_id);
    v_count := v_count + 1;
  end loop;

  -- Compras básicas de arranque
  if not exists (select 1 from shopping_items where household_id = v_household) then
    insert into shopping_items (household_id, name, added_by)
    select v_household, item, auth.uid()
    from unnest(array['Leche', 'Pan', 'Huevos', 'Yerba', 'Papel higiénico', 'Detergente']) as item;
  end if;

  return v_count;
end;
$$;
