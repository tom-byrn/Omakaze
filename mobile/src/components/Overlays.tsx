/**
 * Dialogs, menus and short status messages drawn like the web app (its <dialog>s, dropdown menus
 * and flash messages), instead of the system's alerts, action sheets and context menus.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, ScrollView, Text, View, useWindowDimensions, type HostInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, useTheme } from '@/lib/theme';
import { Button, Icon, Rule, T, alphaInk, type IconName } from './ui';

/* Menus ----------------------------------------------------------------- */

export type MenuItem =
  | { label: string; onPress: () => void; icon?: IconName; destructive?: boolean; isOn?: boolean; hidden?: boolean; disabled?: boolean; detail?: string }
  | { group: string; items: MenuItem[]; hidden?: boolean };

type MenuState = { items: MenuItem[]; title?: string; anchor: { x: number; y: number; width: number; height: number } } | null;

/* Dialogs --------------------------------------------------------------- */

type DialogButton = { label: string; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; value: string };
type DialogState = { title: string; message?: string; buttons: DialogButton[]; resolve: (value: string | null) => void } | null;

type OverlayValue = {
  /** A dialog with a message and buttons; resolves to the pressed button's value (null when dismissed). */
  dialog: (opts: { title: string; message?: string; buttons: DialogButton[] }) => Promise<string | null>;
  /** "Are you sure?" with a confirm button; resolves to true when confirmed. */
  confirm: (opts: { title: string; message?: string; confirm: string; destructive?: boolean; cancel?: string }) => Promise<boolean>;
  /** A dialog with one OK button. */
  notice: (title: string, message?: string) => Promise<void>;
  /** A short status line at the bottom of the screen. */
  flash: (message: string, tone?: 'ok' | 'error') => void;
  openMenu: (items: MenuItem[], anchor: HostInstance | null, title?: string) => void;
};

const OverlayContext = createContext<OverlayValue | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [dialogState, setDialog] = useState<DialogState>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'error'; key: number } | null>(null);

  const dialog = useCallback(
    (opts: { title: string; message?: string; buttons: DialogButton[] }) => new Promise<string | null>((resolve) => setDialog({ ...opts, resolve })),
    [],
  );
  const value = useMemo<OverlayValue>(
    () => ({
      dialog,
      confirm: async ({ title, message, confirm, destructive, cancel }) =>
        (await dialog({
          title,
          message,
          buttons: [
            { label: cancel ?? 'Cancel', kind: 'ghost', value: 'cancel' },
            { label: confirm, kind: destructive ? 'danger' : 'primary', value: 'ok' },
          ],
        })) === 'ok',
      notice: async (title, message) => {
        await dialog({ title, message, buttons: [{ label: 'OK', kind: 'primary', value: 'ok' }] });
      },
      flash: (message, tone = 'ok') => setToast({ message, tone, key: Date.now() }),
      openMenu: (items, anchor, title) => {
        if (!anchor) return setMenu({ items, title, anchor: { x: 0, y: 100, width: 0, height: 0 } });
        anchor.measureInWindow((x, y, width, height) => setMenu({ items, title, anchor: { x, y, width, height } }));
      },
    }),
    [dialog],
  );

  return (
    <OverlayContext.Provider value={value}>
      {children}
      <DialogView
        state={dialogState}
        onClose={(v) => {
          dialogState?.resolve(v);
          setDialog(null);
        }}
      />
      <MenuView state={menu} onClose={() => setMenu(null)} />
      {toast ? <Toast key={toast.key} message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </OverlayContext.Provider>
  );
}

export function useOverlay(): OverlayValue {
  const v = useContext(OverlayContext);
  if (!v) throw new Error('useOverlay outside OverlayProvider');
  return v;
}

/** The web <dialog>: a bordered panel with a serif title over a dashed rule. */
function DialogView({ state, onClose }: { state: DialogState; onClose: (value: string | null) => void }) {
  const { colors } = useTheme();
  return (
    <Modal visible={Boolean(state)} transparent animationType="fade" onRequestClose={() => onClose(null)} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: colors.backdrop, justifyContent: 'center', padding: 16 }} onPress={() => onClose(null)}>
        {state ? (
          <Pressable style={{ alignSelf: 'center', width: '100%', maxWidth: 480, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }} onPress={() => {}}>
            <View style={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: state.message ? 6 : 18, gap: 8 }}>
              <Text style={{ fontFamily: Fonts.serif, fontSize: 22, lineHeight: 26, letterSpacing: -0.44, color: colors.heading }}>{state.title}</Text>
              {state.message ? <T variant="small" style={{ fontSize: 14, lineHeight: 21 }}>{state.message}</T> : null}
            </View>
            <View style={{ height: 14 }} />
            <Rule />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.paper }}>
              {state.buttons.map((b) => (
                <Button key={b.value} title={b.label} kind={b.kind ?? 'secondary'} size="sm" onPress={() => onClose(b.value)} />
              ))}
            </View>
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
  );
}

/** The web dropdown: a bordered paper panel under its button, with mono group labels and dashed rules. */
function MenuView({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!state) return null;
  const panelWidth = Math.min(280, width - 24);
  // Like the web dropdowns: under the button, aligned to its left edge when it sits on the left
  // half of the screen and to its right edge otherwise, and kept on screen.
  const leftAligned = state.anchor.x + state.anchor.width / 2 < width / 2;
  const left = leftAligned
    ? Math.min(Math.max(12, state.anchor.x), width - panelWidth - 12)
    : Math.max(12, Math.min(state.anchor.x + state.anchor.width - panelWidth, width - panelWidth - 12));
  const top = state.anchor.y + state.anchor.height + 6;
  const maxHeight = height - top - insets.bottom - 16;
  const run = (fn: () => void) => {
    onClose();
    setTimeout(fn, 10);
  };
  // Keys are paths through the tree ("1.0"), so nested groups never repeat one.
  const render = (items: MenuItem[], path = ''): ReactNode[] =>
    items
      .filter((i) => !i.hidden)
      .flatMap((i, k) => {
        const key = `${path}${k}`;
        if ('group' in i) {
          return [
            ...(k > 0 || path ? [<Rule key={`${key}-rule`} style={{ marginVertical: 4 }} />] : []),
            // A blank group name only separates items with a rule.
            ...(i.group.trim()
              ? [
                  <T key={`${key}-label`} variant="label" style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 }}>
                    {i.group}
                  </T>,
                ]
              : []),
            ...render(i.items, `${key}.`),
          ];
        }
        return [
          <Pressable
            key={key}
            disabled={i.disabled}
            onPress={() => run(i.onPress)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: pressed ? colors.press : 'transparent', opacity: i.disabled ? 0.45 : 1 })}>
            {i.icon ? <Icon name={i.icon} size={15} color={i.destructive ? colors.danger : colors.ui} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: Fonts.sans, fontSize: 14, color: i.destructive ? colors.danger : i.isOn ? colors.ink : colors.ui }} numberOfLines={1}>
                {i.label}
              </Text>
              {i.detail ? <T variant="meta">{i.detail}</T> : null}
            </View>
            {i.isOn ? <Icon name="CheckLine" size={14} color={colors.ink} /> : null}
          </Pressable>,
        ];
      });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <View style={{ position: 'absolute', top, left, width: panelWidth, maxHeight, borderWidth: 1, borderColor: alphaInk(colors, 0.18), backgroundColor: colors.paper, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } }}>
          {state.title ? (
            <>
              <T variant="label" style={{ paddingHorizontal: 14, paddingVertical: 9 }}>
                {state.title}
              </T>
              <Rule />
            </>
          ) : null}
          <ScrollView bounces={false} contentContainerStyle={{ paddingVertical: 4 }}>
            {render(state.items)}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

/** A flash message: an ink bar at the bottom that fades out. */
function Toast({ message, tone, onDone }: { message: string; tone: 'ok' | 'error'; onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => finished && onDone());
  }, [opacity, onDone]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 76, opacity, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: tone === 'error' ? colors.danger : colors.ink, maxWidth: 480 }}>
        <Icon name={tone === 'error' ? 'ErrorWarningLine' : 'CheckLine'} size={14} color={colors.surface} />
        <Text style={{ fontFamily: Fonts.sans, fontSize: 13.5, color: colors.surface, flexShrink: 1 }}>{message}</Text>
      </View>
    </Animated.View>
  );
}
