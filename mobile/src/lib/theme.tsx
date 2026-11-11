import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { getItem, setItem } from './storage';

/** The web app's tokens (src/app/globals.css), light and dark. */
const light = {
  paper: '#FCFCFC',
  surface: '#FFFFFF',
  wash: '#F4F4F3',
  mist: '#EAEBF1',
  ink: '#141518',
  fg: '#171717',
  heading: '#181A1B',
  stat: '#2A2A2A',
  text: '#3F3F3F',
  body: '#727272',
  meta: '#898989',
  muted: '#919191',
  solid: '#A8A8A8',
  line: '#D4D4D4',
  frame: '#E0E0E0',
  added: '#1F8A85',
  danger: '#BF000F',
  warn: '#8A6D00',
  highlight: '#EAE058',
  moved: '#7C4DD8',
  blue: '#147DBA',
  signal: '#25FFF9',
  code: '#24292E',
  onInk: '#FFFFFF',
  rowAdd: 'rgba(78, 211, 207, 0.14)',
  rowAddNum: 'rgba(78, 211, 207, 0.24)',
  rowAddNumText: 'rgba(0, 70, 66, 0.55)',
  rowDel: 'rgba(191, 0, 15, 0.065)',
  rowDelNum: 'rgba(191, 0, 15, 0.12)',
  rowDelNumText: 'rgba(120, 0, 10, 0.5)',
  num: 'rgba(0, 0, 0, 0.33)',
  numBg: 'rgba(0, 0, 0, 0.012)',
  gap: '#F1F3F7',
  olive: '#54702F',
  blueDeep: '#133264',
  blueBright: '#147DBA',
  tab: '#CCCCCC',
  lineHeader: '#DEDEDE',
  nav: '#777777',
  ui: '#565656',
  sub: '#A2A2A2',
  /** color-mix(black 15%): card, tag and panel borders. */
  border: 'rgba(0, 0, 0, 0.15)',
  /** color-mix(black 60%): mono labels. */
  label: 'rgba(0, 0, 0, 0.6)',
  /** color-mix(black 45%): faint mono text. */
  faint: 'rgba(0, 0, 0, 0.45)',
  /** color-mix(black 4%): hover / pressed rows. */
  press: 'rgba(0, 0, 0, 0.04)',
  backdrop: 'rgba(0, 0, 0, 0.45)',
  /** `--color-black` as r, g, b, for color-mix(black n%). */
  blackRgb: '0, 0, 0',
};

export type Colors = typeof light;

const dark: Colors = {
  paper: '#101113',
  surface: '#17181B',
  wash: '#1A1B1E',
  mist: '#1A1D24',
  ink: '#EDEDEE',
  fg: '#E6E6E7',
  heading: '#F1F1F2',
  stat: '#DADADB',
  text: '#C4C4C6',
  body: '#9B9B9E',
  meta: '#86868A',
  muted: '#7C7C80',
  solid: '#4C4C51',
  line: '#2E2F33',
  frame: '#2A2B2F',
  added: '#4ED3CF',
  danger: '#FF6B6B',
  warn: '#E3C34D',
  highlight: '#EAE058',
  moved: '#A98BF5',
  blue: '#4AA6E0',
  signal: '#25FFF9',
  code: '#E1E4E8',
  onInk: '#101113',
  rowAdd: 'rgba(78, 211, 207, 0.07)',
  rowAddNum: 'rgba(78, 211, 207, 0.12)',
  rowAddNumText: 'rgba(160, 236, 233, 0.6)',
  rowDel: 'rgba(255, 107, 107, 0.09)',
  rowDelNum: 'rgba(255, 107, 107, 0.15)',
  rowDelNumText: 'rgba(255, 170, 170, 0.6)',
  num: 'rgba(255, 255, 255, 0.33)',
  numBg: 'rgba(255, 255, 255, 0.02)',
  gap: '#1C1F26',
  olive: '#9CC26A',
  blueDeep: '#8AB4F8',
  blueBright: '#4AA6E0',
  tab: '#3A3A3F',
  lineHeader: '#28292D',
  nav: '#949497',
  ui: '#A9A9AC',
  sub: '#6B6B6F',
  border: 'rgba(244, 244, 245, 0.15)',
  label: 'rgba(244, 244, 245, 0.6)',
  faint: 'rgba(244, 244, 245, 0.45)',
  press: 'rgba(244, 244, 245, 0.05)',
  backdrop: 'rgba(0, 0, 0, 0.6)',
  blackRgb: '244, 244, 245',
};

/** github-light token colors mapped to github-dark (src/lib/diff/token-colors.ts). */
const DARK_TOKEN_COLORS: Record<string, string> = {
  '#24292E': '#E1E4E8',
  '#6A737D': '#6A737D',
  '#005CC5': '#79B8FF',
  '#6F42C1': '#B392F0',
  '#22863A': '#85E89D',
  '#D73A49': '#F97583',
  '#032F62': '#9ECBFF',
  '#E36209': '#FFAB70',
  '#B31D28': '#FDAEB7',
  '#586069': '#D1D5DA',
};

export function tokenColor(color: string, scheme: 'light' | 'dark'): string {
  return scheme === 'dark' ? (DARK_TOKEN_COLORS[color.toUpperCase()] ?? color) : color;
}

export const Fonts = {
  serif: 'Newsreader_400Regular',
  serifMedium: 'Newsreader_500Medium',
  serifItalic: 'Newsreader_400Regular_Italic',
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemiBold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
};

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeValue = { scheme: 'light' | 'dark'; colors: Colors; mode: ThemeMode; setMode: (m: ThemeMode) => void };

const ThemeContext = createContext<ThemeValue | null>(null);
const MODE_KEY = 'omakaze.theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  useEffect(() => {
    getItem(MODE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
    });
  }, []);
  const value = useMemo<ThemeValue>(() => {
    const scheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
    return {
      scheme,
      colors: scheme === 'dark' ? dark : light,
      mode,
      setMode: (m) => {
        setModeState(m);
        void setItem(MODE_KEY, m);
      },
    };
  }, [mode, system]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}

export const isIOS = Platform.OS === 'ios';
