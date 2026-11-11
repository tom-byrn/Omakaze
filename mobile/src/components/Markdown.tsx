/**
 * GitHub-flavored markdown as native views: what guide summaries, sections, pull request bodies and
 * comments use. Mermaid diagrams and math are shown as their source (the web app renders them).
 */
import { Image } from 'expo-image';
import { marked, type Token, type Tokens } from 'marked';
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, Text, View, type TextStyle } from 'react-native';

import { accessToken, type Account } from '@/lib/accounts';
import { openUrl, parseDiffLink, resolveUrl, type DiffLink } from '@/lib/links';
import { Fonts, useTheme, type Colors } from '@/lib/theme';
import { Rule, VRule, alpha, alphaInk } from './ui';

type Props = {
  source: string;
  account: Account | null;
  onDiffLink?: (link: DiffLink) => void;
  /** Smaller type, for comments. */
  compact?: boolean;
};

const ALERT = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;

export const Markdown = memo(function Markdown({ source, account, onDiffLink, compact }: Props) {
  const theme = useTheme();
  const tokens = useMemo(() => marked.lexer(source ?? '', { gfm: true }), [source]);
  // .guide-prose (15.5px / 1.7) and .guide-prose-sm for comments.
  const ctx: Ctx = { colors: theme.colors, account, onDiffLink, size: compact ? 13.5 : 15.5, line: compact ? 21 : 26 };
  return <View style={{ gap: compact ? 8 : 16 }}>{blocks(tokens, ctx)}</View>;
});

type Ctx = { colors: Colors; account: Account | null; onDiffLink?: (l: DiffLink) => void; size: number; line: number };

function blocks(tokens: Token[], ctx: Ctx): ReactNode[] {
  return tokens.map((t, i) => <Block key={i} token={t} ctx={ctx} />).filter(Boolean);
}

function Block({ token: t, ctx }: { token: Token; ctx: Ctx }): ReactNode {
  const { colors } = ctx;
  const body: TextStyle = { fontFamily: Fonts.sans, fontSize: ctx.size, lineHeight: ctx.line, letterSpacing: -0.012 * ctx.size, color: colors.text };
  switch (t.type) {
    case 'space':
    case 'def':
      return null;
    case 'heading': {
      const h = t as Tokens.Heading;
      const size = h.depth <= 1 ? 30 : h.depth === 2 ? 26 : 21;
      const style: TextStyle =
        h.depth <= 3
          ? { fontFamily: Fonts.serif, fontSize: size, lineHeight: size * 1.12, color: colors.heading, letterSpacing: -0.02 * size }
          : { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 16, letterSpacing: 0.88, textTransform: 'uppercase', color: colors.label };
      return <Text style={[style, { marginTop: 12 }]}>{inline(h.tokens, ctx)}</Text>;
    }
    case 'paragraph': {
      const p = t as Tokens.Paragraph;
      if (/^\s*\$\$[\s\S]*\$\$\s*$/.test(p.raw)) return <CodeBlock code={p.raw.trim().replace(/^\$\$|\$\$$/g, '').trim()} caption="Math" ctx={ctx} />;
      const images = p.tokens.filter((x) => x.type === 'image') as Tokens.Image[];
      const onlyImages = images.length > 0 && p.tokens.every((x) => x.type === 'image' || (x.type === 'text' && !x.raw.trim()) || x.type === 'br');
      if (onlyImages) return <View style={{ gap: 8 }}>{images.map((img, i) => <MdImage key={i} href={img.href} alt={img.text} ctx={ctx} />)}</View>;
      return <Text style={body}>{inline(p.tokens, ctx)}</Text>;
    }
    case 'text': {
      const tt = t as Tokens.Text;
      return <Text style={body}>{tt.tokens ? inline(tt.tokens, ctx) : tt.text}</Text>;
    }
    case 'code': {
      const c = t as Tokens.Code;
      const lang = (c.lang ?? '').split(/\s/)[0];
      if (lang === 'mermaid') return <CodeBlock code={c.text} caption="Mermaid diagram (open on the web to see it drawn)" ctx={ctx} />;
      if (lang === 'math') return <CodeBlock code={c.text} caption="Math" ctx={ctx} />;
      if (lang === 'suggestion') return <CodeBlock code={c.text} caption="Suggested change" ctx={ctx} tone="add" />;
      return <CodeBlock code={c.text} caption={lang || undefined} ctx={ctx} />;
    }
    case 'blockquote': {
      const q = t as Tokens.Blockquote;
      const first = q.tokens[0];
      const m = first && first.type === 'paragraph' ? ALERT.exec(first.raw) : null;
      if (m) {
        const kind = m[1].toUpperCase();
        const c = kind === 'WARNING' ? colors.warn : kind === 'CAUTION' ? colors.danger : kind === 'TIP' ? colors.olive : kind === 'IMPORTANT' ? colors.blueDeep : colors.blueBright;
        const rest = marked.lexer(q.text.replace(ALERT, ''), { gfm: true });
        return (
          <View style={{ borderWidth: 1, borderLeftWidth: 3, borderColor: colors.border, borderLeftColor: c, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.8, color: c, marginBottom: 4 }}>{kind}</Text>
            <View style={{ gap: 8 }}>{blocks(rest, ctx)}</View>
          </View>
        );
      }
      // Blockquotes: a dashed rule on the left.
      return (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <VRule color={alphaInk(colors, 0.35)} />
          <View style={{ flex: 1, gap: 8, paddingVertical: 2 }}>{blocks(q.tokens, { ...ctx, colors: { ...colors, text: colors.body } })}</View>
        </View>
      );
    }
    case 'list': {
      const l = t as Tokens.List;
      const start = typeof l.start === 'number' ? l.start : 1;
      return (
        <View style={{ gap: 4 }}>
          {l.items.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              {item.task ? (
                <View style={{ width: 14, height: 14, marginTop: (ctx.line - 14) / 2, borderWidth: 1, borderColor: item.checked ? colors.ink : alphaInk(colors, 0.35), backgroundColor: item.checked ? colors.ink : colors.surface }} />
              ) : l.ordered ? (
                <Text style={[body, { minWidth: 20, color: alphaInk(colors, 0.35) }]}>{`${start + i}.`}</Text>
              ) : (
                <View style={{ width: 12, paddingTop: (ctx.line - 5) / 2 }}>
                  <View style={{ width: 5, height: 5, backgroundColor: alphaInk(colors, 0.35) }} />
                </View>
              )}
              <View style={{ flex: 1, gap: 6 }}>{blocks(item.tokens, ctx)}</View>
            </View>
          ))}
        </View>
      );
    }
    case 'table': {
      const tb = t as Tokens.Table;
      const W = 168;
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
          <View>
            <View style={{ flexDirection: 'row', backgroundColor: colors.paper }}>
              {tb.header.map((c, i) => (
                <Text key={i} style={{ width: W, paddingHorizontal: 12, paddingVertical: 8, fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.label }}>
                  {inline(c.tokens, ctx)}
                </Text>
              ))}
            </View>
            <Rule />
            {tb.rows.map((r, i) => (
              <View key={i}>
                {i > 0 ? <Rule /> : null}
                <View style={{ flexDirection: 'row' }}>
                  {r.map((c, j) => (
                    <Text key={j} style={[body, { width: W, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13.5, lineHeight: 20 }]}>
                      {inline(c.tokens, ctx)}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      );
    }
    case 'hr':
      return <Rule style={{ marginVertical: 12 }} />;
    case 'html': {
      const raw = (t as Tokens.HTML).raw;
      const video = /<video[^>]*src="([^"]+)"/i.exec(raw);
      if (video) return <LinkText href={video[1]} label="▶ Video" ctx={ctx} />;
      const img = /<img[^>]*src="([^"]+)"[^>]*?(?:alt="([^"]*)")?/i.exec(raw);
      if (img) return <MdImage href={img[1]} alt={img[2] ?? ''} ctx={ctx} />;
      const text = raw.replace(/<[^>]+>/g, '').trim();
      return text ? <Text style={body}>{text}</Text> : null;
    }
    default:
      return 'raw' in t && t.raw.trim() ? <Text style={body}>{t.raw}</Text> : null;
  }
}

function inline(tokens: Token[] | undefined, ctx: Ctx): ReactNode[] {
  if (!tokens) return [];
  const { colors } = ctx;
  return tokens.map((t, i) => {
    switch (t.type) {
      case 'text':
      case 'escape': {
        const tt = t as Tokens.Text;
        return tt.tokens ? <Text key={i}>{inline(tt.tokens, ctx)}</Text> : <Text key={i}>{decode(tt.text)}</Text>;
      }
      case 'strong':
        return (
          <Text key={i} style={{ fontFamily: Fonts.sansSemiBold, color: colors.fg }}>
            {inline((t as Tokens.Strong).tokens, ctx)}
          </Text>
        );
      case 'em':
        return (
          <Text key={i} style={{ fontStyle: 'italic' }}>
            {inline((t as Tokens.Em).tokens, ctx)}
          </Text>
        );
      case 'del':
        return (
          <Text key={i} style={{ textDecorationLine: 'line-through' }}>
            {inline((t as Tokens.Del).tokens, ctx)}
          </Text>
        );
      case 'codespan':
        return (
          <Text key={i} style={{ fontFamily: Fonts.mono, fontSize: ctx.size * 0.84, backgroundColor: alphaInk(colors, 0.045), color: colors.fg }}>
            {nbsp(decode((t as Tokens.Codespan).text))}
          </Text>
        );
      case 'br':
        return <Text key={i}>{'\n'}</Text>;
      case 'link': {
        const l = t as Tokens.Link;
        return <LinkText key={i} href={l.href} ctx={ctx} label={inline(l.tokens, ctx)} />;
      }
      case 'image': {
        const img = t as Tokens.Image;
        return <LinkText key={i} href={img.href} ctx={ctx} label={`🖼 ${img.text || 'Image'}`} />;
      }
      case 'html':
        return null;
      default:
        return 'raw' in t ? <Text key={i}>{t.raw}</Text> : null;
    }
  });
}

function LinkText({ href, label, ctx }: { href: string; label: ReactNode; ctx: Ctx }) {
  const diff = parseDiffLink(href);
  const onPress = () => {
    if (diff) ctx.onDiffLink?.(diff);
    else void openUrl(ctx.account, href);
  };
  return (
    <Text
      onPress={onPress}
      suppressHighlighting={false}
      style={
        diff
          ? { fontFamily: Fonts.mono, fontSize: ctx.size * 0.82, color: ctx.colors.blueDeep, backgroundColor: alpha(ctx.colors.blueBright, 0.08) }
          : { color: ctx.colors.blueDeep, textDecorationLine: 'underline', textDecorationColor: alpha(ctx.colors.blueDeep, 0.35) }
      }>
      {label}
    </Text>
  );
}

/** `.md-code`: a bordered block with a mono label bar over a dashed rule. */
function CodeBlock({ code, caption, ctx, tone }: { code: string; caption?: string; ctx: Ctx; tone?: 'add' }) {
  const { colors } = ctx;
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: tone === 'add' ? colors.rowAdd : colors.surface }}>
      {caption ? (
        <>
          <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: alphaInk(colors, 0.5), paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.paper }}>{caption}</Text>
          <Rule />
        </>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12 }}>
        <Text selectable style={{ fontFamily: Fonts.mono, fontSize: 12.5, lineHeight: 20, color: colors.code }}>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

/** Images; uploads under /api/assets need the member's token. */
function MdImage({ href, alt, ctx }: { href: string; alt: string; ctx: Ctx }) {
  const url = ctx.account ? resolveUrl(ctx.account, href) : href;
  const own = ctx.account && url.startsWith(ctx.account.server);
  const [token, setToken] = useState<string | null>(null);
  const [ratio, setRatio] = useState(16 / 9);
  useEffect(() => {
    if (own && ctx.account) accessToken(ctx.account).then(setToken, () => {});
  }, [own, ctx.account]);
  if (own && !token) return <View style={{ aspectRatio: ratio, backgroundColor: ctx.colors.wash }} />;
  return (
    <Image
      source={{ uri: url, headers: own && token ? { Authorization: `Bearer ${token}` } : undefined }}
      accessibilityLabel={alt}
      contentFit="contain"
      onLoad={(e) => e.source.width && e.source.height && setRatio(e.source.width / e.source.height)}
      style={{ width: '100%', aspectRatio: ratio, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: alphaInk(ctx.colors, 0.12) }}
    />
  );
}

/** Code spans wrap as a unit, padded like the web's 0.35em, so their background never spans a line break. */
function nbsp(code: string): string {
  return `\u00A0${code.replace(/ /g, '\u00A0')}\u00A0`;
}

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

