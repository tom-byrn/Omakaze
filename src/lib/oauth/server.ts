import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, oauthClients, oauthCodes, oauthRefreshTokens } from "@/db/schema";
import { safeEqual, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { newToken } from "@/lib/ids";

export const ACCESS_TOKEN_TTL = 7 * 24 * 3600; // seconds
const REFRESH_TOKEN_TTL = 90 * 24 * 3600;
const CODE_TTL = 5 * 60;

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function issuer(): string {
  return env().APP_URL;
}

export function mcpResource(): string {
  return `${env().APP_URL}/api/mcp`;
}

export function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["mcp"],
    service_documentation: "https://github.com/tom-byrn/guided-prs/blob/main/docs/mcp.md",
  };
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
    resource_name: "Guided PRs",
    resource_documentation: "https://github.com/tom-byrn/guided-prs/blob/main/docs/mcp.md",
  };
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

function validRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (["javascript:", "data:", "file:", "vbscript:"].includes(u.protocol)) return false;
    if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    return !u.hash;
  } catch {
    return false;
  }
}

export async function registerClient(meta: Record<string, unknown>) {
  const redirectUris = Array.isArray(meta.redirect_uris) ? meta.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (redirectUris.length === 0) throw new OAuthError("invalid_redirect_uri", "redirect_uris is required");
  const bad = redirectUris.find((u) => !validRedirectUri(u));
  if (bad) throw new OAuthError("invalid_redirect_uri", `Redirect URI not allowed: ${bad}`);
  const authMethod = typeof meta.token_endpoint_auth_method === "string" ? meta.token_endpoint_auth_method : "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(authMethod)) {
    throw new OAuthError("invalid_client_metadata", "Unsupported token_endpoint_auth_method");
  }
  const clientId = newToken("gpc", 16);
  const secret = authMethod === "none" ? null : randomBytes(32).toString("base64url");
  const name = typeof meta.client_name === "string" && meta.client_name.trim() ? meta.client_name.trim().slice(0, 100) : "MCP client";
  await db.insert(oauthClients).values({
    id: clientId,
    name,
    redirectUris,
    clientSecretHash: secret ? sha256(secret) : null,
    metadata: {
      client_uri: typeof meta.client_uri === "string" ? meta.client_uri : undefined,
      software_id: typeof meta.software_id === "string" ? meta.software_id : undefined,
      token_endpoint_auth_method: authMethod,
    },
  });
  return {
    client_id: clientId,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: authMethod,
  };
}

export async function getClient(clientId: string) {
  const [c] = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);
  return c ?? null;
}

export type AuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string | null;
  resource: string | null;
};

/** Validate an /oauth/authorize request. Errors before the redirect URI is trusted must not redirect. */
export async function validateAuthorizeRequest(params: URLSearchParams): Promise<{ req: AuthorizeRequest; clientName: string }> {
  const clientId = params.get("client_id") ?? "";
  const client = clientId ? await getClient(clientId) : null;
  if (!client) throw new OAuthError("invalid_client", "Unknown client. Re-add the MCP server in your agent.");
  const redirectUri = params.get("redirect_uri") ?? client.redirectUris[0];
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    throw new OAuthError("invalid_request", "redirect_uri does not match the registered client.");
  }
  if (params.get("response_type") !== "code") throw new OAuthError("unsupported_response_type", "Only response_type=code is supported.");
  const codeChallenge = params.get("code_challenge") ?? "";
  if (!codeChallenge || (params.get("code_challenge_method") ?? "S256") !== "S256") {
    throw new OAuthError("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  return {
    req: {
      clientId,
      redirectUri,
      state: params.get("state"),
      codeChallenge,
      scope: params.get("scope"),
      resource: params.get("resource"),
    },
    clientName: client.name,
  };
}

export async function createAuthorizationCode(req: AuthorizeRequest, userId: string, workspaceId: string): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await db.insert(oauthCodes).values({
    codeHash: sha256(code),
    clientId: req.clientId,
    userId,
    workspaceId,
    redirectUri: req.redirectUri,
    codeChallenge: req.codeChallenge,
    scope: req.scope,
    resource: req.resource,
    expiresAt: new Date(Date.now() + CODE_TTL * 1000),
  });
  return code;
}

function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function authenticateClient(clientId: string, secret: string | null) {
  const client = await getClient(clientId);
  if (!client) throw new OAuthError("invalid_client", "Unknown client", 401);
  if (client.clientSecretHash) {
    if (!secret || !safeEqual(sha256(secret), client.clientSecretHash)) throw new OAuthError("invalid_client", "Client authentication failed", 401);
  }
  return client;
}

async function issueTokens(input: { clientId: string; clientName: string; userId: string; workspaceId: string; scope: string | null }) {
  const access = newToken("gpo");
  const refresh = newToken("gpr_refresh");
  const [tok] = await db
    .insert(apiTokens)
    .values({
      userId: input.userId,
      workspaceId: input.workspaceId,
      name: input.clientName,
      kind: "oauth",
      oauthClientId: input.clientId,
      tokenHash: sha256(access),
      tokenPrefix: access.slice(0, 12),
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL * 1000),
    })
    .returning();
  await db.insert(oauthRefreshTokens).values({
    tokenHash: sha256(refresh),
    clientId: input.clientId,
    userId: input.userId,
    workspaceId: input.workspaceId,
    accessTokenId: tok.id,
    scope: input.scope,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000),
  });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refresh,
    scope: input.scope ?? "mcp",
  };
}

export async function exchangeToken(form: URLSearchParams, basicAuth: { id: string; secret: string } | null) {
  const grant = form.get("grant_type");
  const clientId = basicAuth?.id ?? form.get("client_id") ?? "";
  const secret = basicAuth?.secret ?? form.get("client_secret");
  const client = await authenticateClient(clientId, secret);

  if (grant === "authorization_code") {
    const code = form.get("code") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    const [row] = await db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, sha256(code))).limit(1);
    if (!row || row.clientId !== client.id) throw new OAuthError("invalid_grant", "Invalid authorization code");
    if (row.usedAt) throw new OAuthError("invalid_grant", "Authorization code already used");
    if (row.expiresAt < new Date()) throw new OAuthError("invalid_grant", "Authorization code expired");
    const redirectUri = form.get("redirect_uri");
    if (redirectUri && redirectUri !== row.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri mismatch");
    if (!verifier || s256(verifier) !== row.codeChallenge) throw new OAuthError("invalid_grant", "PKCE verification failed");
    const used = await db
      .update(oauthCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(oauthCodes.codeHash, row.codeHash), isNull(oauthCodes.usedAt)))
      .returning();
    if (used.length === 0) throw new OAuthError("invalid_grant", "Authorization code already used");
    return issueTokens({ clientId: client.id, clientName: client.name, userId: row.userId, workspaceId: row.workspaceId, scope: row.scope });
  }

  if (grant === "refresh_token") {
    const refresh = form.get("refresh_token") ?? "";
    const [row] = await db.select().from(oauthRefreshTokens).where(eq(oauthRefreshTokens.tokenHash, sha256(refresh))).limit(1);
    if (!row || row.clientId !== client.id || row.revokedAt || row.expiresAt < new Date()) {
      throw new OAuthError("invalid_grant", "Invalid refresh token");
    }
    await db.update(oauthRefreshTokens).set({ revokedAt: new Date() }).where(eq(oauthRefreshTokens.tokenHash, row.tokenHash));
    if (row.accessTokenId) await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, row.accessTokenId));
    return issueTokens({ clientId: client.id, clientName: client.name, userId: row.userId, workspaceId: row.workspaceId, scope: row.scope });
  }

  throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token");
}

export async function revokeToken(token: string): Promise<void> {
  const hash = sha256(token);
  await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.tokenHash, hash));
  const [r] = await db.select().from(oauthRefreshTokens).where(eq(oauthRefreshTokens.tokenHash, hash)).limit(1);
  if (r) {
    await db.update(oauthRefreshTokens).set({ revokedAt: new Date() }).where(eq(oauthRefreshTokens.tokenHash, hash));
    if (r.accessTokenId) await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, r.accessTokenId));
  }
}

export function parseBasicAuth(header: string | null): { id: string; secret: string } | null {
  if (!header?.toLowerCase().startsWith("basic ")) return null;
  try {
    const [id, secret] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
    return id ? { id: decodeURIComponent(id), secret: decodeURIComponent(secret ?? "") } : null;
  } catch {
    return null;
  }
}

export async function readForm(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await req.json()) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await req.text());
}
