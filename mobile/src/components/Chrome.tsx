/**
 * The app's chrome, drawn like the web app's: the header bar (logo, workspace, account) over a
 * dashed rule, headers for inner screens, the bottom navigation and the sheet panel. No system bars.
 */
import { router } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, type HostInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '@/lib/queries';
import { useAccount, useSession } from '@/lib/session';
import { Fonts, useTheme } from '@/lib/theme';
import { useOverlay, type MenuItem } from './Overlays';
import { Avatar, Icon, IconButton, LogoMark, Rule, T, type IconName } from './ui';

export const BAR_HEIGHT = 56;

/** The header of the tab screens (web AppHeader): logo, the workspace switcher and the account menu. */
export function AppBar() {
  const { colors, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const { accounts, switchTo } = useSession();
  const me = useMe();
  const { openMenu } = useOverlay();
  const wsRef = useRef<HostInstance>(null);
  const meRef = useRef<HostInstance>(null);
  const workspaceMenu: MenuItem[] = [
    ...accounts.map((a) => ({
      label: a.workspace.name,
      detail: new URL(a.server).host,
      isOn: a.id === account.id,
      onPress: () => switchTo(a.id),
    })),
    { group: ' ', items: [{ label: 'Add a workspace', icon: 'AddLine' as const, onPress: () => router.push('/add-account') }] },
  ];
  const accountMenu: MenuItem[] = [
    {
      group: 'Theme',
      items: (['system', 'light', 'dark'] as const).map((m) => ({ label: m[0].toUpperCase() + m.slice(1), isOn: mode === m, onPress: () => setMode(m) })),
    },
    {
      group: ' ',
      items: [
        { label: 'Settings', icon: 'Settings3Line', onPress: () => router.navigate('/settings') },
        { label: 'Notifications', icon: 'Notification3Line', onPress: () => router.push('/settings/notifications') },
      ],
    },
  ];
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: colors.paper }}>
      <View style={{ height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16 }}>
        <LogoMark size={26} />
        <View style={{ height: 24, overflow: 'hidden', width: 1 }}>
          <View style={{ width: 3, flex: 1, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line }} />
        </View>
        <Pressable
          ref={wsRef}
          onPress={() => openMenu(workspaceMenu, wsRef.current, 'Workspaces')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}
          accessibilityLabel="Switch workspace"
          hitSlop={8}>
          <Text style={{ fontFamily: Fonts.sans, fontSize: 15, letterSpacing: -0.3, color: colors.ink, flexShrink: 1 }} numberOfLines={1}>
            {me.data?.workspace.name ?? account.workspace.name}
          </Text>
          <Icon name="ArrowDownSLine" size={16} color={colors.faint} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable ref={meRef} onPress={() => openMenu(accountMenu, meRef.current, account.user.name)} accessibilityLabel="Account menu" hitSlop={8}>
          <Avatar uri={me.data?.user.avatarUrl ?? account.user.avatarUrl} name={account.user.name} size={28} />
        </Pressable>
      </View>
      <Rule color={colors.lineHeader} />
    </View>
  );
}

/** The header of an inner screen: back, a mono breadcrumb or title, and actions. */
export function ScreenHeader({ title, crumb, menu, menuTitle, right, onBack }: { title?: string; crumb?: string; menu?: MenuItem[]; menuTitle?: string; right?: ReactNode; onBack?: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { openMenu } = useOverlay();
  const menuRef = useRef<HostInstance>(null);
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: colors.paper }}>
      <View style={{ height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }}>
        <IconButton icon="ArrowLeftLine" label="Back" color={colors.ink} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/pulls')))} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {crumb ? (
            <T variant="label" numberOfLines={1}>
              {crumb}
            </T>
          ) : null}
          {title ? (
            <Text style={{ fontFamily: Fonts.sans, fontSize: 15, letterSpacing: -0.3, color: colors.ink }} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>
        {right}
        {menu ? (
          <View ref={menuRef} collapsable={false}>
            <IconButton icon="MoreFill" label="More" color={colors.ink} onPress={() => openMenu(menu, menuRef.current, menuTitle)} />
          </View>
        ) : null}
      </View>
      <Rule color={colors.lineHeader} />
    </View>
  );
}

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'pulls', label: 'Pull requests', icon: 'GitPullRequestLine' },
  { name: 'activity', label: 'Activity', icon: 'HistoryLine' },
  { name: 'insights', label: 'Insights', icon: 'BarChart2Line' },
  { name: 'settings', label: 'Settings', icon: 'Settings3Line' },
];

/** Bottom navigation (the web nav links): the current section in ink with a rule above it. */
export function TabBar({ state, navigateToTab }: { state: { index: number; routes: { key: string; name: string }[] }; navigateToTab: (key: string) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.paper, paddingBottom: Math.max(insets.bottom, 8) }}>
      <Rule color={colors.lineHeader} />
      <View style={{ flexDirection: 'row' }}>
        {state.routes.map((route, i) => {
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;
          const on = state.index === i;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={tab.label}
              onPress={() => navigateToTab(route.key)}
              style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingTop: 9, paddingBottom: 4, gap: 4, backgroundColor: pressed ? colors.press : 'transparent' })}>
              <View style={{ position: 'absolute', top: 0, left: 18, right: 18, height: 2, backgroundColor: on ? colors.ink : 'transparent' }} />
              <Icon name={tab.icon} size={20} color={on ? colors.ink : colors.nav} />
              <Text style={{ fontFamily: Fonts.sans, fontSize: 11.5, letterSpacing: -0.1, color: on ? colors.ink : colors.nav }} numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * A sheet (the web dialog): a bordered panel at the bottom over a dimmed backdrop, with a serif
 * title and description over a dashed rule. Used by routes presented as transparent modals.
 */
export function Sheet({ title, description, children, footer, full }: { title: string; description?: string; children: ReactNode; footer?: ReactNode; full?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Pressable style={{ flex: 1, backgroundColor: colors.backdrop }} onPress={() => router.back()} accessibilityLabel="Close" />
      <View
        style={{
          maxHeight: '88%',
          minHeight: full ? '60%' : undefined,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderColor: colors.border,
          paddingBottom: footer ? 0 : insets.bottom,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 22, lineHeight: 26, letterSpacing: -0.44, color: colors.heading }}>{title}</Text>
            {description ? <T variant="small">{description}</T> : null}
          </View>
          <IconButton icon="CloseLine" label="Close" onPress={() => router.back()} />
        </View>
        <Rule />
        <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{ padding: 20, gap: 16 }}>
          {children}
        </ScrollView>
        {footer ? (
          <>
            <Rule />
            <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: colors.paper }}>{footer}</View>
          </>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
