import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/providers/auth-provider';
import { SettingsProvider, useTheme } from '@/providers/settings-provider';

function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <ThemedStatusBar />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="task/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="task/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="task/edit/[taskId]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="schedule" options={{ presentation: 'modal' }} />
          <Stack.Screen name="shopping" options={{ presentation: 'card' }} />
        </Stack>
      </AuthProvider>
    </SettingsProvider>
  );
}
