/**
 * Signing in: the app is an OAuth 2.1 public client of the user's Omakaze instance (the same server
 * MCP clients use). It registers itself once per server (dynamic client registration), then runs the
 * authorization code flow with PKCE in the system browser. The consent page asks which workspace to
 * use; the tokens act as the user in that workspace.
 */
import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';

import { onServer } from './server-url';

export type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

type Metadata = { authorization_endpoint: string; token_endpoint: string; registration_endpoint: string; revocation_endpoint?: string };
export type Endpoints = { authorize: string; token: string; register: string; revoke: string | null };

export class AuthError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function redirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: 'omakaze', path: 'oauth' });
}

export async function discover(server: string): Promise<Endpoints> {
  let res: Response;
  try {
    res = await fetch(`${server}/.well-known/oauth-authorization-server`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new AuthError(`Could not reach ${server}. Check the address and your connection.`);
  }
  if (!res.ok) throw new AuthError(`${server} doesn't look like an Omakaze server (${res.status}).`);
  const m = (await res.json().catch(() => null)) as Metadata | null;
  if (!m?.authorization_endpoint || !m.token_endpoint || !m.registration_endpoint) {
    throw new AuthError(`${server} doesn't look like an Omakaze server.`);
  }
  return {
    authorize: onServer(m.authorization_endpoint, server),
    token: onServer(m.token_endpoint, server),
    register: onServer(m.registration_endpoint, server),
    revoke: m.revocation_endpoint ? onServer(m.revocation_endpoint, server) : null,
  };
}

/**
 * Register the app as a client of the server. Done on every sign-in rather than cached: a server
 * whose database was reset forgets clients, and its consent page can't send that error back.
 */
async function registerClient(server: string, endpoints: Endpoints, redirect: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(endpoints.register, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_name: `Omakaze for ${Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'web'}`,
        redirect_uris: [redirect],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        software_id: 'omakaze-mobile',
      }),
    });
  } catch {
    throw new AuthError(`Could not reach ${server}.`);
  }
  const json = (await res.json().catch(() => null)) as { client_id?: string; error_description?: string } | null;
  if (!res.ok || !json?.client_id) throw new AuthError(json?.error_description ?? `Could not register the app with ${server}.`);
  return json.client_id;
}

async function tokenRequest(endpoint: string, form: Record<string, string>): Promise<Tokens> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json().catch(() => null)) as
    | { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }
    | null;
  if (!res.ok || !json?.access_token) {
    throw new AuthError(json?.error_description ?? 'Signing in failed.', json?.error);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? '',
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

/** Run the browser sign-in. Resolves to null when the person cancels. */
export async function authorize(server: string): Promise<{ tokens: Tokens; clientId: string } | null> {
  const endpoints = await discover(server);
  const redirect = redirectUri();
  const clientId = await registerClient(server, endpoints, redirect);
  const request = new AuthSession.AuthRequest({ clientId, redirectUri: redirect, scopes: ['mcp'], usePKCE: true });
  // A private browser session: iOS shows no "wants to use … to sign in" alert, and the server's
  // cookies stay out of Safari.
  const result = await request.promptAsync({ authorizationEndpoint: endpoints.authorize }, { preferEphemeralSession: true });
  if (result.type === 'cancel' || result.type === 'dismiss') return null;
  if (result.type !== 'success') {
    const message = result.type === 'error' ? (result.params.error_description ?? result.error?.message) : undefined;
    throw new AuthError(message ?? 'Signing in did not finish.');
  }
  if (result.params.error) throw new AuthError(result.params.error === 'access_denied' ? 'Access was denied.' : (result.params.error_description ?? result.params.error));
  const code = result.params.code;
  if (!code || !request.codeVerifier) throw new AuthError('The server did not return an authorization code.');
  const tokens = await tokenRequest(endpoints.token, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect,
    client_id: clientId,
    code_verifier: request.codeVerifier,
  });
  return { tokens, clientId };
}

export async function refresh(server: string, clientId: string, refreshToken: string): Promise<Tokens> {
  if (!refreshToken) throw new AuthError('Session expired', 'invalid_grant');
  const endpoints = await discover(server);
  return tokenRequest(endpoints.token, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId });
}

export async function revoke(server: string, clientId: string, token: string): Promise<void> {
  try {
    const endpoints = await discover(server);
    if (!endpoints.revoke) return;
    await fetch(endpoints.revoke, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, client_id: clientId }).toString(),
    });
  } catch {
    // Signing out locally still works.
  }
}
