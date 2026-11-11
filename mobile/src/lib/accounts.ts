/**
 * Signed-in accounts. Each is one workspace on one server (OAuth tokens are bound to a workspace),
 * so someone in several workspaces adds each one. Tokens live in the keychain under their own key.
 */
import { AuthError, refresh, type Tokens } from './oauth';
import { getItem, getJson, removeItem, setItem, setJson } from './storage';
import type { Role } from './types';

export type Account = {
  id: string;
  server: string;
  clientId: string;
  workspace: { id: string; slug: string; name: string };
  user: { id: string; name: string; email: string | null; avatarUrl: string | null };
  role: Role;
};

const ACCOUNTS_KEY = 'omakaze.accounts';
const ACTIVE_KEY = 'omakaze.active';
const tokenKey = (id: string) => `omakaze.tokens.${id}`;

export function newAccountId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function loadAccounts(): Promise<{ accounts: Account[]; activeId: string | null }> {
  const accounts = (await getJson<Account[]>(ACCOUNTS_KEY)) ?? [];
  const active = await getItem(ACTIVE_KEY);
  return { accounts, activeId: accounts.some((a) => a.id === active) ? active : (accounts[0]?.id ?? null) };
}

export async function saveAccounts(accounts: Account[], activeId: string | null): Promise<void> {
  await setJson(ACCOUNTS_KEY, accounts);
  if (activeId) await setItem(ACTIVE_KEY, activeId);
  else await removeItem(ACTIVE_KEY);
}

const tokenCache = new Map<string, Tokens>();
const refreshing = new Map<string, Promise<Tokens>>();

export async function saveTokens(id: string, tokens: Tokens): Promise<void> {
  tokenCache.set(id, tokens);
  await setJson(tokenKey(id), tokens);
}

export async function readTokens(id: string): Promise<Tokens | null> {
  const cached = tokenCache.get(id);
  if (cached) return cached;
  const stored = await getJson<Tokens>(tokenKey(id));
  if (stored) tokenCache.set(id, stored);
  return stored;
}

export async function forgetTokens(id: string): Promise<void> {
  tokenCache.delete(id);
  await removeItem(tokenKey(id));
}

/** Thrown when an account's session can't be renewed; the app asks the person to sign in again. */
export class SessionExpiredError extends Error {
  constructor(public accountId: string) {
    super('Your session expired. Sign in again.');
  }
}

/** A valid access token, refreshing it (once at a time per account) when it is about to expire. */
export async function accessToken(account: Account, force = false): Promise<string> {
  const tokens = await readTokens(account.id);
  if (!tokens) throw new SessionExpiredError(account.id);
  if (!force && tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;
  let pending = refreshing.get(account.id);
  if (!pending) {
    pending = refresh(account.server, account.clientId, tokens.refreshToken)
      .then(async (next) => {
        await saveTokens(account.id, next);
        return next;
      })
      .finally(() => refreshing.delete(account.id));
    refreshing.set(account.id, pending);
  }
  try {
    return (await pending).accessToken;
  } catch (err) {
    if (err instanceof AuthError && (err.code === 'invalid_grant' || err.code === 'invalid_client')) throw new SessionExpiredError(account.id);
    throw err;
  }
}
