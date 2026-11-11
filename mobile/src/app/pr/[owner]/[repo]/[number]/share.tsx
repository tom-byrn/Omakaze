import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Sheet } from '@/components/Chrome';
import { useOverlay } from '@/components/Overlays';
import { Button, Checkbox, Rule, Segmented, T } from '@/components/ui';
import { timeAgo } from '@/lib/format';
import { useApi, useShareLinks } from '@/lib/queries';
import { useAccount } from '@/lib/session';
import { Fonts, useTheme } from '@/lib/theme';

type Expiry = '1' | '7' | '30' | 'never';

/** Read-only share links to this pull request's guide (web ShareDialog). */
export default function ShareSheet() {
  const p = useLocalSearchParams<{ owner: string; repo: string; number: string; guide: string; version: string }>();
  const repo = `${p.owner}/${p.repo}`;
  const number = Number(p.number);
  const { colors } = useTheme();
  const account = useAccount();
  const request = useApi();
  const client = useQueryClient();
  const { confirm, flash } = useOverlay();
  const links = useShareLinks(repo, number);
  const [target, setTarget] = useState<'version' | 'latest'>('version');
  const [expires, setExpires] = useState<Expiry>('7');
  const [comments, setComments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: [account.id, 'shares'] });

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await request<{ url: string }>('/api/mobile/share-links', { method: 'POST', body: { guideId: p.guide, target, expires, comments } });
      setCreated(res.url);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!(await confirm({ title: 'Revoke this link?', message: 'People with the link can no longer open the guide.', confirm: 'Revoke', destructive: true }))) return;
    try {
      await request('/api/mobile/share-links', { method: 'DELETE', query: { id } });
      void refresh();
      flash('Link revoked.');
    } catch (err) {
      flash(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const option = (value: 'version' | 'latest', title: string, help: string) => {
    const on = target === value;
    return (
      <Pressable
        onPress={() => setTarget(value)}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        style={{ borderWidth: 1, borderColor: on ? colors.ink : colors.border, backgroundColor: on ? colors.paper : colors.surface, paddingHorizontal: 14, paddingVertical: 11, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: on ? colors.ink : `rgba(${colors.blackRgb}, 0.35)`, alignItems: 'center', justifyContent: 'center' }}>
            {on ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink }} /> : null}
          </View>
          <Text style={{ fontFamily: Fonts.sansMedium, fontSize: 14, color: colors.ink }}>{title}</Text>
        </View>
        <T variant="small" style={{ fontSize: 12, lineHeight: 18, color: colors.muted, paddingLeft: 25 }}>
          {help}
        </T>
      </Pressable>
    );
  };

  return (
    <Sheet title="Share a read-only link" description="Anyone with the link can read the guide and its diffs without signing in.">
      {created ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: `rgba(${colors.blackRgb}, 0.4)`, backgroundColor: colors.paper, padding: 10 }}>
            <Text selectable style={{ flex: 1, fontFamily: Fonts.mono, fontSize: 12, color: colors.ink }} numberOfLines={2}>
              {created}
            </Text>
            <Button
              title="Copy link"
              kind="primary"
              size="xs"
              onPress={async () => {
                await Clipboard.setStringAsync(created);
                flash('Link copied.');
              }}
            />
          </View>
          <T variant="small">Copy it now; it isn&apos;t shown again.</T>
        </View>
      ) : links.data && !links.data.canCreate ? (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.paper, paddingHorizontal: 12, paddingVertical: 8 }}>
          <T variant="small">Only admins and owners can create share links in this workspace.</T>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <View style={{ gap: 8 }}>
            <T variant="label">Share</T>
            {option('version', `This version (v${p.version})`, 'The link keeps showing this version.')}
            {option('latest', 'The latest version', 'The link follows new versions of the guide.')}
          </View>
          <View style={{ gap: 8 }}>
            <T variant="label">Expires after</T>
            <Segmented
              value={expires}
              onChange={setExpires}
              options={[
                { value: '1', label: '1 day' },
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
                { value: 'never', label: 'Never' },
              ]}
            />
          </View>
          <Pressable onPress={() => setComments(!comments)} accessibilityRole="checkbox" accessibilityState={{ checked: comments }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 36 }}>
            <Checkbox value={comments} />
            <Text style={{ fontFamily: Fonts.sans, fontSize: 13.5, color: colors.ink }}>Include review comments from GitHub</Text>
          </Pressable>
          {error ? <T variant="small" color={colors.danger}>{error}</T> : null}
          <Button title="Create link" kind="primary" icon="LinksLine" loading={busy} onPress={create} />
        </View>
      )}
      {links.data && links.data.links.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Rule />
          <T variant="label" style={{ marginTop: 8 }}>
            Active links to #{number}
          </T>
          {links.data.links.map((l) => (
            <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 9 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 13.5, color: colors.ink }}>{l.version ? `Version ${l.version}` : 'Latest version'}</Text>
                <T variant="meta">
                  {l.creatorName ?? 'Someone'} · {timeAgo(l.createdAt)} · {l.expiresAt ? `expires ${new Date(l.expiresAt).toLocaleDateString()}` : 'never expires'}
                  {l.includeComments ? ' · comments' : ''}
                </T>
              </View>
              {l.canRevoke ? <Button title="Revoke" kind="ghost" size="xs" onPress={() => revoke(l.id)} /> : null}
            </View>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}
