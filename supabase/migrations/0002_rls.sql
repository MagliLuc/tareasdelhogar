-- ============================================================
-- Row Level Security: cada usuario solo ve/toca datos de SU hogar
-- ============================================================

-- Hogar del usuario autenticado. security definer para poder
-- consultarlo desde las policies sin recursión de RLS.
create or replace function public.my_household_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select household_id from public.profiles where id = auth.uid();
$$;

alter table public.households            enable row level security;
alter table public.profiles              enable row level security;
alter table public.work_schedules        enable row level security;
alter table public.categories            enable row level security;
alter table public.tasks                 enable row level security;
alter table public.task_rotation_members enable row level security;
alter table public.task_instances        enable row level security;
alter table public.task_events           enable row level security;
alter table public.point_entries         enable row level security;
alter table public.push_tokens           enable row level security;

-- ------------------------------------------------------------
-- households: ver y renombrar el propio; crear/unirse via RPC
-- ------------------------------------------------------------
create policy "members can view own household"
  on public.households for select
  using (id = public.my_household_id());

create policy "members can update own household"
  on public.households for update
  using (id = public.my_household_id());

-- ------------------------------------------------------------
-- profiles: ver a los del hogar (y a uno mismo), editar solo el propio
-- ------------------------------------------------------------
create policy "view household members"
  on public.profiles for select
  using (id = auth.uid() or household_id = public.my_household_id());

create policy "update own profile"
  on public.profiles for update
  using (id = auth.uid());

-- ------------------------------------------------------------
-- work_schedules: ver los del hogar, editar solo el propio
-- ------------------------------------------------------------
create policy "view household schedules"
  on public.work_schedules for select
  using (profile_id in (
    select id from public.profiles where household_id = public.my_household_id()
  ));

create policy "manage own schedule"
  on public.work_schedules for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ------------------------------------------------------------
-- Tablas con household_id directo: acceso completo dentro del hogar
-- ------------------------------------------------------------
create policy "household access" on public.categories for all
  using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

create policy "household access" on public.tasks for all
  using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

create policy "household access" on public.task_instances for all
  using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

create policy "household read" on public.task_events for select
  using (household_id = public.my_household_id());
-- inserts de task_events solo via funciones (security definer)

create policy "household read" on public.point_entries for select
  using (household_id = public.my_household_id());
-- inserts de point_entries solo via funciones: nadie se regala puntos

-- ------------------------------------------------------------
-- task_rotation_members: siguen a su tarea
-- ------------------------------------------------------------
create policy "household access" on public.task_rotation_members for all
  using (task_id in (
    select id from public.tasks where household_id = public.my_household_id()
  ))
  with check (task_id in (
    select id from public.tasks where household_id = public.my_household_id()
  ));

-- ------------------------------------------------------------
-- push_tokens: cada uno maneja solo los suyos
-- ------------------------------------------------------------
create policy "own tokens" on public.push_tokens for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
