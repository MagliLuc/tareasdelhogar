import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorText, Input } from '@/components/ui';
import {
  addPendingMember,
  fetchHousehold,
  fetchMembers,
  fetchPendingMembers,
  seedSampleTasks,
} from '@/lib/api';
import { spacing } from '@/lib/theme';
import { Household, PendingMember, Profile } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';
import { MEMBER_COLORS } from './profile';

export default function HouseholdScreen() {
  const { colors, ts } = useTheme();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.household_id) return;
    try {
      const [h, m, pm] = await Promise.all([
        fetchHousehold(profile.household_id),
        fetchMembers(profile.household_id),
        fetchPendingMembers(profile.household_id),
      ]);
      setHousehold(h as Household);
      setMembers(m);
      setPendingMembers(pm);
    } catch {
      setError('No pudimos cargar los datos del hogar');
    }
  }, [profile?.household_id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleAddPendingMember() {
    if (!profile?.household_id || !newMemberName.trim()) return;
    setAddingMember(true);
    setError(null);
    try {
      const used = new Set(members.map((m) => m.color));
      const color = MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[0];
      await addPendingMember(profile.household_id, newMemberName.trim(), color);
      AccessibilityInfo.announceForAccessibility(`${newMemberName.trim()} agregado al hogar`);
      setNewMemberName('');
      await load();
    } catch {
      setError('No se pudo agregar el miembro');
    } finally {
      setAddingMember(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    setError(null);
    try {
      const created = await seedSampleTasks();
      Alert.alert(
        created > 0 ? '¡Listo! 📦' : 'Ya estaban cargadas',
        created > 0
          ? `Se crearon ${created} tareas de ejemplo repartidas entre todos, y una lista de compras inicial.`
          : 'Las tareas de ejemplo ya estaban cargadas (no se duplican).'
      );
    } catch {
      setError('No se pudieron crear las tareas de ejemplo');
    } finally {
      setSeeding(false);
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
          style={{ fontSize: ts(22), fontWeight: '800', color: colors.text, marginBottom: spacing.lg }}
        >
          Mi hogar
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: ts(17), fontWeight: '700', color: colors.text }}>
            {household?.name ?? '...'}
          </Text>
          <Text style={{ fontSize: ts(14), color: colors.textMuted, marginTop: spacing.sm }}>
            Código de invitación (compartilo para sumar miembros):
          </Text>
          <Text
            accessibilityLabel={`Código de invitación: ${household?.invite_code?.split('').join(', ')}`}
            style={{
              fontSize: ts(28),
              fontWeight: '800',
              color: colors.primary,
              letterSpacing: 6,
              marginVertical: spacing.xs,
            }}
          >
            {household?.invite_code ?? '——————'}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: ts(14), fontWeight: '600', color: colors.text, marginBottom: spacing.xs }}>
            Miembros ({members.length + pendingMembers.length})
          </Text>
          {members.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <View style={[styles.dot, { backgroundColor: m.color }]} />
              <Text style={{ fontSize: ts(15), color: colors.text }}>
                {m.name}
                {m.id === profile?.id ? ' (vos)' : ''}
              </Text>
            </View>
          ))}
          {pendingMembers.map((pm) => (
            <View key={pm.id} style={styles.memberRow}>
              <View style={[styles.dot, { backgroundColor: pm.color }]} />
              <Text style={{ fontSize: ts(15), color: colors.textMuted }}>
                {pm.name} · todavía no se unió
              </Text>
            </View>
          ))}

          <Text style={{ fontSize: ts(13), color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.xs }}>
            Agregá a tu familia por nombre: al registrarse con el código eligen quiénes son.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Nuevo miembro"
                value={newMemberName}
                onChangeText={setNewMemberName}
                placeholder="Mirta"
              />
            </View>
            <View style={{ marginBottom: spacing.md }}>
              <Button
                title="Agregar"
                onPress={handleAddPendingMember}
                loading={addingMember}
                disabled={!newMemberName.trim()}
              />
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: ts(14), color: colors.textMuted, marginBottom: spacing.sm }}>
            Carga 11 tareas típicas del hogar ya programadas y repartidas entre todos, más una
            lista de compras inicial.
          </Text>
          <Button title="📦 Cargar tareas de ejemplo" onPress={handleSeed} loading={seeding} />
        </View>

        <ErrorText message={error} />
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
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
