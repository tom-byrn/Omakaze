import { Redirect } from 'expo-router';

/**
 * The sign-in redirect (omakaze://oauth). The browser session normally captures it, but if the
 * system opens the app with it instead, land on the start screen.
 */
export default function OAuthRedirect() {
  return <Redirect href="/" />;
}
