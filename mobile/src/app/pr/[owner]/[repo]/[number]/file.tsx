import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { composeComment, composeReply } from '@/components/Composer';
import { DiffFile } from '@/components/DiffFile';
import { ScreenHeader } from '@/components/Chrome';
import { Empty, ErrorView, Loading, T } from '@/components/ui';
import { useStoredBoolean } from '@/lib/prefs';
import { useComments, usePull } from '@/lib/queries';
import { useTheme } from '@/lib/theme';
import { threadsByPath } from '@/lib/threads';

/** One file's whole diff (from All files, or a diff: link with lines to highlight). */
export default function FileScreen() {
  const params = useLocalSearchParams<{ owner: string; repo: string; number: string; v?: string; path: string; start?: string; end?: string; side?: string }>();
  const repo = `${params.owner}/${params.repo}`;
  const number = Number(params.number);
  const q = usePull(repo, number, params.v ? Number(params.v) : null);
  const guide = q.data?.guide;
  const comments = useComments(guide?.id);
  const threads = useMemo(() => threadsByPath(comments.data), [comments.data]);
  const [wrap, setWrap] = useStoredBoolean('wrap', true);
  const { colors } = useTheme();
  const header = (
    <ScreenHeader crumb={`${repo} / #${number}`} title={params.path?.split('/').pop()} menu={[{ label: 'Wrap long lines', icon: 'TextWrap', isOn: wrap, onPress: () => setWrap(!wrap) }]} />
  );
  const shell = (body: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      {header}
      {body}
    </View>
  );
  const highlight = useMemo(
    () => (params.start ? { start: Number(params.start), end: Number(params.end ?? params.start), side: params.side === 'old' ? ('old' as const) : ('new' as const) } : null),
    [params.start, params.end, params.side],
  );
  if (q.isLoading && !q.data) return shell(<Loading />);
  if (q.error && !q.data) return shell(<ErrorView error={q.error} onRetry={() => q.refetch()} />);
  if (!guide) return shell(<Empty title="No guide." />);
  const f = guide.files.find((x) => x.path === params.path);
  if (!f) return shell(<Empty title="Not in this pull request.">{params.path}</Empty>);
  const base = `/pr/${repo}/${number}`;
  return shell(
      <ScrollView style={{ backgroundColor: colors.wash }} contentContainerStyle={{ padding: 12, paddingBottom: 48, gap: 10 }}>
        {highlight ? (
          <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
            <T variant="meta">
              Lines {highlight.start}
              {highlight.end !== highlight.start ? `–${highlight.end}` : ''} of the {highlight.side} version are highlighted.
            </T>
          </View>
        ) : null}
        <DiffFile
          guideId={guide.id}
          path={f.path}
          status={f.status}
          additions={f.additions}
          deletions={f.deletions}
          refs={null}
          highlight={highlight}
          threads={threads.get(f.path) ?? []}
          wrap={wrap}
          onCompose={guide.status !== 'draft' ? (t) => composeComment(base, guide.id, t) : undefined}
          onReply={(id) => composeReply(base, guide.id, id)}
        />
      </ScrollView>,
  );
}
