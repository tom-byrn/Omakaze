import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { normalizeServer } from '@/lib/server-url';
import { useSession } from '@/lib/session';
import { getItem, setItem } from '@/lib/storage';
import { Fonts, useTheme } from '@/lib/theme';
import { Button, T, alpha } from './ui';

const LAST_SERVER = 'omakaze.lastServer';

/** Server address + browser sign-in (web AuthForms). Used for the first account and for adding more. */
export function SignInForm({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const { colors } = useTheme();
  const { signIn } = useSession();
  const [server, setServer] = useState('');
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getItem(LAST_SERVER).then((v) => {
      const fallback = (Constants.expoConfig?.extra as { defaultServer?: string | null } | undefined)?.defaultServer;
      setServer((cur) => cur || v || fallback || '');
    });
  }, []);

  const submit = async () => {
    const origin = normalizeServer(server);
    if (!origin) {
      setError('Enter the address of your Omakaze server, like omakaze.example.com.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const account = await signIn(origin);
      if (account) {
        await setItem(LAST_SERVER, origin);
        onDone?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      {error ? (
        <View accessibilityRole="alert" style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.danger, 0.4), backgroundColor: alpha(colors.danger, 0.04), paddingHorizontal: 12, paddingVertical: 8 }}>
          <T variant="small" color={colors.danger}>
            {error}
          </T>
        </View>
      ) : null}
      <View style={{ gap: 6 }}>
        <T variant="label">Server</T>
        <TextInput
          value={server}
          onChangeText={setServer}
          placeholder="omakaze.example.com"
          placeholderTextColor={colors.sub}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
          returnKeyType="go"
          onSubmitEditing={submit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!busy}
          style={{ height: 44, borderWidth: 1, borderColor: focused ? colors.ink : `rgba(${colors.blackRgb}, 0.19)`, backgroundColor: colors.surface, paddingHorizontal: 12, fontFamily: Fonts.sans, fontSize: 15, color: colors.fg }}
        />
      </View>
      <Button title="Continue in browser" kind="primary" size="lg" iconRight="ArrowRightLine" onPress={submit} loading={busy} />
      <T variant="small" style={{ fontSize: compact ? 13 : 13.5, lineHeight: 20 }}>
        You sign in on your Omakaze server and choose a workspace. You can revoke the app&apos;s access later in Settings → API tokens &amp; MCP.
      </T>
    </View>
  );
}
