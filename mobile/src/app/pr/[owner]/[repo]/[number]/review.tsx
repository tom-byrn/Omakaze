import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Sheet } from '@/components/Chrome';
import { useOverlay } from '@/components/Overlays';
import { Button, Progress, T } from '@/components/ui';
import { pullKey, pullsKey, useApi, usePull } from '@/lib/queries';
import { useAccount } from '@/lib/session';
import { Fonts, useTheme } from '@/lib/theme';

type Event = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES' | 'ISSUE_COMMENT';

const OPTIONS: { value: Event; label: string; help: string }[] = [
  { value: 'COMMENT', label: 'Comment', help: 'Submit general feedback without approving.' },
  { value: 'APPROVE', label: 'Approve', help: 'Approve merging these changes.' },
  { value: 'REQUEST_CHANGES', label: 'Request changes', help: 'Feedback that must be addressed before merging.' },
  { value: 'ISSUE_COMMENT', label: 'Conversation comment', help: 'A comment on the pull request, not a review.' },
];

/** Finish the review (web ReviewPanel): a review on GitHub, or a plain comment on the pull request. */
export default function ReviewSheet() {
  const p = useLocalSearchParams<{ owner: string; repo: string; number: string; guide?: string }>();
  const repo = `${p.owner}/${p.repo}`;
  const number = Number(p.number);
  const { colors } = useTheme();
  const account = useAccount();
  const request = useApi();
  const client = useQueryClient();
  const { flash } = useOverlay();
  const pull = usePull(repo, number, null);
  const [event, setEvent] = useState<Event>('COMMENT');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guide = pull.data?.guide;
  // The guide being read; links without one review the latest version.
  const guideId = p.guide || guide?.id;
  const mine = guide ? guide.sections.filter((s) => s.reviewedBy.includes(pull.data!.me.id)).length : 0;
  const needsBody = event === 'REQUEST_CHANGES' || event === 'ISSUE_COMMENT';

  const submit = async () => {
    if (!guideId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await request<{ postedAs?: string }>(`/api/guides/${guideId}/review`, { method: 'POST', body: { event, body } });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void client.invalidateQueries({ queryKey: pullKey(account, repo, number) });
      void client.invalidateQueries({ queryKey: pullsKey(account) });
      router.back();
      const what = event === 'APPROVE' ? 'Approved' : event === 'REQUEST_CHANGES' ? 'Changes requested' : event === 'ISSUE_COMMENT' ? 'Comment posted' : 'Review submitted';
      flash(res.postedAs === 'connection' ? `${what} through the workspace connection.` : `${what} on GitHub.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Finish your review"
      description="Posted to the pull request on GitHub."
      footer={
        <Button
          title={event === 'APPROVE' ? 'Approve' : event === 'REQUEST_CHANGES' ? 'Request changes' : event === 'ISSUE_COMMENT' ? 'Post comment' : 'Submit review'}
          kind={event === 'REQUEST_CHANGES' ? 'danger' : 'primary'}
          loading={busy}
          disabled={!guideId || (needsBody && !body.trim())}
          onPress={submit}
        />
      }>
      {guide ? <Progress value={mine} total={guide.sections.length} label={`${mine}/${guide.sections.length} sections reviewed by you in v${guide.version}`} /> : null}
      <View style={{ gap: 8 }}>
        {OPTIONS.map((o) => {
          const on = event === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => setEvent(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{ borderWidth: 1, borderColor: on ? colors.ink : colors.border, backgroundColor: on ? colors.paper : colors.surface, paddingHorizontal: 14, paddingVertical: 11, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: on ? colors.ink : `rgba(${colors.blackRgb}, 0.35)`, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink }} /> : null}
                </View>
                <Text style={{ fontFamily: Fonts.sansMedium, fontSize: 14, color: o.value === 'REQUEST_CHANGES' && on ? colors.danger : colors.ink }}>{o.label}</Text>
              </View>
              <T variant="small" style={{ fontSize: 12, lineHeight: 18, color: colors.muted, paddingLeft: 25 }}>
                {o.help}
              </T>
            </Pressable>
          );
        })}
      </View>
      <View style={{ gap: 6 }}>
        <T variant="label">{needsBody ? 'Comment' : 'Comment (optional)'}</T>
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          placeholder="Leave a comment"
          placeholderTextColor={colors.sub}
          textAlignVertical="top"
          style={{ minHeight: 100, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 10, fontFamily: Fonts.sans, fontSize: 14, lineHeight: 21, color: colors.fg }}
        />
      </View>
      {error ? <T variant="small" color={colors.danger}>{error}</T> : null}
    </Sheet>
  );
}
