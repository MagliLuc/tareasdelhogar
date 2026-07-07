-- ============================================================
-- 0008: tareas encadenadas (completar una dispara otra) y
--       recordatorio diario de compras pendientes.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Cadenas: al completar task_id se dispara next_task_id
-- ------------------------------------------------------------
create table public.task_chains (
  task_id       uuid not null references public.tasks (id) on delete cascade,
  next_task_id  uuid not null references public.tasks (id) on delete cascade,
  primary key (task_id, next_task_id),
  check (task_id <> next_task_id)
);

alter table public.task_chains enable row level security;

create policy "household access" on public.task_chains for all
  using (task_id in (select id from public.tasks where household_id = public.my_household_id()))
  with check (task_id in (select id from public.tasks where household_id = public.my_household_id()));

-- ------------------------------------------------------------
-- 2) complete_task_instance: además de puntos y evento, crea la
--    instancia de HOY de cada tarea encadenada (si no existía).
--    El evento 'assigned' resultante dispara la push normal.
-- ------------------------------------------------------------
create or replace function public.complete_task_instance(p_instance_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_instance     task_instances%rowtype;
  v_points       int;
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

  update task_instances
  set status = 'done', completed_by = auth.uid(), completed_at = now()
  where id = p_instance_id;

  insert into task_events (task_instance_id, household_id, type, actor_id)
  values (p_instance_id, v_instance.household_id, 'completed', auth.uid());

  select points into v_points from tasks where id = v_instance.task_id;
  insert into point_entries (household_id, profile_id, task_instance_id, points)
  values (v_instance.household_id, auth.uid(), p_instance_id, coalesce(v_points, 0));

  -- Tareas encadenadas: se disparan para hoy
  for v_chain in
    select next_task_id from task_chains where task_id = v_instance.task_id
  loop
    select * into v_next from tasks where id = v_chain.next_task_id and active;
    if v_next.id is null then
      continue;
    end if;

    select timezone into v_tz from households where id = v_next.household_id;

    -- A su hora habitual, o en 30 minutos si esa hora ya pasó
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
-- 3) Recordatorio diario de compras pendientes (17:00 Argentina)
-- ------------------------------------------------------------
create or replace function public.send_shopping_reminders()
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
    select household_id, count(*)::int as pending_count
    from shopping_items
    where done = false
    group by household_id
  loop
    select array_agg(pt.token) into v_tokens
    from push_tokens pt
    join profiles p on p.id = pt.profile_id
    where p.household_id = v_row.household_id;

    perform send_expo_push(
      v_tokens,
      'Lista de compras 🛒',
      case when v_row.pending_count = 1
        then 'Hay 1 cosa pendiente de comprar'
        else 'Hay ' || v_row.pending_count || ' cosas pendientes de comprar'
      end,
      jsonb_build_object('screen', 'shopping')
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

select cron.schedule(
  'recordatorio-compras',
  '0 20 * * *', -- 20:00 UTC = 17:00 Argentina
  $$ select public.send_shopping_reminders() $$
);
