import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorText, Input } from '@/components/ui';
import { fetchHousehold, updateHouseholdSettings } from '@/lib/api';
import { spacing } from '@/lib/theme';
import { Household } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

interface Rule {
  key: string;
  label: string;
  help: string;
  defaultValue: number;
}

const RULES: Rule[] = [
  {
    key: 'points_per_obligation_hour',
    label: 'Puntos por hora de trabajo/estudio',
    help: 'Se acreditan cada día según los horarios cargados. Con 0 se desactiva.',
    defaultValue: 1,
  },
  {
    key: 'points_per_shopping_item',
    label: 'Puntos por comprar un ítem de la lista',
    help: 'Los gana quien lo marca comprado. Con 0 se desactiva.',
    defaultValue: 1,
  },
  {
    key: 'late_points_percent',
    label: 'Puntos si se completa vencida (%)',
    help: 'Porcentaje de los puntos que se acreditan al completar una tarea después de su vencimiento. 100 = sin penalidad, 0 = no suma nada.',
    defaultValue: 50,
  },
  {
    key: 'reminder_minutes_before',
    label: 'Recordatorio antes del vencimiento (minutos)',
    help: 'Cuánto antes avisar que una tarea está por vencer.',
    defaultValue: 60,
  },
  {
    key: 'work_weight_divisor',
    label: 'Peso del trabajo en el reparto',
    help: 'Cuántas horas de trabajo/estudio equivalen a 1 hora de tareas. Más alto = el trabajo descuenta menos carga.',
    defaultValue: 4,
  },
  {
    key: 'absence_penalty_minutes',
    label: 'Penalización por no estar (minutos)',
    help: 'Cuánto evita el sistema asignarle una tarea a alguien que no está a esa hora.',
    defaultValue: 240,
  },
];

export default function RulesScreen() {
  const { colors, ts } = useTheme();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.household_id) return;
    try {
      const household = (await fetchHousehold(profile.household_id)) as Household;
      const settings = household.settings ?? {};
      const initial: Record<string, string> = {};
      for (const rule of RULES) {
        initial[rule.key] = String(settings[rule.key] ?? rule.defaultValue);
      }
      setValues(initial);
    } catch {
      setError('No pudimos cargar las reglas');
    }
  }, [profile?.household_id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSave() {
    const parsed: Record<string, number> = {};
    for (const rule of RULES) {
      const n = Number(values[rule.key]);
      if (!Number.isFinite(n) || n < 0) {
        setError(`"${rule.label}" tiene que ser un número (0 o más)`);
        return;
      }
      parsed[rule.key] = n;
    }
    setError(null);
    setSaving(true);
    try {
      await updateHouseholdSettings(parsed);
      AccessibilityInfo.announceForAccessibility('Reglas guardadas');
      router.back();
    } catch {
      setError('No se pudieron guardar las reglas');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior="padding">
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: ts(22), fontWeight: '800', color: colors.text }}
        >
          Reglas de puntos y recordatorios
        </Text>
        <Text style={{ fontSize: ts(14), color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg }}>
          Valen para todo el hogar. Los puntos de cada tarea se definen en la tarea misma.
        </Text>

        {RULES.map((rule) => (
          <View
            key={rule.key}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Input
              label={rule.label}
              value={values[rule.key] ?? ''}
              onChangeText={(v) => setValues((prev) => ({ ...prev, [rule.key]: v }))}
              keyboardType="number-pad"
              maxLength={4}
            />
            <Text style={{ fontSize: ts(13), color: colors.textMuted, marginTop: -spacing.sm }}>
              {rule.help}
            </Text>
          </View>
        ))}

        <ErrorText message={error} />
        <Button title="Guardar reglas" onPress={handleSave} loading={saving} />
        <View style={{ height: spacing.sm }} />
        <Button title="Volver" variant="secondary" onPress={() => router.back()} />
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
});
