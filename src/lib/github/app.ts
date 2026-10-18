import { createSign } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instanceSettings } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { gh, type GhUser } from "./client";

export type GitHubAppConfig = {
  appId: string;
  slug: string;
  privateKey: string;
  webhookSecret: string | null;
  clientId: string | null;
  clientSecret: string | null;
  htmlUrl?: string | null;
  source: "env" | "manifest";
};

type StoredApp = {
  appId: string;
  slug: string;
  privateKeyEnc: string;
  webhookSecretEnc: string | null;
  clientId: string | null;
  clientSecretEnc: string | null;
  htmlUrl: string | null;
};

const APP_KEY = "github_app";
let appCache: { value: GitHubAppConfig | null; at: number } | null = null;

function normalizePem(pem: string): string {
  let key = pem.trim();
  if (!key.includes("\n") && key.includes("\\n")) key = key.replace(/\\n/g, "\n");
  if (!key.startsWith("-----BEGIN")) {
    // allow base64-encoded PEM
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.startsWith("-----BEGIN")) key = decoded;
    } catch {
      // ignore
    }
  }
  return key;
}

/** GitHub App configuration from environment variables or the setup page (manifest flow). */
export async function getGitHubApp(): Promise<GitHubAppConfig | null> {
  const e = env();
  if (e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY) {
    return {
      appId: e.GITHUB_APP_ID,
      slug: e.GITHUB_APP_SLUG ?? "",
      privateKey: normalizePem(e.GITHUB_APP_PRIVATE_KEY),
      webhookSecret: e.GITHUB_APP_WEBHOOK_SECRET ?? null,
      clientId: e.GITHUB_CLIENT_ID ?? null,
      clientSecret: e.GITHUB_CLIENT_SECRET ?? null,
      source: "env",
    };
  }
  if (appCache && Date.now() - appCache.at < 30_000) return appCache.value;
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.key, APP_KEY)).limit(1);
  let value: GitHubAppConfig | null = null;
  if (row) {
    const s = row.value as StoredApp;
    value = {
      appId: s.appId,
      slug: s.slug,
      privateKey: decrypt(s.privateKeyEnc),
      webhookSecret: s.webhookSecretEnc ? decrypt(s.webhookSecretEnc) : null,
      clientId: s.clientId,
      clientSecret: s.clientSecretEnc ? decrypt(s.clientSecretEnc) : null,
      htmlUrl: s.htmlUrl,
      source: "manifest",
    };
  }
  appCache = { value, at: Date.now() };
  return value;
}

export async function saveGitHubApp(app: {
  id: number;
  slug: string;
  pem: string;
  webhook_secret: string | null;
  client_id: string;
  client_secret: string;
  html_url: string;
}): Promise<void> {
  const value: StoredApp = {
    appId: String(app.id),
    slug: app.slug,
    privateKeyEnc: encrypt(app.pem),
    webhookSecretEnc: app.webhook_secret ? encrypt(app.webhook_secret) : null,
    clientId: app.client_id,
    clientSecretEnc: encrypt(app.client_secret),
    htmlUrl: app.html_url,
  };
  await db
    .insert(instanceSettings)
    .values({ key: APP_KEY, value })
    .onConflictDoUpdate({ target: instanceSettings.key, set: { value } });
  appCache = null;
}

export async function deleteStoredGitHubApp(): Promise<void> {
  await db.delete(instanceSettings).where(eq(instanceSettings.key, APP_KEY));
  appCache = null;
}

/** OAuth client used for "Sign in with GitHub" (GitHub App or OAuth App credentials). */
export async function getOAuthClient(): Promise<{ clientId: string; clientSecret: string; isApp: boolean } | null> {
  const e = env();
  if (e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET) {
    return { clientId: e.GITHUB_CLIENT_ID, clientSecret: e.GITHUB_CLIENT_SECRET, isApp: Boolean(e.GITHUB_APP_ID) };
  }
  const app = await getGitHubApp();
  if (app?.clientId && app.clientSecret) return { clientId: app.clientId, clientSecret: app.clientSecret, isApp: true };
  return null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Short-lived JWT for authenticating as the GitHub App. */
export function appJwt(app: GitHubAppConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: app.appId }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(app.privateKey).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

const installationTokens = new Map<number, { token: string; expiresAt: number }>();

export async function getInstallationToken(installationId: number): Promise<string> {
  const cached = installationTokens.get(installationId);
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
  const app = await getGitHubApp();
  if (!app) throw new Error("GitHub App is not configured");
  const res = await gh<{ token: string; expires_at: string }>(appJwt(app), `/app/installations/${installationId}/access_tokens`, {
    method: "POST",
  });
  installationTokens.set(installationId, { token: res.token, expiresAt: new Date(res.expires_at).getTime() });
  return res.token;
}

export type GhInstallation = {
  id: number;
  account: GhUser & { type: "Organization" | "User" };
  repository_selection: "all" | "selected";
  html_url: string;
  suspended_at: string | null;
};

export async function getInstallation(installationId: number): Promise<GhInstallation> {
  const app = await getGitHubApp();
  if (!app) throw new Error("GitHub App is not configured");
  return gh<GhInstallation>(appJwt(app), `/app/installations/${installationId}`);
}

/**
 * Permissions the app has on GitHub and where to change them, or null when GitHub can't be asked.
 * Used to point out permissions that older apps were created without.
 */
export async function getAppGrant(app: GitHubAppConfig): Promise<{ permissions: Record<string, string>; settingsUrl: string } | null> {
  try {
    const info = await gh<{ slug: string; permissions: Record<string, string>; owner?: { login: string; type: string } }>(
      appJwt(app),
      "/app",
    );
    const base = env().GITHUB_URL;
    const settingsUrl =
      info.owner?.type === "Organization"
        ? `${base}/organizations/${info.owner.login}/settings/apps/${info.slug}/permissions`
        : `${base}/settings/apps/${info.slug}/permissions`;
    return { permissions: info.permissions ?? {}, settingsUrl };
  } catch {
    return null;
  }
}

export function installUrl(app: GitHubAppConfig, state: string): string {
  const base = app.htmlUrl ?? `${env().GITHUB_URL}/apps/${app.slug}`;
  return `${base}/installations/new?state=${encodeURIComponent(state)}`;
}

/** Manifest used by the setup page to create a GitHub App in one step. */
export function buildAppManifest(name: string) {
  const url = env().APP_URL;
  return {
    name,
    url,
    hook_attributes: { url: `${url}/api/github/webhook`, active: true },
    redirect_url: `${url}/api/github/manifest`,
    callback_urls: [`${url}/api/auth/github/callback`],
    setup_url: `${url}/api/github/setup`,
    setup_on_update: true,
    description: "Guided walkthroughs for pull requests.",
    public: false,
    request_oauth_on_install: false,
    default_permissions: {
      contents: "read",
      metadata: "read",
      pull_requests: "write",
      issues: "write",
      // Lets "Sign in with GitHub" read the user's verified email address.
      email_addresses: "read",
    },
    default_events: ["pull_request", "pull_request_review", "pull_request_review_comment"],
  };
}
