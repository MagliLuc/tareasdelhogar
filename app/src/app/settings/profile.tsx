import { router } from 'expo-router';
import React, { useState } from 'react';
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

import { Button, ErrorText, Input } from '@/components/ui';
import { updateProfile } from '@/lib/api';
import { spacing } from '@/lib/theme';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

export const MEMBER_COLORS = [
  '#4F46E5',
  '#0D9488',
  '#B45309',
  '#BE185D',
  '#15803D',
  '#B91C1C',
  '#6D28D9',
  '#0369A1',
];

export default function ProfileScreen() {
  const { colors, ts } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(profile?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: { name?: string; color?: string }) {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile(profile.id, patch);
      await refreshProfile();
      AccessibilityInfo.announceForAccessibility('Perfil actualizado');
    } catch {
      setError('No se pudo guardar el perfil');
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
          style={{ fontSize: ts(22), fontWeight: '800', color: colors.text, marginBottom: spacing.lg }}
        >
          Mi perfil
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Input label="Mi nombre" value={name} onChangeText={setName} />
          {name.trim() !== profile?.name && (
            <Button
              title="Guardar nombre"
              onPress={() => save({ name: name.trim() })}
              loading={saving}
              disabled={!name.trim()}
            />
          )}

          <Text style={{ fontSize: ts(14), fontWeight: '600', color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm }}>
            Mi color en el calendario
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {MEMBER_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => save({ color: c })}
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
    marginBottom: spacing.md,
  },
  colorSwatch: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
});
