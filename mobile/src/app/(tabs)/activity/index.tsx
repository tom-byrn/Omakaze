import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { AppBar } from '@/components/Chrome';
import { Avatar, Empty, ErrorView, Loading, PageHeader, Rule, T } from '@/components/ui';
import { formatDate, timeAgo } from '@/lib/format';
import { useActivity, useMe, useRefetchOnFocus } from '@/lib/queries';
import { useAccount } from '@/lib/session';
import { Fonts, useTheme } from '@/lib/theme';
import type { ActivityItem } from '@/lib/types';

type Row = { kind: 'day'; label: string; key: string } | { kind: 'item'; item: ActivityItem; key: string };

export default function Activity() {
  const { colors } = useTheme();
  const account = useAccount();
  const me = useMe();
  const q = useActivity();
  useRefetchOnFocus(q);
  const rows = useMemo(() => {
    const out: Row[] = [];
    let day = '';
    for (const item of q.data?.pages.flatMap((p) => p.items) ?? []) {
      const d = formatDate(item.at);
      if (d !== day) out.push({ kind: 'day', label: d, key: `d${item.at}` });
      day = d;
      out.push({ kind: 'item', item, key: item.id });
    }
    return out;
  }, [q.data]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <AppBar />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorView error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          ListHeaderComponent={
            <PageHeader
              eyebrow={`Workspace · ${me.data?.workspace.name ?? account.workspace.name}`}
              title="Activity."
              description="Guides, comments, reviews and changes in this workspace."
            />
          }
          contentContainerStyle={{ paddingBottom: 32 }}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<Empty title="Nothing yet." />}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} color={colors.meta} /> : undefined}
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} tintColor={colors.meta} />}
          renderItem={({ item: r }) =>
            r.kind === 'day' ? (
              <View style={{ paddingHorizontal: 20, paddingTop: 26 }}>
                <T variant="label" style={{ paddingBottom: 8 }}>
                  {r.label}
                </T>
                <Rule />
              </View>
            ) : (
              <Pressable
                disabled={!r.item.repo || !r.item.prNumber}
                onPress={() => router.push(`/pr/${r.item.repo}/${r.item.prNumber}` as never)}
                style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'flex-start', backgroundColor: pressed ? colors.press : 'transparent' })}>
                <Avatar uri={r.item.actor.avatarUrl} name={r.item.actor.name} size={24} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 14, lineHeight: 20, color: colors.text }}>
                    <Text style={{ color: colors.ink }}>{r.item.actor.name}</Text> {r.item.text}
                  </Text>
                  <T variant="meta">{timeAgo(r.item.at)}</T>
                </View>
              </Pressable>
            )
          }
        />
      )}
    </View>
  );
}
