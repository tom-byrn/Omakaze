import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { Newsreader_400Regular, Newsreader_400Regular_Italic, Newsreader_500Medium, useFonts } from '@expo-google-fonts/newsreader';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { OverlayProvider } from '@/components/Overlays';
import { ApiError } from '@/lib/api';
import { PushRouter } from '@/lib/push-router';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeProvider, useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

// Refetch when the app comes back to the foreground.
AppState.addEventListener('change', (s) => {
  if (Platform.OS !== 'web') focusManager.setFocused(s === 'active');
});
onlineManager.setOnline(true);

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
          },
        },
      }),
  );
  const [fontsLoaded, fontError] = useFonts({
    Newsreader_400Regular,
    Newsreader_500Medium,
    Newsreader_400Regular_Italic,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <OverlayProvider>
          <SessionProvider>{fontsLoaded || fontError ? <Navigator /> : null}</SessionProvider>
        </OverlayProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function Navigator() {
  const { ready, account } = useSession();
  const { scheme, colors } = useTheme();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: colors.paper, card: colors.paper, text: colors.ink, border: colors.line, primary: colors.ink } };
  // Sheets are drawn by the screen (components/Chrome Sheet) over a transparent modal: no system sheet.
  const sheet = { presentation: 'transparentModal' as const, animation: 'fade' as const, contentStyle: { backgroundColor: 'transparent' } };
  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {account ? <PushRouter /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="oauth" />
        <Stack.Protected guard={Boolean(account)}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="pr/[owner]/[repo]/[number]/index" />
          <Stack.Screen name="pr/[owner]/[repo]/[number]/section" />
          <Stack.Screen name="pr/[owner]/[repo]/[number]/files" />
          <Stack.Screen name="pr/[owner]/[repo]/[number]/file" />
          <Stack.Screen name="pr/[owner]/[repo]/[number]/comment" options={sheet} />
          <Stack.Screen name="pr/[owner]/[repo]/[number]/review" options={sheet} />
          <Stack.Screen name="pr/[owner]/[repo]/[number]/share" options={sheet} />
          <Stack.Screen name="add-account" options={sheet} />
        </Stack.Protected>
        <Stack.Protected guard={!account}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </NavThemeProvider>
  );
}
