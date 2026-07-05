import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,

  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';
import { Button, Chip, ErrorText, Input } from '@/components/ui';
import { addSchedule, deleteSchedule, fetchMySchedules } from '@/lib/api';
import { spacing } from '@/lib/theme';
import { WorkSchedule } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

const WEEKDAYS = [
  { value: 1, label: 'Lun', full: 'Lunes' },
  { value: 2, label: 'Mar', full: 'Martes' },
  { value: 3, label: 'Mié', full: 'Miércoles' },
  { value: 4, label: 'Jue', full: 'Jueves' },
  { value: 5, label: 'Vie', full: 'Viernes' },
  { value: 6, label: 'Sáb', full: 'Sábado' },
  { value: 7, label: 'Dom', full: 'Domingo' },
];

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function hhmm(time: string): string {
  return time.slice(0, 5);
}

export default function ScheduleScreen() {
  const { profile } = useAuth();
  const { colors, ts } = useTheme();
  const insets = useSafeAreaInsets();

  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      setSchedules(await fetchMySchedules(profile.id));
    } catch {
      setError('No pudimos cargar tu horario');
    }
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleAdd() {
    if (!profile?.id) return;
    if (selectedDays.length === 0) {
      setError('Elegí al menos un día');
      return;
    }
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      setError('Escribí las horas como HH:MM, por ejemplo 09:00');
      return;
    }
    if (startTime >= endTime) {
      setError('La hora de fin tiene que ser después de la de inicio');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      for (const day of selectedDays) {
        await addSchedule(profile.id, day, startTime, endTime);
      }
      AccessibilityInfo.announceForAccessibility('Franja horaria agregada');
      setSelectedDays([]);
      await load();
    } catch {
      setError('No se pudo guardar. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(schedule: WorkSchedule) {
    try {
      await deleteSchedule(schedule.id);
      AccessibilityInfo.announceForAccessibility('Franja eliminada');
      await load();
    } catch {
      setError('No se pudo eliminar. Probá de nuevo.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior="padding"
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: ts(22), fontWeight: '800', color: colors.text }}
        >
          Mi horario laboral
        </Text>
        <Text style={{ fontSize: ts(14), color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg }}>
          El reparto de tareas rotativas usa este horario para no sobrecargarte los días que
          trabajás.
        </Text>

        {/* Franjas actuales */}
        {WEEKDAYS.map((day) => {
          const daySchedules = schedules.filter((s) => s.weekday === day.value);
          if (daySchedules.length === 0) return null;
          return (
            <View key={day.value} style={{ marginBottom: spacing.sm }}>
              <Text style={{ fontSize: ts(15), fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                {day.full}
              </Text>
              {daySchedules.map((s) => (
                <View
                  key={s.id}
                  style={[styles.scheduleRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={{ flex: 1, fontSize: ts(15), color: colors.text }}>
                    {hhmm(s.start_time)} – {hhmm(s.end_time)}
                  </Text>
                  <Pressable
                    onPress={() => handleDelete(s)}
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar franja del ${day.full} de ${hhmm(s.start_time)} a ${hhmm(s.end_time)}`}
                    hitSlop={8}
                    style={styles.deleteButton}
                  >
                    <Ionicons name="trash-outline" size={22} color={colors.danger} />
                  </Pressable>
                </View>
              ))}
            </View>
          );
        })}
        {schedules.length === 0 && (
          <Text style={{ fontSize: ts(14), color: colors.textMuted, marginBottom: spacing.md }}>
            Todavía no cargaste ninguna franja.
          </Text>
        )}

        {/* Agregar franja */}
        <Text
          accessibilityRole="header"
          style={{
            fontSize: ts(16),
            fontWeight: '700',
            color: colors.textMuted,
            marginTop: spacing.md,
            marginBottom: spacing.sm,
          }}
        >
          Agregar franja
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm }}>
          {WEEKDAYS.map((day) => (
            <Chip
              key={day.value}
              label={day.label}
              selected={selectedDays.includes(day.value)}
              onPress={() => toggleDay(day.value)}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Desde"
              value={startTime}
              onChangeText={setStartTime}
              placeholder="09:00"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Hasta"
              value={endTime}
              onChangeText={setEndTime}
              placeholder="17:00"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>
        </View>

        <ErrorText message={error} />
        <Button title="Agregar franja" onPress={handleAdd} loading={saving} />
        <View style={{ height: spacing.sm }} />
        <Button title="Listo" variant="secondary" onPress={() => router.back()} />
        <View style={{ height: spacing.xl + insets.bottom }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs,
  },
  deleteButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
