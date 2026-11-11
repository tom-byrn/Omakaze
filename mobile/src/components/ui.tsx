/**
 * The web app's components (src/app/globals.css and src/components) for React Native: serif
 * buttons with square corners, mono labels, hairline borders, dashed rules, square avatars and tags.
 */
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Fonts, useTheme, type Colors } from '@/lib/theme';
import type { GuideStatus, PullState } from '@/lib/types';
import { REMIX, type RemixName } from './remix-icons';

/** `color-mix(in srgb, <hex> <a>, transparent)` for a #RRGGBB color. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/* Text ------------------------------------------------------------------ */

type Variant = 'display' | 'title' | 'h4' | 'heading' | 'body' | 'small' | 'label' | 'mono' | 'meta';

export function textStyles(colors: Colors): Record<Variant, TextStyle> {
  return {
    // .h2 / page titles
    display: { fontFamily: Fonts.serif, fontSize: 36, lineHeight: 38, letterSpacing: -1.44, color: colors.heading },
    // .h3
    title: { fontFamily: Fonts.serif, fontSize: 26, lineHeight: 29, letterSpacing: -0.5, color: colors.heading },
    // .h4 (panel titles)
    h4: { fontFamily: Fonts.serif, fontSize: 22, lineHeight: 25, letterSpacing: -0.22, color: colors.heading },
    heading: { fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22, letterSpacing: -0.15, color: colors.ink },
    // .guide-prose / .body-copy
    body: { fontFamily: Fonts.sans, fontSize: 15.5, lineHeight: 26, letterSpacing: -0.2, color: colors.text },
    small: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 20, color: colors.body },
    // .mono-label
    label: { fontFamily: Fonts.mono, fontSize: 10, lineHeight: 15, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.label },
    mono: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 18, color: colors.ink },
    meta: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 16, color: colors.meta },
  };
}

export function T({ variant = 'body', style, color, ...props }: TextProps & { variant?: Variant; color?: string }) {
  const { colors } = useTheme();
  return <Text {...props} style={[textStyles(colors)[variant], color ? { color } : null, style]} />;
}

/** `.eyebrow`: a dashed box with a mono label. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: alphaInk(colors, 0.25) }, style]}>
      <T variant="label">{children}</T>
    </View>
  );
}

/** `color-mix(in srgb, var(--color-black) <a>, transparent)`, which flips with the theme. */
export function alphaInk(colors: Colors, a: number): string {
  return `rgba(${colors.blackRgb}, ${a})`;
}

/** `PageHeader`: eyebrow, serif title and lead, over a dashed rule. */
export function PageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <T variant="display" style={{ marginTop: 20 }}>
        {title}
      </T>
      {description ? (
        <T variant="small" style={{ marginTop: 10, fontSize: 15, lineHeight: 22 }}>
          {description}
        </T>
      ) : null}
      {children ? <View style={{ marginTop: 18 }}>{children}</View> : null}
      <Rule style={{ marginTop: 22 }} />
    </View>
  );
}

/* Rules ----------------------------------------------------------------- */

/** A 1px dashed horizontal rule (`border-dashed border-line`). */
export function Rule({ color, style, solid }: { color?: string; style?: StyleProp<ViewStyle>; solid?: boolean }) {
  const { colors } = useTheme();
  const c = color ?? colors.line;
  if (solid) return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c }, style]} />;
  // A single dashed side isn't drawn on iOS; clip a dashed box to its top edge.
  return (
    <View style={[{ height: 1, overflow: 'hidden' }, style]}>
      <View style={{ height: 3, borderWidth: 1, borderColor: c, borderStyle: 'dashed' }} />
    </View>
  );
}

/** A 1px dashed vertical rule. */
export function VRule({ color, style }: { color?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[{ width: 1, alignSelf: 'stretch', overflow: 'hidden' }, style]}>
      <View style={{ width: 3, flex: 1, borderWidth: 1, borderColor: color ?? colors.line, borderStyle: 'dashed' }} />
    </View>
  );
}

/** Kept for older call sites: a dashed rule. */
export function Divider({ style }: { dashed?: boolean; style?: StyleProp<ViewStyle> }) {
  return <Rule style={style} />;
}

/* Icons ----------------------------------------------------------------- */

/** The web app's Remix icons. */
export const Icons = {
  check: 'CheckLine',
  checkDouble: 'CheckDoubleLine',
  checkCircle: 'CheckboxCircleFill',
  checkCircleLine: 'CheckboxCircleLine',
  circle: 'CheckboxBlankCircleLine',
  chevronRight: 'ArrowRightSLine',
  chevronLeft: 'ArrowLeftSLine',
  chevronDown: 'ArrowDownSLine',
  arrowLeft: 'ArrowLeftLine',
  arrowRight: 'ArrowRightLine',
  branch: 'GitBranchLine',
  pull: 'GitPullRequestLine',
  comment: 'Chat3Line',
  doc: 'FileTextLine',
  files: 'FileList3Line',
  sparkles: 'SparklingLine',
  share: 'ShareLine',
  link: 'LinksLine',
  copy: 'FileCopyLine',
  globe: 'GlobalLine',
  external: 'ExternalLinkLine',
  warning: 'ErrorWarningLine',
  info: 'InformationLine',
  clock: 'TimeLine',
  activity: 'HistoryLine',
  insights: 'BarChart2Line',
  settings: 'Settings3Line',
  person: 'UserLine',
  plus: 'AddLine',
  trash: 'DeleteBinLine',
  reply: 'ReplyLine',
  expand: 'ExpandUpDownLine',
  bell: 'Notification3Line',
  people: 'TeamLine',
  moon: 'MoonLine',
  server: 'ServerLine',
  logout: 'LogoutBoxRLine',
  wrap: 'TextWrap',
  eye: 'EyeLine',
  pencil: 'Edit2Line',
  more: 'MoreFill',
  close: 'CloseLine',
  search: 'SearchLine',
  filter: 'Filter3Line',
  download: 'DownloadLine',
  refresh: 'RefreshLine',
} satisfies Record<string, RemixName>;

export type IconName = RemixName;

export function Icon({ name, size = 16, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={REMIX[name]} fill={color ?? colors.ink} />
      </Svg>
    </View>
  );
}

/** The chopsticks mark (public/logo.svg; the white version in the dark theme). */
export function LogoMark({ size = 26 }: { size?: number }) {
  const { scheme } = useTheme();
  return (
    <Image
      source={scheme === 'dark' ? require('@/assets/images/logo-white.png') : require('@/assets/images/logo.png')}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

/* Buttons --------------------------------------------------------------- */

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'lg' | 'md' | 'sm' | 'xs';

/** `.btn`: serif label, square corners, 1px ink border. */
export function Button({
  title,
  kind = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  small,
  style,
  ...props
}: Omit<PressableProps, 'style'> & {
  title: string;
  kind?: ButtonKind;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  /** Same as size="sm". */
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const sz = small ? 'sm' : size;
  const fg = kind === 'primary' ? colors.surface : kind === 'danger' ? colors.danger : kind === 'ghost' ? colors.ui : colors.ink;
  const border = kind === 'ghost' ? 'transparent' : kind === 'danger' ? colors.danger : colors.ink;
  const off = disabled || loading;
  const dims: Record<ButtonSize, { h: number; px: number; fs: number; icon: number }> = {
    lg: { h: 48, px: 24, fs: 16, icon: 16 },
    md: { h: 44, px: 20, fs: 14, icon: 15 },
    sm: { h: 32, px: 12, fs: 12.5, icon: 13 },
    xs: { h: 26, px: 9, fs: 12, icon: 12 },
  };
  const d = dims[sz];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      {...props}
      style={({ pressed }) => [
        styles.button,
        { height: d.h, paddingHorizontal: d.px, borderColor: border, backgroundColor: kind === 'primary' ? colors.ink : 'transparent' },
        pressed && kind !== 'primary' && { backgroundColor: colors.press },
        { opacity: off ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed && !off ? 0.98 : 1 }] },
        style,
      ]}>
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={d.icon} color={fg} /> : null}
      <Text
        style={{
          fontFamily: sz === 'xs' ? Fonts.sans : Fonts.serifMedium,
          fontSize: d.fs,
          letterSpacing: sz === 'xs' ? 0 : 0.14,
          color: fg,
        }}
        numberOfLines={1}>
        {title}
      </Text>
      {iconRight ? <Icon name={iconRight} size={d.icon} color={fg} /> : null}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color, size = 18 }: { icon: IconName; onPress: () => void; label: string; color?: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.press : 'transparent' })}>
      <Icon name={icon} size={size} color={color ?? colors.ui} />
    </Pressable>
  );
}

/* Tabs ------------------------------------------------------------------ */

/** `FilterTabs`: text tabs over a dashed rule; the current one is underlined in ink. */
export function FilterTabs<V extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: V; label: string; count?: number; badge?: boolean }[];
  value: V;
  onChange: (v: V) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20 }}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ paddingLeft: i === 0 ? 0 : 14, paddingRight: 14 }}>
            <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontFamily: Fonts.sans, fontSize: 14, letterSpacing: -0.28, color: on ? colors.ink : colors.nav }}>{o.label}</Text>
              {o.count !== undefined ? (
                o.badge && o.count > 0 ? (
                  <View style={{ minWidth: 18, height: 18, paddingHorizontal: 4, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: Fonts.mono, fontSize: 10, color: colors.surface }}>{o.count}</Text>
                  </View>
                ) : (
                  <Text style={{ fontFamily: Fonts.mono, fontSize: 10, color: on ? colors.label : colors.faint }}>{o.count}</Text>
                )
              ) : null}
            </View>
            {on ? <View style={{ height: 1, backgroundColor: colors.ink }} /> : <Rule />}
          </Pressable>
        );
      })}
      <View style={{ flex: 1, minWidth: 16, justifyContent: 'flex-end' }}>
        <Rule />
      </View>
    </ScrollView>
  );
}

/** `StateTabs`: a boxed segmented control; the current segment is filled with ink. */
export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: V; label: string; count?: number }[];
  value: V;
  onChange: (v: V) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ flexGrow: 0 }}>
      <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: colors.tab }}>
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => onChange(o.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [
                { height: 38, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: on ? colors.ink : pressed ? colors.press : colors.paper },
                i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.tab },
              ]}>
              <Text style={{ fontFamily: Fonts.serif, fontSize: 15, color: on ? colors.surface : colors.ink }}>{o.label}</Text>
              {o.count !== undefined ? (
                <Text style={{ fontFamily: Fonts.mono, fontSize: 10, color: on ? alpha(colors.surface, 0.6) : colors.faint }}>{o.count}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

/* Layout ---------------------------------------------------------------- */

/** `.card`: white with a black/15 border. */
export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { colors } = useTheme();
  const s = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { backgroundColor: colors.wash }]}>
      {children}
    </Pressable>
  );
}

/** `Panel` (settings): a serif title and description over a dashed rule, then the content. */
export function Panel({ title, description, children, footer, style, tone }: { title?: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'danger' }) {
  const { colors } = useTheme();
  return (
    <View style={[{ borderWidth: 1, borderColor: tone === 'danger' ? alpha(colors.danger, 0.3) : colors.border, backgroundColor: colors.surface }, style]}>
      {title ? (
        <>
          <View style={{ paddingHorizontal: 18, paddingVertical: 16, gap: 4 }}>
            <T variant="h4">{title}</T>
            {description ? <T variant="small">{description}</T> : null}
          </View>
          <Rule />
        </>
      ) : null}
      {children}
      {footer ? (
        <>
          <Rule />
          <View style={{ paddingHorizontal: 18, paddingVertical: 12, backgroundColor: colors.paper }}>{typeof footer === 'string' ? <T variant="small">{footer}</T> : footer}</View>
        </>
      ) : null}
    </View>
  );
}

/** A group of rows in a panel, with an optional mono label above and a note below. */
export function Section({ title, children, footer, style }: { title?: string; children: ReactNode; footer?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[{ gap: 8 }, style]}>
      {title ? <T variant="label">{title}</T> : null}
      <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>{children}</View>
      {footer ? <T variant="small">{footer}</T> : null}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  icon,
  right,
  onPress,
  destructive,
  last,
  left,
}: {
  title: string;
  subtitle?: string | null;
  icon?: IconName;
  right?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
  left?: ReactNode;
}) {
  const { colors } = useTheme();
  const content = (
    <>
      <View style={styles.listRow}>
        {left ?? (icon ? <Icon name={icon} size={17} color={destructive ? colors.danger : colors.ui} /> : null)}
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ fontFamily: Fonts.sans, fontSize: 15, lineHeight: 21, letterSpacing: -0.2, color: destructive ? colors.danger : colors.ink }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <T variant="small" numberOfLines={2}>
              {subtitle}
            </T>
          ) : null}
        </View>
        {right ?? (onPress ? <Icon name="ArrowRightSLine" size={16} color={colors.faint} /> : null)}
      </View>
      {last ? null : <Rule />}
    </>
  );
  if (!onPress) return <View>{content}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { backgroundColor: colors.press } : null)}>
      {content}
    </Pressable>
  );
}

/* Checkboxes ------------------------------------------------------------ */

/** A square checkbox (`accent-ink`). */
export function Checkbox({ value, size = 18, disabled }: { value: boolean; size?: number; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderWidth: 1,
        borderColor: value ? colors.ink : alphaInk(colors, 0.35),
        backgroundColor: value ? colors.ink : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
      }}>
      {value ? <Icon name="CheckLine" size={size - 4} color={colors.surface} /> : null}
    </View>
  );
}

/** A checkbox with a label and a line of help, separated from the next by a dashed rule (NotificationFields). */
export function SwitchRow({ title, subtitle, value, onChange, disabled, last }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => onChange(!value)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: value, disabled }}
        style={({ pressed }) => [{ flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingVertical: 14 }, pressed && { backgroundColor: colors.press }]}>
        <View style={{ paddingTop: 2 }}>
          <Checkbox value={value} disabled={disabled} />
        </View>
        <View style={{ flex: 1, gap: 2, opacity: disabled ? 0.5 : 1 }}>
          <Text style={{ fontFamily: Fonts.sans, fontSize: 14.5, lineHeight: 20, color: colors.ink }}>{title}</Text>
          {subtitle ? <T variant="small">{subtitle}</T> : null}
        </View>
      </Pressable>
      {last ? null : <Rule />}
    </>
  );
}

/* Status ---------------------------------------------------------------- */

/** Square avatars with a hairline border, or initials on mist. */
export function Avatar({ uri, name, size = 22 }: { uri?: string | null; name?: string | null; size?: number }) {
  const { colors } = useTheme();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderWidth: 1, borderColor: alphaInk(colors, 0.1), backgroundColor: colors.wash }} />;
  const initials =
    (name ?? '?')
      .split(/[\s\-_]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || '?';
  return (
    <View style={{ width: size, height: size, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: Fonts.mono, fontSize: Math.max(9, size * 0.38), color: colors.label }}>{initials}</Text>
    </View>
  );
}

/** `.dot` */
export function Dot({ color, size = 6 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/** `.tag`: mono uppercase in a hairline box. */
export function Tag({ label, color, border, dot }: { label: string; color?: string; border?: string; dot?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tag, { borderColor: border ?? colors.border, backgroundColor: colors.surface }]}>
      {dot ? <Dot color={dot} /> : null}
      <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: color ?? colors.label }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** `PrStateTag` */
export function StateTag({ state, draft }: { state: PullState; draft?: boolean }) {
  const { colors } = useTheme();
  if (draft && state === 'open') return <Tag label="draft" color={colors.faint} border={alphaInk(colors, 0.2)} />;
  if (state === 'merged') return <Tag label="merged" color={colors.blueDeep} border={alpha(colors.blueDeep, 0.4)} />;
  if (state === 'closed') return <Tag label="closed" color={colors.danger} border={alpha(colors.danger, 0.4)} />;
  return <Tag label="open" color={colors.olive} border={alpha(colors.olive, 0.4)} />;
}

/** `GuideChip` */
export function GuideBadge({ status, version, outdated }: { status: GuideStatus | null; version?: number; outdated?: boolean }) {
  const { colors } = useTheme();
  if (!status) return <Tag label="No guide" color={colors.faint} />;
  if (status === 'generating') return <Tag label="Generating" color={colors.ink} border={alpha(colors.ink, 0.3)} dot={colors.blueBright} />;
  if (status === 'failed') return <Tag label="Failed" color={colors.danger} border={alpha(colors.danger, 0.4)} dot={colors.danger} />;
  if (status === 'draft') return <Tag label={`Draft v${version}`} dot={alphaInk(colors, 0.3)} />;
  return (
    <Tag
      label={`Guide v${version}${outdated ? ' · outdated' : ''}`}
      color={outdated ? alphaInk(colors, 0.55) : colors.ink}
      border={outdated ? colors.border : alpha(colors.ink, 0.4)}
      dot={outdated ? colors.highlight : colors.ink}
    />
  );
}

export function DiffStat({ additions, deletions }: { additions: number | null; deletions: number | null }) {
  const { colors } = useTheme();
  if (additions === null && deletions === null) return null;
  return (
    <Text style={{ fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 0.22 }}>
      <Text style={{ color: colors.added }}>+{(additions ?? 0).toLocaleString('en')}</Text>{' '}
      <Text style={{ color: colors.danger }}>−{(deletions ?? 0).toLocaleString('en')}</Text>
    </Text>
  );
}

/** Review progress: a square per section (up to 12), else a bar (ReviewLine's SectionProgress). */
export function Progress({ value, total, label }: { value: number; total: number; height?: number; label?: string }) {
  const { colors } = useTheme();
  const done = total > 0 && value >= total;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {total <= 12 ? (
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={{ width: 8, height: 8, borderWidth: 1, borderColor: i < value ? colors.ink : alphaInk(colors, 0.25), backgroundColor: i < value ? colors.ink : colors.surface }} />
          ))}
        </View>
      ) : (
        <View style={{ width: 72, height: 8, borderWidth: 1, borderColor: alphaInk(colors, 0.25), backgroundColor: colors.surface }}>
          <View style={{ width: `${Math.round((value / Math.max(1, total)) * 100)}%`, height: '100%', backgroundColor: colors.ink }} />
        </View>
      )}
      {label !== undefined ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          {done ? <Icon name="CheckLine" size={12} color={colors.ink} /> : null}
          <T variant="meta" color={done ? colors.ink : colors.muted}>
            {label}
          </T>
        </View>
      ) : null}
    </View>
  );
}

/** A notice strip (the guide page's draft, outdated and new-version notices). */
export function Banner({ tone = 'info', children, action }: { tone?: 'info' | 'warn' | 'danger' | 'success'; children: ReactNode; action?: ReactNode }) {
  const { colors } = useTheme();
  const dot = tone === 'warn' ? colors.highlight : tone === 'danger' ? colors.danger : tone === 'success' ? colors.olive : colors.blueBright;
  const bg = tone === 'warn' ? alpha(colors.highlight, 0.15) : tone === 'danger' ? alpha(colors.danger, 0.04) : tone === 'success' ? alpha(colors.olive, 0.07) : colors.mist;
  const border = tone === 'danger' ? alpha(colors.danger, 0.4) : colors.line;
  return (
    <View style={[styles.banner, { backgroundColor: bg, borderColor: border }]}>
      <View style={{ paddingTop: 7 }}>
        <Dot color={dot} />
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        {typeof children === 'string' ? <T variant="small" color={tone === 'danger' ? colors.danger : colors.ink} style={{ fontSize: 13 }}>{children}</T> : children}
        {action}
      </View>
    </View>
  );
}

/* Screens --------------------------------------------------------------- */

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.paper }]}>
      <ActivityIndicator color={colors.meta} />
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Empty title="Something went wrong." action={onRetry ? <Button title="Try again" onPress={onRetry} /> : undefined}>
        {error instanceof Error ? error.message : String(error)}
      </Empty>
    </View>
  );
}

/** `EmptyState`: a dashed box with a serif title. */
export function Empty({ title, children, action, style }: { title: string; children?: ReactNode; action?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[{ margin: 20, paddingHorizontal: 24, paddingVertical: 44, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: alpha(colors.surface, 0.5), alignItems: 'center' }, style]}>
      <Text style={{ fontFamily: Fonts.serif, fontSize: 26, lineHeight: 29, letterSpacing: -0.5, color: colors.heading, textAlign: 'center' }}>{title}</Text>
      {children ? (
        <T variant="small" style={{ textAlign: 'center', marginTop: 10, maxWidth: 360, fontSize: 15, lineHeight: 24 }}>
          {children}
        </T>
      ) : null}
      {action ? <View style={{ marginTop: 22 }}>{action}</View> : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1 },
  card: { borderWidth: 1, padding: 18 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 13, minHeight: 50 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 20, paddingHorizontal: 6, borderWidth: 1, alignSelf: 'flex-start' },
  banner: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderStyle: 'dashed' },
  center: { flex: 1, alignItems: 'stretch', justifyContent: 'center' },
});
