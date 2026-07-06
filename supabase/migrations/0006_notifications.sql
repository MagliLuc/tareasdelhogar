-- ============================================================
-- Notificaciones push (gratis, sin servidor propio):
--   * pg_net: hace el HTTP POST a la API de push de Expo
--   * pg_cron: recordatorios antes del vencimiento + generación
--     diaria de instancias
-- Los celulares registran su token de Expo en push_tokens.
-- ============================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Para no recordar dos veces la misma instancia
alter table public.task_instances add column if not exists reminded_at timestamptz;

-- ------------------------------------------------------------
-- Envía una push de Expo a una lista de tokens
-- ------------------------------------------------------------
create or replace function public.send_expo_push(
  p_tokens text[],
  p_title  text,
  p_body   text,
  p_data   jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_messages jsonb;
begin
  if p_tokens is null or array_length(p_tokens, 1) is null then
    return;
  end if;

  select jsonb_agg(jsonb_build_object(
    'to', t,
    'title', p_title,
    'body', p_body,
    'data', p_data,
    'sound', 'default'
  ))
  into v_messages
  from unnest(p_tokens) as t;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := v_messages
  );
end;
$$;

-- ------------------------------------------------------------
-- Push automática cuando se registra un evento de tarea:
--   * assigned    → al asignado (solo si vence dentro de 24 h,
--                   para no spamear al generar la semana entera)
--   * reassigned  → a quien la recibe
--   * completed   → al resto del hogar (para estar al tanto)
-- ------------------------------------------------------------
create or replace function public.handle_task_event_push()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_task_title text;
  v_due_at     timestamptz;
  v_actor      text;
  v_tokens     text[];
begin
  select t.title, ti.due_at
  into v_task_title, v_due_at
  from task_instances ti
  join tasks t on t.id = ti.task_id
  where ti.id = new.task_instance_id;

  if new.type = 'assigned' and new.to_profile_id is not null
     and v_due_at < now() + interval '24 hours' then
    select array_agg(token) into v_tokens
    from push_tokens where profile_id = new.to_profile_id;

    perform send_expo_push(
      v_tokens,
      'Nueva tarea para vos 📌',
      v_task_title,
      jsonb_build_object('instanceId', new.task_instance_id)
    );

  elsif new.type = 'reassigned' and new.to_profile_id is not null then
    select name into v_actor from profiles where id = new.actor_id;
    select array_agg(token) into v_tokens
    from push_tokens where profile_id = new.to_profile_id;

    perform send_expo_push(
      v_tokens,
      'Te pasaron una tarea 🔄',
      coalesce(v_actor, 'Alguien') || ' te pasó: ' || v_task_title,
      jsonb_build_object('instanceId', new.task_instance_id)
    );

  elsif new.type = 'completed' then
    select name into v_actor from profiles where id = new.actor_id;
    select array_agg(pt.token) into v_tokens
    from push_tokens pt
    join profiles p on p.id = pt.profile_id
    where p.household_id = new.household_id
      and pt.profile_id is distinct from new.actor_id;

    perform send_expo_push(
      v_tokens,
      'Tarea completada ✅',
      coalesce(v_actor, 'Alguien') || ' completó: ' || v_task_title,
      jsonb_build_object('instanceId', new.task_instance_id)
    );
  end if;

  return new;
end;
$$;

create trigger on_task_event_push
  after insert on public.task_events
  for each row execute function public.handle_task_event_push();

-- ------------------------------------------------------------
-- Recordatorios: tareas pendientes que vencen dentro de 1 hora
-- (corre cada 15 minutos vía pg_cron)
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
      and ti.due_at between now() and now() + interval '60 minutes'
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

-- ------------------------------------------------------------
-- Tareas programadas (los nombres son únicos: re-ejecutar actualiza)
-- ------------------------------------------------------------
select cron.schedule(
  'recordatorios-tareas',
  '*/15 * * * *',
  $$ select public.send_due_reminders() $$
);

select cron.schedule(
  'generar-instancias-diarias',
  '0 6 * * *',
  $$ select public.generate_task_instances(7) $$
);
