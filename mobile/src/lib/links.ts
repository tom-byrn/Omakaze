import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import type { Account } from './accounts';

export { parseDiffLink, type DiffLink } from './diff-link';

/** A guide page of this server's web app, opened in the app instead. */
export function inAppRoute(account: Account, url: string): string | null {
  let u: URL;
  try {
    u = new URL(url, account.server);
  } catch {
    return null;
  }
  if (u.origin !== new URL(account.server).origin) return null;
  const m = /^\/w\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/.exec(u.pathname);
  if (!m || m[1].toLowerCase() !== account.workspace.slug.toLowerCase()) return null;
  const v = u.searchParams.get('v');
  const section = u.searchParams.get('section');
  const base = `/pr/${m[2]}/${m[3]}/${m[4]}`;
  if (section && Number(section) > 0) return `${base}/section?position=${section}${v ? `&v=${v}` : ''}`;
  return v ? `${base}?v=${v}` : base;
}

export function resolveUrl(account: Account, href: string): string {
  try {
    return new URL(href, account.server).toString();
  } catch {
    return href;
  }
}

export async function openUrl(account: Account | null, href: string): Promise<void> {
  const url = account ? resolveUrl(account, href) : href;
  const route = account ? inAppRoute(account, url) : null;
  if (route) {
    router.push(route as never);
    return;
  }
  if (/^https?:/i.test(url)) {
    await WebBrowser.openBrowserAsync(url);
    return;
  }
  await Linking.openURL(url).catch(() => {});
}
