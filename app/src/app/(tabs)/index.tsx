import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';
import { Household } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

export default function TodayScreen() {
  const { profile, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [household, setHousehold] = useState<Household | null>(null);

  const loadHousehold = useCallback(async () => {
    if (!profile?.household_id) return;
    const { data } = await supabase
      .from('households')
      .select('*')
      .eq('id', profile.household_id)
      .single();
    setHousehold(data as Household);
    // Genera las instancias de los próximos días si faltan
    await supabase.rpc('generate_task_instances', { p_days_ahead: 7 });
  }, [profile?.household_id]);

  useEffect(() => {
    loadHousehold();
  }, [loadHousehold]);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg }]}
    >
      <Text style={styles.greeting}>¡Hola, {profile?.name}! 👋</Text>
      <Text style={styles.household}>{household?.name ?? '...'}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Código de invitación</Text>
        <Text style={styles.inviteCode}>{household?.invite_code ?? '——————'}</Text>
        <Text style={styles.cardHint}>
          Compartilo con tu familia para que se sumen al hogar
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Próximamente acá</Text>
        <Text style={styles.cardHint}>
          Tus tareas del día, el calendario compartido y el ranking semanal. ¡Estamos en
          plena construcción! 🚧
        </Text>
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <Button title="Cerrar sesión" variant="secondary" onPress={signOut} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },
  greeting: { fontSize: 24, fontWeight: '800', color: colors.text },
  household: { fontSize: 16, color: colors.textMuted, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.textMuted, marginBottom: 4 },
  inviteCode: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 6,
    marginVertical: spacing.xs,
  },
  cardHint: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
});
