import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchWeeklyRanking } from '@/lib/api';
import { spacing } from '@/lib/theme';
import { WeeklyRankingRow } from '@/lib/types';
import { useRealtimeInstances } from '@/hooks/use-realtime-instances';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function RankingScreen() {
  const { profile } = useAuth();
  const { colors, ts } = useTheme();
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<WeeklyRankingRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.household_id) return;
    try {
      setError(null);
      setRows(await fetchWeeklyRanking(profile.household_id));
    } catch {
      setError('No pudimos cargar el ranking. Deslizá hacia abajo para reintentar.');
    }
  }, [profile?.household_id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Cuando alguien completa una tarea cambian los puntos
  useRealtimeInstances(profile?.household_id ?? null, load);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: ts(24), fontWeight: '800', color: colors.text }}
      >
        Ranking semanal 🏆
      </Text>
      <Text style={{ fontSize: ts(14), color: colors.textMuted, marginBottom: spacing.lg }}>
        Puntos por tareas completadas esta semana. ¡Se reinicia cada lunes!
      </Text>

      {!!error && (
        <Text
          accessibilityLiveRegion="assertive"
          style={{ color: colors.danger, fontSize: ts(14), marginBottom: spacing.md }}
        >
          {error}
        </Text>
      )}

      {rows.length === 0 && !error && (
        <Text style={{ fontSize: ts(15), color: colors.textMuted }}>
          Todavía nadie sumó puntos esta semana. ¡El primero en completar una tarea arranca
          ganando! 💪
        </Text>
      )}

      {rows.map((row, index) => {
        const isMe = row.profile_id === profile?.id;
        return (
          <View
            key={row.profile_id}
            accessible
            accessibilityLabel={`Puesto ${index + 1}: ${row.name}${isMe ? ', vos' : ''}, ${row.total_points} puntos`}
            style={[
              styles.row,
              {
                backgroundColor: colors.card,
                borderColor: isMe ? colors.primary : colors.border,
                borderWidth: isMe ? 2 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: ts(22), width: 40 }}>
              {MEDALS[index] ?? `${index + 1}º`}
            </Text>
            <View style={[styles.dot, { backgroundColor: row.color }]} />
            <Text style={{ flex: 1, fontSize: ts(17), fontWeight: isMe ? '800' : '600', color: colors.text }}>
              {row.name}
              {isMe ? ' (vos)' : ''}
            </Text>
            <Text style={{ fontSize: ts(17), fontWeight: '800', color: colors.primary }}>
              {row.total_points} pts
            </Text>
          </View>
        );
      })}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
});
