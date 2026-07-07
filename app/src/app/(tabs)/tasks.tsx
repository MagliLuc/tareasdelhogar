import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
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
  fetchInstances,
  fetchMembers,
  humanDay,
  startOfDayISO,
  toDateString,
  uncompleteInstance,
} from '@/lib/api';
import { spacing } from '@/lib/theme';
import { Profile, TaskInstance } from '@/lib/types';
import { useRealtimeInstances } from '@/hooks/use-realtime-instances';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

type StatusFilter = 'pending' | 'done' | 'all';

export default function TasksScreen() {
  const { profile } = useAuth();
  const { colors, ts } = useTheme();
  const insets = useSafeAreaInsets();

  const [instances, setInstances] = useState<TaskInstance[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [memberFilter, setMemberFilter] = useState<string | null>(null); // null = todos
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.household_id) return;
    try {
      setError(null);
      const [inst, mems] = await Promise.all([
        // Desde hace 7 días (atrasadas/hechas) hasta 7 días adelante
        fetchInstances(
          profile.household_id,
          startOfDayISO(addDays(new Date(), -7)),
          endOfDayISO(addDays(new Date(), 7))
        ),
        fetchMembers(profile.household_id),
      ]);
      setInstances(inst);
      setMembers(mems);
    } catch {
      setError('No pudimos cargar las tareas. Deslizá hacia abajo para reintentar.');
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
        AccessibilityInfo.announceForAccessibility('Tarea completada');
      }
      await load();
    } catch {
      setError('No se pudo actualizar la tarea. Probá de nuevo.');
    }
  }

  const filtered = useMemo(
    () =>
      instances.filter((i) => {
        if (memberFilter && i.assigned_to !== memberFilter) return false;
        if (statusFilter !== 'all' && i.status !== statusFilter) return false;
        // Las hechas de días pasados solo se ven con el filtro "Hechas"/"Todas"
        if (statusFilter === 'pending' && new Date(i.due_at) < new Date(startOfDayISO(new Date())))
          return true; // atrasadas pendientes sí se muestran
        return true;
      }),
    [instances, memberFilter, statusFilter]
  );

  // Agrupar por día
  const groups = useMemo(() => {
    const map = new Map<string, TaskInstance[]>();
    for (const i of filtered) {
      const key = toDateString(new Date(i.due_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: ts(24), fontWeight: '800', color: colors.text, marginBottom: spacing.md }}
        >
          Tareas del hogar
        </Text>

        {/* Filtro por miembro */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
          <Chip label="Todos" selected={memberFilter === null} onPress={() => setMemberFilter(null)} />
          {members.map((m) => (
            <Chip
              key={m.id}
              label={m.name}
              selected={memberFilter === m.id}
              onPress={() => setMemberFilter(memberFilter === m.id ? null : m.id)}
            />
          ))}
        </ScrollView>

        {/* Filtro por estado */}
        <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
          <Chip
            label="Pendientes"
            selected={statusFilter === 'pending'}
            onPress={() => setStatusFilter('pending')}
          />
          <Chip label="Hechas" selected={statusFilter === 'done'} onPress={() => setStatusFilter('done')} />
          <Chip label="Todas" selected={statusFilter === 'all'} onPress={() => setStatusFilter('all')} />
        </View>

        {!!error && (
          <Text
            accessibilityLiveRegion="assertive"
            style={{ color: colors.danger, fontSize: ts(14), marginBottom: spacing.md }}
          >
            {error}
          </Text>
        )}

        {groups.length === 0 && !error && (
          <Text style={{ fontSize: ts(15), color: colors.textMuted, marginTop: spacing.lg }}>
            No hay tareas con estos filtros. Creá una con el botón de abajo. ➕
          </Text>
        )}

        {groups.map(([dateKey, dayInstances]) => (
          <View key={dateKey}>
            <Text
              accessibilityRole="header"
              style={{
                fontSize: ts(15),
                fontWeight: '700',
                color: colors.textMuted,
                marginTop: spacing.md,
                marginBottom: spacing.sm,
              }}
            >
              {humanDay(new Date(dayInstances[0].due_at))}
            </Text>
            {dayInstances.map((instance) => (
              <TaskCard
                key={instance.id}
                instance={instance}
                showAssignee
                canComplete={instance.assigned_to === profile?.id || instance.assigned_to == null}
                onPress={() => router.push(`/task/${instance.id}`)}
                onToggleComplete={() => toggleComplete(instance)}
              />
            ))}
          </View>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Botón flotante: nueva tarea */}
      <Pressable
        onPress={() => router.push('/task/new')}
        accessibilityRole="button"
        accessibilityLabel="Crear tarea nueva"
        style={[
          styles.fab,
          { backgroundColor: colors.primary, bottom: 150 + insets.bottom },
        ]}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
