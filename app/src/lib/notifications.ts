import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { humanTime } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { TaskInstance } from '@/lib/types';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

/**
 * expo-notifications se carga de forma diferida: en Expo Go de
 * Android el módulo LANZA ERROR al importarlo (Expo lo quitó en el
 * SDK 53), así que un import estático rompería toda la app. En un
 * development build / APK propio funciona completo.
 */
function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;

  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  if (Platform.OS === 'android' && isExpoGo) {
    cached = null;
    return cached;
  }

  try {
    const mod = require('expo-notifications') as NotificationsModule;
    // Mostrar notificaciones también con la app abierta
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Pide permiso y registra el token de push de Expo en Supabase.
 * Sin proyecto EAS o sin módulo disponible, no hace nada (la app
 * sigue funcionando normal).
 */
export async function registerForPushNotifications(profileId: string): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;

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
    // Push remota no disponible: no es fatal
  }
}

/**
 * Programa recordatorios LOCALES para mis tareas pendientes
 * (60 min antes del vencimiento). Idempotente.
 */
export async function scheduleLocalReminders(
  instances: TaskInstance[],
  myProfileId: string,
  minutesBefore = 60
): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;

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

/**
 * Al tocar una notificación, avisa con el id de la instancia para
 * navegar al detalle. Devuelve la función para desuscribirse.
 */
export function addNotificationTapListener(onTap: (instanceId: string) => void): () => void {
  const Notifications = getNotifications();
  if (!Notifications) return () => {};

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const instanceId = response.notification.request.content.data?.instanceId;
    if (typeof instanceId === 'string') onTap(instanceId);
  });
  return () => sub.remove();
}
