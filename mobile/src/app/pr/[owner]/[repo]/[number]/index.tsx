import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Chrome';
import { Markdown } from '@/components/Markdown';
import { useOverlay, type MenuItem } from '@/components/Overlays';
import { Avatar, Banner, Button, DiffStat, Dot, Empty, ErrorView, Eyebrow, Icon, Loading, Progress, Rule, StateTag, T, Tag, alpha } from '@/components/ui';
import { shortSha, timeAgo } from '@/lib/format';
import { useGenerate, useToggleReviewed } from '@/lib/guide-actions';
import { openUrl } from '@/lib/links';
import { guideMarkdown, useGuideStatus, useMe, usePull } from '@/lib/queries';
import { useAccount } from '@/lib/session';
import { Fonts, useTheme } from '@/lib/theme';
import type { Guide, GuideSection, PullDetail } from '@/lib/types';

const VIA: Record<string, string> = { mcp: 'MCP', api: 'REST API', ui: 'Omakaze', webhook: 'automation', poll: 'automation' };

export default function PullScreen() {
  const params = useLocalSearchParams<{ owner: string; repo: string; number: string; v?: string }>();
  const repo = `${params.owner}/${params.repo}`;
  const number = Number(params.number);
  const version = params.v ? Number(params.v) : null;
  const { colors } = useTheme();
  const account = useAccount();
  const me = useMe();
  const { confirm, flash } = useOverlay();
  const q = usePull(repo, number, version);
  const toggle = useToggleReviewed(repo, number);
  const generate = useGenerate(repo, number);
  const status = useGuideStatus(q.data?.guide?.id, q.data?.guide?.status === 'generating');
  const [refreshing, setRefreshing] = useState(false);

  const header = (menu?: MenuItem[]) => <ScreenHeader crumb={repo} title={`#${number}`} menu={menu} menuTitle={`#${number}`} />;
  if (q.isLoading && !q.data) return withHeader(header(), <Loading />, colors.paper);
  if (q.error && !q.data) return withHeader(header(), <ErrorView error={q.error} onRetry={() => q.refetch()} />, colors.paper);
  const d = q.data!;
  const guide = d.guide;
  const base = `/pr/${repo}/${number}`;
  const webUrl = `${account.server}/w/${account.workspace.slug}/${repo}/pull/${number}${guide ? `?v=${guide.version}` : ''}`;

  const startGenerate = async () => {
    const v = await generate(d.pull.url);
    if (v) router.setParams({ v: undefined });
  };
  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    flash(`${what} copied.`);
  };

  const menu: MenuItem[] = [
    {
      group: 'Version',
      hidden: d.versions.length < 2,
      items: d.versions.map((v) => ({
        label: `Version ${v.version}`,
        detail: v.status === 'ready' ? shortSha(v.headSha) : v.status,
        isOn: guide?.version === v.version,
        onPress: () => router.setParams({ v: String(v.version) }),
      })),
    },
    {
      group: 'Guide',
      items: [
        { label: 'Share…', icon: 'LinksLine', hidden: !guide || !me.data?.features.shareLinks, onPress: () => router.push(`${base}/share?guide=${guide!.id}&version=${guide!.version}` as never) },
        {
          label: 'Copy as Markdown',
          icon: 'FileCopyLine',
          hidden: !guide,
          onPress: async () => {
            try {
              await copy(await guideMarkdown(account, guide!.id), 'Markdown');
            } catch (err) {
              flash(err instanceof Error ? err.message : 'Export failed', 'error');
            }
          },
        },
        {
          label: guide ? 'Regenerate' : 'Generate with AI',
          icon: 'SparklingLine',
          hidden: !d.canGenerate || guide?.status === 'generating',
          onPress: async () => {
            if (
              guide &&
              !(await confirm({
                title: 'Regenerate the guide?',
                message: `This writes version ${(d.versions[0]?.version ?? 0) + 1} with ${me.data?.features.ai?.model ?? 'the workspace AI provider'}.`,
                confirm: 'Regenerate',
              }))
            )
              return;
            await startGenerate();
          },
        },
        { label: 'Copy agent prompt', icon: 'FileCopyLine', onPress: () => copy(d.agentPrompt, 'Agent prompt') },
      ],
    },
    {
      group: 'Open',
      items: [
        { label: 'GitHub', icon: 'ExternalLinkLine', onPress: () => openUrl(null, d.pull.url) },
        { label: 'Omakaze on the web', icon: 'GlobalLine', onPress: () => openUrl(null, webUrl) },
      ],
    },
  ];

  return withHeader(
    header(menu),
    <ScrollView
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.meta}
          onRefresh={async () => {
            setRefreshing(true);
            await q.refetch();
            setRefreshing(false);
          }}
        />
      }>
      <PullBar d={d} />
      <Notices d={d} statusEvents={status.data?.events ?? []} />
      {guide && guide.status !== 'generating' ? (
        <Overview d={d} guide={guide} base={base} onToggle={(s, on) => toggle(guide.id, s.id, on)} />
      ) : !guide ? (
        <NoGuide d={d} onGenerate={startGenerate} onCopyPrompt={() => copy(d.agentPrompt, 'Agent prompt')} />
      ) : null}
    </ScrollView>,
    colors.paper,
  );
}

function withHeader(header: React.ReactNode, body: React.ReactNode, bg: string) {
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {header}
      {body}
    </View>
  );
}

/** The bar above the guide (web pull page): repository, state, title, author, branches and size. */
function PullBar({ d }: { d: PullDetail }) {
  const { colors } = useTheme();
  const p = d.pull;
  const conclusion = d.check.check?.conclusion;
  return (
    <View style={{ backgroundColor: colors.paper }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T variant="meta" style={{ letterSpacing: 0.44 }}>
            {d.repo.fullName} / #{p.number}
          </T>
          <StateTag state={p.state} draft={p.draft} />
        </View>
        <Text selectable style={{ fontFamily: Fonts.serif, fontSize: 24, lineHeight: 28, letterSpacing: -0.48, color: colors.heading }}>
          {p.title}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Avatar uri={p.authorAvatarUrl} name={p.author} size={16} />
            <T variant="small" style={{ fontSize: 12, color: colors.muted }}>
              {p.author}
            </T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
            <Icon name="GitBranchLine" size={12} color={colors.muted} />
            <T variant="meta" numberOfLines={1} style={{ color: colors.muted, flexShrink: 1 }}>
              {p.headRef} → {p.baseRef}
            </T>
          </View>
          <DiffStat additions={p.additions} deletions={p.deletions} />
          {p.changedFiles !== null ? <T variant="small" style={{ fontSize: 12, color: colors.muted }}>{p.changedFiles} files</T> : null}
          <T variant="small" style={{ fontSize: 12, color: colors.muted }}>
            updated {timeAgo(p.updatedAt)}
          </T>
        </View>
        {p.requestedReviewers.length + p.requestedTeams.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <T variant="label" color={colors.faint}>
              Reviewers
            </T>
            {p.requestedReviewers.map((r) => (
              <View key={r.login} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 }}>
                <Avatar uri={r.avatarUrl} name={r.login} size={16} />
                <T variant="small" style={{ fontSize: 12 }}>
                  {r.login}
                </T>
              </View>
            ))}
            {p.requestedTeams.map((t) => (
              <Tag key={t} label={t} />
            ))}
          </View>
        ) : null}
        {p.state === 'open' && d.check.mode !== 'off' && d.check.check ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Dot color={conclusion === 'success' ? colors.olive : conclusion === 'failure' ? colors.danger : colors.highlight} />
            <T variant="meta">
              Guide check{d.check.mode === 'required' ? ' (required)' : ''}: {d.check.check.title ?? conclusion ?? 'pending'}
            </T>
          </View>
        ) : null}
      </View>
      <Rule solid color={colors.border} />
    </View>
  );
}

function Notices({ d, statusEvents }: { d: PullDetail; statusEvents: { message: string }[] }) {
  const g = d.guide;
  if (!g) return null;
  const items: React.ReactNode[] = [];
  if (g.status === 'generating') {
    items.push(
      <Banner key="gen" tone="info">
        <View style={{ gap: 3 }}>
          <T variant="label">Writing version {g.version}…</T>
          {(statusEvents.length ? statusEvents.slice(-5) : [{ message: 'Starting' }]).map((e, i) => (
            <T key={i} variant="small" style={{ fontSize: 13 }} numberOfLines={2}>
              {e.message}
            </T>
          ))}
        </View>
      </Banner>,
    );
  }
  if (g.status === 'failed') items.push(<Banner key="failed" tone="danger">{`Version ${g.version} could not be generated: ${g.error ?? 'unknown error'}`}</Banner>);
  if (g.status === 'draft') items.push(<Banner key="draft" tone="info">Draft. Only people in this workspace can see it.</Banner>);
  if (g.outdated && g.status === 'ready') {
    items.push(<Banner key="outdated" tone="warn">{`This guide covers ${shortSha(g.headSha)}. The pull request now points to ${shortSha(d.pull.headSha)}. Regenerate, or ask your agent to update it.`}</Banner>);
  }
  if (g.sinceVisit) {
    items.push(
      <Banner key="since" tone="success">{`New since your last visit: version${g.sinceVisit.versions.length === 1 ? '' : 's'} ${g.sinceVisit.versions.join(', ')}. New and changed sections are marked.`}</Banner>,
    );
  }
  if (g.template && g.template.missing.length > 0) {
    items.push(<Banner key="template" tone="warn">{`Missing required sections of the "${g.template.name}" template: ${g.template.missing.join(', ')}.`}</Banner>);
  }
  if (items.length === 0) return null;
  return <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 8 }}>{items}</View>;
}

/** The guide's overview (web viewer step 0): eyebrow, title, meta, summary and the numbered sections. */
function Overview({ d, guide, base, onToggle }: { d: PullDetail; guide: Guide; base: string; onToggle: (s: GuideSection, on: boolean) => void }) {
  const { colors } = useTheme();
  const account = useAccount();
  const meId = d.me.id;
  const mine = guide.sections.filter((s) => s.reviewedBy.includes(meId)).length;
  const total = guide.sections.length;
  const vq = `v=${guide.version}`;
  const next = guide.sections.find((s) => !s.reviewedBy.includes(meId));
  const goSection = (s: GuideSection) => router.push(`${base}/section?position=${s.position}&${vq}` as never);
  const goFile = (path: string, start: number | null, end: number | null, side: string) =>
    router.push(`${base}/file?path=${encodeURIComponent(path)}&${vq}${start ? `&start=${start}&end=${end ?? start}&side=${side}` : ''}` as never);
  const coverage = guide.coverage.total > 0 ? Math.round((guide.coverage.covered / guide.coverage.total) * 100) : null;
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
      <Eyebrow>Guided PR · v{guide.version}</Eyebrow>
      <Text style={{ marginTop: 20, fontFamily: Fonts.serif, fontSize: 34, lineHeight: 36, letterSpacing: -1.2, color: colors.heading }}>{guide.title}</Text>
      <T variant="label" style={{ marginTop: 14 }}>
        {guide.author ? `${guide.author} · ` : ''}via {VIA[guide.createdVia] ?? guide.createdVia} · {timeAgo(guide.createdAt)} · {total} sections · {guide.files.length} files
      </T>
      <View style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <Progress value={mine} total={total} label={`${mine}/${total} reviewed`} />
        {coverage !== null ? <T variant="meta">{coverage}% of changed lines in sections</T> : null}
      </View>
      {guide.summary.trim() ? (
        <View style={{ marginTop: 26 }}>
          <Markdown source={guide.summary} account={account} onDiffLink={(l) => goFile(l.path, l.start, l.end, l.side)} />
        </View>
      ) : null}
      <View style={{ marginTop: 34 }}>
        <Rule />
        <T variant="label" style={{ marginTop: 22, marginBottom: 6 }}>
          Sections
        </T>
        {guide.sections.map((s, i) => (
          <SectionRow key={s.id} s={s} index={i} guide={guide} meId={meId} first={i === 0} onPress={() => goSection(s)} onToggle={(on) => onToggle(s, on)} />
        ))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 24 }}>
          {total > 0 ? (
            <Button
              title={mine === 0 ? 'Start with section 01' : next ? `Continue with section ${String(guide.sections.indexOf(next) + 1).padStart(2, '0')}` : 'Read again'}
              kind="primary"
              iconRight="ArrowRightLine"
              onPress={() => goSection(next ?? guide.sections[0])}
            />
          ) : null}
          <Button title="Finish review" icon="Chat3Line" onPress={() => router.push(`${base}/review?guide=${guide.id}` as never)} />
          <Button title={`All ${guide.files.length} files`} kind="ghost" icon="FileList3Line" onPress={() => router.push(`${base}/files?${vq}` as never)} />
        </View>
      </View>
    </View>
  );
}

function SectionRow({ s, index, guide, meId, first, onPress, onToggle }: { s: GuideSection; index: number; guide: Guide; meId: string; first: boolean; onPress: () => void; onToggle: (on: boolean) => void }) {
  const { colors } = useTheme();
  const done = s.reviewedBy.includes(meId);
  const others = s.reviewedBy.filter((u) => u !== meId);
  const mark = s.reviewChange ? { label: 'Re-review', color: colors.warn } : s.visitChange?.status === 'new' ? { label: 'New', color: colors.blueBright } : s.visitChange ? { label: 'Changed', color: colors.blueBright } : null;
  return (
    <>
      {first ? null : <Rule />}
      <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13, backgroundColor: pressed ? colors.press : 'transparent' })}>
        <T variant="meta" color={colors.faint} style={{ paddingTop: 6 }}>
          {String(index + 1).padStart(2, '0')}
        </T>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 20, lineHeight: 23, letterSpacing: -0.3, color: s.generated ? alpha(colors.heading, 0.55) : colors.heading }}>{s.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <T variant="label" color={colors.faint}>
              {s.files.length} file{s.files.length === 1 ? '' : 's'}
            </T>
            <DiffStat additions={s.additions} deletions={s.deletions} />
            {mark ? <Tag label={mark.label} color={mark.color} border={alpha(mark.color, 0.4)} /> : null}
            {others.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {others.slice(0, 5).map((u) => (
                  <Avatar key={u} uri={guide.members[u]?.avatarUrl} name={guide.members[u]?.name} size={16} />
                ))}
              </View>
            ) : null}
          </View>
        </View>
        <Pressable onPress={() => onToggle(!done)} hitSlop={12} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={`Mark ${s.title} reviewed`} style={{ paddingTop: 3 }}>
          <Icon name={done ? 'CheckboxCircleFill' : 'CheckboxBlankCircleLine'} size={20} color={done ? colors.ink : colors.solid} />
        </Pressable>
      </Pressable>
    </>
  );
}

function NoGuide({ d, onGenerate, onCopyPrompt }: { d: PullDetail; onGenerate: () => Promise<void>; onCopyPrompt: () => void }) {
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  return (
    <View>
      <Empty
        title="No guide yet."
        action={
          <View style={{ gap: 8, alignItems: 'center' }}>
            {d.canGenerate ? (
              <Button
                title="Generate with AI"
                kind="primary"
                icon="SparklingLine"
                loading={busy}
                onPress={async () => {
                  setBusy(true);
                  await onGenerate();
                  setBusy(false);
                }}
              />
            ) : null}
            <Button title="Copy agent prompt" kind="ghost" icon="FileCopyLine" onPress={onCopyPrompt} />
          </View>
        }>
        {d.canGenerate
          ? 'Generate one with the workspace AI provider, or ask your coding agent to write it over MCP.'
          : 'Ask your coding agent to write one over MCP: copy the prompt and paste it into the agent.'}
      </Empty>
      {d.pull.body?.trim() ? (
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          <T variant="label">Description</T>
          <Markdown source={d.pull.body} account={account} />
        </View>
      ) : null}
    </View>
  );
}
