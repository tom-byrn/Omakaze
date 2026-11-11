import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BAR_HEIGHT } from '@/components/Chrome';
import { SignInForm } from '@/components/SignInForm';
import { Eyebrow, LogoMark, Rule, T } from '@/components/ui';
import { Fonts, useTheme } from '@/lib/theme';

/** The web sign-in page: logo header over a dashed rule, then the form. */
export default function SignIn() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ paddingTop: insets.top }}>
        <View style={{ height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20 }}>
          <LogoMark size={26} />
          <Text style={{ fontFamily: Fonts.serif, fontSize: 19, letterSpacing: -0.38, color: colors.heading }}>Omakaze</Text>
        </View>
        <Rule color={colors.lineHeader} />
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Eyebrow>Sign in</Eyebrow>
        <Text style={{ marginTop: 22, fontFamily: Fonts.serif, fontSize: 36, lineHeight: 38, letterSpacing: -1.44, color: colors.heading }}>Guided reviews, in your pocket.</Text>
        <T variant="body" style={{ marginTop: 12, fontSize: 16, lineHeight: 24, color: colors.body }}>
          Read pull requests section by section, mark what you reviewed, comment and approve. Connect to your team&apos;s Omakaze server to start.
        </T>
        <View style={{ marginTop: 32 }}>
          <SignInForm />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
