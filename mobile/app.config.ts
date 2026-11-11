import type { ExpoConfig } from 'expo/config';

/**
 * App config. Self-hosters building their own copy set these when building:
 *   OMAKAZE_IOS_BUNDLE_ID / OMAKAZE_ANDROID_PACKAGE  app identifiers
 *   EAS_PROJECT_ID                                     Expo project ID, needed for push notifications
 *   OMAKAZE_DEFAULT_SERVER                             server URL pre-filled on the sign-in screen
 */
const projectId = process.env.EAS_PROJECT_ID;

const config: ExpoConfig = {
  name: 'Omakaze',
  slug: 'omakaze',
  version: '0.1.0',
  orientation: 'default',
  icon: './assets/images/icon.png',
  scheme: 'omakaze',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: process.env.OMAKAZE_IOS_BUNDLE_ID ?? 'dev.omakaze.app',
    supportsTablet: true,
    infoPlist: {
      // Self-hosted instances on the local network (http://192.168.x.x:3000) during development.
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: process.env.OMAKAZE_ANDROID_PACKAGE ?? 'dev.omakaze.app',
    adaptiveIcon: {
      backgroundColor: '#FCFCFC',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    ['expo-notifications', { color: '#141518' }],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: './assets/images/splash-icon.png',
        imageWidth: 160,
        dark: { backgroundColor: '#101113' },
      },
    ],
  ],
  experiments: {
    reactCompiler: true,
  },
  extra: {
    defaultServer: process.env.OMAKAZE_DEFAULT_SERVER ?? null,
    ...(projectId ? { eas: { projectId } } : {}),
  },
};

export default config;
