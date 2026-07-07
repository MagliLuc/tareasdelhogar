import { router } from 'expo-router';
import React from 'react';
import { AccessibilityInfo } from 'react-native';

import { TaskForm, TaskFormResult } from '@/components/task-form';
import { createTask } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

export default function NewTaskScreen() {
  const { profile } = useAuth();

  async function handleSubmit(values: TaskFormResult) {
    if (!profile?.household_id) return;
    await createTask({
      ...values,
      household_id: profile.household_id,
      created_by: profile.id,
    });
    AccessibilityInfo.announceForAccessibility('Tarea creada');
    router.back();
  }

  return (
    <TaskForm
      heading="Nueva tarea"
      submitLabel="Crear tarea"
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
    />
  );
}
