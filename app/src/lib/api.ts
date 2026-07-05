// Capa de acceso a datos: todas las consultas a Supabase en un lugar

import { supabase } from '@/lib/supabase';
import { Category, Frequency, Profile, TaskInstance } from '@/lib/types';

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
  created_by: string;
}

export async function createTask(input: NewTask): Promise<void> {
  const { rotation_member_ids, ...taskRow } = input;

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

  // Generar las instancias recién ahora, con la rotación ya cargada
  const { error: genError } = await supabase.rpc('generate_task_instances', {
    p_days_ahead: 7,
    p_task_id: task.id,
  });
  if (genError) throw genError;
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
