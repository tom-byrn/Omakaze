import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { ScreenHeader } from '@/components/Chrome';
import { useOverlay } from '@/components/Overlays';
import { Banner, Button, ErrorView, Loading, Panel, Segmented, SwitchRow } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { pushPermission, registerPush, unregisterPush, type PushPermission } from '@/lib/push';
import { useApi, useMe, useNotificationSettings, useRefetchOnFocus } from '@/lib/queries';
import { useAccount } from '@/lib/session';
import type { NotificationSettings } from '@/lib/types';

export default function Notifications() {
  const account = useAccount();
  const request = useApi();
  const client = useQueryClient();
  const me = useMe();
  const q = useNotificationSettings();
  const { colors } = useTheme();
  const { dialog, flash } = useOverlay();
  useRefetchOnFocus(q);
  const [permission, setPermission] = useState<PushPermission>('undetermined');
  useEffect(() => {
    pushPermission().then(setPermission);
  }, []);

  const save = async (patch: Partial<NotificationSettings['preferences']> & { workspaceMuted?: boolean }) => {
    const key = [account.id, 'notifications'];
    const prev = client.getQueryData<NotificationSettings>(key);
    if (prev) {
      const { workspaceMuted, ...prefs } = patch;
      client.setQueryData<NotificationSettings>(key, { ...prev, preferences: { ...prev.preferences, ...prefs }, workspaceMuted: workspaceMuted ?? prev.workspaceMuted });
    }
    try {
      client.setQueryData(key, await request<NotificationSettings>('/api/mobile/notifications', { method: 'PATCH', body: patch }));
    } catch (err) {
      if (prev) client.setQueryData(key, prev);
      flash(err instanceof Error ? err.message : 'Could not save', 'error');
    }
  };

  const setPush = async (on: boolean) => {
    if (on) {
      const ok = await registerPush(account, true).catch(() => false);
      setPermission(await pushPermission());
      if (!ok) {
        const choice = await dialog({
          title: 'Notifications are off',
          message: 'Allow notifications for Omakaze in your device settings, then try again.',
          buttons: [
            { label: 'Not now', kind: 'ghost', value: 'no' },
            { label: 'Open settings', kind: 'primary', value: 'open' },
          ],
        });
        if (choice === 'open') void Linking.openSettings();
        return;
      }
    } else {
      await unregisterPush(account).catch(() => {});
    }
    await save({ push: on });
  };

  const header = <ScreenHeader crumb="Settings" title="Notifications" />;
  if (q.isLoading) return <View style={{ flex: 1, backgroundColor: colors.paper }}>{header}<Loading /></View>;
  if (q.error || !q.data) return <View style={{ flex: 1, backgroundColor: colors.paper }}>{header}<ErrorView error={q.error} onRetry={() => q.refetch()} /></View>;
  const s = q.data;
  const p = s.preferences;
  const pushOn = p.push && permission === 'granted';

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 18 }}>
        {!s.enabled ? <Banner tone="warn">Notifications are turned off on this server.</Banner> : null}
        <Panel
          title="Delivery"
          footer={
            permission === 'unavailable'
              ? 'Push notifications need a build of the app with an Expo project ID (see mobile/README.md).'
              : !s.pushAvailable
                ? 'Push notifications are turned off on this server.'
                : 'These settings apply to all your workspaces on this server.'
          }>
          <SwitchRow
            title="Push notifications"
            subtitle={permission === 'denied' ? 'Blocked in device settings' : 'On this device, right away'}
            value={pushOn}
            onChange={setPush}
            disabled={!s.enabled || !s.pushAvailable || permission === 'unavailable' || !me.data?.features.push}
          />
          <SwitchRow title="Email" subtitle={s.emailAvailable ? 'Grouped, to your confirmed address' : 'Email is not set up on this server'} value={p.email} onChange={(v) => save({ email: v })} disabled={!s.enabled || !s.emailAvailable} last />
        </Panel>
        {permission === 'denied' ? <Button title="Open device settings" onPress={() => Linking.openSettings()} /> : null}

        <Panel title="Notify me when" description="For email and push.">
          <SwitchRow title="A guide is ready for my review" value={p.guideReady} onChange={(v) => save({ guideReady: v })} disabled={!s.enabled} />
          <SwitchRow title="A guide I reviewed has a new version" value={p.newVersion} onChange={(v) => save({ newVersion: v })} disabled={!s.enabled} />
          <SwitchRow title="Someone replies to me" value={p.replies} onChange={(v) => save({ replies: v })} disabled={!s.enabled} />
          <SwitchRow title="Comments and reviews on my pull requests" value={p.pullActivity} onChange={(v) => save({ pullActivity: v })} disabled={!s.enabled} last />
        </Panel>

        {p.email && s.emailAvailable ? (
          <Panel title="Email timing" description="How long to wait so several notifications become one email.">
            <Segmented
              style={{ padding: 18 }}
              value={p.digest}
              onChange={(v) => save({ digest: v })}
              options={s.digestOptions.map((o) => ({ value: o.value, label: o.label }))}
            />
          </Panel>
        ) : null}

        <Panel title={account.workspace.name}>
          <SwitchRow title="Mute this workspace" subtitle="No email or push from this workspace" value={s.workspaceMuted} onChange={(v) => save({ workspaceMuted: v })} disabled={!s.enabled} last />
        </Panel>
      </ScrollView>
    </View>
  );
}
