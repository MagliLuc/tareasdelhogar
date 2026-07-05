import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/lib/theme';
import { useAuth } from '@/providers/auth-provider';

export default function AuthLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Ya logueado: al hogar (o a crearlo si todavía no tiene)
  if (session) {
    return <Redirect href={profile?.household_id ? '/(tabs)' : '/onboarding'} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
