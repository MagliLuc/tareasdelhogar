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
import {
  addDays,
  addSchedule,
  deleteSchedule,
  fetchMySchedules,
  humanDay,
  toDateString,
} from '@/lib/api';
import { spacing } from '@/lib/theme';
import { ScheduleKind, WorkSchedule } from '@/lib/types';
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

export const KIND_META: Record<ScheduleKind, { icon: string; label: string }> = {
  work: { icon: '💼', label: 'Trabajo' },
  study: { icon: '📚', label: 'Estudio' },
  leisure: { icon: '🚶', label: 'Salida' },
};

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function hhmm(time: string): string {
  return time.slice(0, 5);
}

function isAllDay(s: WorkSchedule): boolean {
  return hhmm(s.start_time) === '00:00' && hhmm(s.end_time) === '23:59';
}

export default function ScheduleScreen() {
  const { profile } = useAuth();
  const { colors, ts } = useTheme();
  const insets = useSafeAreaInsets();

  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [kind, setKind] = useState<ScheduleKind>('work');
  const [recurring, setRecurring] = useState(true);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(false);
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

  const dateOptions = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(new Date(), i);
    return { value: toDateString(d), label: humanDay(d) };
  });

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleAdd() {
    if (!profile?.id) return;
    if (recurring && selectedDays.length === 0) {
      setError('Elegí al menos un día de la semana');
      return;
    }
    if (!recurring && !selectedDate) {
      setError('Elegí la fecha de la salida');
      return;
    }
    const start = allDay ? '00:00' : startTime;
    const end = allDay ? '23:59' : endTime;
    if (!allDay && (!TIME_RE.test(startTime) || !TIME_RE.test(endTime))) {
      setError('Escribí las horas como HH:MM, por ejemplo 09:00');
      return;
    }
    if (!allDay && startTime >= endTime) {
      setError('La hora de fin tiene que ser después de la de inicio');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (recurring) {
        for (const day of selectedDays) {
          await addSchedule({
            profileId: profile.id,
            kind,
            weekday: day,
            startTime: start,
            endTime: end,
          });
        }
      } else {
        await addSchedule({
          profileId: profile.id,
          kind,
          date: selectedDate,
          startTime: start,
          endTime: end,
        });
      }
      AccessibilityInfo.announceForAccessibility('Horario agregado');
      setSelectedDays([]);
      setSelectedDate(null);
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
      AccessibilityInfo.announceForAccessibility('Horario eliminado');
      await load();
    } catch {
      setError('No se pudo eliminar. Probá de nuevo.');
    }
  }

  const recurrentes = schedules.filter((s) => s.weekday !== null);
  const puntuales = schedules
    .filter((s) => s.date !== null && s.date >= toDateString(new Date()))
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));

  const renderRow = (s: WorkSchedule, description: string) => (
    <View
      key={s.id}
      style={[styles.scheduleRow, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Text style={{ flex: 1, fontSize: ts(15), color: colors.text }}>
        {KIND_META[s.kind].icon} {KIND_META[s.kind].label} ·{' '}
        {isAllDay(s) ? 'todo el día' : `${hhmm(s.start_time)} – ${hhmm(s.end_time)}`}
      </Text>
      <Pressable
        onPress={() => handleDelete(s)}
        accessibilityRole="button"
        accessibilityLabel={`Eliminar: ${KIND_META[s.kind].label} ${description}`}
        hitSlop={8}
        style={styles.deleteButton}
      >
        <Ionicons name="trash-outline" size={22} color={colors.danger} />
      </Pressable>
    </View>
  );

  const sectionHeader = (label: string) => (
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
      {label}
    </Text>
  );

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
          Mis horarios y salidas
        </Text>
        <Text style={{ fontSize: ts(14), color: colors.textMuted, marginTop: 4, marginBottom: spacing.md }}>
          El reparto de tareas evita asignarte cosas cuando no estás. El trabajo y el estudio
          además suman puntos (1 por hora); las salidas no.
        </Text>

        {/* Horarios semanales */}
        {recurrentes.length > 0 && sectionHeader('Todas las semanas')}
        {WEEKDAYS.map((day) => {
          const daySchedules = recurrentes.filter((s) => s.weekday === day.value);
          if (daySchedules.length === 0) return null;
          return (
            <View key={day.value} style={{ marginBottom: spacing.sm }}>
              <Text style={{ fontSize: ts(15), fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                {day.full}
              </Text>
              {daySchedules.map((s) => renderRow(s, `del ${day.full}`))}
            </View>
          );
        })}

        {/* Salidas puntuales */}
        {puntuales.length > 0 && sectionHeader('Días puntuales')}
        {puntuales.map((s) => (
          <View key={s.id} style={{ marginBottom: spacing.xs }}>
            <Text style={{ fontSize: ts(15), fontWeight: '700', color: colors.text, marginBottom: 4 }}>
              {humanDay(new Date(`${s.date}T12:00:00`))}
            </Text>
            {renderRow(s, `del ${s.date}`)}
          </View>
        ))}

        {schedules.length === 0 && (
          <Text style={{ fontSize: ts(14), color: colors.textMuted, marginBottom: spacing.md }}>
            Todavía no cargaste ningún horario.
          </Text>
        )}

        {/* Agregar */}
        {sectionHeader('Agregar')}

        <Text style={{ fontSize: ts(14), fontWeight: '600', color: colors.text, marginBottom: spacing.xs }}>
          ¿Qué es?
        </Text>
        <View style={styles.chipRow}>
          {(Object.keys(KIND_META) as ScheduleKind[]).map((k) => (
            <Chip
              key={k}
              label={`${KIND_META[k].icon} ${KIND_META[k].label}`}
              selected={kind === k}
              onPress={() => setKind(k)}
            />
          ))}
        </View>
        {kind === 'leisure' && (
          <Text style={{ fontSize: ts(13), color: colors.textMuted, marginBottom: spacing.sm }}>
            Paseos y visitas: no suman puntos, pero avisan que no vas a estar.
          </Text>
        )}

        <Text style={{ fontSize: ts(14), fontWeight: '600', color: colors.text, marginBottom: spacing.xs }}>
          ¿Cuándo?
        </Text>
        <View style={styles.chipRow}>
          <Chip label="Todas las semanas" selected={recurring} onPress={() => setRecurring(true)} />
          <Chip label="Un día puntual" selected={!recurring} onPress={() => setRecurring(false)} />
        </View>

        {recurring ? (
          <View style={styles.chipRow}>
            {WEEKDAYS.map((day) => (
              <Chip
                key={day.value}
                label={day.label}
                selected={selectedDays.includes(day.value)}
                onPress={() => toggleDay(day.value)}
              />
            ))}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
            {dateOptions.map((d) => (
              <Chip
                key={d.value}
                label={d.label}
                selected={selectedDate === d.value}
                onPress={() => setSelectedDate(d.value)}
              />
            ))}
          </ScrollView>
        )}

        <View style={styles.chipRow}>
          <Chip
            label="🌞 Todo el día (salgo y vuelvo)"
            selected={allDay}
            onPress={() => setAllDay(!allDay)}
          />
        </View>

        {!allDay && (
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Salgo de casa"
                value={startTime}
                onChangeText={setStartTime}
                placeholder="09:00"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Vuelvo a casa"
                value={endTime}
                onChangeText={setEndTime}
                placeholder="17:00"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
          </View>
        )}

        <ErrorText message={error} />
        <Button title="Agregar" onPress={handleAdd} loading={saving} />
        <View style={{ height: spacing.sm }} />
        <Button title="Listo" variant="secondary" onPress={() => router.back()} />
        <View style={{ height: spacing.xl + insets.bottom }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
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
