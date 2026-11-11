import * as Haptics from 'expo-haptics';
import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { buildRows, layoutItems, rowText, selectRows, type Item, type Row } from '@/lib/diff-model';
import { useFileView } from '@/lib/queries';
import { Fonts, tokenColor, useTheme } from '@/lib/theme';
import { threadOnRow, type Thread } from '@/lib/threads';
import type { SectionRef } from '@/lib/types';
import { CommentThread } from './CommentThread';
import { Button, DiffStat, Icon, Rule, T, Tag, alphaInk } from './ui';

export type ComposeTarget = { path: string; line: number; side: 'LEFT' | 'RIGHT'; startLine: number | null; text: string };

type Props = {
  guideId: string;
  path: string;
  status?: string;
  additions?: number;
  deletions?: number;
  /** The refs of a section for this file; null shows every hunk. */
  refs: SectionRef[] | null;
  threads: Thread[];
  wrap: boolean;
  highlight?: { start: number; end: number; side: 'new' | 'old' } | null;
  onCompose?: (t: ComposeTarget) => void;
  onReply: (rootId: number) => void;
  initiallyCollapsed?: boolean;
};

const EXPAND_STEP = 20;

export const DiffFile = memo(function DiffFile(props: Props) {
  const { colors } = useTheme();
  const [collapsed, setCollapsed] = useState(props.initiallyCollapsed ?? false);
  const notes = (props.refs ?? []).map((r) => r.note).filter((n): n is string => Boolean(n));
  return (
    <View style={[styles.file, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Pressable onPress={() => setCollapsed((c) => !c)} style={[styles.header, { backgroundColor: colors.paper }]}>
        <Icon name={collapsed ? 'ArrowRightSLine' : 'ArrowDownSLine'} size={15} color={colors.faint} />
        {props.status ? <Tag label={STATUS_TAG[props.status] ?? props.status} /> : null}
        <Text style={{ flex: 1, fontFamily: Fonts.mono, fontSize: 12, color: colors.ink }} numberOfLines={2}>
          {props.path}
        </Text>
        {props.additions !== undefined ? <DiffStat additions={props.additions} deletions={props.deletions ?? 0} /> : null}
      </Pressable>
      {collapsed ? null : <Rule />}
      {notes.length > 0 && !collapsed ? (
        <>
          <View style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 2, backgroundColor: colors.surface }}>
            {notes.map((n, i) => (
              <T key={i} variant="small" style={{ fontSize: 12.5 }} color={colors.text}>
                {n}
              </T>
            ))}
          </View>
          <Rule />
        </>
      ) : null}
      {collapsed ? null : <FileBody {...props} />}
    </View>
  );
});

const STATUS_TAG: Record<string, string> = {
  added: 'added',
  removed: 'deleted',
  modified: 'modified',
  renamed: 'renamed',
  copied: 'copied',
  changed: 'changed',
  unchanged: 'unchanged',
};

function FileBody({ guideId, path, refs, threads, wrap, highlight, onCompose, onReply }: Props) {
  const { colors, scheme } = useTheme();
  const { width } = useWindowDimensions();
  const q = useFileView(guideId, path);
  const view = q.data;
  const model = useMemo(() => (view ? buildRows(view) : null), [view]);
  const initial = useMemo(() => {
    if (!model) return null;
    const visible = selectRows(model.rows, refs ?? [{ path }]);
    if (highlight) {
      model.rows.forEach((r, i) => {
        const n = highlight.side === 'old' ? r.old : r.new;
        if (n !== null && n >= highlight.start - 3 && n <= highlight.end + 3) visible[i] = 1;
      });
    }
    return visible;
  }, [model, refs, path, highlight]);
  // Expanded context belongs to one selection; a new selection (another section, a refetch) starts over.
  const [expanded, setExpanded] = useState<{ base: Uint8Array; rows: Uint8Array } | null>(null);
  const visible = expanded && expanded.base === initial ? expanded.rows : initial;
  const setVisible = (rows: Uint8Array) => initial && setExpanded({ base: initial, rows });
  const [selection, setSelection] = useState<[number, number] | null>(null);

  if (q.isLoading) {
    return (
      <View style={{ padding: 20 }}>
        <ActivityIndicator color={colors.meta} />
      </View>
    );
  }
  if (q.error || !view || !model || !visible) {
    return (
      <T variant="small" style={{ padding: 12 }}>
        {q.error instanceof Error ? q.error.message : 'This file could not be loaded.'}
      </T>
    );
  }
  if (view.binary || view.hunks.length === 0) {
    return (
      <T variant="small" style={{ padding: 12 }}>
        {view.binary ? 'Binary file.' : 'No changes to show (the file may be too large or only renamed).'}
      </T>
    );
  }

  const { rows, full } = model;
  const items = layoutItems(rows, visible, view, full);
  const placed = new Set<Thread>();
  const threadsAt = (row: Row) => threads.filter((t) => !placed.has(t) && threadOnRow(t, row));
  const expand = (it: Extract<Item, { type: 'gap' }>) => {
    const next = new Uint8Array(visible);
    const n = it.to - it.from + 1;
    if (n <= EXPAND_STEP) for (let i = it.from; i <= it.to; i++) next[i] = 1;
    else if (it.leading) for (let i = it.to - EXPAND_STEP + 1; i <= it.to; i++) next[i] = 1;
    else for (let i = it.from; i < it.from + EXPAND_STEP; i++) next[i] = 1;
    setVisible(next);
  };
  const lineOf = (r: Row) => (r.kind === 'del' ? { line: r.old!, side: 'LEFT' as const } : { line: r.new!, side: 'RIGHT' as const });
  const compose = (from: number, to: number) => {
    if (!onCompose) return;
    const a = rows[from];
    const b = rows[to];
    const end = lineOf(b);
    const start = lineOf(a);
    onCompose({
      path,
      line: end.line,
      side: end.side,
      startLine: from !== to && start.side === end.side ? start.line : null,
      text: rows
        .slice(from, to + 1)
        .filter((r) => r.kind !== 'del')
        .map(rowText)
        .join('\n'),
    });
    setSelection(null);
  };
  const tapNumber = (i: number) => {
    if (!onCompose || !rows[i].inHunk) return;
    void Haptics.selectionAsync();
    if (!selection) setSelection([i, i]);
    else if (i === selection[0] && i === selection[1]) setSelection(null);
    else setSelection([Math.min(selection[0], i), Math.max(selection[1], i)]);
  };
  const numW = String(Math.max(view.oldLineCount ?? 0, view.newFile?.length ?? 0, ...rows.slice(-1).map((r) => r.new ?? r.old ?? 0))).length * 7 + 10;

  const lines = items.map((it, k) => {
    if (it.type === 'unknown-gap') {
      return (
        <View key={`u${k}`} style={[styles.gap, { backgroundColor: colors.mist }]}>
          <Text style={{ fontFamily: Fonts.mono, fontSize: 11, color: alphaInk(colors, 0.5) }} numberOfLines={1}>
            {it.lines ? `⋯ ${it.lines} unchanged lines` : '⋯'} {it.header}
          </Text>
        </View>
      );
    }
    if (it.type === 'gap') {
      return (
        <Pressable key={`g${it.from}`} onPress={() => expand(it)} style={({ pressed }) => [styles.gap, { backgroundColor: pressed ? colors.wash : colors.mist }]}>
          <Icon name="ExpandUpDownLine" size={13} color={colors.ui} />
          <Text style={{ fontFamily: Fonts.sans, fontSize: 11.5, color: colors.ui }}>
            Show {Math.min(it.hidden, EXPAND_STEP)} {it.hidden > EXPAND_STEP ? `of ${it.hidden} ` : ''}lines
          </Text>
        </Pressable>
      );
    }
    const i = it.index;
    const r = rows[i];
    const selected = selection && i >= selection[0] && i <= selection[1];
    const lit =
      highlight && ((highlight.side === 'old' ? r.old : r.new) ?? -1) >= highlight.start && ((highlight.side === 'old' ? r.old : r.new) ?? -1) <= highlight.end;
    const bg = selected ? 'rgba(73, 157, 248, 0.22)' : lit ? 'rgba(234, 224, 88, 0.28)' : r.kind === 'add' ? colors.rowAdd : r.kind === 'del' ? colors.rowDel : 'transparent';
    const numBg = r.kind === 'add' ? colors.rowAddNum : r.kind === 'del' ? colors.rowDelNum : colors.numBg;
    const numColor = r.kind === 'add' ? colors.rowAddNumText : r.kind === 'del' ? colors.rowDelNumText : colors.num;
    const here = threadsAt(r);
    here.forEach((t) => placed.add(t));
    return (
      <View key={`r${i}`}>
        <Pressable
          onPress={() => (selection ? tapNumber(i) : undefined)}
          onLongPress={() => {
            if (!onCompose || !r.inHunk) return;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            compose(selection ? selection[0] : i, selection ? selection[1] : i);
          }}
          delayLongPress={350}
          style={[styles.row, { backgroundColor: bg }]}>
          <Pressable onPress={() => tapNumber(i)} hitSlop={4} style={[styles.num, { width: numW * 2, backgroundColor: numBg }]}>
            <Text style={[styles.numText, { color: numColor, width: numW }]}>{r.old ?? ''}</Text>
            <Text style={[styles.numText, { color: numColor, width: numW }]}>{r.new ?? ''}</Text>
          </Pressable>
          <Text style={[styles.marker, { color: r.kind === 'add' ? colors.added : r.kind === 'del' ? colors.danger : 'transparent' }]}>
            {r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '}
          </Text>
          <Text style={[styles.code, wrap ? { flex: 1 } : null, { color: colors.code }]}>
            {r.tokens.map((tok, j) => (
              <Text
                key={j}
                style={{
                  color: tokenColor(view.palette[tok[1]] ?? colors.code, scheme),
                  fontStyle: tok[2] && tok[2] & 1 ? 'italic' : undefined,
                  fontWeight: tok[2] && tok[2] & 2 ? '600' : undefined,
                }}>
                {tok[0]}
              </Text>
            ))}
            {r.tokens.length === 0 || (r.tokens.length === 1 && r.tokens[0][0] === '') ? ' ' : ''}
          </Text>
        </Pressable>
        {selection && i === selection[1] ? (
          <View style={[styles.selBar, { width: wrap ? undefined : width - 34, borderColor: colors.border, backgroundColor: colors.paper }]}>
            <T variant="small" style={{ flex: 1 }}>
              {selection[1] - selection[0] + 1 === 1 ? '1 line selected' : `${selection[1] - selection[0] + 1} lines selected`}
            </T>
            <Button title="Cancel" kind="ghost" size="xs" onPress={() => setSelection(null)} />
            <Button title="Comment" kind="primary" size="xs" icon="Chat3Line" onPress={() => compose(selection[0], selection[1])} />
          </View>
        ) : null}
        {here.map((t) => (
          <View key={t.root.id} style={{ width: wrap ? undefined : width - 34 }}>
            <CommentThread thread={t} guideId={guideId} onReply={onReply} readOnly={!onCompose} />
          </View>
        ))}
      </View>
    );
  });

  const leftover = threads.filter((t) => !placed.has(t));
  return (
    <View>
      {wrap ? (
        <View>{lines}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
          <View style={{ minWidth: width - 34 }}>{lines}</View>
        </ScrollView>
      )}
      {leftover.length > 0 ? (
        <View style={{ paddingVertical: 6 }}>
          <Rule />
          <T variant="label" style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
            {leftover.some((t) => t.root.line === null) ? 'Outdated or hidden lines' : 'On lines not shown'}
          </T>
          {leftover.map((t) => (
            <View key={t.root.id}>
              <T variant="meta" style={{ paddingHorizontal: 12 }}>
                {t.root.side === 'LEFT' ? 'old ' : ''}line {t.root.line ?? t.root.originalLine ?? '?'}
              </T>
              <CommentThread thread={t} guideId={guideId} onReply={onReply} readOnly={!onCompose} />
            </View>
          ))}
        </View>
      ) : null}
      {onCompose ? (
        <>
          <Rule />
          <T variant="label" color={colors.faint} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
            Long-press a line to comment · tap line numbers to select lines
          </T>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  file: { borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9 },
  row: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 19 },
  num: { flexDirection: 'row', alignSelf: 'stretch' },
  numText: { fontFamily: Fonts.mono, fontSize: 10, lineHeight: 19, textAlign: 'right', paddingRight: 4 },
  marker: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 19, width: 14, textAlign: 'center' },
  code: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 19, paddingRight: 12 },
  gap: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  selBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: 1, borderBottomWidth: 1 },
});
