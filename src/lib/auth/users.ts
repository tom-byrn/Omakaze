import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { githubAccounts, users } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { gh, GitHubError, type GhUser } from "@/lib/github/client";
import { getOAuthClient } from "@/lib/github/app";
import { createWorkspace, listUserWorkspaces } from "@/lib/workspaces";
import { logActivity } from "@/lib/activity";

export type User = typeof users.$inferSelect;

export class AuthError extends Error {}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomainAllowed(email: string): boolean {
  const allowed = env().AUTH_ALLOWED_EMAIL_DOMAINS;
  if (!allowed) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return allowed
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .includes(domain ?? "");
}

/** Sign-ups are allowed when enabled, when the caller holds an invite, or for the very first user. */
export async function canCreateAccount(hasInvite = false): Promise<boolean> {
  if (env().AUTH_SIGNUP_ENABLED || hasInvite) return true;
  const [{ n }] = await db.select({ n: count() }).from(users);
  return n === 0;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const [u] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizeEmail(email)}`)
    .limit(1);
  return u ?? null;
}

/** Create a user. The first user of an instance becomes the instance admin. */
export async function createUser(input: {
  name: string;
  email?: string | null;
  /** The address is known to belong to the user (e.g. a verified GitHub email). */
  emailVerified?: boolean;
  avatarUrl?: string | null;
  passwordHash?: string | null;
}): Promise<User> {
  const [{ n }] = await db.select({ n: count() }).from(users);
  const [user] = await db
    .insert(users)
    .values({
      name: input.name.trim().slice(0, 100) || "User",
      email: input.email ? normalizeEmail(input.email) : null,
      emailVerifiedAt: input.email && input.emailVerified ? new Date() : null,
      avatarUrl: input.avatarUrl ?? null,
      passwordHash: input.passwordHash ?? null,
      isInstanceAdmin: n === 0,
    })
    .returning();
  return user;
}

/** Give a user with no workspaces a personal one. */
export async function ensurePersonalWorkspace(user: User, preferredSlug?: string): Promise<void> {
  const existing = await listUserWorkspaces(user.id);
  if (existing.length > 0) return;
  const ws = await createWorkspace({ name: preferredSlug ?? user.name, slug: preferredSlug ?? user.name, userId: user.id });
  await logActivity({ workspaceId: ws.id, type: "workspace.created", actorUserId: user.id, data: { name: ws.name } });
}

type TokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null;
  refreshTokenExpiresIn?: number | null;
  scopes?: string | null;
  tokenType: "oauth" | "pat";
};

/**
 * Verified email addresses of a GitHub user, primary first. GitHub only allows a verified address
 * as the public profile email, so that one counts too when /user/emails isn't readable.
 */
async function fetchVerifiedEmails(token: string, ghUser: GhUser): Promise<string[]> {
  const out: string[] = [];
  try {
    const emails = await gh<{ email: string; primary: boolean; verified: boolean }[]>(token, "/user/emails");
    for (const e of [...emails].sort((a, b) => Number(b.primary) - Number(a.primary))) {
      if (e.verified) out.push(normalizeEmail(e.email));
    }
  } catch {
    // The token may not be allowed to read email addresses.
  }
  if (ghUser.email && !out.includes(normalizeEmail(ghUser.email))) out.push(normalizeEmail(ghUser.email));
  return out;
}

/** Mark the user's email as verified when it is one of their verified GitHub addresses. */
async function verifyEmailFromGitHub(user: User, token: string, ghUser: GhUser): Promise<User> {
  if (!user.email || user.emailVerifiedAt) return user;
  const verified = await fetchVerifiedEmails(token, ghUser);
  if (!verified.includes(normalizeEmail(user.email))) return user;
  const [updated] = await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id)).returning();
  return updated;
}

/**
 * Sign in (or link) a GitHub identity.
 * - If `linkToUserId` is set, the GitHub account is attached to that user.
 * - Otherwise the user owning this GitHub id is returned, or a new user is created.
 */
export async function upsertGitHubIdentity(
  ghUser: GhUser,
  tokens: TokenSet,
  opts: { linkToUserId?: string | null; allowCreate?: boolean } = {},
): Promise<{ user: User; created: boolean }> {
  const linkToUserId = opts.linkToUserId ?? null;
  const now = Date.now();
  const values = {
    githubId: ghUser.id,
    login: ghUser.login,
    avatarUrl: ghUser.avatar_url,
    tokenType: tokens.tokenType,
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    accessTokenExpiresAt: tokens.expiresIn ? new Date(now + tokens.expiresIn * 1000) : null,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresIn ? new Date(now + tokens.refreshTokenExpiresIn * 1000) : null,
    scopes: tokens.scopes ?? null,
  };

  const [existing] = await db.select().from(githubAccounts).where(eq(githubAccounts.githubId, ghUser.id)).limit(1);

  if (linkToUserId) {
    if (existing && existing.userId !== linkToUserId) {
      throw new AuthError(`GitHub account @${ghUser.login} is already linked to another user.`);
    }
    await db
      .insert(githubAccounts)
      .values({ ...values, userId: linkToUserId })
      .onConflictDoUpdate({ target: githubAccounts.userId, set: values });
    const [user] = await db.select().from(users).where(eq(users.id, linkToUserId)).limit(1);
    if (!user.avatarUrl) await db.update(users).set({ avatarUrl: ghUser.avatar_url }).where(eq(users.id, user.id));
    return { user: await verifyEmailFromGitHub(user, tokens.accessToken, ghUser), created: false };
  }

  if (existing) {
    await db.update(githubAccounts).set(values).where(eq(githubAccounts.id, existing.id));
    const [user] = await db.select().from(users).where(eq(users.id, existing.userId)).limit(1);
    await db
      .update(users)
      .set({ avatarUrl: ghUser.avatar_url, name: user.name || ghUser.name || ghUser.login })
      .where(eq(users.id, user.id));
    return { user: await verifyEmailFromGitHub({ ...user, avatarUrl: ghUser.avatar_url }, tokens.accessToken, ghUser), created: false };
  }

  if (!(await canCreateAccount(opts.allowCreate))) {
    throw new AuthError("Sign-ups are disabled on this instance. Ask an admin for an invite link.");
  }

  const verified = await fetchVerifiedEmails(tokens.accessToken, ghUser);
  // Without an invite, an email domain restriction applies to GitHub sign-ups too.
  if (env().AUTH_ALLOWED_EMAIL_DOMAINS && !opts.allowCreate && !verified.some(emailDomainAllowed)) {
    throw new AuthError(
      "Sign-up is limited to certain email domains, and this GitHub account has no verified address in them. Ask an admin for an invite link.",
    );
  }
  let email: string | null = verified.find(emailDomainAllowed) ?? verified[0] ?? null;
  if (email && (await findUserByEmail(email))) email = null; // never auto-merge accounts by email
  const user = await createUser({ name: ghUser.name || ghUser.login, email, emailVerified: true, avatarUrl: ghUser.avatar_url });
  await db.insert(githubAccounts).values({ ...values, userId: user.id });
  return { user, created: true };
}

export async function getGitHubAccount(userId: string) {
  const [acc] = await db.select().from(githubAccounts).where(eq(githubAccounts.userId, userId)).limit(1);
  return acc ?? null;
}

/** A usable GitHub token for the user (refreshing OAuth tokens when needed), or null. */
export async function getUserGitHubToken(userId: string): Promise<string | null> {
  const acc = await getGitHubAccount(userId);
  if (!acc) return null;
  const expiresAt = acc.accessTokenExpiresAt?.getTime();
  if (!expiresAt || expiresAt - Date.now() > 2 * 60_000) return decrypt(acc.accessTokenEnc);
  if (!acc.refreshTokenEnc) return null;
  const client = await getOAuthClient();
  if (!client) return null;
  const res = await fetch(`${env().GITHUB_URL}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      grant_type: "refresh_token",
      refresh_token: decrypt(acc.refreshTokenEnc),
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    error?: string;
  };
  if (!data.access_token) {
    console.warn("[github] token refresh failed", data.error);
    return null;
  }
  const now = Date.now();
  await db
    .update(githubAccounts)
    .set({
      accessTokenEnc: encrypt(data.access_token),
      refreshTokenEnc: data.refresh_token ? encrypt(data.refresh_token) : acc.refreshTokenEnc,
      accessTokenExpiresAt: data.expires_in ? new Date(now + data.expires_in * 1000) : null,
      refreshTokenExpiresAt: data.refresh_token_expires_in
        ? new Date(now + data.refresh_token_expires_in * 1000)
        : acc.refreshTokenExpiresAt,
    })
    .where(eq(githubAccounts.id, acc.id));
  return data.access_token;
}

/** Validate a personal access token against GitHub and return the user it belongs to. */
export async function verifyGitHubToken(token: string): Promise<{ user: GhUser; scopes: string | null }> {
  try {
    const user = await gh<GhUser>(token, "/user", { noCache: true });
    return { user, scopes: null };
  } catch (err) {
    if (err instanceof GitHubError && err.status === 401) throw new AuthError("GitHub rejected this token.");
    throw err;
  }
}
