import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/Chrome';
import { composeComment, composeReply } from '@/components/Composer';
import { DiffFile } from '@/components/DiffFile';
import { Markdown } from '@/components/Markdown';
import { alpha, Avatar, Banner, Button, Dot, Empty, ErrorView, Eyebrow, IconButton, Loading, Rule, T, VRule } from '@/components/ui';
import { useToggleReviewed } from '@/lib/guide-actions';
import { useStoredBoolean } from '@/lib/prefs';
import { useComments, usePull } from '@/lib/queries';
import { useAccount } from '@/lib/session';
import { Fonts, useTheme } from '@/lib/theme';
import { threadsByPath } from '@/lib/threads';
import type { GuideSection, SectionRef } from '@/lib/types';

const STEP_WIDTH = 136;

export default function SectionScreen() {
  const params = useLocalSearchParams<{ owner: string; repo: string; number: string; v?: string; position: string }>();
  const repo = `${params.owner}/${params.repo}`;
  const number = Number(params.number);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const q = usePull(repo, number, params.v ? Number(params.v) : null);
  const guide = q.data?.guide ?? null;
  const comments = useComments(guide?.id);
  const threads = useMemo(() => threadsByPath(comments.data), [comments.data]);
  const toggle = useToggleReviewed(repo, number);
  const [wrap, setWrap] = useStoredBoolean('wrap', true);
  const steps = useRef<ScrollViewInstance>(null);
  const index = guide ? Math.max(0, guide.sections.findIndex((s) => s.position === Number(params.position))) : 0;
  useEffect(() => {
    steps.current?.scrollTo({ x: Math.max(0, (index + 1) * STEP_WIDTH - 60), animated: true });
  }, [index]);

  const base = `/pr/${repo}/${number}`;
  const header = <ScreenHeader crumb={`${repo} / #${number}`} title={guide?.title} menu={guide ? [
    { label: 'Wrap long lines', icon: 'TextWrap', isOn: wrap, onPress: () => setWrap(!wrap) },
    { label: 'Overview', icon: 'FileTextLine', onPress: () => router.dismissTo(`${base}?v=${guide.version}` as never) },
    { label: 'All files', icon: 'FileList3Line', onPress: () => router.push(`${base}/files?v=${guide.version}` as never) },
    { label: 'Finish review', icon: 'Chat3Line', onPress: () => router.push(`${base}/review?guide=${guide.id}` as never) },
  ] : undefined} />;
  if (q.isLoading && !q.data) return <Shell header={header}><Loading /></Shell>;
  if (q.error && !q.data) return <Shell header={header}><ErrorView error={q.error} onRetry={() => q.refetch()} /></Shell>;
  if (!guide) return <Shell header={header}><Empty title="No guide." /></Shell>;
  const s = guide.sections[index];
  if (!s) return <Shell header={header}><Empty title="This section no longer exists." /></Shell>;
  const me = q.data!.me.id;
  const done = s.reviewedBy.includes(me);
  const others = s.reviewedBy.filter((u) => u !== me);
  const paths: string[] = [];
  for (const r of s.refs) if (!paths.includes(r.path)) paths.push(r.path);
  const fileMeta = new Map(guide.files.map((f) => [f.path, f]));
  const statsByPath = new Map(s.files.map((f) => [f.path, f]));
  const go = (i: number) => {
    const target = guide.sections[i];
    if (target) router.setParams({ position: String(target.position) });
  };
  const last = index === guide.sections.length - 1;
  const canComment = guide.status !== 'draft';
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <Shell header={header}>
      {/* Stepper (web GuideViewer): Overview, then a tab per section. */}
      <View style={{ backgroundColor: colors.paper }}>
        <ScrollView ref={steps} horizontal showsHorizontalScrollIndicator={false}>
          <Step label="Overview" index="—" active={false} onPress={() => router.dismissTo(`${base}?v=${guide.version}` as never)} />
          {guide.sections.map((x, i) => (
            <Step key={x.id} label={x.title} index={pad(i + 1)} active={i === index} mark={stepMark(x, me)} muted={x.generated} onPress={() => go(i)} />
          ))}
          <Step label="Finish review" index="—" active={false} onPress={() => router.push(`${base}/review?guide=${guide.id}` as never)} />
        </ScrollView>
        <Rule solid color={colors.border} />
      </View>
      <ScrollView key={s.id} contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 26, paddingBottom: 24, backgroundColor: colors.paper }}>
          <Eyebrow>
            Section {pad(index + 1)} / {pad(guide.sections.length)}
          </Eyebrow>
          <Text style={{ marginTop: 20, fontFamily: Fonts.serif, fontSize: 32, lineHeight: 34, letterSpacing: -0.96, color: colors.heading }}>{s.title}</Text>
          <View style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <T variant="label" color={colors.faint}>
              {paths.length} file{paths.length === 1 ? '' : 's'}
            </T>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.8 }}>
              <Text style={{ color: colors.added }}>+{s.additions}</Text> <Text style={{ color: colors.danger }}>−{s.deletions}</Text>
            </Text>
            {others.length > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <T variant="label" color={colors.faint}>
                  Reviewed by
                </T>
                {others.map((u) => (
                  <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Avatar uri={guide.members[u]?.avatarUrl} name={guide.members[u]?.name} size={16} />
                    {s.carriedFrom[u] !== undefined ? <T variant="label" color={colors.faint}>v{s.carriedFrom[u]}</T> : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          {s.reviewChange ? (
            <View style={{ marginTop: 16 }}>
              <Banner tone="warn">{`Changed since you reviewed it in v${s.reviewChange.version}${s.reviewChange.files.length ? `: ${s.reviewChange.files.map((f) => f.path).join(', ')}` : ''}. Mark it again when you've read the new code.`}</Banner>
            </View>
          ) : s.visitChange ? (
            <View style={{ marginTop: 16 }}>
              <Banner tone="info">{s.visitChange.status === 'new' ? 'New since your last visit.' : `Changed since v${s.visitChange.version}.`}</Banner>
            </View>
          ) : null}
          {s.body.trim() ? (
            <View style={{ marginTop: 26 }}>
              <Markdown
                source={s.body}
                account={account}
                onDiffLink={(l) => router.push(`${base}/file?path=${encodeURIComponent(l.path)}&v=${guide.version}${l.start ? `&start=${l.start}&end=${l.end ?? l.start}&side=${l.side}` : ''}` as never)}
              />
            </View>
          ) : null}
        </View>
        {/* The code (web right pane). */}
        <Rule />
        <View style={{ backgroundColor: colors.wash, padding: 12, gap: 12 }}>
          {paths.length === 0 ? <T variant="small" style={{ padding: 8 }}>This section has no code.</T> : null}
          {paths.map((path) => {
            const refs: SectionRef[] = s.refs.filter((r) => r.path === path);
            const f = fileMeta.get(path);
            const st = statsByPath.get(path);
            return (
              <DiffFile
                key={`${s.id}:${path}`}
                guideId={guide.id}
                path={path}
                status={f?.status}
                additions={st?.additions ?? f?.additions}
                deletions={st?.deletions ?? f?.deletions}
                refs={refs}
                threads={threads.get(path) ?? []}
                wrap={wrap}
                onCompose={canComment ? (t) => composeComment(base, guide.id, t, s.id) : undefined}
                onReply={(id) => composeReply(base, guide.id, id)}
              />
            );
          })}
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.paper, paddingBottom: insets.bottom + 10 }}>
        <Rule color={colors.lineHeader} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 10 }}>
          <Button
            style={{ flex: 1 }}
            kind={done ? 'secondary' : 'primary'}
            icon={done ? 'CheckboxCircleFill' : 'CheckboxCircleLine'}
            title={done ? 'Reviewed' : last ? 'Mark reviewed' : 'Mark reviewed and continue'}
            onPress={() => {
              void toggle(guide.id, s.id, !done);
              if (!done && !last) setTimeout(() => go(index + 1), 200);
            }}
          />
          <IconButton icon="ArrowLeftLine" label="Previous section" color={index === 0 ? colors.sub : colors.ink} onPress={() => index > 0 && go(index - 1)} />
          <IconButton
            icon="ArrowRightLine"
            label={last ? 'Finish review' : 'Next section'}
            color={colors.ink}
            onPress={() => (last ? router.push(`${base}/review?guide=${guide.id}` as never) : go(index + 1))}
          />
        </View>
      </View>
    </Shell>
  );
}

function Shell({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      {header}
      {children}
    </View>
  );
}

type Mark = { label: string; tone: 'done' | 'rereview' | 'new' };

function stepMark(s: GuideSection, me: string): Mark | null {
  if (s.reviewChange) return { label: 're-review', tone: 'rereview' };
  if (s.reviewedBy.includes(me)) return { label: 'done', tone: 'done' };
  if (s.visitChange?.status === 'new') return { label: 'new', tone: 'new' };
  if (s.visitChange) return { label: 'changed', tone: 'new' };
  return null;
}

/** A tab of the stepper: mono index and mark over the title; the current one is filled with ink. */
function Step({ label, index, active, mark, muted, onPress }: { label: string; index: string; active: boolean; mark?: Mark | null; muted?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const markColor = mark ? (mark.tone === 'done' ? colors.ink : mark.tone === 'rereview' ? colors.warn : colors.blueBright) : 'transparent';
  return (
    <View style={{ flexDirection: 'row' }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        style={({ pressed }) => ({ width: STEP_WIDTH, height: 56, paddingHorizontal: 14, justifyContent: 'center', gap: 3, backgroundColor: active ? colors.ink : pressed ? colors.press : 'transparent' })}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: active ? 'transparent' : markColor }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Dot color={active ? colors.signal : mark ? markColor : `rgba(${colors.blackRgb}, 0.18)`} />
          <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: active ? alpha(colors.surface, 0.6) : colors.faint }} numberOfLines={1}>
            {active && index === '—' ? 'Now' : index}
            {mark ? ` · ${mark.label}` : ''}
          </Text>
        </View>
        <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: active ? colors.surface : muted ? colors.muted : colors.ink }} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      <VRule />
    </View>
  );
}
