import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { timeAgo } from '@/lib/format';
import { Fonts, useTheme } from '@/lib/theme';
import type { PullListItem } from '@/lib/types';
import { Avatar, DiffStat, GuideBadge, Icon, Progress, Rule, StateTag, T, Tag, alpha } from './ui';

const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/** A pull request in a repository group (web PullRow + ReviewLine). */
export const PullRow = memo(function PullRow({ pr, viewerLogin, first }: { pr: PullListItem; viewerLogin: string | null; first: boolean }) {
  const { colors } = useTheme();
  const p = pr.reviewProgress;
  const requested = pr.requestedReviewers.some((r) => same(r.login, viewerLogin));
  const assigned = pr.assignees.some((a) => same(a.login, viewerLogin));
  const showProgress = p !== null && p.sections > 0 && !same(pr.author, viewerLogin);
  const reviewers = pr.requestedReviewers.length + pr.requestedTeams.length;
  return (
    <>
      {first ? null : <Rule />}
      <Pressable
        onPress={() => router.push(`/pr/${pr.repository}/${pr.number}` as never)}
        style={({ pressed }) => ({ flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingVertical: 15, backgroundColor: pressed ? colors.press : 'transparent' })}>
        <View style={{ paddingTop: 1 }}>
          <StateTag state={pr.state} draft={pr.draft} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Text style={{ fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22, letterSpacing: -0.15, color: colors.ink }} numberOfLines={3}>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 12, color: colors.meta }}>#{pr.number} </Text>
            {pr.title}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Avatar uri={pr.authorAvatarUrl} name={pr.author} size={16} />
              <T variant="small" style={{ fontSize: 12, color: colors.muted }}>
                {pr.author ?? 'unknown'}
              </T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
              <Icon name="GitBranchLine" size={12} color={colors.muted} />
              <T variant="meta" numberOfLines={1} style={{ flexShrink: 1, color: colors.muted }}>
                {pr.headRef} → {pr.baseRef}
              </T>
            </View>
            <T variant="small" style={{ fontSize: 12, color: colors.muted }}>
              updated {timeAgo(pr.updatedAt)}
            </T>
            <DiffStat additions={pr.additions} deletions={pr.deletions} />
          </View>
          {requested || assigned || reviewers > 0 || showProgress ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 6, marginTop: 2 }}>
              {requested ? <Tag label="Review requested" color={colors.ink} border={alpha(colors.ink, 0.4)} dot={colors.blueBright} /> : null}
              {assigned ? <Tag label="Assigned to you" /> : null}
              {reviewers > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <T variant="label" color={colors.faint}>
                    Reviewers
                  </T>
                  {pr.requestedReviewers.map((r) => (
                    <View key={r.login} style={same(r.login, viewerLogin) ? { borderWidth: 1, borderColor: colors.ink, padding: 1 } : null}>
                      <Avatar uri={r.avatarUrl} name={r.login} size={16} />
                    </View>
                  ))}
                  {pr.requestedTeams.map((t) => (
                    <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 16, paddingHorizontal: 4, borderWidth: 1, borderColor: colors.border }}>
                      <Icon name="TeamLine" size={10} color={colors.label} />
                      <Text style={{ fontFamily: Fonts.mono, fontSize: 10, color: colors.label }}>{t}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {showProgress ? <Progress value={p.reviewed} total={p.sections} label={`${p.reviewed}/${p.sections} sections reviewed by you`} /> : null}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <GuideBadge status={pr.guide?.status ?? null} version={pr.guide?.version} outdated={pr.guide?.outdated} />
          </View>
        </View>
      </Pressable>
    </>
  );
});
