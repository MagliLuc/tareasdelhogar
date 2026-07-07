// Capa de acceso a datos: todas las consultas a Supabase en un lugar

import { supabase } from '@/lib/supabase';
import {
  Category,
  Frequency,
  PendingMember,
  Profile,
  ScheduleKind,
  ShoppingItem,
  Task,
  TaskInstance,
  WeeklyRankingRow,
  WorkSchedule,
} from '@/lib/types';

// Joins habituales de una instancia (la tabla referencia profiles dos
// veces, por eso los hints de FK explícitos)
const INSTANCE_SELECT = `
  *,
  task:tasks(*, category:categories(*)),
  assignee:profiles!task_instances_assigned_to_fkey(id, name, color)
`;

export async function fetchMembers(householdId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('household_id', householdId)
    .order('name');
  if (error) throw error;
  return data as Profile[];
}

export async function fetchCategories(householdId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('household_id', householdId)
    .order('name');
  if (error) throw error;
  return data as Category[];
}

export async function fetchInstances(
  householdId: string,
  fromISO: string,
  toISO: string
): Promise<TaskInstance[]> {
  const { data, error } = await supabase
    .from('task_instances')
    .select(INSTANCE_SELECT)
    .eq('household_id', householdId)
    .gte('due_at', fromISO)
    .lt('due_at', toISO)
    .order('due_at');
  if (error) throw error;
  return data as unknown as TaskInstance[];
}

export async function fetchInstance(id: string): Promise<TaskInstance> {
  const { data, error } = await supabase
    .from('task_instances')
    .select(INSTANCE_SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as TaskInstance;
}

export interface InstanceEvent {
  id: string;
  type: 'created' | 'assigned' | 'reassigned' | 'completed' | 'uncompleted';
  created_at: string;
  actor: { name: string } | null;
  from_p: { name: string } | null;
  to_p: { name: string } | null;
}

export async function fetchInstanceEvents(instanceId: string): Promise<InstanceEvent[]> {
  const { data, error } = await supabase
    .from('task_events')
    .select(
      `id, type, created_at,
       actor:profiles!task_events_actor_id_fkey(name),
       from_p:profiles!task_events_from_profile_id_fkey(name),
       to_p:profiles!task_events_to_profile_id_fkey(name)`
    )
    .eq('task_instance_id', instanceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as InstanceEvent[];
}

export async function completeInstance(id: string): Promise<void> {
  const { error } = await supabase.rpc('complete_task_instance', { p_instance_id: id });
  if (error) throw error;
}

export async function uncompleteInstance(id: string): Promise<void> {
  const { error } = await supabase.rpc('uncomplete_task_instance', { p_instance_id: id });
  if (error) throw error;
}

export async function reassignInstance(id: string, toProfileId: string): Promise<void> {
  const { error } = await supabase.rpc('reassign_task_instance', {
    p_instance_id: id,
    p_to_profile: toProfileId,
  });
  if (error) throw error;
}

export interface NewTask {
  household_id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  frequency: Frequency;
  frequency_interval: number | null;
  start_date: string; // 'YYYY-MM-DD'
  due_time: string; // 'HH:MM'
  estimated_minutes: number;
  points: number;
  assignment_type: 'manual' | 'rotative';
  assigned_to: string | null;
  rotation_member_ids: string[]; // solo para rotativas
  chained_task_ids: string[]; // tareas que se disparan al completarla
  created_by: string;
}

export async function createTask(input: NewTask): Promise<void> {
  const { rotation_member_ids, chained_task_ids, ...taskRow } = input;

  const { data: task, error } = await supabase
    .from('tasks')
    .insert(taskRow)
    .select('id')
    .single();
  if (error) throw error;

  if (input.assignment_type === 'rotative' && rotation_member_ids.length > 0) {
    const { error: rmError } = await supabase.from('task_rotation_members').insert(
      rotation_member_ids.map((profile_id) => ({ task_id: task.id, profile_id }))
    );
    if (rmError) throw rmError;
  }

  if (chained_task_ids.length > 0) {
    const { error: chError } = await supabase.from('task_chains').insert(
      chained_task_ids.map((next_task_id) => ({ task_id: task.id, next_task_id }))
    );
    if (chError) throw chError;
  }

  // Generar las instancias recién ahora, con la rotación ya cargada
  const { error: genError } = await supabase.rpc('generate_task_instances', {
    p_days_ahead: 7,
    p_task_id: task.id,
  });
  if (genError) throw genError;
}

// ------------------------------------------------------------
// Definiciones de tareas (para cadenas y edición)
// ------------------------------------------------------------
export async function fetchTasks(householdId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('household_id', householdId)
    .eq('active', true)
    .order('title');
  if (error) throw error;
  return data as Task[];
}

export async function fetchTask(taskId: string): Promise<Task> {
  const { data, error } = await supabase.from('tasks').select('*').eq('id', taskId).single();
  if (error) throw error;
  return data as Task;
}

export async function fetchTaskRotation(taskId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('task_rotation_members')
    .select('profile_id')
    .eq('task_id', taskId);
  if (error) throw error;
  return (data as { profile_id: string }[]).map((r) => r.profile_id);
}

export async function fetchTaskChains(taskId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('task_chains')
    .select('next_task_id')
    .eq('task_id', taskId);
  if (error) throw error;
  return (data as { next_task_id: string }[]).map((r) => r.next_task_id);
}

/**
 * Actualiza la definición de una tarea: reemplaza rotación y cadenas,
 * borra las ocurrencias PENDIENTES (las completadas quedan en el
 * historial) y regenera con la nueva configuración.
 */
export async function updateTask(taskId: string, input: NewTask): Promise<void> {
  const { rotation_member_ids, chained_task_ids, created_by, ...taskRow } = input;
  void created_by; // el creador original no cambia

  const { error } = await supabase.from('tasks').update(taskRow).eq('id', taskId);
  if (error) throw error;

  const { error: delRotError } = await supabase
    .from('task_rotation_members')
    .delete()
    .eq('task_id', taskId);
  if (delRotError) throw delRotError;
  if (input.assignment_type === 'rotative' && rotation_member_ids.length > 0) {
    const { error: rmError } = await supabase.from('task_rotation_members').insert(
      rotation_member_ids.map((profile_id) => ({ task_id: taskId, profile_id }))
    );
    if (rmError) throw rmError;
  }

  const { error: delChError } = await supabase.from('task_chains').delete().eq('task_id', taskId);
  if (delChError) throw delChError;
  if (chained_task_ids.length > 0) {
    const { error: chError } = await supabase.from('task_chains').insert(
      chained_task_ids.map((next_task_id) => ({ task_id: taskId, next_task_id }))
    );
    if (chError) throw chError;
  }

  const { error: delInstError } = await supabase
    .from('task_instances')
    .delete()
    .eq('task_id', taskId)
    .eq('status', 'pending');
  if (delInstError) throw delInstError;

  const { error: genError } = await supabase.rpc('generate_task_instances', {
    p_days_ahead: 7,
    p_task_id: taskId,
  });
  if (genError) throw genError;
}

// ------------------------------------------------------------
// Perfil, horarios laborales y ranking
// ------------------------------------------------------------
export async function updateProfile(
  id: string,
  patch: { name?: string; color?: string }
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw error;
}

export interface ScheduleWithProfile extends WorkSchedule {
  profile: { id: string; name: string; color: string };
}

export async function fetchHouseholdSchedules(
  householdId: string
): Promise<ScheduleWithProfile[]> {
  const { data, error } = await supabase
    .from('work_schedules')
    .select('*, profile:profiles!inner(id, name, color, household_id)')
    .eq('profile.household_id', householdId)
    .order('weekday')
    .order('start_time');
  if (error) throw error;
  return data as unknown as ScheduleWithProfile[];
}

export async function fetchMySchedules(profileId: string): Promise<WorkSchedule[]> {
  const { data, error } = await supabase
    .from('work_schedules')
    .select('*')
    .eq('profile_id', profileId)
    .order('weekday')
    .order('start_time');
  if (error) throw error;
  return data as WorkSchedule[];
}

export async function addSchedule(input: {
  profileId: string;
  kind: ScheduleKind;
  weekday?: number | null; // recurrente semanal
  date?: string | null; // salida puntual 'YYYY-MM-DD'
  startTime: string;
  endTime: string;
}): Promise<void> {
  const { error } = await supabase.from('work_schedules').insert({
    profile_id: input.profileId,
    kind: input.kind,
    weekday: input.weekday ?? null,
    date: input.date ?? null,
    start_time: input.startTime,
    end_time: input.endTime,
  });
  if (error) throw error;
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase.from('work_schedules').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchWeeklyRanking(householdId: string): Promise<WeeklyRankingRow[]> {
  const { data, error } = await supabase
    .from('weekly_ranking')
    .select('*')
    .eq('household_id', householdId)
    .order('total_points', { ascending: false });
  if (error) throw error;
  return data as WeeklyRankingRow[];
}

// ------------------------------------------------------------
// Miembros pendientes y unirse con identidad
// ------------------------------------------------------------
export interface HouseholdPreview {
  household_name: string;
  pending: { id: string; name: string; color: string }[];
}

export async function previewHousehold(code: string): Promise<HouseholdPreview | null> {
  const { data, error } = await supabase
    .rpc('preview_household', { p_code: code })
    .maybeSingle<HouseholdPreview>();
  if (error) throw error;
  return data;
}

export async function joinHousehold(
  code: string,
  pendingMemberId: string | null
): Promise<{ id: string; name: string }> {
  const { data, error } = await supabase
    .rpc('join_household', { p_code: code, p_pending_member: pendingMemberId })
    .single<{ id: string; name: string }>();
  if (error) throw error;
  return data;
}

export async function fetchPendingMembers(householdId: string): Promise<PendingMember[]> {
  const { data, error } = await supabase
    .from('pending_members')
    .select('*')
    .eq('household_id', householdId)
    .is('claimed_at', null)
    .order('name');
  if (error) throw error;
  return data as PendingMember[];
}

export async function addPendingMember(
  householdId: string,
  name: string,
  color: string
): Promise<void> {
  const { error } = await supabase
    .from('pending_members')
    .insert({ household_id: householdId, name, color });
  if (error) throw error;
}

export async function seedSampleTasks(): Promise<number> {
  const { data, error } = await supabase.rpc('seed_sample_tasks');
  if (error) throw error;
  return data as number;
}

// ------------------------------------------------------------
// Lista de compras
// ------------------------------------------------------------
export async function fetchShoppingItems(householdId: string): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from('shopping_items')
    .select('*')
    .eq('household_id', householdId)
    .order('done')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ShoppingItem[];
}

export async function addShoppingItem(
  householdId: string,
  name: string,
  addedBy: string
): Promise<void> {
  const { error } = await supabase
    .from('shopping_items')
    .insert({ household_id: householdId, name, added_by: addedBy });
  if (error) throw error;
}

export async function toggleShoppingItem(item: ShoppingItem, byProfileId: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_items')
    .update({ done: !item.done, done_by: item.done ? null : byProfileId })
    .eq('id', item.id);
  if (error) throw error;
}

export async function deleteShoppingItem(id: string): Promise<void> {
  const { error } = await supabase.from('shopping_items').delete().eq('id', id);
  if (error) throw error;
}

export async function updateHouseholdSettings(
  settings: Record<string, number>
): Promise<void> {
  const { error } = await supabase.rpc('update_household_settings', { p_settings: settings });
  if (error) throw error;
}

/** Liquida puntos de trabajo/estudio de los últimos días (idempotente) */
export async function settleObligationPoints(daysBack = 7): Promise<void> {
  const { error } = await supabase.rpc('award_schedule_points', { p_days_back: daysBack });
  if (error) throw error;
}

export async function fetchHousehold(householdId: string) {
  const { data, error } = await supabase
    .from('households')
    .select('*')
    .eq('id', householdId)
    .single();
  if (error) throw error;
  return data;
}

// ------------------------------------------------------------
// Helpers de fechas (hora local del dispositivo)
// ------------------------------------------------------------
export function startOfDayISO(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function endOfDayISO(date: Date): string {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const dayFormatter = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'numeric',
});

export function humanDay(date: Date): string {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  if (toDateString(date) === toDateString(today)) return 'Hoy';
  if (toDateString(date) === toDateString(tomorrow)) return 'Mañana';
  const label = dayFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function humanTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
