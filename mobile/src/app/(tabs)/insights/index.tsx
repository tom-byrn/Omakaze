import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type HostInstance } from 'react-native';

import { AppBar } from '@/components/Chrome';
import { useOverlay } from '@/components/Overlays';
import { Avatar, Empty, ErrorView, Icon, Loading, PageHeader, Rule, Segmented, T } from '@/components/ui';
import { formatDuration, percent } from '@/lib/format';
import { useInsights, useMe, useRefetchOnFocus } from '@/lib/queries';
import { useAccount } from '@/lib/session';
import { Fonts, useTheme } from '@/lib/theme';
import type { Insights } from '@/lib/types';

const ORIGIN_COLORS: Record<string, string> = { mcp: '#147DBA', ai: '#EB6834', chatgpt: '#1BAF7A', api: '#EDA100', manual: '#7C4DD8' };

export default function InsightsScreen() {
  const { colors } = useTheme();
  const account = useAccount();
  const me = useMe();
  const { openMenu } = useOverlay();
  const repoRef = useRef<HostInstance>(null);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [repo, setRepo] = useState<string | null>(null);
  const q = useInsights(days, repo);
  useRefetchOnFocus(q);
  const repos = q.data?.repos ?? me.data?.repos.map((r) => r.fullName) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <AppBar />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.meta} />}>
        <PageHeader eyebrow={`Workspace · ${me.data?.workspace.name ?? account.workspace.name}`} title="Insights." description="How guides are written and reviewed in this workspace.">
          <View style={{ gap: 10 }}>
            <Segmented
              value={days}
              onChange={setDays}
              options={[
                { value: 7, label: '7 days' },
                { value: 30, label: '30 days' },
                { value: 90, label: '90 days' },
              ]}
            />
            {repos.length > 1 ? (
              <Pressable
                ref={repoRef}
                onPress={() =>
                  openMenu(
                    [{ label: 'All repositories', isOn: repo === null, onPress: () => setRepo(null) }, ...repos.map((r) => ({ label: r, isOn: repo === r, onPress: () => setRepo(r) }))],
                    repoRef.current,
                    'Repository',
                  )
                }
                style={({ pressed }) => ({ alignSelf: 'flex-start', height: 38, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.tab, backgroundColor: pressed ? colors.press : colors.paper })}>
                <Text style={{ fontFamily: Fonts.serif, fontSize: 15, color: colors.ink }}>{repo ?? 'All repositories'}</Text>
                <Icon name="ArrowDownSLine" size={15} color={colors.faint} />
              </Pressable>
            ) : null}
          </View>
        </PageHeader>
        {q.isLoading && !q.data ? (
          <View style={{ height: 240 }}>
            <Loading />
          </View>
        ) : q.error && !q.data ? (
          <ErrorView error={q.error} onRetry={() => q.refetch()} />
        ) : q.data && q.data.repos.length === 0 ? (
          <Empty title="Nothing to measure yet.">Insights count the guides, review marks and comments of the repositories this workspace follows.</Empty>
        ) : q.data ? (
          <View style={{ padding: 20, gap: 16 }}>
            <Panels d={q.data} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Panels({ d }: { d: Insights }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...d.created.buckets.map((b) => b.total));
  const done = d.completion;
  const cmax = Math.max(1, ...d.coverage.bins.map((b) => b.total));
  const pull = (repo: string, n: number, q = '') => router.push(`/pr/${repo}/${n}${q}` as never);
  return (
    <>
      <Panel title="Guides created" stat={String(d.created.total)}>
        <View style={styles.chart}>
          {d.created.buckets.map((b) => (
            <View key={b.start} style={styles.colWrap}>
              <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                {d.origins.map((o) =>
                  b.values[o.key] ? <View key={o.key} style={{ height: `${(b.values[o.key] / max) * 100}%`, backgroundColor: ORIGIN_COLORS[o.key] ?? colors.ink }} /> : null,
                )}
              </View>
            </View>
          ))}
        </View>
        <View style={styles.legend}>
          {d.origins
            .filter((o) => d.created.totals[o.key])
            .map((o) => (
              <View key={o.key} style={styles.legendItem}>
                <View style={{ width: 8, height: 8, backgroundColor: ORIGIN_COLORS[o.key] }} />
                <T variant="meta">
                  {o.label} {d.created.totals[o.key]}
                </T>
              </View>
            ))}
        </View>
      </Panel>

      <Panel title="Review speed" stat={formatDuration(d.speed.firstMedian)} statLabel="median to first review">
        <Kv k="Median until fully reviewed" v={formatDuration(d.speed.allMedian)} />
        <Kv k="Guides published" v={String(d.speed.published)} />
        <Kv k="Reviewed at all" v={`${d.speed.reviewed} (${percent(d.speed.published ? d.speed.reviewed / d.speed.published : null)})`} />
        <Kv k="Fully reviewed" v={`${d.speed.completed} (${percent(d.speed.published ? d.speed.completed / d.speed.published : null)})`} />
      </Panel>

      <Panel title="Completion" stat={percent(done.sections ? done.reviewedSections / done.sections : null)} statLabel="of sections reviewed">
        <View style={[styles.stack, { backgroundColor: colors.wash }]}>
          {(['full', 'partial', 'none'] as const).map((k) =>
            done.states[k] ? <View key={k} style={{ flex: done.states[k], backgroundColor: k === 'full' ? colors.ink : k === 'partial' ? colors.body : colors.solid }} /> : null,
          )}
        </View>
        <Kv k="Fully reviewed guides" v={String(done.states.full)} />
        <Kv k="Partly reviewed" v={String(done.states.partial)} />
        <Kv k="Not reviewed" v={String(done.states.none)} />
      </Panel>

      <Panel title="Coverage" stat={percent(d.coverage.median)} statLabel="median of changed lines in sections">
        {d.coverage.bins.map((b) => (
          <View key={b.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <T variant="meta" style={{ width: 62 }}>
              {b.label}
            </T>
            <View style={{ flex: 1, height: 8, backgroundColor: colors.wash }}>
              <View style={{ width: `${(b.total / cmax) * 100}%`, height: 8, backgroundColor: colors.ink }} />
            </View>
            <T variant="meta" style={{ width: 24, textAlign: 'right' }}>
              {b.total}
            </T>
          </View>
        ))}
        <Kv k="Lines left to “Other changes”" v={percent(d.coverage.otherShare)} />
      </Panel>

      {d.unreviewed.length > 0 ? (
        <Panel title="Sections reviewers skip">
          {d.unreviewed.map((s) => (
            <Kv key={s.title} k={s.title} v={`${s.unreviewed}/${s.appearances}`} />
          ))}
        </Panel>
      ) : null}

      {d.hotSections.length > 0 ? (
        <Panel title="Most discussed sections">
          {d.hotSections.map((s) => (
            <Kv key={s.sectionId} k={`${s.title}`} sub={`${s.repoFullName}#${s.prNumber}`} v={`${s.comments}`} onPress={() => pull(s.repoFullName, s.prNumber, `/section?position=${s.position}&v=${s.version}`)} />
          ))}
        </Panel>
      ) : null}

      {d.hotFiles.length > 0 ? (
        <Panel title="Most discussed files">
          {d.hotFiles.map((f) => (
            <Kv key={`${f.repoFullName}:${f.path}`} k={f.path} sub={f.repoFullName} v={`${f.comments}`} mono onPress={() => pull(f.repoFullName, f.link.prNumber)} />
          ))}
        </Panel>
      ) : null}

      <Panel title={d.members.everyone ? 'Members' : 'You'}>
        {[...d.members.rows, ...(d.members.everyone ? [d.members.total] : [])].map((m, i) => (
          <View key={m.userId ?? `t${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
            {m.userId ? <Avatar uri={m.avatarUrl} name={m.name} size={22} /> : <View style={{ width: 22 }} />}
            <T variant={m.userId ? 'body' : 'heading'} style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
              {m.name}
            </T>
            <T variant="meta">
              {m.reviewed} rev · {m.comments} cmt · {m.reviews} rvw
            </T>
          </View>
        ))}
      </Panel>

      {d.templates.guides > 0 ? (
        <Panel title="Template compliance" stat={`${d.templates.guides - d.templates.missing}/${d.templates.guides}`} statLabel="guides with every required section">
          {d.templates.sections.map((s) => (
            <Kv key={`${s.template}:${s.title}`} k={s.title} sub={s.template} v={`${s.missing} missing`} />
          ))}
        </Panel>
      ) : null}
    </>
  );
}

/** An insights panel: a serif title over a dashed rule, then a stat and the content. */
function Panel({ title, stat, statLabel, description, children }: { title: string; stat?: string; statLabel?: string; description?: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <View style={{ paddingHorizontal: 18, paddingVertical: 15, gap: 4 }}>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 21, lineHeight: 24, letterSpacing: -0.3, color: colors.heading }}>{title}</Text>
        {description ? <T variant="small" style={{ color: colors.muted }}>{description}</T> : null}
      </View>
      <Rule />
      {stat ? (
        <View style={{ paddingHorizontal: 18, paddingTop: 16 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 30, lineHeight: 32, letterSpacing: -0.9, color: colors.stat }}>{stat}</Text>
          {statLabel ? <T variant="small" style={{ marginTop: 6, color: colors.muted }}>{statLabel}</T> : null}
        </View>
      ) : null}
      <View style={{ padding: 18, gap: 12 }}>{children}</View>
    </View>
  );
}

function Kv({ k, v, sub, mono, onPress }: { k: string; v: string; sub?: string; mono?: boolean; onPress?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <T variant={mono ? 'mono' : 'body'} style={{ fontSize: mono ? 12 : 14, lineHeight: 19 }} numberOfLines={2} onPress={onPress}>
          {k}
        </T>
        {sub ? <T variant="meta">{sub}</T> : null}
      </View>
      <T variant="mono">{v}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'stretch', height: 96, gap: 2 },
  colWrap: { flex: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stack: { flexDirection: 'row', height: 10, overflow: 'hidden' },
});
