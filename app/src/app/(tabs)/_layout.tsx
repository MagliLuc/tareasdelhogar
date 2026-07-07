import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { UpdateBanner } from '@/components/update-banner';
import { addNotificationTapListener, registerForPushNotifications } from '@/lib/notifications';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

export default function TabsLayout() {
  const { session, profile, loading } = useAuth();
  const { colors, ts } = useTheme();

  // Registrar el token de push al entrar con sesión y hogar
  useEffect(() => {
    if (profile?.id && profile.household_id) {
      registerForPushNotifications(profile.id);
    }
  }, [profile?.id, profile?.household_id]);

  // Al tocar una notificación, abrir lo que corresponda
  useEffect(() => {
    return addNotificationTapListener({
      onTask: (instanceId) => router.push(`/task/${instanceId}`),
      onShopping: () => router.push('/shopping'),
    });
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;
  if (profile && !profile.household_id) return <Redirect href="/onboarding" />;

  return (
    <View style={{ flex: 1 }}>
      <UpdateBanner />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: ts(12), fontWeight: '600' },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Hoy',
          tabBarIcon: ({ color, size }) => <Ionicons name="sunny" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tareas',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendario',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          title: 'Ranking',
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
        }}
      />
    </Tabs>
    </View>
  );
}
