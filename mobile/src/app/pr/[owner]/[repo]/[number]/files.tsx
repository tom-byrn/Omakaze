import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Chrome';
import { DiffStat, Empty, ErrorView, Loading, Rule, T, Tag } from '@/components/ui';
import { useComments, usePull } from '@/lib/queries';
import { Fonts, useTheme } from '@/lib/theme';
import { threadsByPath } from '@/lib/threads';

/** Every changed file (the web viewer's All files). */
export default function FilesScreen() {
  const params = useLocalSearchParams<{ owner: string; repo: string; number: string; v?: string }>();
  const repo = `${params.owner}/${params.repo}`;
  const number = Number(params.number);
  const { colors } = useTheme();
  const q = usePull(repo, number, params.v ? Number(params.v) : null);
  const guide = q.data?.guide;
  const comments = useComments(guide?.id);
  const threads = threadsByPath(comments.data);
  const header = <ScreenHeader crumb={`${repo} / #${number}`} title="All files" />;
  if (q.isLoading && !q.data) return <View style={{ flex: 1, backgroundColor: colors.paper }}>{header}<Loading /></View>;
  if (q.error && !q.data) return <View style={{ flex: 1, backgroundColor: colors.paper }}>{header}<ErrorView error={q.error} onRetry={() => q.refetch()} /></View>;
  if (!guide) return <View style={{ flex: 1, backgroundColor: colors.paper }}>{header}<Empty title="No guide." /></View>;
  const covered = guide.coverage.total > 0 ? Math.round((guide.coverage.covered / guide.coverage.total) * 100) : null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      {header}
      <FlatList
        data={guide.files}
        keyExtractor={(f) => f.path}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        ListHeaderComponent={
          <T variant="label" style={{ paddingBottom: 12 }}>
            {guide.files.length} files changed{covered !== null ? ` · ${covered}% of changed lines in sections` : ''}
          </T>
        }
        renderItem={({ item: f, index }) => {
          const open = (threads.get(f.path) ?? []).filter((t) => !t.isResolved).length;
          return (
            <View style={{ borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: index === 0 ? 1 : 0, borderBottomWidth: index === guide.files.length - 1 ? 1 : 0, borderColor: colors.border, backgroundColor: colors.surface }}>
              {index > 0 ? <Rule /> : null}
              <Pressable
                onPress={() => router.push(`/pr/${repo}/${number}/file?path=${encodeURIComponent(f.path)}&v=${guide.version}` as never)}
                style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 12, gap: 7, backgroundColor: pressed ? colors.press : 'transparent' })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Tag label={f.status} />
                  <Text style={{ flex: 1, fontFamily: Fonts.mono, fontSize: 12, color: colors.ink }} numberOfLines={2}>
                    {f.previousPath && f.previousPath !== f.path ? <Text style={{ color: colors.meta }}>{f.previousPath} → </Text> : null}
                    {f.path}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <DiffStat additions={f.additions} deletions={f.deletions} />
                  <T variant="label" color={colors.faint}>
                    {f.sections.length === 0 ? 'In no section' : `Section${f.sections.length > 1 ? 's' : ''} ${f.sections.map((i) => String(i + 1).padStart(2, '0')).join(', ')}`}
                  </T>
                  {open > 0 ? <T variant="label" color={colors.blueBright}>{open === 1 ? '1 open conversation' : `${open} open conversations`}</T> : null}
                </View>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}
