import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { AppBar } from '@/components/Chrome';
import { useOverlay } from '@/components/Overlays';
import { Avatar, Button, ListRow, PageHeader, Panel, Segmented, T } from '@/components/ui';
import { openUrl } from '@/lib/links';
import { useMe } from '@/lib/queries';
import { useAccount, useSession } from '@/lib/session';
import { Fonts, useTheme, type ThemeMode } from '@/lib/theme';

export default function Settings() {
  const { colors, mode, setMode } = useTheme();
  const account = useAccount();
  const { accounts, switchTo, signOut } = useSession();
  const { confirm } = useOverlay();
  const me = useMe();
  const m = me.data;
  const host = new URL(account.server).host;

  const confirmSignOut = async () => {
    if (
      await confirm({
        title: `Sign out of ${account.workspace.name}?`,
        message: "The app's access to this workspace is revoked and this device stops getting its notifications.",
        confirm: 'Sign out',
        destructive: true,
      })
    )
      await signOut(account.id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <AppBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <PageHeader eyebrow={`Workspace · ${m?.workspace.name ?? account.workspace.name}`} title="Settings." description="Your account, workspaces and notifications. Repositories, GitHub, AI and automation are set on the web." />
        <View style={{ padding: 20, gap: 18 }}>
          <Panel>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 }}>
              <Avatar uri={m?.user.avatarUrl ?? account.user.avatarUrl} name={account.user.name} size={48} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontFamily: Fonts.serif, fontSize: 22, lineHeight: 25, letterSpacing: -0.22, color: colors.heading }}>{m?.user.name ?? account.user.name}</Text>
                <T variant="meta" numberOfLines={1}>
                  {[m?.user.email ?? account.user.email, m?.user.githubLogin ? `@${m.user.githubLogin}` : null].filter(Boolean).join(' · ')}
                </T>
                <T variant="label">
                  {m?.role ?? account.role} · {host}
                </T>
              </View>
            </View>
          </Panel>

          <Panel title="Workspaces" description="Each workspace signs in separately.">
            {accounts.map((a) => (
              <ListRow
                key={a.id}
                title={a.workspace.name}
                subtitle={`${new URL(a.server).host} · ${a.user.name}`}
                left={<Avatar uri={a.user.avatarUrl} name={a.workspace.name} size={26} />}
                right={a.id === account.id ? <T variant="label" color={colors.ink}>Current</T> : <T variant="label">Switch</T>}
                onPress={a.id === account.id ? undefined : () => switchTo(a.id)}
              />
            ))}
            <ListRow title="Add a workspace" icon="AddLine" onPress={() => router.push('/add-account')} last />
          </Panel>

          <Panel title="This workspace">
            <ListRow title="Notifications" icon="Notification3Line" onPress={() => router.push('/settings/notifications')} />
            <ListRow title="Members" icon="TeamLine" onPress={() => router.push('/settings/members')} />
            {m?.features.shareLinks ? <ListRow title="Share links" icon="LinksLine" onPress={() => router.push('/settings/share-links')} /> : null}
            <ListRow
              title="Workspace settings on the web"
              subtitle="Repositories, GitHub, AI, automation, templates and tokens"
              icon="ExternalLinkLine"
              onPress={() => openUrl(null, `${account.server}/w/${account.workspace.slug}/settings`)}
              last
            />
          </Panel>

          <Panel title="Theme" description="System follows your device.">
            <View style={{ padding: 18 }}>
              <Segmented<ThemeMode>
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </View>
          </Panel>

          <Panel title="About">
            <ListRow title="Server" subtitle={account.server} icon="ServerLine" />
            <ListRow title="AI generation" subtitle={m?.features.ai ? m.features.ai.model : 'Not set up in this workspace'} icon="SparklingLine" />
            <ListRow title="App version" subtitle={Constants.expoConfig?.version ?? ''} icon="InformationLine" last />
          </Panel>

          <Panel tone="danger" title="Sign out" description={`Revokes the app's access to ${account.workspace.name} on ${host}.`}>
            <View style={{ padding: 18, flexDirection: 'row' }}>
              <Button title={`Sign out of ${account.workspace.name}`} kind="danger" icon="LogoutBoxRLine" onPress={confirmSignOut} />
            </View>
          </Panel>
        </View>
      </ScrollView>
    </View>
  );
}
