import { createHash, createPublicKey, randomBytes, randomUUID, verify, type JsonWebKey } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chatgptConnections, instanceSettings } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { MANAGE_USAGE_URL } from "./chatgpt-links";
import { resolveAiConfig, type AiConfig, type WorkspaceAiFields } from "./config";
import type { ModelOption } from "./models";

/*
 * ChatGPT plan usage through Sign in with ChatGPT, OpenAI's supported way for open-source apps to send
 * requests on a user's ChatGPT plan: https://developers.openai.com/siwc/token-sharing-open-source
 * Requests go to the public Responses API with the user's OAuth token. Each Omakaze user connects
 * their own account, and only guides they start use it.
 */

const ISSUER = "https://auth.openai.com";
const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`;
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
const REVOKE_URL = `${ISSUER}/api/accounts/oauth/revoke`;
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const DYNAMIC_CLIENT = "dynamic_agent_client";

/** Plan requests go to the public Responses API, never to ChatGPT's own backend. */
export const CHATGPT_API_URL = "https://api.openai.com/v1";
export const PLAN_SCOPE = "chatgpt.tokens.use.direct";
const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
export { MANAGE_USAGE_URL };
/**
 * Sign in with ChatGPT only redirects to a loopback address. The Omakaze server is usually on another
 * machine, so the browser lands on a page that does not load and the user pastes its address back.
 */
export const CHATGPT_REDIRECT_URI = "http://127.0.0.1:1456/auth/callback";
/** How long a started sign-in can be finished. */
export const SIGN_IN_TTL_MS = 15 * 60 * 1000;

export class ChatgptError extends Error {
  constructor(
    message: string,
    public opts: { retryable?: boolean; reconnect?: boolean; code?: string } = {},
  ) {
    super(message);
    this.name = "ChatgptError";
  }
}

export type ChatgptConnection = typeof chatgptConnections.$inferSelect;

export function chatgptPlansEnabled(): boolean {
  return env().CHATGPT_PLAN_ENABLED;
}

export function grantsPlanUsage(scopes: string | null | undefined): boolean {
  return (scopes ?? "").split(/\s+/).includes(PLAN_SCOPE);
}

/** Connected, allowed to use the plan, and with a model picked. */
export function connectionUsable(conn: ChatgptConnection | null | undefined): conn is ChatgptConnection {
  return Boolean(conn && conn.enabled && conn.refreshTokenEnc && conn.model && grantsPlanUsage(conn.scopes));
}

/* Sign-in ------------------------------------------------------------- */

/** Kept in an encrypted cookie between starting and finishing a sign-in. */
export type PendingSignIn = {
  state: string;
  nonce: string;
  verifier: string;
  /** The issued client ID when signing back in to a registered account; null for a new registration. */
  clientId: string | null;
  createdAt: number;
};

export function newPendingSignIn(clientId: string | null, now = Date.now()): PendingSignIn {
  const rand = () => randomBytes(32).toString("base64url");
  return { state: rand(), nonce: rand(), verifier: rand(), clientId, createdAt: now };
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthorizeUrl(opts: {
  pending: PendingSignIn;
  hostId: string;
  idTokenHint?: string | null;
  loginHint?: string | null;
  /** Ask again for consent, for an account that declined plan usage before. */
  consent?: boolean;
}): string {
  const { pending } = opts;
  const params = new URLSearchParams({ client_id: pending.clientId ?? DYNAMIC_CLIENT });
  if (!pending.clientId) params.set("agent_name_hint", "Omakaze");
  params.set("ext_agent_host_id", opts.hostId);
  if (pending.clientId && opts.idTokenHint) params.set("id_token_hint", opts.idTokenHint);
  if (pending.clientId && opts.loginHint) params.set("login_hint", opts.loginHint);
  params.set("response_type", "code");
  params.set("redirect_uri", CHATGPT_REDIRECT_URI);
  params.set("scope", SCOPES);
  params.set("resource", CHATGPT_API_URL);
  params.set("state", pending.state);
  params.set("nonce", pending.nonce);
  params.set("code_challenge_method", "S256");
  params.set("code_challenge", pkceChallenge(pending.verifier));
  if (opts.consent) params.set("prompt", "consent");
  return `${AUTHORIZE_URL}?${params}`;
}

export type CallbackParams = { code?: string; state?: string; clientId?: string; error?: string; errorDescription?: string };

/** The address the browser was sent to after sign-in, or just its query string. */
export function parseCallback(input: string): CallbackParams | null {
  const text = input.trim();
  if (!text) return null;
  let query: URLSearchParams;
  try {
    query = text.includes("://") ? new URL(text).searchParams : new URLSearchParams(text.replace(/^[^?]*\?/, ""));
  } catch {
    return null;
  }
  const get = (k: string) => query.get(k) ?? undefined;
  const out = {
    code: get("code"),
    state: get("state"),
    clientId: get("client_id"),
    error: get("error"),
    errorDescription: get("error_description"),
  };
  return out.code || out.error ? out : null;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
};

async function postForm(url: string, fields: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
  } catch {
    throw new ChatgptError("Could not reach auth.openai.com.", { retryable: true });
  }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // Not JSON: only the status is used.
  }
  return { status: res.status, body };
}

function oauthErrorCode(body: Record<string, unknown>): string | undefined {
  const e = body.error;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string") return (e as { code: string }).code;
  return undefined;
}

function tokenResponse(status: number, body: Record<string, unknown>, what: string): TokenResponse {
  if (status === 200 && typeof body.access_token === "string") return body as TokenResponse;
  const code = oauthErrorCode(body);
  throw new ChatgptError(`${what} failed${code ? ` (${code})` : ` (HTTP ${status})`}.`, { code, retryable: status >= 500 });
}

export async function exchangeCode(pending: PendingSignIn, code: string, clientId: string): Promise<TokenResponse> {
  const { status, body } = await postForm(TOKEN_URL, {
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: pending.verifier,
    redirect_uri: CHATGPT_REDIRECT_URI,
    resource: CHATGPT_API_URL,
  });
  return tokenResponse(status, body, "Signing in with ChatGPT");
}

/** Errors on refresh after which the token set is unusable and the user has to sign in again. */
const TERMINAL_REFRESH_ERRORS = new Set([
  "invalid_grant",
  "invalid_refresh_token",
  "token_expired",
  "refresh_token_expired",
  "refresh_token_invalidated",
  "refresh_token_reused",
]);

async function refreshTokens(clientId: string, refreshToken: string): Promise<TokenResponse> {
  const { status, body } = await postForm(TOKEN_URL, {
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
    resource: CHATGPT_API_URL,
  });
  try {
    return tokenResponse(status, body, "Refreshing the ChatGPT token");
  } catch (err) {
    if (err instanceof ChatgptError && TERMINAL_REFRESH_ERRORS.has(err.opts.code ?? "")) {
      throw new ChatgptError("Your ChatGPT connection has expired. Sign in again in Account settings.", { reconnect: true, code: err.opts.code });
    }
    throw err;
  }
}

/* ID tokens ------------------------------------------------------------ */

type Jwk = JsonWebKey & { kid?: string };
let jwksCache: { keys: Jwk[]; at: number } | null = null;

async function fetchJwks(force: boolean): Promise<Jwk[]> {
  if (!force && jwksCache && Date.now() - jwksCache.at < 60 * 60 * 1000) return jwksCache.keys;
  try {
    const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(15_000), redirect: "error" });
    const data = (await res.json()) as { keys?: Jwk[] };
    if (!res.ok || !Array.isArray(data.keys)) throw new Error();
    jwksCache = { keys: data.keys, at: Date.now() };
    return data.keys;
  } catch {
    throw new ChatgptError("Could not load OpenAI's signing keys.", { retryable: true });
  }
}

export type IdTokenClaims = { sub: string; email?: string };

/** Verify an RS256 ID token: signature, issuer, audience, expiry and nonce. */
export function verifyIdToken(
  token: string,
  keys: Jwk[],
  expected: { clientId: string; nonce: string; now?: number },
): IdTokenClaims | "unknown-key" {
  const parts = token.split(".");
  if (parts.length !== 3) throw new ChatgptError("The ID token is malformed.");
  const decode = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as Record<string, unknown>;
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = decode(parts[0]);
    claims = decode(parts[1]);
  } catch {
    throw new ChatgptError("The ID token is malformed.");
  }
  if (header.alg !== "RS256") throw new ChatgptError("The ID token uses an unexpected algorithm.");
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return "unknown-key";
  const valid = verify(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey({ key: jwk, format: "jwk" }),
    Buffer.from(parts[2], "base64url"),
  );
  if (!valid) throw new ChatgptError("The ID token signature is invalid.");
  const now = Math.floor((expected.now ?? Date.now()) / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== ISSUER) throw new ChatgptError("The ID token has an unexpected issuer.");
  if (!aud.includes(expected.clientId)) throw new ChatgptError("The ID token was issued for another client.");
  if (typeof claims.exp !== "number" || claims.exp < now - 60) throw new ChatgptError("The ID token has expired.");
  if (claims.nonce !== expected.nonce) throw new ChatgptError("The ID token does not match this sign-in.");
  if (typeof claims.sub !== "string" || !claims.sub) throw new ChatgptError("The ID token has no subject.");
  return { sub: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
}

async function verifyIdTokenOnline(token: string, expected: { clientId: string; nonce: string }): Promise<IdTokenClaims> {
  const first = verifyIdToken(token, await fetchJwks(false), expected);
  if (first !== "unknown-key") return first;
  // Keys rotated since they were cached.
  const second = verifyIdToken(token, await fetchJwks(true), expected);
  if (second === "unknown-key") throw new ChatgptError("The ID token was signed with an unknown key.");
  return second;
}

/* Storage --------------------------------------------------------------- */

const HOST_ID_KEY = "chatgpt_host_id";

/**
 * Sign in with ChatGPT identifies each installation with a stable, opaque host ID. One Omakaze
 * instance is one host, whichever of its users signs in.
 */
export async function chatgptHostId(): Promise<string> {
  await db.insert(instanceSettings).values({ key: HOST_ID_KEY, value: `urn:uuid:${randomUUID()}` }).onConflictDoNothing();
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.key, HOST_ID_KEY)).limit(1);
  return String(row.value);
}

export async function getChatgptConnection(userId: string): Promise<ChatgptConnection | null> {
  const [row] = await db.select().from(chatgptConnections).where(eq(chatgptConnections.userId, userId)).limit(1);
  return row ?? null;
}

/** Start a sign-in: a fresh registration, or the user's existing one. */
export async function startChatgptSignIn(userId: string, opts: { newAccount?: boolean } = {}) {
  const existing = opts.newAccount ? null : await getChatgptConnection(userId);
  const pending = newPendingSignIn(existing?.clientId ?? null);
  const url = buildAuthorizeUrl({
    pending,
    hostId: await chatgptHostId(),
    // After signing out the ID token is gone, so the account picker is shown.
    idTokenHint: existing?.idTokenEnc ? decrypt(existing.idTokenEnc) : null,
    loginHint: existing?.idTokenEnc ? existing.email : null,
    consent: Boolean(existing?.refreshTokenEnc && !grantsPlanUsage(existing.scopes)),
  });
  return { pending, url };
}

function expiresAt(t: TokenResponse): Date {
  return new Date(Date.now() + (t.expires_in ?? 3600) * 1000);
}

/** Finish a sign-in from the pasted callback address. Returns whether this is the account's first connection. */
export async function finishChatgptSignIn(
  userId: string,
  pending: PendingSignIn,
  pasted: string,
): Promise<{ firstTime: boolean; planUsage: boolean }> {
  if (Date.now() - pending.createdAt > SIGN_IN_TTL_MS) throw new ChatgptError("This sign-in has expired. Start again.");
  const cb = parseCallback(pasted);
  if (!cb) throw new ChatgptError("Paste the full address from the browser's address bar. It starts with http://127.0.0.1.");
  if (cb.state !== pending.state) throw new ChatgptError("That address belongs to a different sign-in. Start again.");
  if (cb.error === "access_denied") throw new ChatgptError("Sign-in was cancelled.");
  if (cb.error || !cb.code) throw new ChatgptError(`ChatGPT returned an error: ${cb.errorDescription ?? cb.error ?? "no code"}.`);

  let clientId: string;
  if (pending.clientId) {
    if (cb.clientId && cb.clientId !== pending.clientId) throw new ChatgptError("ChatGPT returned a different client. Start again.");
    clientId = pending.clientId;
  } else {
    if (!cb.clientId || cb.clientId === DYNAMIC_CLIENT) throw new ChatgptError("ChatGPT did not finish registering Omakaze. Start again.");
    clientId = cb.clientId;
  }

  const tokens = await exchangeCode(pending, cb.code, clientId);
  if (!tokens.id_token || !tokens.refresh_token) throw new ChatgptError("ChatGPT did not return the expected tokens.");
  const claims = await verifyIdTokenOnline(tokens.id_token, { clientId, nonce: pending.nonce });
  const scopes = tokens.scope ?? "";

  const existing = await getChatgptConnection(userId);
  if (pending.clientId && existing && existing.subject !== claims.sub) {
    // The registration belongs to the other account: forget it so the next attempt registers this one.
    await db.delete(chatgptConnections).where(eq(chatgptConnections.id, existing.id));
    throw new ChatgptError("You signed in with a different ChatGPT account than before. Start again to connect it.");
  }

  let model = existing?.clientId === clientId ? existing.model : null;
  if (!model && grantsPlanUsage(scopes)) {
    model = (await listChatgptModels(tokens.access_token).catch(() => []))[0]?.id ?? null;
  }
  const values = {
    userId,
    clientId,
    subject: claims.sub,
    email: claims.email ?? null,
    accessTokenEnc: encrypt(tokens.access_token),
    refreshTokenEnc: encrypt(tokens.refresh_token),
    idTokenEnc: encrypt(tokens.id_token),
    accessTokenExpiresAt: expiresAt(tokens),
    scopes,
    model,
  };
  await db
    .insert(chatgptConnections)
    .values(values)
    .onConflictDoUpdate({ target: chatgptConnections.userId, set: values });
  return { firstTime: !existing || existing.clientId !== clientId, planUsage: grantsPlanUsage(scopes) };
}

/** Revoke the refresh token and clear the tokens. The registration is kept for the next sign-in. */
export async function signOutChatgpt(userId: string): Promise<{ revoked: boolean }> {
  const conn = await getChatgptConnection(userId);
  if (!conn) return { revoked: true };
  let revoked = !conn.refreshTokenEnc;
  if (conn.refreshTokenEnc) {
    const fields = { token: decrypt(conn.refreshTokenEnc), token_type_hint: "refresh_token", client_id: conn.clientId };
    for (let attempt = 0; attempt < 3 && !revoked; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      try {
        const { status } = await postForm(REVOKE_URL, fields);
        revoked = status === 200;
        if (status < 500 && !revoked) break;
      } catch {
        // Retried, then reported.
      }
    }
  }
  await db
    .update(chatgptConnections)
    .set({ accessTokenEnc: null, refreshTokenEnc: null, idTokenEnc: null, accessTokenExpiresAt: null })
    .where(eq(chatgptConnections.id, conn.id));
  return { revoked };
}

/** A valid access token, refreshed when it is about to expire. Refreshes are serialized with a row lock. */
export async function chatgptAccessToken(connectionId: string): Promise<string> {
  const soon = () => new Date(Date.now() + 2 * 60 * 1000);
  const [cached] = await db.select().from(chatgptConnections).where(eq(chatgptConnections.id, connectionId)).limit(1);
  if (cached?.accessTokenEnc && cached.accessTokenExpiresAt && cached.accessTokenExpiresAt > soon()) {
    return decrypt(cached.accessTokenEnc);
  }
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(chatgptConnections).where(eq(chatgptConnections.id, connectionId)).for("update").limit(1);
    if (!row?.refreshTokenEnc) return { error: new ChatgptError("ChatGPT is not connected. Sign in again in Account settings.", { reconnect: true }) };
    // Another process refreshed while this one waited for the lock.
    if (row.accessTokenEnc && row.accessTokenExpiresAt && row.accessTokenExpiresAt > soon()) return { token: decrypt(row.accessTokenEnc) };
    try {
      const t = await refreshTokens(row.clientId, decrypt(row.refreshTokenEnc));
      // Access token, expiry, scopes and the rotated refresh token are replaced together.
      await tx
        .update(chatgptConnections)
        .set({
          accessTokenEnc: encrypt(t.access_token),
          refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : row.refreshTokenEnc,
          accessTokenExpiresAt: expiresAt(t),
          ...(t.scope ? { scopes: t.scope } : {}),
        })
        .where(eq(chatgptConnections.id, row.id));
      return { token: t.access_token };
    } catch (err) {
      if (err instanceof ChatgptError && err.opts.reconnect) {
        await tx
          .update(chatgptConnections)
          .set({ accessTokenEnc: null, refreshTokenEnc: null, accessTokenExpiresAt: null })
          .where(eq(chatgptConnections.id, row.id));
        return { error: err };
      }
      throw err;
    }
  });
  if ("error" in result) throw result.error;
  return result.token;
}

/* Models and requests ----------------------------------------------------- */

/** `GET /v1/models` for a plan token: entries with `visibility: "list"`, in the server's order. */
export function parseChatgptModels(data: unknown): ModelOption[] {
  const models = (data as { models?: unknown })?.models;
  if (!Array.isArray(models)) return [];
  const out: ModelOption[] = [];
  for (const m of models as { slug?: unknown; display_name?: unknown; visibility?: unknown }[]) {
    if (typeof m?.slug !== "string" || !m.slug || m.visibility !== "list") continue;
    out.push({ id: m.slug, label: typeof m.display_name === "string" && m.display_name !== m.slug ? m.display_name : undefined });
  }
  return out;
}

export async function listChatgptModels(accessToken: string): Promise<ModelOption[]> {
  let res: Response;
  try {
    res = await fetch(`${CHATGPT_API_URL}/models`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
  } catch {
    throw new ChatgptError("Could not reach api.openai.com.", { retryable: true });
  }
  if (!res.ok) throw new ChatgptError(`Could not load your ChatGPT models (HTTP ${res.status}).`);
  return parseChatgptModels(await res.json().catch(() => null));
}

/** Fields that plan requests reject (see the Sign in with ChatGPT preview limitations). */
const UNSUPPORTED_FIELDS = [
  "background",
  "conversation",
  "max_output_tokens",
  "max_tool_calls",
  "metadata",
  "moderation",
  "multi_agent",
  "previous_response_id",
  "prompt",
  "prompt_cache_retention",
  "safety_identifier",
  "temperature",
  "top_logprobs",
  "top_p",
  "truncation",
  "user",
];

/** Make a Responses API body acceptable for plan usage: not stored, streamed, no unsupported fields. */
export function planRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body, store: false, stream: true };
  for (const f of UNSUPPORTED_FIELDS) delete out[f];
  return out;
}

/** `fetch` for the AI SDK that signs requests with a fresh token for the connection. */
export function chatgptFetch(connectionId: string): typeof fetch {
  return async (input, init) => {
    const token = await chatgptAccessToken(connectionId);
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body = init?.body;
    if (typeof body === "string" && new URL(url).pathname.endsWith("/responses")) {
      body = JSON.stringify(planRequestBody(JSON.parse(body) as Record<string, unknown>));
    }
    return fetch(input, { ...init, headers, body });
  };
}

/* Configuration ------------------------------------------------------------ */

type WorkspaceWithPlans = WorkspaceAiFields & { allowChatgptPlans: boolean };

export function chatgptAiConfig(conn: ChatgptConnection, ws: WorkspaceAiFields): AiConfig {
  return {
    provider: "chatgpt",
    model: conn.model!,
    apiKey: null,
    baseUrl: CHATGPT_API_URL,
    instructions: ws.aiInstructions,
    source: "chatgpt",
    chatgptConnectionId: conn.id,
  };
}

/** The user's own ChatGPT plan, if they turned it on and the workspace allows it. */
export async function chatgptConfigFor(ws: WorkspaceWithPlans, userId: string | null | undefined): Promise<AiConfig | null> {
  if (!userId || !ws.allowChatgptPlans || !chatgptPlansEnabled()) return null;
  const conn = await getChatgptConnection(userId);
  return connectionUsable(conn) ? chatgptAiConfig(conn, ws) : null;
}

/**
 * The configuration for a guide started by `userId`: their ChatGPT plan when it applies, otherwise the
 * workspace or instance provider. Automated runs have no user and never use someone's plan.
 */
export async function resolveAiConfigFor(ws: WorkspaceWithPlans, userId: string | null | undefined): Promise<AiConfig | null> {
  return (await chatgptConfigFor(ws, userId)) ?? resolveAiConfig(ws);
}
