import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, View } from 'react-native';

import { TaskForm, TaskFormResult } from '@/components/task-form';
import { fetchTask, fetchTaskChains, fetchTaskRotation, updateTask } from '@/lib/api';
import { Task } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

export default function EditTaskScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [task, setTask] = useState<Task | null>(null);
  const [rotationIds, setRotationIds] = useState<string[]>([]);
  const [chainedIds, setChainedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!taskId) return;
    Promise.all([fetchTask(taskId), fetchTaskRotation(taskId), fetchTaskChains(taskId)])
      .then(([t, rot, ch]) => {
        setTask(t);
        setRotationIds(rot);
        setChainedIds(ch);
      })
      .catch(() => router.back());
  }, [taskId]);

  async function handleSubmit(values: TaskFormResult) {
    if (!profile?.household_id || !task) return;
    await updateTask(task.id, {
      ...values,
      household_id: profile.household_id,
      created_by: profile.id,
    });
    AccessibilityInfo.announceForAccessibility('Tarea actualizada');
    router.back();
  }

  if (!task) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <TaskForm
      heading="Editar tarea"
      submitLabel="Guardar cambios"
      initial={{ task, rotationIds, chainedIds }}
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
    />
  );
}
