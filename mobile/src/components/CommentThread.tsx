import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Pressable, Text, View, type HostInstance } from 'react-native';

import { timeAgo } from '@/lib/format';
import { openUrl } from '@/lib/links';
import { commentsKey, useApi } from '@/lib/queries';
import { useAccount } from '@/lib/session';
import { Fonts, useTheme } from '@/lib/theme';
import type { Thread } from '@/lib/threads';
import type { ReviewComment } from '@/lib/types';
import { Markdown } from './Markdown';
import { useOverlay } from './Overlays';
import { Avatar, Button, Icon, Rule, T, alpha, alphaInk } from './ui';

type Props = {
  thread: Thread;
  guideId: string;
  onReply: (rootId: number) => void;
  readOnly?: boolean;
};

/** A conversation on a line (web CommentThread): the comments, Reply and Resolve, or a collapsed resolved strip. */
export function CommentThread({ thread, guideId, onReply, readOnly }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(!thread.isResolved);
  const [busy, setBusy] = useState(false);
  const request = useApi();
  const account = useAccount();
  const client = useQueryClient();
  const { confirm, flash, openMenu } = useOverlay();

  const resolve = async (resolved: boolean) => {
    if (!thread.id) return;
    setBusy(true);
    try {
      await request(`/api/guides/${guideId}/threads`, { method: 'POST', body: { threadId: thread.id, resolved } });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await client.invalidateQueries({ queryKey: commentsKey(account, guideId) });
      if (resolved) setOpen(false);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not update the conversation', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: ReviewComment) => {
    if (!(await confirm({ title: 'Delete this comment?', message: 'It is deleted on GitHub too.', confirm: 'Delete', destructive: true }))) return;
    try {
      await request(`/api/guides/${guideId}/comments`, { method: 'DELETE', query: { commentId: c.id } });
      await client.invalidateQueries({ queryKey: commentsKey(account, guideId) });
      flash('Comment deleted.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete the comment', 'error');
    }
  };

  if (!open) {
    return (
      <View style={{ marginHorizontal: 10, marginVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: alphaInk(colors, 0.2), backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6 }}>
        <Icon name="CheckDoubleLine" size={14} color={colors.olive} />
        <T variant="label" color={colors.olive}>
          Resolved
        </T>
        <Text style={{ flex: 1, fontFamily: Fonts.sans, fontSize: 12, color: colors.muted }} numberOfLines={1}>
          <Text style={{ color: colors.ink }}>{thread.root.user?.login ?? 'unknown'}</Text> {preview(thread.root.body)}
        </Text>
        <Button title="Show" kind="ghost" size="xs" onPress={() => setOpen(true)} />
      </View>
    );
  }

  return (
    <View style={{ marginHorizontal: 10, marginVertical: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      {[thread.root, ...thread.replies].map((c, i) => (
        <View key={c.id}>
          {i > 0 ? <Rule /> : null}
          <CommentView c={c} readOnly={readOnly} onDelete={() => remove(c)} openMenu={openMenu} />
        </View>
      ))}
      {!readOnly ? (
        <>
          <Rule />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 8, paddingVertical: 6 }}>
            <Button title="Reply" kind="ghost" size="xs" icon="ReplyLine" onPress={() => onReply(thread.root.id)} />
            {thread.id ? (
              <Button
                title={thread.isResolved ? 'Unresolve conversation' : 'Resolve conversation'}
                kind="ghost"
                size="xs"
                icon={thread.isResolved ? 'CheckboxBlankCircleLine' : 'CheckDoubleLine'}
                loading={busy}
                onPress={() => resolve(!thread.isResolved)}
              />
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

function CommentView({
  c,
  readOnly,
  onDelete,
  openMenu,
}: {
  c: ReviewComment;
  readOnly?: boolean;
  onDelete: () => void;
  openMenu: ReturnType<typeof useOverlay>['openMenu'];
}) {
  const { colors } = useTheme();
  const account = useAccount();
  const more = useRef<HostInstance>(null);
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 11 }}>
      <Avatar uri={c.user?.avatarUrl} name={c.user?.login} size={22} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontFamily: Fonts.sansMedium, fontSize: 12.5, color: colors.ink }}>{c.user?.login ?? 'unknown'}</Text>
          <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.muted, flex: 1 }} numberOfLines={1}>
            {timeAgo(c.createdAt)}
            {c.outdated ? ' · outdated' : ''}
          </Text>
          <Pressable
            ref={more}
            hitSlop={10}
            accessibilityLabel="Comment actions"
            onPress={() =>
              openMenu(
                [
                  { label: 'Open on GitHub', icon: 'ExternalLinkLine', onPress: () => openUrl(null, c.htmlUrl) },
                  ...(c.mine && !readOnly ? [{ label: 'Delete comment', icon: 'DeleteBinLine' as const, destructive: true, onPress: onDelete }] : []),
                ],
                more.current,
              )
            }>
            <Icon name="MoreFill" size={16} color={alpha(colors.ink, 0.35)} />
          </Pressable>
        </View>
        <Markdown source={c.body} account={account} compact />
      </View>
    </View>
  );
}

/** One line of a comment for the collapsed view: suggestions are named, code blocks dropped. */
function preview(body: string): string {
  return body
    .replace(/```suggestion[^\n]*\n[\s\S]*?```/g, '[Suggested change] ')
    .replace(/```[^\n]*\n[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
