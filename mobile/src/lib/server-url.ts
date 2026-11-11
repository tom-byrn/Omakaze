/** Normalize what someone types as their Omakaze address into an origin (scheme + host + port). */
export function normalizeServer(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    // Plain hosts default to https, except local development addresses.
    const host = s.split('/')[0].split(':')[0];
    const local = host === 'localhost' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.endsWith('.local');
    s = `${local ? 'http' : 'https'}://${s}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Move an endpoint the server advertised onto the origin the app talks to (APP_URL may name another host). */
export function onServer(endpoint: string, server: string): string {
  const u = new URL(endpoint);
  return `${server}${u.pathname}${u.search}`;
}
