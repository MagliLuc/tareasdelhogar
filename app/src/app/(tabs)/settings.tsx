import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, ErrorText, Input } from '@/components/ui';
import {
  addPendingMember,
  fetchHousehold,
  fetchMembers,
  fetchPendingMembers,
  seedSampleTasks,
  updateProfile,
} from '@/lib/api';
import { spacing, TEXT_SCALES } from '@/lib/theme';
import { Household, PendingMember, Profile } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useSettings, useTheme } from '@/providers/settings-provider';

const MEMBER_COLORS = [
  '#4F46E5', // índigo
  '#0D9488', // verde azulado
  '#B45309', // ámbar oscuro
  '#BE185D', // rosa fuerte
  '#15803D', // verde
  '#B91C1C', // rojo
  '#6D28D9', // violeta
  '#0369A1', // celeste oscuro
];

export default function SettingsScreen() {
  const { colors, ts } = useTheme();
  const { highContrast, textScale, setHighContrast, setTextScale } = useSettings();
  const { profile, refreshProfile, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [name, setName] = useState(profile?.name ?? '');
  const [newMemberName, setNewMemberName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
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
      setName(profile?.name ?? '');
      load();
    }, [load, profile?.name])
  );

  async function handleAddPendingMember() {
    if (!profile?.household_id || !newMemberName.trim()) return;
    setAddingMember(true);
    setError(null);
    try {
      // Color distinto al de los miembros existentes, si se puede
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
      await load();
      AccessibilityInfo.announceForAccessibility(
        created > 0 ? `${created} tareas de ejemplo creadas` : 'Las tareas de ejemplo ya estaban cargadas'
      );
      Alert.alert(
        created > 0 ? '¡Listo! 📦' : 'Ya estaban cargadas',
        created > 0
          ? `Se crearon ${created} tareas de ejemplo repartidas entre todos, y una lista de compras inicial. Mirá las pestañas Tareas y Calendario.`
          : 'Las tareas de ejemplo ya estaban cargadas (no se duplican).'
      );
    } catch {
      setError('No se pudieron crear las tareas de ejemplo');
    } finally {
      setSeeding(false);
    }
  }

  async function handleSaveProfile(patch: { name?: string; color?: string }) {
    if (!profile) return;
    setSavingProfile(true);
    setError(null);
    try {
      await updateProfile(profile.id, patch);
      await refreshProfile();
      AccessibilityInfo.announceForAccessibility('Perfil actualizado');
    } catch {
      setError('No se pudo guardar el perfil');
    } finally {
      setSavingProfile(false);
    }
  }

  const sectionHeader = (label: string) => (
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
      {label}
    </Text>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: ts(24), fontWeight: '800', color: colors.text }}
      >
        Ajustes
      </Text>

      <ErrorText message={error} />

      {/* ------------- Accesibilidad ------------- */}
      {sectionHeader('Accesibilidad')}

      <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flex: 1, paddingRight: spacing.md }}>
          <Text style={{ fontSize: ts(16), fontWeight: '600', color: colors.text }}>
            Alto contraste
          </Text>
          <Text style={{ fontSize: ts(13), color: colors.textMuted }}>
            Texto negro sobre blanco y bordes más marcados
          </Text>
        </View>
        <Switch
          value={highContrast}
          onValueChange={setHighContrast}
          accessibilityLabel="Alto contraste"
          trackColor={{ true: colors.primary }}
        />
      </View>

      <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: ts(16), fontWeight: '600', color: colors.text, marginBottom: spacing.sm }}>
            Tamaño de letra
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {TEXT_SCALES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={textScale === option.value}
                onPress={() => setTextScale(option.value)}
              />
            ))}
          </View>
          <Text style={{ fontSize: ts(13), color: colors.textMuted }}>
            Además, la app siempre respeta el tamaño de letra configurado en los ajustes de
            accesibilidad de tu teléfono.
          </Text>
        </View>
      </View>

      {/* ------------- Mi perfil ------------- */}
      {sectionHeader('Mi perfil')}

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Input label="Mi nombre" value={name} onChangeText={setName} />
        {name.trim() !== profile?.name && (
          <Button
            title="Guardar nombre"
            onPress={() => handleSaveProfile({ name: name.trim() })}
            loading={savingProfile}
            disabled={!name.trim()}
          />
        )}

        <Text style={{ fontSize: ts(14), fontWeight: '600', color: colors.text, marginTop: spacing.sm, marginBottom: spacing.sm }}>
          Mi color en el calendario
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {MEMBER_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => handleSaveProfile({ color: c })}
              accessibilityRole="button"
              accessibilityLabel={`Elegir color ${c}`}
              accessibilityState={{ selected: profile?.color === c }}
              style={[
                styles.colorSwatch,
                { backgroundColor: c },
                profile?.color === c && { borderWidth: 3, borderColor: colors.text },
              ]}
            />
          ))}
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Button
            title="Mi horario laboral 🕐"
            variant="secondary"
            onPress={() => router.push('/schedule')}
            accessibilityHint="Abre el editor de franjas horarias de trabajo"
          />
        </View>
      </View>

      {/* ------------- Mi hogar ------------- */}
      {sectionHeader('Mi hogar')}

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

        <Text style={{ fontSize: ts(14), fontWeight: '600', color: colors.text, marginTop: spacing.sm, marginBottom: spacing.xs }}>
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
          Agregá a tu familia por nombre: cuando se registren con el código, van a poder elegir
          quiénes son.
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

      {/* ------------- Tareas de ejemplo ------------- */}
      {sectionHeader('Para arrancar')}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={{ fontSize: ts(14), color: colors.textMuted, marginBottom: spacing.sm }}>
          Carga 11 tareas típicas del hogar (platos, cocina, baño, ropa, compras…) ya
          programadas y repartidas entre todos, más una lista de compras inicial.
        </Text>
        <Button
          title="📦 Cargar tareas de ejemplo"
          onPress={handleSeed}
          loading={seeding}
          accessibilityHint="Crea un paquete de tareas típicas repartidas entre los miembros"
        />
      </View>

      {/* ------------- Cuenta ------------- */}
      <View style={{ marginTop: spacing.lg }}>
        <Button title="Cerrar sesión" variant="secondary" onPress={signOut} />
      </View>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
