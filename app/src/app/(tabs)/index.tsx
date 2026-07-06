import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  AccessibilityInfo,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TaskCard } from '@/components/task-card';
import { Button } from '@/components/ui';
import {
  completeInstance,
  endOfDayISO,
  fetchInstances,
  startOfDayISO,
  uncompleteInstance,
} from '@/lib/api';
import { scheduleLocalReminders } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/lib/theme';
import { TaskInstance } from '@/lib/types';
import { useRealtimeInstances } from '@/hooks/use-realtime-instances';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

export default function TodayScreen() {
  const { profile } = useAuth();
  const { colors, ts } = useTheme();
  const insets = useSafeAreaInsets();
  const [instances, setInstances] = useState<TaskInstance[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.household_id) return;
    try {
      setError(null);
      // Genera instancias que falten y trae desde hace 7 días
      // (para mostrar atrasadas) hasta el fin de hoy
      await supabase.rpc('generate_task_instances', { p_days_ahead: 7 });
      const from = new Date();
      from.setDate(from.getDate() - 7);
      const data = await fetchInstances(
        profile.household_id,
        startOfDayISO(from),
        endOfDayISO(new Date())
      );
      setInstances(data);
      // Recordatorios locales para mis tareas de hoy (60 min antes)
      scheduleLocalReminders(data, profile.id);
    } catch {
      setError('No pudimos cargar tus tareas. Deslizá hacia abajo para reintentar.');
    }
  }, [profile?.household_id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useRealtimeInstances(profile?.household_id ?? null, load);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggleComplete(instance: TaskInstance) {
    try {
      if (instance.status === 'done') {
        await uncompleteInstance(instance.id);
        AccessibilityInfo.announceForAccessibility('Tarea desmarcada');
      } else {
        await completeInstance(instance.id);
        AccessibilityInfo.announceForAccessibility(
          `Tarea completada. Sumaste ${instance.task?.points ?? 0} puntos`
        );
      }
      await load();
    } catch {
      setError('No se pudo actualizar la tarea. Probá de nuevo.');
    }
  }

  const mine = instances.filter((i) => i.assigned_to === profile?.id);
  const pending = mine.filter((i) => i.status === 'pending');
  const doneToday = mine.filter(
    (i) => i.status === 'done' && new Date(i.due_at) >= new Date(startOfDayISO(new Date()))
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: ts(24), fontWeight: '800', color: colors.text }}
      >
        ¡Hola, {profile?.name}! 👋
      </Text>
      <Text style={{ fontSize: ts(15), color: colors.textMuted, marginBottom: spacing.md }}>
        {pending.length === 0
          ? 'No tenés tareas pendientes. ¡Bien ahí! 🎉'
          : `Tenés ${pending.length} ${pending.length === 1 ? 'tarea pendiente' : 'tareas pendientes'}`}
      </Text>

      <View style={{ marginBottom: spacing.md }}>
        <Button
          title="🛒 Lista de compras"
          variant="secondary"
          onPress={() => router.push('/shopping')}
          accessibilityHint="Abre la lista de compras compartida del hogar"
        />
      </View>

      {!!error && (
        <Text
          accessibilityLiveRegion="assertive"
          style={{ color: colors.danger, fontSize: ts(14), marginBottom: spacing.md }}
        >
          {error}
        </Text>
      )}

      {pending.map((instance) => (
        <TaskCard
          key={instance.id}
          instance={instance}
          onPress={() => router.push(`/task/${instance.id}`)}
          onToggleComplete={() => toggleComplete(instance)}
        />
      ))}

      {doneToday.length > 0 && (
        <>
          <Text
            accessibilityRole="header"
            style={{
              fontSize: ts(16),
              fontWeight: '700',
              color: colors.textMuted,
              marginTop: spacing.lg,
              marginBottom: spacing.sm,
            }}
          >
            Completadas hoy ✅
          </Text>
          {doneToday.map((instance) => (
            <TaskCard
              key={instance.id}
              instance={instance}
              onPress={() => router.push(`/task/${instance.id}`)}
              onToggleComplete={() => toggleComplete(instance)}
            />
          ))}
        </>
      )}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
});
