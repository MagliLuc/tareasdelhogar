import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, View } from 'react-native';

import { TaskForm, TaskFormResult } from '@/components/task-form';
import { Button } from '@/components/ui';
import { deleteTask, fetchTask, fetchTaskChains, fetchTaskRotation, updateTask } from '@/lib/api';
import { spacing } from '@/lib/theme';
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

  function confirmDelete() {
    if (!task) return;
    Alert.alert(
      `¿Eliminar "${task.title}"?`,
      'Se borran sus ocurrencias pendientes y no se genera más. El historial de las que ya se completaron se conserva.',
      [
        { text: 'No, volver', style: 'cancel' },
        {
          text: 'Sí, eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTask(task.id);
              AccessibilityInfo.announceForAccessibility('Tarea eliminada');
              router.dismissAll();
            } catch {
              Alert.alert('Error', 'No se pudo eliminar la tarea. Probá de nuevo.');
            }
          },
        },
      ]
    );
  }

  if (!task) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TaskForm
        heading="Editar tarea"
        submitLabel="Guardar cambios"
        initial={{ task, rotationIds, chainedIds }}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
      <View
        style={{
          padding: spacing.lg,
          paddingTop: 0,
          backgroundColor: colors.background,
        }}
      >
        <Button
          title="🗑 Eliminar tarea (y sus repeticiones)"
          variant="danger"
          onPress={confirmDelete}
          accessibilityHint="Elimina la tarea definitivamente, con confirmación"
        />
      </View>
    </View>
  );
}
