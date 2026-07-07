import * as Updates from 'expo-updates';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@/lib/theme';
import { useTheme } from '@/providers/settings-provider';

/**
 * Banner que aparece cuando hay una versión nueva publicada con
 * EAS Update: un toque la descarga y reinicia la app ya actualizada.
 * En Expo Go y en desarrollo Updates.isEnabled es false y no se
 * muestra nunca.
 */
export function UpdateBanner() {
  const { colors, ts } = useTheme();
  const insets = useSafeAreaInsets();
  const [available, setAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!Updates.isEnabled) return;
    Updates.checkForUpdateAsync()
      .then((result) => setAvailable(result.isAvailable))
      .catch(() => {
        // sin conexión o sin servicio de updates: no molestamos
      });
  }, []);

  if (!available) return null;

  async function applyUpdate() {
    setUpdating(true);
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      // si falla, se aplicará sola en el próximo arranque
      setUpdating(false);
      setAvailable(false);
    }
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        {
          backgroundColor: colors.primary,
          paddingTop: insets.top + spacing.sm,
        },
      ]}
    >
      <Text style={{ color: '#fff', fontSize: ts(14), flex: 1, fontWeight: '600' }}>
        🆕 Hay una versión nueva de la app
      </Text>
      <Pressable
        onPress={applyUpdate}
        disabled={updating}
        accessibilityRole="button"
        accessibilityLabel="Actualizar la app ahora"
        accessibilityState={{ busy: updating }}
        style={[styles.button, { backgroundColor: '#fff' }, updating && { opacity: 0.7 }]}
      >
        {updating ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={{ color: colors.primary, fontSize: ts(14), fontWeight: '800' }}>
            Actualizar ahora
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  button: {
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    minHeight: 44,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
