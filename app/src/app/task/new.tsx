import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, ErrorText, Input } from '@/components/ui';
import { addDays, createTask, fetchCategories, fetchMembers, humanDay, toDateString } from '@/lib/api';
import { spacing } from '@/lib/theme';
import { Category, Frequency, Profile } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'once', label: 'Una vez' },
  { value: 'daily', label: 'Todos los días' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'every_x_days', label: 'Cada X días' },
];

const TIMES = [
  { value: '09:00', label: 'Mañana (9:00)' },
  { value: '12:00', label: 'Mediodía (12:00)' },
  { value: '17:00', label: 'Tarde (17:00)' },
  { value: '20:00', label: 'Noche (20:00)' },
];

const DURATIONS = [5, 10, 15, 30, 45, 60];
const POINTS = [5, 10, 20, 30];

export default function NewTaskScreen() {
  const { profile } = useAuth();
  const { colors, ts } = useTheme();
  const insets = useSafeAreaInsets();

  const [members, setMembers] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<Frequency>('once');
  const [interval, setInterval] = useState('3');
  const [startDate, setStartDate] = useState(toDateString(new Date()));
  const [dueTime, setDueTime] = useState('20:00');
  const [duration, setDuration] = useState(15);
  const [points, setPoints] = useState(10);
  const [rotative, setRotative] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [rotationIds, setRotationIds] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.household_id) return;
    Promise.all([fetchMembers(profile.household_id), fetchCategories(profile.household_id)])
      .then(([m, c]) => {
        setMembers(m);
        setCategories(c);
        setAssignedTo(profile.id); // por defecto, me la asigno a mí
      })
      .catch(() => setError('No pudimos cargar los datos del hogar'));
  }, [profile?.household_id, profile?.id]);

  // Próximos 7 días como opciones de inicio/vencimiento
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(), i);
    return { value: toDateString(d), label: humanDay(d) };
  });

  function toggleRotationMember(id: string) {
    setRotationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    if (!profile?.household_id) return;
    if (!title.trim()) {
      setError('Poné un título a la tarea');
      return;
    }
    if (rotative && rotationIds.length < 2) {
      setError('Elegí al menos 2 personas para la rotación');
      return;
    }
    if (!rotative && !assignedTo) {
      setError('Elegí a quién se le asigna');
      return;
    }
    const parsedInterval = parseInt(interval, 10);
    if (frequency === 'every_x_days' && (!parsedInterval || parsedInterval < 1)) {
      setError('Indicá cada cuántos días se repite');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await createTask({
        household_id: profile.household_id,
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId,
        frequency,
        frequency_interval: frequency === 'every_x_days' ? parsedInterval : null,
        start_date: startDate,
        due_time: dueTime,
        estimated_minutes: duration,
        points,
        assignment_type: rotative ? 'rotative' : 'manual',
        assigned_to: rotative ? null : assignedTo,
        rotation_member_ids: rotative ? rotationIds : [],
        created_by: profile.id,
      });
      AccessibilityInfo.announceForAccessibility('Tarea creada');
      router.back();
    } catch {
      setError('No se pudo crear la tarea. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  const section = (label: string) => (
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
      {label}
    </Text>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: ts(22), fontWeight: '800', color: colors.text, marginBottom: spacing.md }}
        >
          Nueva tarea
        </Text>

        <Input label="Título" value={title} onChangeText={setTitle} placeholder="Lavar los platos" />
        <Input
          label="Descripción (opcional)"
          value={description}
          onChangeText={setDescription}
          placeholder="Incluye secar y guardar"
          multiline
        />

        {section('Categoría')}
        <View style={styles.chipRow}>
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={`${c.icon} ${c.name}`}
              selected={categoryId === c.id}
              onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
            />
          ))}
        </View>

        {section('¿Cada cuánto se hace?')}
        <View style={styles.chipRow}>
          {FREQUENCIES.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              selected={frequency === f.value}
              onPress={() => setFrequency(f.value)}
            />
          ))}
        </View>
        {frequency === 'every_x_days' && (
          <Input
            label="¿Cada cuántos días?"
            value={interval}
            onChangeText={setInterval}
            keyboardType="number-pad"
            maxLength={2}
          />
        )}

        {section(frequency === 'once' ? '¿Qué día?' : '¿Desde qué día?')}
        <View style={styles.chipRow}>
          {dateOptions.map((d) => (
            <Chip
              key={d.value}
              label={d.label}
              selected={startDate === d.value}
              onPress={() => setStartDate(d.value)}
            />
          ))}
        </View>

        {section('¿Para qué hora tiene que estar lista?')}
        <View style={styles.chipRow}>
          {TIMES.map((t) => (
            <Chip
              key={t.value}
              label={t.label}
              selected={dueTime === t.value}
              onPress={() => setDueTime(t.value)}
            />
          ))}
        </View>

        {section('Duración estimada')}
        <View style={styles.chipRow}>
          {DURATIONS.map((d) => (
            <Chip
              key={d}
              label={`${d} min`}
              selected={duration === d}
              onPress={() => setDuration(d)}
            />
          ))}
        </View>

        {section('Puntos que vale')}
        <View style={styles.chipRow}>
          {POINTS.map((p) => (
            <Chip key={p} label={`${p} pts`} selected={points === p} onPress={() => setPoints(p)} />
          ))}
        </View>

        {section('¿Quién la hace?')}
        <View style={styles.chipRow}>
          <Chip label="Una persona fija" selected={!rotative} onPress={() => setRotative(false)} />
          <Chip label="Rotativa (reparto justo)" selected={rotative} onPress={() => setRotative(true)} />
        </View>

        {rotative ? (
          <>
            <Text style={{ fontSize: ts(14), color: colors.textMuted, marginBottom: spacing.sm }}>
              Elegí quiénes rotan. El sistema reparte según el horario laboral y la carga de cada
              uno.
            </Text>
            <View style={styles.chipRow}>
              {members.map((m) => (
                <Chip
                  key={m.id}
                  label={m.name}
                  selected={rotationIds.includes(m.id)}
                  onPress={() => toggleRotationMember(m.id)}
                />
              ))}
            </View>
          </>
        ) : (
          <View style={styles.chipRow}>
            {members.map((m) => (
              <Chip
                key={m.id}
                label={m.name}
                selected={assignedTo === m.id}
                onPress={() => setAssignedTo(m.id)}
              />
            ))}
          </View>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <ErrorText message={error} />
          <Button title="Crear tarea" onPress={handleSave} loading={saving} />
          <View style={{ height: spacing.sm }} />
          <Button title="Cancelar" variant="secondary" onPress={() => router.back()} />
        </View>

        <View style={{ height: spacing.xl + insets.bottom }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
});
