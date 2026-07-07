import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip } from '@/components/ui';
import { spacing, TEXT_SCALES } from '@/lib/theme';
import { useSettings, useTheme } from '@/providers/settings-provider';

export default function AppearanceScreen() {
  const { colors, ts } = useTheme();
  const { highContrast, textScale, themeMode, setHighContrast, setTextScale, setThemeMode } =
    useSettings();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: ts(22), fontWeight: '800', color: colors.text, marginBottom: spacing.lg }}
      >
        Apariencia y accesibilidad
      </Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={{ fontSize: ts(16), fontWeight: '600', color: colors.text, marginBottom: spacing.sm }}>
          Tema
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label="🌗 Sistema" selected={themeMode === 'system'} onPress={() => setThemeMode('system')} />
          <Chip label="☀️ Claro" selected={themeMode === 'light'} onPress={() => setThemeMode('light')} />
          <Chip label="🌙 Oscuro" selected={themeMode === 'dark'} onPress={() => setThemeMode('dark')} />
        </View>
        <Text style={{ fontSize: ts(13), color: colors.textMuted }}>
          &quot;Sistema&quot; sigue el modo claro/oscuro del teléfono.
        </Text>
      </View>

      <View style={[styles.card, styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flex: 1, paddingRight: spacing.md }}>
          <Text style={{ fontSize: ts(16), fontWeight: '600', color: colors.text }}>
            Alto contraste
          </Text>
          <Text style={{ fontSize: ts(13), color: colors.textMuted }}>
            Máximo contraste de texto y bordes, en tema claro y oscuro
          </Text>
        </View>
        <Switch
          value={highContrast}
          onValueChange={setHighContrast}
          accessibilityLabel="Alto contraste"
          trackColor={{ true: colors.primary }}
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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

      <Button title="Volver" variant="secondary" onPress={() => router.back()} />
      <View style={{ height: spacing.xl }} />
    </ScrollView>
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
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
