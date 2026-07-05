import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip } from '@/components/ui';
import { spacing, TEXT_SCALES } from '@/lib/theme';
import { useAuth } from '@/providers/auth-provider';
import { useSettings, useTheme } from '@/providers/settings-provider';

export default function SettingsScreen() {
  const { colors, ts } = useTheme();
  const { highContrast, textScale, setHighContrast, setTextScale } = useSettings();
  const { profile, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg }]}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: ts(24), fontWeight: '800', color: colors.text, marginBottom: spacing.lg }}
      >
        Ajustes
      </Text>

      <Text
        accessibilityRole="header"
        style={{ fontSize: ts(16), fontWeight: '700', color: colors.textMuted, marginBottom: spacing.sm }}
      >
        Accesibilidad
      </Text>

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
        Cuenta
      </Text>
      <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={{ fontSize: ts(16), color: colors.text }}>
          Sesión iniciada como <Text style={{ fontWeight: '700' }}>{profile?.name}</Text>
        </Text>
      </View>

      <View style={{ marginTop: spacing.md }}>
        <Button title="Cerrar sesión" variant="secondary" onPress={signOut} />
      </View>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
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
});
