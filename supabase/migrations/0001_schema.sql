-- ============================================================
-- Tareas del Hogar — Esquema inicial
-- Convenciones:
--   * weekday: ISO 8601 → 1 = lunes ... 7 = domingo
--   * Todos los timestamps en timestamptz (UTC en la base,
--     la app los muestra en hora local del dispositivo)
-- ============================================================

-- ------------------------------------------------------------
-- Hogares
-- ------------------------------------------------------------
create table public.households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  invite_code  text not null unique,
  timezone     text not null default 'America/Argentina/Buenos_Aires',
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Perfiles (1 a 1 con auth.users)
-- ------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  household_id  uuid references public.households (id) on delete set null,
  name          text not null,
  avatar_url    text,
  color         text not null default '#6366F1',
  role          text not null default 'adult' check (role in ('adult', 'child')),
  created_at    timestamptz not null default now()
);

create index profiles_household_idx on public.profiles (household_id);

-- Crea el perfil automáticamente al registrarse un usuario
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Horario laboral semanal de cada miembro
-- ------------------------------------------------------------
create table public.work_schedules (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7), -- 1=lunes
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time)
);

create index work_schedules_profile_idx on public.work_schedules (profile_id);

-- ------------------------------------------------------------
-- Categorías de tareas (por hogar, con valores por defecto al crearlo)
-- ------------------------------------------------------------
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null,
  icon          text not null default '🏠',
  unique (household_id, name)
);

-- ------------------------------------------------------------
-- Tareas (definición / plantilla recurrente)
-- ------------------------------------------------------------
create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  title              text not null,
  description        text,
  category_id        uuid references public.categories (id) on delete set null,
  frequency          text not null default 'once'
                     check (frequency in ('once', 'daily', 'weekly', 'every_x_days')),
  frequency_interval smallint check (frequency_interval > 0), -- solo para every_x_days
  start_date         date not null default current_date,      -- para 'once' es la fecha de vencimiento
  due_time           time not null default '20:00',           -- hora límite del día
  estimated_minutes  int not null default 15 check (estimated_minutes > 0),
  points             int not null default 10 check (points >= 0),
  assignment_type    text not null default 'manual'
                     check (assignment_type in ('manual', 'rotative')),
  assigned_to        uuid references public.profiles (id) on delete set null, -- solo para manual
  active             boolean not null default true,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  check (frequency <> 'every_x_days' or frequency_interval is not null)
);

create index tasks_household_idx on public.tasks (household_id);

-- Miembros que participan de la rotación de una tarea rotativa
create table public.task_rotation_members (
  task_id     uuid not null references public.tasks (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (task_id, profile_id)
);

-- ------------------------------------------------------------
-- Instancias de tareas (cada ocurrencia concreta con fecha)
-- ------------------------------------------------------------
create table public.task_instances (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks (id) on delete cascade,
  household_id  uuid not null references public.households (id) on delete cascade,
  assigned_to   uuid references public.profiles (id) on delete set null,
  due_at        timestamptz not null,
  status        text not null default 'pending' check (status in ('pending', 'done')),
  completed_by  uuid references public.profiles (id) on delete set null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- Evita duplicar la instancia de un mismo día al regenerar
create unique index task_instances_task_day_uidx
  on public.task_instances (task_id, ((due_at at time zone 'utc')::date));

create index task_instances_household_due_idx
  on public.task_instances (household_id, due_at);
create index task_instances_assignee_idx
  on public.task_instances (assigned_to, status);

-- ------------------------------------------------------------
-- Historial de eventos (asignaciones, reasignaciones, completadas)
-- ------------------------------------------------------------
create table public.task_events (
  id                uuid primary key default gen_random_uuid(),
  task_instance_id  uuid not null references public.task_instances (id) on delete cascade,
  household_id      uuid not null references public.households (id) on delete cascade,
  type              text not null
                    check (type in ('created', 'assigned', 'reassigned', 'completed', 'uncompleted')),
  actor_id          uuid references public.profiles (id) on delete set null,
  from_profile_id   uuid references public.profiles (id) on delete set null,
  to_profile_id     uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);

create index task_events_household_idx on public.task_events (household_id, created_at desc);

-- ------------------------------------------------------------
-- Puntos (libro mayor: una fila por tarea completada)
-- ------------------------------------------------------------
create table public.point_entries (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households (id) on delete cascade,
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  task_instance_id  uuid references public.task_instances (id) on delete set null,
  points            int not null,
  created_at        timestamptz not null default now()
);

create index point_entries_ranking_idx
  on public.point_entries (household_id, profile_id, created_at);

-- Ranking semanal (semana ISO actual)
create view public.weekly_ranking
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
where pe.created_at >= date_trunc('week', now())
group by pe.household_id, pe.profile_id, p.name, p.color;

-- ------------------------------------------------------------
-- Tokens de notificaciones push (Expo)
-- ------------------------------------------------------------
create table public.push_tokens (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  token       text not null,
  updated_at  timestamptz not null default now(),
  primary key (profile_id, token)
);
