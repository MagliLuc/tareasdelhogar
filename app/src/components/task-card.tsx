import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { humanTime } from '@/lib/api';
import { spacing } from '@/lib/theme';
import { TaskInstance } from '@/lib/types';
import { useTheme } from '@/providers/settings-provider';

interface TaskCardProps {
  instance: TaskInstance;
  onPress: () => void;
  onToggleComplete: () => void;
  showAssignee?: boolean;
  /** false cuando la tarea es de otro: el casillero queda bloqueado */
  canComplete?: boolean;
}

export function TaskCard({
  instance,
  onPress,
  onToggleComplete,
  showAssignee = false,
  canComplete = true,
}: TaskCardProps) {
  const { colors, ts } = useTheme();
  const done = instance.status === 'done';
  const cancelled = instance.status === 'cancelled';
  const overdue = !done && !cancelled && new Date(instance.due_at) < new Date();
  const title = instance.task?.title ?? 'Tarea';
  const icon = instance.task?.category?.icon ?? '📌';
  const points = instance.task?.points ?? 0;

  // Todo el estado en una sola frase para el lector de pantalla
  const a11yLabel = [
    title,
    cancelled
      ? 'cancelada'
      : done
        ? 'completada'
        : overdue
          ? 'atrasada'
          : `vence a las ${humanTime(instance.due_at)}`,
    showAssignee && instance.assignee ? `asignada a ${instance.assignee.name}` : null,
    !cancelled ? `vale ${points} puntos` : null,
    !canComplete && !done && !cancelled ? 'solo puede completarla su asignado' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Abre el detalle de la tarea"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: overdue ? colors.danger : colors.border,
          borderWidth: overdue ? 2 : 1,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Pressable
        onPress={canComplete && !cancelled ? onToggleComplete : undefined}
        disabled={!canComplete || cancelled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, disabled: !canComplete || cancelled }}
        accessibilityLabel={
          cancelled
            ? `${title} está cancelada`
            : !canComplete
              ? `${title}: solo puede completarla su asignado`
              : done
                ? `Desmarcar ${title}`
                : `Marcar ${title} como completada`
        }
        hitSlop={8}
        style={[
          styles.checkbox,
          {
            borderColor: done ? colors.success : colors.border,
            backgroundColor: done ? colors.success : 'transparent',
            opacity: !canComplete || cancelled ? 0.35 : 1,
          },
        ]}
      >
        {done && <Ionicons name="checkmark" size={22} color="#fff" />}
        {cancelled && <Ionicons name="close" size={22} color={colors.textMuted} />}
      </Pressable>

      <View style={styles.body}>
        <Text
          style={{
            fontSize: ts(16),
            fontWeight: '700',
            color: cancelled ? colors.textMuted : colors.text,
            textDecorationLine: done || cancelled ? 'line-through' : 'none',
          }}
        >
          {icon} {title}
        </Text>
        <View style={styles.metaRow}>
          {cancelled ? (
            <Text style={{ fontSize: ts(13), color: colors.textMuted, fontWeight: '700' }}>
              🚫 Cancelada
            </Text>
          ) : overdue ? (
            <Text style={{ fontSize: ts(13), color: colors.danger, fontWeight: '700' }}>
              ⚠ Atrasada
            </Text>
          ) : (
            <Text style={{ fontSize: ts(13), color: colors.textMuted }}>
              {done ? 'Completada' : `Vence ${humanTime(instance.due_at)}`}
            </Text>
          )}
          {showAssignee && instance.assignee && (
            <View style={styles.assignee}>
              <View style={[styles.dot, { backgroundColor: instance.assignee.color }]} />
              <Text style={{ fontSize: ts(13), color: colors.textMuted }}>
                {instance.assignee.name}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Text style={{ fontSize: ts(13), fontWeight: '700', color: colors.primary }}>
        {points} pts
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  assignee: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
