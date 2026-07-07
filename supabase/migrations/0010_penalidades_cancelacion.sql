-- ============================================================
-- 0010: penalidad por completar tareas vencidas, solo el asignado
--       puede completar, y cancelación de tareas.
-- Regla nueva configurable:
--   late_points_percent → % de los puntos que se acreditan si la
--   tarea se completa después de vencida (default 50; 0 = nada,
--   100 = sin penalidad)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Estado 'cancelled' en instancias y eventos
-- ------------------------------------------------------------
alter table public.task_instances drop constraint if exists task_instances_status_check;
alter table public.task_instances
  add constraint task_instances_status_check
  check (status in ('pending', 'done', 'cancelled'));

alter table public.task_events drop constraint if exists task_events_type_check;
alter table public.task_events
  add constraint task_events_type_check
  check (type in ('created', 'assigned', 'reassigned', 'completed', 'uncompleted', 'cancelled'));

-- ------------------------------------------------------------
-- 2) Completar: solo quien la tiene asignada (si no es tuya,
--    primero que te la pasen o pasátela con 'reasignar'), y con
--    penalidad configurable si está vencida.
-- ------------------------------------------------------------
create or replace function public.complete_task_instance(p_instance_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_instance     task_instances%rowtype;
  v_points       int;
  v_late_pct     numeric;
  v_chain        record;
  v_next         tasks%rowtype;
  v_tz           text;
  v_due          timestamptz;
  v_assignee     uuid;
  v_new_instance uuid;
begin
  select * into v_instance from task_instances where id = p_instance_id;

  if v_instance.id is null or v_instance.household_id <> public.my_household_id() then
    raise exception 'Tarea no encontrada';
  end if;
  if v_instance.status = 'done' then
    raise exception 'La tarea ya está completada';
  end if;
  if v_instance.status = 'cancelled' then
    raise exception 'La tarea está cancelada';
  end if;
  if v_instance.assigned_to is not null and v_instance.assigned_to <> auth.uid() then
    raise exception 'Solo puede completarla quien la tiene asignada. Pedile que te la pase.';
  end if;

  update task_instances
  set status = 'done', completed_by = auth.uid(), completed_at = now()
  where id = p_instance_id;

  insert into task_events (task_instance_id, household_id, type, actor_id)
  values (p_instance_id, v_instance.household_id, 'completed', auth.uid());

  select points into v_points from tasks where id = v_instance.task_id;
  v_points := coalesce(v_points, 0);

  -- Penalidad por vencida
  if now() > v_instance.due_at then
    v_late_pct := public.household_setting(v_instance.household_id, 'late_points_percent', 50);
    v_points := round(v_points * greatest(least(v_late_pct, 100), 0) / 100)::int;
  end if;

  if v_points > 0 then
    insert into point_entries (household_id, profile_id, task_instance_id, points, awarded_date)
    values (v_instance.household_id, auth.uid(), p_instance_id, v_points, current_date);
  end if;

  -- Tareas encadenadas: se disparan para hoy
  for v_chain in
    select next_task_id from task_chains where task_id = v_instance.task_id
  loop
    select * into v_next from tasks where id = v_chain.next_task_id and active;
    if v_next.id is null then
      continue;
    end if;

    select timezone into v_tz from households where id = v_next.household_id;

    v_due := greatest(
      (current_date::timestamp + v_next.due_time) at time zone v_tz,
      now() + interval '30 minutes'
    );

    v_assignee := case v_next.assignment_type
      when 'manual'   then v_next.assigned_to
      when 'rotative' then public.pick_rotative_assignee(v_next.id, current_date, v_next.due_time)
    end;

    insert into task_instances (task_id, household_id, assigned_to, due_at)
    values (v_next.id, v_next.household_id, v_assignee, v_due)
    on conflict (task_id, ((due_at at time zone 'utc')::date)) do nothing
    returning id into v_new_instance;

    if v_new_instance is not null then
      insert into task_events (task_instance_id, household_id, type, to_profile_id)
      values (v_new_instance, v_next.household_id, 'assigned', v_assignee);
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 3) Deshacer: solo quien la completó o quien la tenía asignada
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
  if v_instance.status <> 'done' then
    raise exception 'La tarea no está completada';
  end if;
  if auth.uid() not in (v_instance.completed_by, v_instance.assigned_to) then
    raise exception 'Solo puede deshacerla quien la completó o su asignado';
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
-- 4) Cancelar una ocurrencia pendiente (ej: hoy no se cocina).
--    Cualquier miembro del hogar puede (el acuerdo es de la familia).
--    No suma puntos y no se regenera para ese día.
-- ------------------------------------------------------------
create or replace function public.cancel_task_instance(p_instance_id uuid)
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
  if v_instance.status <> 'pending' then
    raise exception 'Solo se pueden cancelar tareas pendientes';
  end if;

  update task_instances set status = 'cancelled' where id = p_instance_id;

  insert into task_events (task_instance_id, household_id, type, actor_id)
  values (p_instance_id, v_instance.household_id, 'cancelled', auth.uid());
end;
$$;

revoke execute on function public.cancel_task_instance(uuid) from public, anon;
