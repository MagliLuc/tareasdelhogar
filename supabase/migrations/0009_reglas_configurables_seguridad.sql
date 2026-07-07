-- ============================================================
-- 0009: reglas de puntos configurables por hogar, puntos por
--       compras, liquidación retroactiva de obligaciones y
--       endurecimiento de seguridad (repo público).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Reglas configurables por hogar (JSON con defaults):
--    points_per_obligation_hour  → 1 punto por hora trabajo/estudio
--    points_per_shopping_item    → 1 punto por ítem comprado
--    reminder_minutes_before     → 60 min antes del vencimiento
--    work_weight_divisor         → 4 h de obligación = 1 h de tareas
--    absence_penalty_minutes     → 240 de castigo si no está
-- ------------------------------------------------------------
alter table public.households
  add column if not exists settings jsonb not null default '{}'::jsonb;

create or replace function public.household_setting(
  p_household uuid,
  p_key text,
  p_default numeric
)
returns numeric
language sql
stable
security definer set search_path = public
as $$
  select coalesce((settings ->> p_key)::numeric, p_default)
  from households where id = p_household;
$$;

-- Guardar reglas (cualquier miembro del hogar)
create or replace function public.update_household_settings(p_settings jsonb)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if public.my_household_id() is null then
    raise exception 'No pertenecés a un hogar';
  end if;
  update households
  set settings = settings || p_settings
  where id = public.my_household_id();
end;
$$;

-- ------------------------------------------------------------
-- 2) Puntos por comprar ítems de la lista (via trigger: nadie
--    puede insertarse puntos a mano)
-- ------------------------------------------------------------
alter table public.point_entries
  drop constraint if exists point_entries_source_check;
alter table public.point_entries
  add constraint point_entries_source_check
  check (source in ('task', 'schedule', 'shopping'));

alter table public.point_entries
  add column if not exists shopping_item_id uuid references public.shopping_items (id) on delete set null;

create or replace function public.handle_shopping_points()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_points int;
begin
  if new.done and not old.done and new.done_by is not null then
    v_points := public.household_setting(new.household_id, 'points_per_shopping_item', 1)::int;
    if v_points > 0 then
      insert into point_entries
        (household_id, profile_id, points, source, awarded_date, shopping_item_id)
      values
        (new.household_id, new.done_by, v_points, 'shopping', current_date, new.id);
    end if;
  elsif old.done and not new.done then
    -- se desmarcó: se retira el punto
    delete from point_entries where source = 'shopping' and shopping_item_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_shopping_item_done on public.shopping_items;
create trigger on_shopping_item_done
  after update of done on public.shopping_items
  for each row execute function public.handle_shopping_points();

-- ------------------------------------------------------------
-- 3) Puntos por obligaciones: liquidación retroactiva e idempotente.
--    La app la invoca al abrir el Ranking (últimos 7 días), además
--    del cron nocturno: si el cron falla o los horarios se cargaron
--    tarde, se acredita igual.
-- ------------------------------------------------------------
drop function if exists public.award_schedule_points();

create or replace function public.award_schedule_points(p_days_back int default 1)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_day   date;
  v_row   record;
  v_rate  numeric;
  v_count int := 0;
begin
  for v_day in
    select d::date
    from generate_series(current_date - greatest(p_days_back, 1), current_date - 1, interval '1 day') d
  loop
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
          (ws.date is null and ws.weekday = extract(isodow from v_day))
          or ws.date = v_day
        )
        -- si la app la llama, liquidar solo el hogar del usuario
        and (auth.uid() is null or p.household_id = public.my_household_id())
      group by p.id, p.household_id
    loop
      v_rate := public.household_setting(v_row.household_id, 'points_per_obligation_hour', 1);
      if v_rate <= 0 then
        continue;
      end if;

      insert into point_entries (household_id, profile_id, points, source, awarded_date)
      values (
        v_row.household_id,
        v_row.profile_id,
        greatest(1, round(v_row.minutes / 60 * v_rate))::int,
        'schedule',
        v_day
      )
      on conflict (profile_id, awarded_date) where source = 'schedule' do nothing;
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

select cron.schedule(
  'puntos-por-obligaciones',
  '30 3 * * *',
  $$ select public.award_schedule_points(3) $$
);

-- El ranking atribuye los puntos al día en que se ganaron
create or replace view public.weekly_ranking
  with (security_invoker = true)
as
select
  pe.household_id,
  pe.profile_id,
  p.name,
  p.color,
  sum(pe.points)::int as total_points
from public.point_entries pe
join public.profiles p on p.id = pe.profile_id
where coalesce(pe.awarded_date, (pe.created_at at time zone 'utc')::date)
      >= date_trunc('week', now())::date
group by pe.household_id, pe.profile_id, p.name, p.color;

-- ------------------------------------------------------------
-- 4) Recordatorios y reparto usan las reglas del hogar
-- ------------------------------------------------------------
create or replace function public.send_due_reminders()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_row    record;
  v_tokens text[];
  v_count  int := 0;
begin
  for v_row in
    select ti.id, ti.assigned_to, ti.due_at, t.title, h.timezone
    from task_instances ti
    join tasks t on t.id = ti.task_id
    join households h on h.id = ti.household_id
    where ti.status = 'pending'
      and ti.assigned_to is not null
      and ti.reminded_at is null
      and ti.due_at between now()
        and now() + make_interval(mins =>
          public.household_setting(ti.household_id, 'reminder_minutes_before', 60)::int)
  loop
    select array_agg(token) into v_tokens
    from push_tokens where profile_id = v_row.assigned_to;

    perform send_expo_push(
      v_tokens,
      'Recordatorio ⏰',
      '"' || v_row.title || '" vence a las ' ||
        to_char(v_row.due_at at time zone v_row.timezone, 'HH24:MI'),
      jsonb_build_object('instanceId', v_row.id)
    );

    update task_instances set reminded_at = now() where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

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
  join tasks tk on tk.id = p_task_id
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
        ws.weekday is not null
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
      + oblig.oblig_minutes
        / greatest(public.household_setting(tk.household_id, 'work_weight_divisor', 4), 1)
      + case when disp.ausente
          then public.household_setting(tk.household_id, 'absence_penalty_minutes', 240)
          else 0 end,
    random()
  limit 1;
$$;

-- ------------------------------------------------------------
-- 5) Seguridad (repo público):
--    * las funciones RPC no quedan expuestas al rol anónimo
--    * las internas (push/cron) tampoco al rol autenticado
--    * generate_task_instances exige usuario y se limita a su hogar
--      (el cron, que corre como dueño de la base, procesa todos)
-- ------------------------------------------------------------
create or replace function public.generate_task_instances(
  p_days_ahead int default 7,
  p_task_id    uuid default null
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
  v_caller_household uuid;
begin
  -- Llamada desde la app: solo el hogar del usuario. Sin usuario
  -- (cron como dueño de la base) procesa todos los hogares.
  if auth.uid() is not null then
    v_caller_household := public.my_household_id();
    if v_caller_household is null then
      return 0;
    end if;
  end if;

  for v_task in
    select t.*, h.timezone as household_tz
    from tasks t
    join households h on h.id = t.household_id
    where t.active
      and (p_task_id is null or t.id = p_task_id)
      and (v_caller_household is null or t.household_id = v_caller_household)
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

-- RPCs de la app: solo usuarios autenticados
revoke execute on function public.create_household(text) from public, anon;
revoke execute on function public.join_household(text, uuid) from public, anon;
revoke execute on function public.preview_household(text) from public, anon;
revoke execute on function public.complete_task_instance(uuid) from public, anon;
revoke execute on function public.uncomplete_task_instance(uuid) from public, anon;
revoke execute on function public.reassign_task_instance(uuid, uuid) from public, anon;
revoke execute on function public.generate_task_instances(int, uuid) from public, anon;
revoke execute on function public.seed_sample_tasks() from public, anon;
revoke execute on function public.award_schedule_points(int) from public, anon;
revoke execute on function public.update_household_settings(jsonb) from public, anon;
revoke execute on function public.household_setting(uuid, text, numeric) from public, anon;

-- Internas (push y cron): ningún rol de la API puede invocarlas
revoke execute on function public.send_expo_push(text[], text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.send_due_reminders() from public, anon, authenticated;
revoke execute on function public.send_shopping_reminders() from public, anon, authenticated;
revoke execute on function public.pick_rotative_assignee(uuid, date, time) from public, anon, authenticated;
