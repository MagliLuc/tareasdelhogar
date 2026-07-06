import { Redirect } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,

  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button, Chip, ErrorText, Input } from '@/components/ui';
import { HouseholdPreview, joinHousehold, previewHousehold } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';
import { useAuth } from '@/providers/auth-provider';

type Mode = 'create' | 'join';

export default function OnboardingScreen() {
  const { session, profile, loading, refreshProfile, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>('create');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [preview, setPreview] = useState<HouseholdPreview | null>(null);
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null); // pending_member id o 'other'
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && !session) return <Redirect href="/login" />;
  if (profile?.household_id) return <Redirect href="/(tabs)" />;

  async function handleCreate() {
    if (!householdName.trim()) {
      setError('Poné un nombre para tu hogar');
      return;
    }
    setError(null);
    setSubmitting(true);
    const { data, error: rpcError } = await supabase
      .rpc('create_household', { p_name: householdName.trim() })
      .single<{ id: string; name: string; invite_code: string }>();
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    Alert.alert(
      '¡Hogar creado! 🎉',
      `Compartí este código con tu familia para que se sumen:\n\n${data.invite_code}\n\n(También lo vas a encontrar en la configuración del hogar)`,
      [{ text: 'Entendido', onPress: () => refreshProfile() }]
    );
  }

  async function handleSearch() {
    if (!inviteCode.trim()) {
      setError('Ingresá el código de invitación');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const found = await previewHousehold(inviteCode.trim());
      if (!found) {
        setError('Código inválido. Revisá que esté bien escrito.');
        return;
      }
      if (found.pending.length === 0) {
        // Sin identidades pendientes: unirse directo
        await doJoin(null);
        return;
      }
      setPreview(found);
      setSelectedIdentity(null);
    } catch {
      setError('No pudimos buscar el hogar. Probá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  async function doJoin(pendingId: string | null) {
    setError(null);
    setSubmitting(true);
    try {
      const joined = await joinHousehold(inviteCode.trim(), pendingId);
      Alert.alert('¡Bienvenido! 👋', `Te sumaste a "${joined.name}"`, [
        { text: 'Vamos', onPress: () => refreshProfile() },
      ]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '';
      setError(
        message.includes('inválido')
          ? 'Código inválido. Revisá que esté bien escrito.'
          : 'No pudimos unirte al hogar. Probá de nuevo.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>¡Hola, {profile?.name}! 👋</Text>
        <Text style={styles.subtitle}>Para empezar, creá tu hogar o sumate a uno</Text>

        <View style={styles.toggle}>
          <Pressable
            style={[styles.toggleOption, mode === 'create' && styles.toggleActive]}
            onPress={() => setMode('create')}
          >
            <Text style={[styles.toggleText, mode === 'create' && styles.toggleTextActive]}>
              Crear hogar
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleOption, mode === 'join' && styles.toggleActive]}
            onPress={() => setMode('join')}
          >
            <Text style={[styles.toggleText, mode === 'join' && styles.toggleTextActive]}>
              Unirme con código
            </Text>
          </Pressable>
        </View>

        {mode === 'create' ? (
          <View>
            <Input
              label="Nombre del hogar"
              value={householdName}
              onChangeText={setHouseholdName}
              placeholder="Casa de los Maglicic"
            />
            <ErrorText message={error} />
            <Button title="Crear mi hogar" onPress={handleCreate} loading={submitting} />
          </View>
        ) : preview ? (
          <View>
            <Text style={styles.previewTitle}>
              Encontramos el hogar &quot;{preview.household_name}&quot; 🏠
            </Text>
            <Text style={styles.previewSubtitle}>¿Quién sos?</Text>
            <View style={styles.identityRow}>
              {preview.pending.map((pm) => (
                <Chip
                  key={pm.id}
                  label={pm.name}
                  selected={selectedIdentity === pm.id}
                  onPress={() => setSelectedIdentity(pm.id)}
                />
              ))}
              <Chip
                label="Soy otra persona"
                selected={selectedIdentity === 'other'}
                onPress={() => setSelectedIdentity('other')}
              />
            </View>
            <ErrorText message={error} />
            <Button
              title="Unirme al hogar"
              onPress={() => doJoin(selectedIdentity === 'other' ? null : selectedIdentity)}
              loading={submitting}
              disabled={!selectedIdentity}
            />
            <View style={{ height: spacing.sm }} />
            <Button
              title="Volver"
              variant="secondary"
              onPress={() => {
                setPreview(null);
                setSelectedIdentity(null);
              }}
            />
          </View>
        ) : (
          <View>
            <Input
              label="Código de invitación"
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              placeholder="ABC123"
              autoCapitalize="characters"
              maxLength={6}
            />
            <ErrorText message={error} />
            <Button title="Buscar hogar" onPress={handleSearch} loading={submitting} />
          </View>
        )}

        <Pressable onPress={signOut} style={styles.signOut}>
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: 14,
    padding: 4,
    marginBottom: spacing.lg,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 11,
    alignItems: 'center',
  },
  toggleActive: { backgroundColor: colors.card },
  toggleText: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  toggleTextActive: { color: colors.primary },
  signOut: { marginTop: spacing.xl, alignItems: 'center' },
  signOutText: { color: colors.textMuted, fontSize: 14 },
  previewTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  previewSubtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  identityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
});
