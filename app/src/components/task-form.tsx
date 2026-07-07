import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, ErrorText, Input } from '@/components/ui';
import { addDays, fetchCategories, fetchMembers, fetchTasks, humanDay, NewTask, toDateString } from '@/lib/api';
import { spacing } from '@/lib/theme';
import { Category, Frequency, Profile, Task } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'once', label: 'Una vez' },
  { value: 'daily', label: 'Todos los días' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'every_x_days', label: 'Cada X días' },
];

const TIMES = ['09:00', '12:00', '17:00', '20:00'];
const DURATIONS = [5, 10, 15, 30, 45, 60];
const POINTS = [5, 10, 20, 30];
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// Qué tareas tiene sentido encadenar según el título (heurística)
const CHAIN_HINTS: { trigger: RegExp; follow: RegExp }[] = [
  { trigger: /cocin|cena|almuerzo|comida/i, follow: /plato|mesa|basura|cocina/i },
  { trigger: /lavar.*ropa|lavarropas|lavado/i, follow: /tender|doblar|colgar|plancha|guardar/i },
  { trigger: /compra/i, follow: /guardar|heladera|alacena|lista/i },
  { trigger: /mesa/i, follow: /plato|basura/i },
  { trigger: /baño/i, follow: /toalla|basura/i },
];

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tarea existente con título igual o muy parecido (para avisar duplicados) */
export function findSimilarTask(title: string, tasks: Task[]): Task | undefined {
  const target = normalizeTitle(title);
  if (target.length < 4) return undefined;
  return tasks.find((t) => {
    const other = normalizeTitle(t.title);
    return other === target || other.includes(target) || target.includes(other);
  });
}

function suggestedChainCandidates(title: string, tasks: Task[]): Task[] {
  const rules = CHAIN_HINTS.filter((r) => r.trigger.test(title));
  if (rules.length === 0) return [];
  return tasks.filter((t) => rules.some((r) => r.follow.test(t.title)));
}

export type TaskFormResult = Omit<NewTask, 'household_id' | 'created_by'>;

interface TaskFormProps {
  heading: string;
  submitLabel: string;
  /** En edición: valores actuales de la tarea */
  initial?: {
    task: Task;
    rotationIds: string[];
    chainedIds: string[];
  };
  onSubmit: (values: TaskFormResult) => Promise<void>;
  onCancel: () => void;
}

export function TaskForm({ heading, submitLabel, initial, onSubmit, onCancel }: TaskFormProps) {
  const { profile } = useAuth();
  const { colors, ts } = useTheme();
  const insets = useSafeAreaInsets();

  const [members, setMembers] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  const t = initial?.task;
  const [title, setTitle] = useState(t?.title ?? '');
  const [description, setDescription] = useState(t?.description ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(t?.category_id ?? null);
  const [frequency, setFrequency] = useState<Frequency>(t?.frequency ?? 'once');
  const [interval, setInterval] = useState(String(t?.frequency_interval ?? 3));
  const [startDate, setStartDate] = useState(t?.start_date ?? toDateString(new Date()));
  const [dueTime, setDueTime] = useState(t?.due_time?.slice(0, 5) ?? '20:00');
  const [customTime, setCustomTime] = useState(
    t && !TIMES.includes(t.due_time.slice(0, 5)) ? t.due_time.slice(0, 5) : ''
  );
  const [duration, setDuration] = useState(t?.estimated_minutes ?? 15);
  const [points, setPoints] = useState(t?.points ?? 10);
  const [rotative, setRotative] = useState(t?.assignment_type === 'rotative');
  const [assignedTo, setAssignedTo] = useState<string | null>(t?.assigned_to ?? null);
  const [rotationIds, setRotationIds] = useState<string[]>(initial?.rotationIds ?? []);
  const [chainedIds, setChainedIds] = useState<string[]>(initial?.chainedIds ?? []);

  const [showAllChains, setShowAllChains] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.household_id) return;
    Promise.all([
      fetchMembers(profile.household_id),
      fetchCategories(profile.household_id),
      fetchTasks(profile.household_id),
    ])
      .then(([m, c, tasks]) => {
        setMembers(m);
        setCategories(c);
        setAllTasks(tasks.filter((x) => x.id !== t?.id)); // sin encadenarse a sí misma
        if (!initial) setAssignedTo(profile.id); // nueva: me la asigno por defecto
      })
      .catch(() => setError('No pudimos cargar los datos del hogar'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.household_id, profile?.id]);

  // Próximos 7 días (más la fecha actual de la tarea en edición si es otra)
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(), i);
    return { value: toDateString(d), label: humanDay(d) };
  });
  if (t && !dateOptions.some((d) => d.value === t.start_date)) {
    dateOptions.unshift({ value: t.start_date, label: t.start_date });
  }

  const effectiveTime = customTime.trim() !== '' ? customTime.trim() : dueTime;

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('Poné un título a la tarea');
      return;
    }
    if (!TIME_RE.test(effectiveTime)) {
      setError('La hora tiene que ser HH:MM, por ejemplo 14:30');
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

    // Aviso de duplicado (solo al crear)
    if (!initial) {
      const similar = findSimilarTask(title, allTasks);
      if (similar) {
        Alert.alert(
          '¿Tarea repetida? 🤔',
          `Ya existe una tarea muy parecida: "${similar.title}". ¿Seguro querés crear otra?`,
          [
            { text: 'No, mejor no', style: 'cancel' },
            { text: 'Sí, crear igual', onPress: () => submit(parsedInterval) },
          ]
        );
        return;
      }
    }

    await submit(parsedInterval);
  }

  async function submit(parsedInterval: number) {
    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId,
        frequency,
        frequency_interval: frequency === 'every_x_days' ? parsedInterval : null,
        start_date: startDate,
        due_time: effectiveTime,
        estimated_minutes: duration,
        points,
        assignment_type: rotative ? 'rotative' : 'manual',
        assigned_to: rotative ? null : assignedTo,
        rotation_member_ids: rotative ? rotationIds : [],
        chained_task_ids: chainedIds,
      });
    } catch {
      setError('No se pudo guardar la tarea. Probá de nuevo.');
      setSaving(false);
      return;
    }
    setSaving(false);
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
      behavior="padding"
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: ts(22), fontWeight: '800', color: colors.text, marginBottom: spacing.md }}
        >
          {heading}
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
          {TIMES.map((time) => (
            <Chip
              key={time}
              label={time}
              selected={customTime.trim() === '' && dueTime === time}
              onPress={() => {
                setDueTime(time);
                setCustomTime('');
              }}
            />
          ))}
        </View>
        <Input
          label="Otra hora (HH:MM)"
          value={customTime}
          onChangeText={setCustomTime}
          placeholder="14:30"
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />

        {section('Duración estimada')}
        <View style={styles.chipRow}>
          {DURATIONS.map((d) => (
            <Chip key={d} label={`${d} min`} selected={duration === d} onPress={() => setDuration(d)} />
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
              Elegí quiénes rotan. El sistema reparte según horarios y carga de cada uno.
            </Text>
            <View style={styles.chipRow}>
              {members.map((m) => (
                <Chip
                  key={m.id}
                  label={m.name}
                  selected={rotationIds.includes(m.id)}
                  onPress={() => toggle(rotationIds, setRotationIds, m.id)}
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

        {allTasks.length > 0 &&
          (() => {
            const suggested = suggestedChainCandidates(title, allTasks);
            // Sugeridas + las ya encadenadas siempre visibles;
            // el resto solo al pedir "mostrar todas"
            const visible = showAllChains
              ? allTasks
              : allTasks.filter(
                  (task) => suggested.includes(task) || chainedIds.includes(task.id)
                );
            return (
              <>
                {section('🔗 Al completarla, disparar también…')}
                <Text style={{ fontSize: ts(13), color: colors.textMuted, marginBottom: spacing.sm }}>
                  {suggested.length > 0 && !showAllChains
                    ? 'Sugeridas según el título (ej: cocinar suele encadenar lavar los platos):'
                    : 'Ej: al completar "Cocinar" se crea "Lavar los platos" para hoy.'}
                </Text>
                {visible.length === 0 && !showAllChains && (
                  <Text style={{ fontSize: ts(13), color: colors.textMuted, marginBottom: spacing.sm }}>
                    No hay sugerencias para este título.
                  </Text>
                )}
                <View style={styles.chipRow}>
                  {visible.map((task) => (
                    <Chip
                      key={task.id}
                      label={task.title}
                      selected={chainedIds.includes(task.id)}
                      onPress={() => toggle(chainedIds, setChainedIds, task.id)}
                    />
                  ))}
                </View>
                <Chip
                  label={showAllChains ? 'Mostrar solo sugeridas' : 'Mostrar todas las tareas'}
                  selected={false}
                  onPress={() => setShowAllChains(!showAllChains)}
                />
              </>
            );
          })()}

        <View style={{ marginTop: spacing.lg }}>
          <ErrorText message={error} />
          <Button title={submitLabel} onPress={handleSave} loading={saving} />
          <View style={{ height: spacing.sm }} />
          <Button title="Cancelar" variant="secondary" onPress={onCancel} />
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
