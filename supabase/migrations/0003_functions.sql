-- ============================================================
-- Funciones RPC (la app las llama con supabase.rpc(...))
-- Todas validan pertenencia al hogar; son security definer para
-- poder escribir en tablas protegidas (eventos, puntos).
-- ============================================================

-- ------------------------------------------------------------
-- Crear un hogar: genera código de invitación, asocia al creador
-- y siembra categorías por defecto.
-- ------------------------------------------------------------
create or replace function public.create_household(p_name text)
returns table (id uuid, name text, invite_code text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_code text;
  v_id   uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- Código de 6 caracteres sin ambiguos (0/O, 1/I/L)
  loop
    v_code := (
      select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (random() * 30)::int + 1, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from households h where h.invite_code = v_code);
  end loop;

  insert into households (name, invite_code)
  values (p_name, v_code)
  returning households.id into v_id;

  update profiles set household_id = v_id where profiles.id = auth.uid();

  insert into categories (household_id, name, icon) values
    (v_id, 'Cocina',   '🍳'),
    (v_id, 'Limpieza', '🧹'),
    (v_id, 'Compras',  '🛒'),
    (v_id, 'Ropa',     '👕'),
    (v_id, 'Mascotas', '🐾'),
    (v_id, 'Jardín',   '🌱'),
    (v_id, 'Otros',    '📌');

  return query select h.id, h.name, h.invite_code from households h where h.id = v_id;
end;
$$;

-- ------------------------------------------------------------
-- Unirse a un hogar con el código de invitación
-- ------------------------------------------------------------
create or replace function public.join_household(p_code text)
returns table (id uuid, name text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select h.id into v_id from households h where h.invite_code = upper(trim(p_code));
  if v_id is null then
    raise exception 'Código de invitación inválido';
  end if;

  update profiles set household_id = v_id where profiles.id = auth.uid();

  return query select h.id, h.name from households h where h.id = v_id;
end;
$$;

-- ------------------------------------------------------------
-- Reparto equitativo: elige al miembro de la rotación con menor
-- carga, ponderando:
--   * minutos de tareas pendientes ya asignadas esta semana
--   * minutos de trabajo semanales declarados en su horario
--   * penalización si trabaja justo a la hora de vencimiento
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
    select coalesce(sum(extract(epoch from (ws.end_time - ws.start_time)) / 60), 0) as work_minutes
    from work_schedules ws
    where ws.profile_id = rm.profile_id
  ) laburo on true
  left join lateral (
    -- ¿está trabajando a la hora de vencimiento ese día?
    select exists (
      select 1 from work_schedules ws
      where ws.profile_id = rm.profile_id
        and ws.weekday = extract(isodow from p_due_date)
        and p_due_time between ws.start_time and ws.end_time
    ) as ocupado
  ) disponibilidad on true
  where rm.task_id = p_task_id
  order by
    carga.pending_minutes
      + laburo.work_minutes / 4          -- 4 h de trabajo pesan como 1 h de tareas
      + case when disponibilidad.ocupado then 240 else 0 end,
    random()
  limit 1;
$$;

-- ------------------------------------------------------------
-- Genera las instancias de los próximos días para tareas activas.
-- Idempotente (índice único por tarea+día). La app la llama al
-- abrir el dashboard y también puede correr por pg_cron a diario.
-- ------------------------------------------------------------
create or replace function public.generate_task_instances(
  p_days_ahead int default 7,
  p_task_id    uuid default null   -- si viene, genera solo para esa tarea
)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_task     record;
  v_date     date;
  v_due_at   timestamptz;
  v_assignee uuid;
  v_instance uuid;
  v_count    int := 0;
  v_tz       text;
begin
  for v_task in
    select t.*, h.timezone as household_tz
    from tasks t
    join households h on h.id = t.household_id
    where t.active
      and (p_task_id is null or t.id = p_task_id)
  loop
    v_tz := v_task.household_tz;

    for v_date in
      select d::date
      from generate_series(
        greatest(current_date, v_task.start_date),
        current_date + p_days_ahead - 1,
        interval '1 day'
      ) d
      where case v_task.frequency
        when 'once'         then d::date = v_task.start_date
        when 'daily'        then true
        when 'weekly'       then extract(isodow from d) = extract(isodow from v_task.start_date)
        when 'every_x_days' then (d::date - v_task.start_date) % v_task.frequency_interval = 0
      end
    loop
      v_due_at := (v_date::timestamp + v_task.due_time) at time zone v_tz;

      v_assignee := case v_task.assignment_type
        when 'manual'   then v_task.assigned_to
        when 'rotative' then public.pick_rotative_assignee(v_task.id, v_date, v_task.due_time)
      end;

      insert into task_instances (task_id, household_id, assigned_to, due_at)
      values (v_task.id, v_task.household_id, v_assignee, v_due_at)
      on conflict (task_id, ((due_at at time zone 'utc')::date)) do nothing
      returning id into v_instance;

      if v_instance is not null then
        v_count := v_count + 1;
        insert into task_events (task_instance_id, household_id, type, to_profile_id)
        values (v_instance, v_task.household_id, 'assigned', v_assignee);
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

-- Al crear una tarea, generar sus instancias de inmediato
create or replace function public.handle_new_task()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.generate_task_instances(7, new.id);
  return new;
end;
$$;

create trigger on_task_created
  after insert on public.tasks
  for each row execute function public.handle_new_task();

-- ------------------------------------------------------------
-- Completar una tarea: marca hecha, registra evento y suma puntos
-- ------------------------------------------------------------
create or replace function public.complete_task_instance(p_instance_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_instance task_instances%rowtype;
  v_points   int;
begin
  select * into v_instance from task_instances where id = p_instance_id;

  if v_instance.id is null or v_instance.household_id <> public.my_household_id() then
    raise exception 'Tarea no encontrada';
  end if;
  if v_instance.status = 'done' then
    raise exception 'La tarea ya está completada';
  end if;

  update task_instances
  set status = 'done', completed_by = auth.uid(), completed_at = now()
  where id = p_instance_id;

  insert into task_events (task_instance_id, household_id, type, actor_id)
  values (p_instance_id, v_instance.household_id, 'completed', auth.uid());

  select points into v_points from tasks where id = v_instance.task_id;
  insert into point_entries (household_id, profile_id, task_instance_id, points)
  values (v_instance.household_id, auth.uid(), p_instance_id, coalesce(v_points, 0));
end;
$$;

-- ------------------------------------------------------------
-- Deshacer una tarea completada (por si se marcó por error)
-- ------------------------------------------------------------
create or replace function public.uncomplete_task_instance(p_instance_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_instance task_instances%rowtype;
begin
  select * into v_instance from task_instances where id = p_instance_id;

  if v_instance.id is null or v_instance.household_id <> public.my_household_id() then
    raise exception 'Tarea no encontrada';
  end if;

  update task_instances
  set status = 'pending', completed_by = null, completed_at = null
  where id = p_instance_id;

  delete from point_entries where task_instance_id = p_instance_id;

  insert into task_events (task_instance_id, household_id, type, actor_id)
  values (p_instance_id, v_instance.household_id, 'uncompleted', auth.uid());
end;
$$;

-- ------------------------------------------------------------
-- Reasignar/pasar una tarea a otro miembro (queda en el historial;
-- la notificación push se dispara desde el evento 'reassigned')
-- ------------------------------------------------------------
create or replace function public.reassign_task_instance(
  p_instance_id uuid,
  p_to_profile  uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_instance task_instances%rowtype;
begin
  select * into v_instance from task_instances where id = p_instance_id;

  if v_instance.id is null or v_instance.household_id <> public.my_household_id() then
    raise exception 'Tarea no encontrada';
  end if;
  if not exists (
    select 1 from profiles
    where id = p_to_profile and household_id = v_instance.household_id
  ) then
    raise exception 'Ese miembro no pertenece al hogar';
  end if;

  update task_instances set assigned_to = p_to_profile where id = p_instance_id;

  insert into task_events
    (task_instance_id, household_id, type, actor_id, from_profile_id, to_profile_id)
  values
    (p_instance_id, v_instance.household_id, 'reassigned',
     auth.uid(), v_instance.assigned_to, p_to_profile);
end;
$$;
