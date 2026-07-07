import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
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
import { Chip } from '@/components/ui';
import {
  addDays,
  completeInstance,
  endOfDayISO,
  fetchHouseholdSchedules,
  fetchInstances,
  humanDay,
  ScheduleWithProfile,
  startOfDayISO,
  toDateString,
  uncompleteInstance,
} from '@/lib/api';
import { spacing } from '@/lib/theme';
import { TaskInstance } from '@/lib/types';
import { useRealtimeInstances } from '@/hooks/use-realtime-instances';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

/** Lunes de la semana actual */
function mondayOfThisWeek(): Date {
  const d = new Date();
  const isoDow = d.getDay() === 0 ? 7 : d.getDay(); // 1=lunes...7=domingo
  return addDays(d, 1 - isoDow);
}

function hhmm(time: string): string {
  return time.slice(0, 5);
}

export default function CalendarScreen() {
  const { profile } = useAuth();
  const { colors, ts } = useTheme();
  const insets = useSafeAreaInsets();

  const [selectedDate, setSelectedDate] = useState(toDateString(new Date()));
  const [instances, setInstances] = useState<TaskInstance[]>([]);
  const [schedules, setSchedules] = useState<ScheduleWithProfile[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monday = useMemo(mondayOfThisWeek, []);
  // Dos semanas: la actual y la que viene
  const days = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDays(monday, i)),
    [monday]
  );

  const load = useCallback(async () => {
    if (!profile?.household_id) return;
    try {
      setError(null);
      const [inst, sched] = await Promise.all([
        fetchInstances(
          profile.household_id,
          startOfDayISO(monday),
          endOfDayISO(addDays(monday, 13))
        ),
        fetchHouseholdSchedules(profile.household_id),
      ]);
      setInstances(inst);
      setSchedules(sched);
    } catch {
      setError('No pudimos cargar el calendario. Deslizá hacia abajo para reintentar.');
    }
  }, [profile?.household_id, monday]);

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
        AccessibilityInfo.announceForAccessibility('Tarea completada');
      }
      await load();
    } catch {
      setError('No se pudo actualizar la tarea. Probá de nuevo.');
    }
  }

  const selected = new Date(`${selectedDate}T12:00:00`);
  const selectedIsoDow = selected.getDay() === 0 ? 7 : selected.getDay();
  const dayInstances = instances.filter(
    (i) => toDateString(new Date(i.due_at)) === selectedDate
  );
  // Semanales de ese día de la semana + salidas puntuales de esa fecha
  const daySchedules = schedules.filter(
    (s) => (s.date === null && s.weekday === selectedIsoDow) || s.date === selectedDate
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: ts(24), fontWeight: '800', color: colors.text, marginBottom: spacing.md }}
      >
        Calendario
      </Text>

      {/* Selector de día (dos semanas) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
        {days.map((d) => {
          const key = toDateString(d);
          const count = instances.filter(
            (i) => toDateString(new Date(i.due_at)) === key && i.status === 'pending'
          ).length;
          return (
            <Chip
              key={key}
              label={`${humanDay(d)}${count > 0 ? ` (${count})` : ''}`}
              selected={selectedDate === key}
              onPress={() => setSelectedDate(key)}
            />
          );
        })}
      </ScrollView>

      {!!error && (
        <Text
          accessibilityLiveRegion="assertive"
          style={{ color: colors.danger, fontSize: ts(14), marginBottom: spacing.md }}
        >
          {error}
        </Text>
      )}

      {/* Quién no está y cuándo: explica el reparto */}
      <Text
        accessibilityRole="header"
        style={{ fontSize: ts(16), fontWeight: '700', color: colors.textMuted, marginBottom: spacing.sm }}
      >
        Quién no está — {humanDay(selected)}
      </Text>
      {daySchedules.length === 0 ? (
        <Text style={{ fontSize: ts(14), color: colors.textMuted, marginBottom: spacing.md }}>
          Nadie cargó horarios ni salidas para este día: están todos disponibles.
        </Text>
      ) : (
        <View style={{ marginBottom: spacing.md }}>
          {daySchedules.map((s) => {
            const verb =
              s.kind === 'work' ? 'trabaja' : s.kind === 'study' ? 'estudia' : 'está afuera';
            const icon = s.kind === 'work' ? '💼' : s.kind === 'study' ? '📚' : '🚶';
            const allDay = hhmm(s.start_time) === '00:00' && hhmm(s.end_time) === '23:59';
            const range = allDay ? 'todo el día' : `${hhmm(s.start_time)}–${hhmm(s.end_time)}`;
            return (
              <View
                key={s.id}
                accessible
                accessibilityLabel={`${s.profile.name} ${verb} ${range}`}
                style={[
                  styles.scheduleRow,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={[styles.dot, { backgroundColor: s.profile.color }]} />
                <Text style={{ fontSize: ts(14), color: colors.text, flex: 1 }}>
                  <Text style={{ fontWeight: '700' }}>{s.profile.name}</Text> {icon} {verb}{' '}
                  {range}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Tareas del día */}
      <Text
        accessibilityRole="header"
        style={{ fontSize: ts(16), fontWeight: '700', color: colors.textMuted, marginBottom: spacing.sm }}
      >
        Tareas — {humanDay(selected)}
      </Text>
      {dayInstances.length === 0 ? (
        <Text style={{ fontSize: ts(14), color: colors.textMuted }}>
          No hay tareas para este día. 🎉
        </Text>
      ) : (
        dayInstances.map((instance) => (
          <TaskCard
            key={instance.id}
            instance={instance}
            showAssignee
            canComplete={instance.assigned_to === profile?.id || instance.assigned_to == null}
            onPress={() => router.push(`/task/${instance.id}`)}
            onToggleComplete={() => toggleComplete(instance)}
          />
        ))
      )}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
});
