import {
  addShoppingItem,
  createTask,
  fetchCategories,
  fetchMembers,
  fetchShoppingItems,
  fetchTasks,
  toDateString,
} from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { Profile, Task } from '@/lib/types';

// ------------------------------------------------------------
// Acciones que puede proponer la IA (espejo del esquema de la función)
// ------------------------------------------------------------
export interface CreateTaskAction {
  type: 'create_task';
  title: string;
  category_name?: string;
  frequency?: 'once' | 'daily' | 'weekly' | 'every_x_days';
  frequency_interval?: number;
  due_time?: string;
  estimated_minutes?: number;
  points?: number;
  assignment_type?: 'manual' | 'rotative';
  assigned_to_name?: string;
  rotation_member_names?: string[];
  chained_task_titles?: string[];
}

export interface AddShoppingAction {
  type: 'add_shopping_items';
  items: string[];
}

export interface SuggestionAction {
  type: 'suggestion';
  text: string;
}

export type AIAction = CreateTaskAction | AddShoppingAction | SuggestionAction;

export interface AIResponse {
  reply: string;
  actions: AIAction[];
}

// ------------------------------------------------------------
// Contexto que se manda a la IA (respeta RLS: solo datos del hogar)
// ------------------------------------------------------------
async function gatherContext(householdId: string) {
  const [members, categories, tasks, shopping] = await Promise.all([
    fetchMembers(householdId),
    fetchCategories(householdId),
    fetchTasks(householdId),
    fetchShoppingItems(householdId),
  ]);

  // Horarios de todos, resumidos
  const { data: schedules } = await supabase
    .from('work_schedules')
    .select('profile_id, kind, weekday, date, start_time, end_time')
    .in(
      'profile_id',
      members.map((m) => m.id)
    );

  return {
    members: members.map((m) => ({ name: m.name, role: m.role })),
    categories: categories.map((c) => c.name),
    existing_tasks: tasks.map((t) => ({ title: t.title, frequency: t.frequency })),
    shopping_pending: shopping.filter((s) => !s.done).map((s) => s.name),
    schedules:
      schedules?.map((s) => ({
        member: members.find((m) => m.id === s.profile_id)?.name,
        kind: s.kind,
        weekday: s.weekday,
        date: s.date,
        from: (s.start_time as string)?.slice(0, 5),
        to: (s.end_time as string)?.slice(0, 5),
      })) ?? [],
  };
}

export async function askAssistant(householdId: string, message: string): Promise<AIResponse> {
  const context = await gatherContext(householdId);
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: { message, context, today: toDateString(new Date()) },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { reply: data.reply ?? '', actions: Array.isArray(data.actions) ? data.actions : [] };
}

// ------------------------------------------------------------
// Aplicar una acción (bajo RLS del usuario). Devuelve un texto de
// resultado para mostrar/leer.
// ------------------------------------------------------------
export async function applyAction(
  action: AIAction,
  ctx: { householdId: string; profile: Profile }
): Promise<string> {
  if (action.type === 'add_shopping_items') {
    for (const name of action.items) {
      await addShoppingItem(ctx.householdId, name, ctx.profile.id);
    }
    return `Agregué a la lista de compras: ${action.items.join(', ')}.`;
  }

  if (action.type === 'create_task') {
    const [members, categories, tasks] = await Promise.all([
      fetchMembers(ctx.householdId),
      fetchCategories(ctx.householdId),
      fetchTasks(ctx.householdId),
    ]);

    const byName = (name?: string) =>
      name
        ? members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null
        : null;

    const categoryId =
      categories.find(
        (c) => c.name.toLowerCase() === (action.category_name ?? '').toLowerCase()
      )?.id ?? null;

    const rotationIds = (action.rotation_member_names ?? [])
      .map((n) => byName(n))
      .filter((id): id is string => !!id);

    const chainedIds = matchTaskTitles(action.chained_task_titles ?? [], tasks);

    const rotative = action.assignment_type === 'rotative';
    await createTask({
      household_id: ctx.householdId,
      title: action.title,
      description: null,
      category_id: categoryId,
      frequency: action.frequency ?? 'once',
      frequency_interval: action.frequency === 'every_x_days' ? action.frequency_interval ?? 2 : null,
      start_date: toDateString(new Date()),
      due_time: action.due_time ?? '20:00',
      estimated_minutes: action.estimated_minutes ?? 15,
      points: action.points ?? 10,
      assignment_type: rotative ? 'rotative' : 'manual',
      assigned_to: rotative ? null : byName(action.assigned_to_name) ?? ctx.profile.id,
      rotation_member_ids: rotative
        ? rotationIds.length >= 2
          ? rotationIds
          : members.map((m) => m.id)
        : [],
      chained_task_ids: chainedIds,
      created_by: ctx.profile.id,
    });
    return `Creé la tarea "${action.title}".`;
  }

  return action.text; // suggestion: no ejecuta nada
}

function matchTaskTitles(titles: string[], tasks: Task[]): string[] {
  return titles
    .map((t) => {
      const target = t.toLowerCase();
      return (
        tasks.find((task) => task.title.toLowerCase() === target) ??
        tasks.find(
          (task) =>
            task.title.toLowerCase().includes(target) || target.includes(task.title.toLowerCase())
        )
      )?.id;
    })
    .filter((id): id is string => !!id);
}
