import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, ErrorText } from '@/components/ui';
import {
  completeInstance,
  fetchInstance,
  fetchInstanceEvents,
  fetchMembers,
  humanDay,
  humanTime,
  InstanceEvent,
  reassignInstance,
  uncompleteInstance,
} from '@/lib/api';
import { spacing } from '@/lib/theme';
import { Profile, TaskInstance } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

function eventLabel(e: InstanceEvent): string {
  const when = `${humanDay(new Date(e.created_at))} ${humanTime(e.created_at)}`;
  switch (e.type) {
    case 'assigned':
      return `📌 Asignada a ${e.to_p?.name ?? 'alguien'} — ${when}`;
    case 'reassigned':
      return `🔄 ${e.actor?.name ?? 'Alguien'} se la pasó de ${e.from_p?.name ?? '?'} a ${e.to_p?.name ?? '?'} — ${when}`;
    case 'completed':
      return `✅ Completada por ${e.actor?.name ?? 'alguien'} — ${when}`;
    case 'uncompleted':
      return `↩️ ${e.actor?.name ?? 'Alguien'} la desmarcó — ${when}`;
    default:
      return `Creada — ${when}`;
  }
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { colors, ts } = useTheme();
  const insets = useSafeAreaInsets();

  const [instance, setInstance] = useState<TaskInstance | null>(null);
  const [events, setEvents] = useState<InstanceEvent[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [reassigning, setReassigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !profile?.household_id) return;
    try {
      setError(null);
      const [inst, evts, mems] = await Promise.all([
        fetchInstance(id),
        fetchInstanceEvents(id),
        fetchMembers(profile.household_id),
      ]);
      setInstance(inst);
      setEvents(evts);
      setMembers(mems);
    } catch {
      setError('No pudimos cargar la tarea');
    }
  }, [id, profile?.household_id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggleComplete() {
    if (!instance) return;
    setBusy(true);
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
      setError('No se pudo actualizar. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReassign(toId: string) {
    if (!instance) return;
    setBusy(true);
    try {
      await reassignInstance(instance.id, toId);
      const toName = members.find((m) => m.id === toId)?.name ?? 'otro miembro';
      AccessibilityInfo.announceForAccessibility(`Tarea pasada a ${toName}`);
      setReassigning(false);
      await load();
    } catch {
      setError('No se pudo reasignar. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (!instance) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        {error ? <ErrorText message={error} /> : <ActivityIndicator size="large" color={colors.primary} />}
      </View>
    );
  }

  const task = instance.task;
  const done = instance.status === 'done';
  const overdue = !done && new Date(instance.due_at) < new Date();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
    >
      <Text accessibilityRole="header" style={{ fontSize: ts(24), fontWeight: '800', color: colors.text }}>
        {task?.category?.icon ?? '📌'} {task?.title}
      </Text>

      {!!task?.description && (
        <Text style={{ fontSize: ts(15), color: colors.textMuted, marginTop: spacing.xs }}>
          {task.description}
        </Text>
      )}

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={{ fontSize: ts(15), color: colors.text }}>
          Estado:{' '}
          <Text style={{ fontWeight: '700', color: done ? colors.success : overdue ? colors.danger : colors.text }}>
            {done ? '✅ Completada' : overdue ? '⚠ Atrasada' : '⏳ Pendiente'}
          </Text>
        </Text>
        <Text style={{ fontSize: ts(15), color: colors.text, marginTop: spacing.xs }}>
          Vence: {humanDay(new Date(instance.due_at))} a las {humanTime(instance.due_at)}
        </Text>
        <Text style={{ fontSize: ts(15), color: colors.text, marginTop: spacing.xs }}>
          Asignada a:{' '}
          <Text style={{ fontWeight: '700' }}>
            {instance.assignee?.name ?? 'Sin asignar'}
            {instance.assigned_to === profile?.id ? ' (vos)' : ''}
          </Text>
        </Text>
        <Text style={{ fontSize: ts(15), color: colors.text, marginTop: spacing.xs }}>
          Vale: <Text style={{ fontWeight: '700', color: colors.primary }}>{task?.points ?? 0} puntos</Text>
          {'  ·  '}~{task?.estimated_minutes ?? 0} min
        </Text>
      </View>

      <ErrorText message={error} />

      <Button
        title={done ? 'Desmarcar (no estaba lista)' : '✓ Marcar como completada'}
        onPress={handleToggleComplete}
        loading={busy && !reassigning}
        variant={done ? 'secondary' : 'primary'}
      />
      <View style={{ height: spacing.sm }} />

      {!done &&
        (reassigning ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: ts(15), fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>
              ¿A quién se la pasás? (le llega una notificación)
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {members
                .filter((m) => m.id !== instance.assigned_to)
                .map((m) => (
                  <Chip key={m.id} label={m.name} selected={false} onPress={() => handleReassign(m.id)} />
                ))}
            </View>
            <Button title="Cancelar" variant="secondary" onPress={() => setReassigning(false)} />
          </View>
        ) : (
          <Button
            title="Pasar a otro miembro"
            variant="secondary"
            onPress={() => setReassigning(true)}
            accessibilityHint="Muestra la lista de miembros para reasignar la tarea"
          />
        ))}

      {events.length > 0 && (
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
            Historial
          </Text>
          {events.map((e) => (
            <Text
              key={e.id}
              style={{ fontSize: ts(14), color: colors.text, marginBottom: spacing.sm, lineHeight: ts(20) }}
            >
              {eventLabel(e)}
            </Text>
          ))}
        </>
      )}

      <View style={{ height: spacing.sm }} />
      <Button title="Volver" variant="secondary" onPress={() => router.back()} />
      <View style={{ height: spacing.xl + insets.bottom }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
    marginVertical: spacing.md,
  },
});
