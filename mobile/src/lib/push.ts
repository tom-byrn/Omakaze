/**
 * Push notifications. The server pushes through Expo's push service (src/lib/notifications/push.ts
 * on the server), so the app registers an Expo push token. That needs an Expo project ID
 * (EAS_PROJECT_ID when building); without one, push is skipped quietly.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';

import type { Account } from './accounts';
import { api } from './api';
import { getJson, setJson } from './storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const REGISTERED_KEY = 'omakaze.push';

export function pushProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export async function pushPermission(): Promise<PushPermission> {
  if (Platform.OS === 'web' || !pushProjectId()) return 'unavailable';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted || p.ios?.status === IosAuthorizationStatus.PROVISIONAL) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

let tokenPromise: Promise<string | null> | null = null;

/** This device's Expo push token, asking for permission when it hasn't been asked yet. */
export function devicePushToken(ask: boolean): Promise<string | null> {
  if (!tokenPromise || ask) {
    tokenPromise = (async () => {
      const projectId = pushProjectId();
      if (Platform.OS === 'web' || !projectId) return null;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Omakaze',
          importance: AndroidImportance.HIGH,
        });
      }
      let { granted } = await Notifications.getPermissionsAsync();
      if (!granted && ask) granted = (await Notifications.requestPermissionsAsync()).granted;
      if (!granted) return null;
      try {
        return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      } catch (err) {
        console.warn('[push] no push token', err);
        return null;
      }
    })();
  }
  return tokenPromise;
}

/** Register this device with an account's server so its member's notifications are pushed here. */
export async function registerPush(account: Account, ask: boolean): Promise<boolean> {
  const token = await devicePushToken(ask);
  if (!token) return false;
  await api(account, '/api/mobile/push-devices', {
    method: 'POST',
    body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android', deviceName: Device.deviceName ?? Device.modelName ?? null },
  });
  const registered = (await getJson<Record<string, string>>(REGISTERED_KEY)) ?? {};
  registered[account.id] = token;
  await setJson(REGISTERED_KEY, registered);
  return true;
}

export async function unregisterPush(account: Account): Promise<void> {
  const registered = (await getJson<Record<string, string>>(REGISTERED_KEY)) ?? {};
  const token = registered[account.id];
  if (!token) return;
  delete registered[account.id];
  await setJson(REGISTERED_KEY, registered);
  await api(account, '/api/mobile/push-devices', { method: 'DELETE', query: { token } });
}

export { isPushData, routeForPush, type PushData } from './push-data';
