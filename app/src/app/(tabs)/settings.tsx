import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { spacing } from '@/lib/theme';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  route: string;
}

const MENU: MenuItem[] = [
  {
    icon: 'color-palette',
    title: 'Apariencia y accesibilidad',
    subtitle: 'Tema claro/oscuro, alto contraste, tamaño de letra',
    route: '/settings/appearance',
  },
  {
    icon: 'person',
    title: 'Mi perfil',
    subtitle: 'Nombre y color en el calendario',
    route: '/settings/profile',
  },
  {
    icon: 'time',
    title: 'Mis horarios y salidas',
    subtitle: 'Trabajo, estudio y salidas (afectan el reparto)',
    route: '/schedule',
  },
  {
    icon: 'home',
    title: 'Mi hogar',
    subtitle: 'Miembros, código de invitación, tareas de ejemplo',
    route: '/settings/household',
  },
  {
    icon: 'trophy',
    title: 'Reglas de puntos y recordatorios',
    subtitle: 'Cuánto vale cada cosa y cuándo avisar',
    route: '/settings/rules',
  },
];

export default function SettingsMenuScreen() {
  const { colors, ts } = useTheme();
  const { profile, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg }]}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: ts(24), fontWeight: '800', color: colors.text }}
      >
        Configuración
      </Text>
      <Text style={{ fontSize: ts(14), color: colors.textMuted, marginBottom: spacing.lg }}>
        Sesión iniciada como {profile?.name}
      </Text>

      {MENU.map((item) => (
        <Pressable
          key={item.route}
          onPress={() => router.push(item.route as never)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. ${item.subtitle}`}
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name={item.icon} size={26} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: ts(16), fontWeight: '700', color: colors.text }}>
              {item.title}
            </Text>
            <Text style={{ fontSize: ts(13), color: colors.textMuted }}>{item.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
        </Pressable>
      ))}

      <View style={{ marginTop: spacing.lg }}>
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
    gap: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 72,
  },
});
