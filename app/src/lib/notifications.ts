import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { humanTime } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { TaskInstance } from '@/lib/types';

// Mostrar notificaciones también con la app abierta
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Pide permiso y registra el token de push de Expo en Supabase.
 * Si no hay proyecto EAS o corre en Expo Go (Android no soporta push
 * remota ahí), falla en silencio: los recordatorios locales siguen
 * funcionando igual.
 */
export async function registerForPushNotifications(profileId: string): Promise<void> {
  try {
    if (!Device.isDevice) return; // emuladores sin servicios de Google

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Tareas del hogar',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
    }

    const { status } = await Notifications.getPermissionsAsync();
    let finalStatus = status;
    if (status !== 'granted') {
      finalStatus = (await Notifications.requestPermissionsAsync()).status;
    }
    if (finalStatus !== 'granted') return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return; // todavía sin proyecto EAS: solo locales

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

    await supabase.from('push_tokens').upsert({
      profile_id: profileId,
      token,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Push remota no disponible (p. ej. Expo Go en Android): no es fatal
  }
}

/**
 * Programa recordatorios LOCALES para mis tareas pendientes
 * (60 min antes del vencimiento). Funciona incluso en Expo Go.
 * Idempotente: cancela lo programado y vuelve a armar.
 */
export async function scheduleLocalReminders(
  instances: TaskInstance[],
  myProfileId: string,
  minutesBefore = 60
): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = Date.now();
    for (const instance of instances) {
      if (instance.assigned_to !== myProfileId || instance.status !== 'pending') continue;

      const remindAt = new Date(instance.due_at).getTime() - minutesBefore * 60 * 1000;
      if (remindAt <= now) continue;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Recordatorio ⏰',
          body: `"${instance.task?.title ?? 'Tarea'}" vence a las ${humanTime(instance.due_at)}`,
          data: { instanceId: instance.id },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(remindAt),
        },
      });
    }
  } catch {
    // sin permiso de notificaciones: seguimos sin recordatorios
  }
}
