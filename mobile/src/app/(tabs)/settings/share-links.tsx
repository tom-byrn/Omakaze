import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, View } from 'react-native';

import { ScreenHeader } from '@/components/Chrome';
import { useOverlay } from '@/components/Overlays';
import { Button, Empty, ErrorView, ListRow, Loading, T } from '@/components/ui';
import { timeAgo } from '@/lib/format';
import { useApi, useShareLinks } from '@/lib/queries';
import { useAccount } from '@/lib/session';
import { useTheme } from '@/lib/theme';

/** Active share links of the workspace (web Settings → Share links). */
export default function ShareLinks() {
  const { colors } = useTheme();
  const account = useAccount();
  const request = useApi();
  const client = useQueryClient();
  const { confirm, flash } = useOverlay();
  const q = useShareLinks(null, null);
  const revoke = async (id: string) => {
    if (!(await confirm({ title: 'Revoke this link?', message: 'People with the link can no longer open the guide.', confirm: 'Revoke', destructive: true }))) return;
    try {
      await request('/api/mobile/share-links', { method: 'DELETE', query: { id } });
      void client.invalidateQueries({ queryKey: [account.id, 'shares'] });
      flash('Link revoked.');
    } catch (err) {
      flash(err instanceof Error ? err.message : String(err), 'error');
    }
  };
  const header = <ScreenHeader crumb="Settings" title="Share links" />;
  if (q.isLoading) return <View style={{ flex: 1, backgroundColor: colors.paper }}>{header}<Loading /></View>;
  if (q.error || !q.data) return <View style={{ flex: 1, backgroundColor: colors.paper }}>{header}<ErrorView error={q.error} onRetry={() => q.refetch()} /></View>;
  const links = q.data.links;
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      {header}
      <FlatList
        data={links}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        ListHeaderComponent={
          <T variant="label" style={{ paddingBottom: 12 }}>
            Links that work now · create them from a guide&apos;s menu
          </T>
        }
        ListEmptyComponent={<Empty title="No active links." style={{ margin: 0 }} />}
        renderItem={({ item: l, index }) => (
          <View style={{ borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: index === 0 ? 1 : 0, borderBottomWidth: index === links.length - 1 ? 1 : 0, borderColor: colors.border, backgroundColor: colors.surface }}>
            <ListRow
              title={`${l.repoFullName}#${l.prNumber}`}
              subtitle={`${l.version ? `v${l.version}` : 'Latest version'} · ${l.creatorName ?? 'Someone'} · ${timeAgo(l.createdAt)}${l.lastUsedAt ? ` · opened ${timeAgo(l.lastUsedAt)}` : ''}`}
              onPress={() => router.push(`/pr/${l.repoFullName}/${l.prNumber}` as never)}
              right={l.canRevoke ? <Button title="Revoke" kind="ghost" size="xs" onPress={() => revoke(l.id)} /> : undefined}
              last={index === links.length - 1}
            />
          </View>
        )}
      />
    </View>
  );
}
