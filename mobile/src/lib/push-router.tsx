import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useMe } from './queries';
import { isPushData, registerPush, routeForPush } from './push';
import { useSession } from './session';

/**
 * Registers the device for push with the active account's server, and opens the right guide when a
 * notification is tapped (switching to the account of the notification's workspace first).
 */
export function PushRouter() {
  const { accounts, account, switchTo } = useSession();
  const me = useMe();
  const registered = useRef(new Set<string>());

  useEffect(() => {
    if (!account || !me.data?.features.push || registered.current.has(account.id) || Platform.OS === 'web') return;
    registered.current.add(account.id);
    registerPush(account, true).catch((err) => console.warn('[push] registration failed', err));
  }, [account, me.data?.features.push]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data;
      if (!isPushData(data)) return;
      const target = accounts.find((a) => a.workspace.id === data.workspaceId && (!data.url || data.url.startsWith(a.server))) ?? accounts.find((a) => a.workspace.id === data.workspaceId);
      if (!target) return;
      if (target.id !== account?.id) switchTo(target.id);
      // Let the navigator settle on the new account before pushing the guide.
      setTimeout(() => router.push(routeForPush(data) as never), target.id !== account?.id ? 300 : 0);
      void Notifications.clearLastNotificationResponseAsync?.();
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  return null;
}
