import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Sheet } from '@/components/Chrome';
import { Markdown } from '@/components/Markdown';
import { useOverlay } from '@/components/Overlays';
import { Button, T } from '@/components/ui';
import { commentsKey, useApi, useComments } from '@/lib/queries';
import { useAccount } from '@/lib/session';
import { Fonts, useTheme } from '@/lib/theme';

/** A new line comment (optionally with a suggested change) or a reply in a conversation (web comment composer). */
export default function CommentSheet() {
  const p = useLocalSearchParams<{ guide: string; path?: string; line?: string; side?: 'LEFT' | 'RIGHT'; startLine?: string; section?: string; text?: string; inReplyTo?: string }>();
  const { colors } = useTheme();
  const account = useAccount();
  const request = useApi();
  const client = useQueryClient();
  const { flash } = useOverlay();
  const comments = useComments(p.guide);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reply = p.inReplyTo ? Number(p.inReplyTo) : null;
  const root = reply ? comments.data?.comments.find((c) => c.id === reply) : null;
  const canSuggest = !reply && p.side === 'RIGHT' && p.text !== undefined;
  const where = p.startLine ? `lines ${p.startLine}–${p.line}` : `line ${p.line}`;

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await request(`/api/guides/${p.guide}/comments`, {
        method: 'POST',
        body: reply
          ? { body, inReplyTo: reply }
          : { body, path: p.path, line: Number(p.line), side: p.side, startLine: p.startLine ? Number(p.startLine) : null, sectionId: p.section ?? null },
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await client.invalidateQueries({ queryKey: commentsKey(account, p.guide) });
      router.back();
      flash(reply ? 'Reply posted.' : 'Comment posted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={reply ? 'Reply' : 'Comment'}
      description={reply ? undefined : `${p.path} · ${p.side === 'LEFT' ? 'old ' : ''}${where}`}
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {canSuggest ? (
            <Button
              title="Insert suggestion"
              kind="ghost"
              size="sm"
              icon="Edit2Line"
              onPress={() => setBody((b) => `${b}${b && !b.endsWith('\n') ? '\n' : ''}\`\`\`suggestion\n${p.text}\n\`\`\`\n`)}
            />
          ) : null}
          <View style={{ flex: 1 }} />
          <Button title="Cancel" kind="ghost" size="sm" onPress={() => router.back()} />
          <Button title={reply ? 'Reply' : 'Comment'} kind="primary" size="sm" loading={busy} disabled={!body.trim()} onPress={submit} />
        </View>
      }>
      {root ? (
        <View style={{ borderLeftWidth: 1, borderStyle: 'dashed', borderColor: `rgba(${colors.blackRgb}, 0.35)`, paddingLeft: 14, gap: 6 }}>
          <T variant="meta">
            {root.user?.login} on {root.path}
            {root.line ? `:${root.line}` : ''}
          </T>
          <Markdown source={root.body} account={account} compact />
        </View>
      ) : null}
      <TextInput
        value={body}
        onChangeText={setBody}
        multiline
        autoFocus
        placeholder={reply ? 'Write a reply' : 'Leave a comment'}
        placeholderTextColor={colors.sub}
        textAlignVertical="top"
        style={{ minHeight: 132, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 10, fontFamily: Fonts.sans, fontSize: 14, lineHeight: 21, color: colors.fg }}
      />
      {error ? <T variant="small" color={colors.danger}>{error}</T> : null}
      <T variant="label" color={colors.faint}>
        Markdown · posted to the pull request on GitHub
      </T>
    </Sheet>
  );
}
