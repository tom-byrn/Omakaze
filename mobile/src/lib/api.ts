import { accessToken, SessionExpiredError, type Account } from './accounts';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Init = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; query?: Record<string, string | number | boolean | null | undefined>; body?: unknown };

let onExpired: ((accountId: string) => void) | null = null;
/** The session provider listens here to sign an account out when its tokens stop working. */
export function setSessionExpiredHandler(fn: ((accountId: string) => void) | null) {
  onExpired = fn;
}

export function apiUrl(account: Account, path: string, query?: Init['query']): string {
  const url = new URL(path, account.server);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v));
  return url.toString();
}

/** A request to the account's server as the signed-in member. Retries once with a fresh token on 401. */
export async function apiRequest(account: Account, path: string, init: Init = {}): Promise<Response> {
  const send = async (force: boolean) => {
    const token = await accessToken(account, force);
    return fetch(apiUrl(account, path, init.query), {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  };
  try {
    let res = await send(false);
    if (res.status === 401) res = await send(true);
    if (res.status === 401) throw new SessionExpiredError(account.id);
    return res;
  } catch (err) {
    if (err instanceof SessionExpiredError) onExpired?.(account.id);
    if (err instanceof TypeError) throw new ApiError(`Could not reach ${new URL(account.server).host}.`, 0);
    throw err;
  }
}

export async function api<T>(account: Account, path: string, init: Init = {}): Promise<T> {
  const res = await apiRequest(account, path, init);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const message = json && typeof json === 'object' && 'error' in json ? String((json as { error: unknown }).error) : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return json as T;
}

export async function apiText(account: Account, path: string, init: Init = {}): Promise<string> {
  const res = await apiRequest(account, path, init);
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
  return res.text();
}
