// Tipos del modelo de datos (espejo de supabase/migrations)

export type Role = 'adult' | 'child';
export type Frequency = 'once' | 'daily' | 'weekly' | 'every_x_days';
export type AssignmentType = 'manual' | 'rotative';
export type InstanceStatus = 'pending' | 'done';

export interface Household {
  id: string;
  name: string;
  invite_code: string;
  timezone: string;
}

export interface Profile {
  id: string;
  household_id: string | null;
  name: string;
  avatar_url: string | null;
  color: string;
  role: Role;
}

export interface WorkSchedule {
  id: string;
  profile_id: string;
  weekday: number; // 1 = lunes ... 7 = domingo
  start_time: string; // 'HH:MM:SS'
  end_time: string;
}

export interface Category {
  id: string;
  household_id: string;
  name: string;
  icon: string;
}

export interface Task {
  id: string;
  household_id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  frequency: Frequency;
  frequency_interval: number | null;
  start_date: string; // 'YYYY-MM-DD'
  due_time: string;
  estimated_minutes: number;
  points: number;
  assignment_type: AssignmentType;
  assigned_to: string | null;
  active: boolean;
}

export interface TaskInstance {
  id: string;
  task_id: string;
  household_id: string;
  assigned_to: string | null;
  due_at: string; // ISO timestamp
  status: InstanceStatus;
  completed_by: string | null;
  completed_at: string | null;
  // joins habituales
  task?: Task & { category?: Category | null };
  assignee?: Profile | null;
}

export interface WeeklyRankingRow {
  household_id: string;
  profile_id: string;
  name: string;
  color: string;
  total_points: number;
}
