"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  apiTokens,
  githubConnections,
  memberships,
  repositories,
  workspaces,
  type AiProvider,
  type Role,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { providerInfo, resolveAiConfig } from "@/lib/ai/config";
import { testAiConfig } from "@/lib/ai/providers";
import { requireUser } from "@/lib/auth/session";
import { getGitHubAccount, verifyGitHubToken, AuthError } from "@/lib/auth/users";
import { encrypt, sha256 } from "@/lib/crypto";
import { newToken } from "@/lib/ids";
import { createInvite, revokeInvite } from "@/lib/invites";
import {
  addRepository,
  ConnectionError,
  getConnection,
  lookupRepo,
  reattachRepositories,
} from "@/lib/github/connections";
import { gh, GitHubError } from "@/lib/github/client";
import { repoWebhookSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { revokeAccessToken } from "@/lib/oauth/server";
import { syncRepositoryPulls } from "@/lib/github/pulls";
import { getRepoContext } from "@/lib/github/connections";
import { assertWorkspaceRole, getWorkspaceBySlug, ownerCount, uniqueSlug, slugify, type Workspace } from "@/lib/workspaces";

export type FormState = { ok?: boolean; error?: string; message?: string; data?: Record<string, string> } | undefined;

async function ctx(slug: string, minRole: Role) {
  const user = await requireUser();
  const ws = await getWorkspaceBySlug(slug);
  if (!ws) throw new Error("Workspace not found");
  const role = await assertWorkspaceRole(ws.id, user.id, minRole);
  return { user, ws, role };
}

function fail(err: unknown): FormState {
  if (err instanceof Error) return { error: err.message };
  return { error: "Something went wrong" };
}

function done(ws: Workspace, path: string, message?: string): FormState {
  revalidatePath(`/w/${ws.slug}${path}`);
  return { ok: true, message };
}

/* General ------------------------------------------------------------ */

export async function updateWorkspaceAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  let newSlug = slug;
  try {
    const { user, ws } = await ctx(slug, "admin");
    const name = String(form.get("name") ?? "").trim();
    const requestedSlug = slugify(String(form.get("slug") ?? ws.slug));
    if (!name) return { error: "Name is required" };
    if (requestedSlug !== ws.slug) {
      const taken = await getWorkspaceBySlug(requestedSlug);
      if (taken) return { error: "That URL is already taken" };
      newSlug = await uniqueSlug(requestedSlug);
    }
    await db.update(workspaces).set({ name: name.slice(0, 80), slug: newSlug }).where(eq(workspaces.id, ws.id));
    await logActivity({ workspaceId: ws.id, type: "settings.updated", actorUserId: user.id, data: { section: "general" } });
  } catch (err) {
    return fail(err);
  }
  if (newSlug !== slug) redirect(`/w/${newSlug}/settings`);
  revalidatePath(`/w/${slug}`, "layout");
  return { ok: true, message: "Saved" };
}

export async function deleteWorkspaceAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { ws } = await ctx(slug, "owner");
    if (String(form.get("confirm") ?? "") !== ws.slug) return { error: `Type ${ws.slug} to confirm.` };
    await db.delete(workspaces).where(eq(workspaces.id, ws.id));
  } catch (err) {
    return fail(err);
  }
  redirect("/");
}

export async function leaveWorkspaceAction(slug: string): Promise<FormState> {
  try {
    const { user, ws, role } = await ctx(slug, "member");
    if (role === "owner" && (await ownerCount(ws.id)) <= 1) {
      return { error: "Transfer ownership or delete the workspace before leaving." };
    }
    await db.delete(memberships).where(and(eq(memberships.workspaceId, ws.id), eq(memberships.userId, user.id)));
    await logActivity({ workspaceId: ws.id, type: "member.removed", actorUserId: user.id, data: { left: true } });
  } catch (err) {
    return fail(err);
  }
  redirect("/");
}

/* Members ------------------------------------------------------------ */

export async function inviteAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { user, ws } = await ctx(slug, "admin");
    const email = String(form.get("email") ?? "").trim();
    const role = (String(form.get("role") ?? "member") as Role) === "admin" ? "admin" : "member";
    if (email && !z.email().safeParse(email).success) return { error: "Enter a valid email or leave it empty" };
    const { url, emailed } = await createInvite({ workspaceId: ws.id, role, email: email || null, invitedByUserId: user.id });
    revalidatePath(`/w/${ws.slug}/settings/members`);
    return {
      ok: true,
      message: emailed ? `Invite sent to ${email}.` : "Invite link created. Share it with your teammate.",
      data: { url },
    };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeInviteAction(slug: string, inviteId: string): Promise<FormState> {
  try {
    const { ws } = await ctx(slug, "admin");
    await revokeInvite(ws.id, inviteId);
    return done(ws, "/settings/members");
  } catch (err) {
    return fail(err);
  }
}

export async function changeRoleAction(slug: string, userId: string, role: Role): Promise<FormState> {
  try {
    const { user, ws, role: myRole } = await ctx(slug, "admin");
    if (role === "owner" && myRole !== "owner") return { error: "Only owners can make someone an owner." };
    const [target] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspaceId, ws.id), eq(memberships.userId, userId)))
      .limit(1);
    if (!target) return { error: "Member not found" };
    if (target.role === "owner" && myRole !== "owner") return { error: "Only owners can change an owner's role." };
    if (target.role === "owner" && role !== "owner" && (await ownerCount(ws.id)) <= 1) {
      return { error: "A workspace needs at least one owner." };
    }
    await db.update(memberships).set({ role }).where(and(eq(memberships.workspaceId, ws.id), eq(memberships.userId, userId)));
    await logActivity({ workspaceId: ws.id, type: "member.role_changed", actorUserId: user.id, data: { userId, role } });
    return done(ws, "/settings/members");
  } catch (err) {
    return fail(err);
  }
}

export async function removeMemberAction(slug: string, userId: string): Promise<FormState> {
  try {
    const { user, ws, role: myRole } = await ctx(slug, "admin");
    const [target] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspaceId, ws.id), eq(memberships.userId, userId)))
      .limit(1);
    if (!target) return { error: "Member not found" };
    if (target.role === "owner" && myRole !== "owner") return { error: "Only owners can remove an owner." };
    if (target.role === "owner" && (await ownerCount(ws.id)) <= 1) return { error: "A workspace needs at least one owner." };
    await db.delete(memberships).where(and(eq(memberships.workspaceId, ws.id), eq(memberships.userId, userId)));
    await db.delete(apiTokens).where(and(eq(apiTokens.workspaceId, ws.id), eq(apiTokens.userId, userId)));
    await logActivity({ workspaceId: ws.id, type: "member.removed", actorUserId: user.id, data: { userId } });
    return done(ws, "/settings/members");
  } catch (err) {
    return fail(err);
  }
}

/* GitHub connections ------------------------------------------------- */

function reattachedNote(count: number): string {
  return count > 0 ? ` ${count} ${count === 1 ? "repository was" : "repositories were"} reconnected.` : "";
}

export async function connectWithAccountAction(slug: string): Promise<FormState> {
  try {
    const { user, ws } = await ctx(slug, "admin");
    const account = await getGitHubAccount(user.id);
    if (!account) return { error: "Link a GitHub account in your account settings first." };
    const [existing] = await db
      .select()
      .from(githubConnections)
      .where(and(eq(githubConnections.workspaceId, ws.id), eq(githubConnections.type, "user"), eq(githubConnections.userId, user.id)))
      .limit(1);
    if (existing) return { error: `Already connected through @${account.login}.` };
    const [conn] = await db
      .insert(githubConnections)
      .values({
        workspaceId: ws.id,
        type: "user",
        userId: user.id,
        accountLogin: account.login,
        accountType: "User",
        accountAvatarUrl: account.avatarUrl,
        createdByUserId: user.id,
      })
      .returning();
    await logActivity({ workspaceId: ws.id, type: "connection.created", actorUserId: user.id, data: { type: "user", login: account.login } });
    const reattached = await reattachRepositories(ws.id, conn);
    return done(ws, "/settings/github", `Connected through @${account.login}.${reattachedNote(reattached)}`);
  } catch (err) {
    return fail(err);
  }
}

export async function connectWithTokenAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { user, ws } = await ctx(slug, "admin");
    const token = String(form.get("token") ?? "").trim();
    if (token.length < 10) return { error: "Paste a personal access token." };
    const { user: ghUser } = await verifyGitHubToken(token);
    const [conn] = await db
      .insert(githubConnections)
      .values({
        workspaceId: ws.id,
        type: "token",
        tokenEnc: encrypt(token),
        accountLogin: ghUser.login,
        accountType: ghUser.type === "Organization" ? "Organization" : "User",
        accountAvatarUrl: ghUser.avatar_url,
        createdByUserId: user.id,
      })
      .returning();
    await logActivity({ workspaceId: ws.id, type: "connection.created", actorUserId: user.id, data: { type: "token", login: ghUser.login } });
    const reattached = await reattachRepositories(ws.id, conn);
    return done(ws, "/settings/github", `Connected with a token for @${ghUser.login}.${reattachedNote(reattached)}`);
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    return fail(err);
  }
}

export async function removeConnectionAction(slug: string, connectionId: string): Promise<FormState> {
  try {
    const { user, ws } = await ctx(slug, "admin");
    const conn = await getConnection(connectionId);
    if (!conn || conn.workspaceId !== ws.id) return { error: "Connection not found" };
    await db.delete(githubConnections).where(eq(githubConnections.id, conn.id));
    await logActivity({ workspaceId: ws.id, type: "connection.removed", actorUserId: user.id, data: { login: conn.accountLogin } });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* Repositories ------------------------------------------------------- */

export async function addRepositoryAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { user, ws } = await ctx(slug, "admin");
    const conn = await getConnection(String(form.get("connectionId") ?? ""));
    if (!conn || conn.workspaceId !== ws.id) return { error: "Choose a connection" };
    const fullName = String(form.get("fullName") ?? "").trim();
    if (!fullName) return { error: "Enter a repository as owner/name" };
    const ghRepo = await lookupRepo(conn, fullName);
    const repo = await addRepository(ws.id, conn, ghRepo);
    await logActivity({ workspaceId: ws.id, type: "repo.added", actorUserId: user.id, repositoryId: repo.id, data: { fullName: repo.fullName } });
    // Load PRs right away so the dashboard is populated.
    await syncRepositoryPulls(await getRepoContext(repo.id)).catch(() => null);
    revalidatePath(`/w/${ws.slug}`, "layout");
    return { ok: true, message: `Added ${repo.fullName}.` };
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof GitHubError) return { error: err.message };
    return fail(err);
  }
}

export async function removeRepositoryAction(slug: string, repositoryId: string): Promise<FormState> {
  try {
    const { user, ws } = await ctx(slug, "admin");
    const [repo] = await db
      .select()
      .from(repositories)
      .where(and(eq(repositories.id, repositoryId), eq(repositories.workspaceId, ws.id)))
      .limit(1);
    if (!repo) return { error: "Repository not found" };
    await db.delete(repositories).where(eq(repositories.id, repo.id));
    await logActivity({ workspaceId: ws.id, type: "repo.removed", actorUserId: user.id, data: { fullName: repo.fullName } });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setRepoAutoGenerateAction(slug: string, repositoryId: string, value: "inherit" | "on" | "off"): Promise<FormState> {
  try {
    const { ws } = await ctx(slug, "admin");
    await db
      .update(repositories)
      .set({ autoGenerate: value === "inherit" ? null : value === "on" })
      .where(and(eq(repositories.id, repositoryId), eq(repositories.workspaceId, ws.id)));
    return done(ws, "/repos");
  } catch (err) {
    return fail(err);
  }
}

/** Create a repository webhook (token/user connections) so PR events arrive without polling. */
export async function createRepoWebhookAction(slug: string, repositoryId: string): Promise<FormState> {
  try {
    const { ws } = await ctx(slug, "admin");
    const [repo] = await db
      .select()
      .from(repositories)
      .where(and(eq(repositories.id, repositoryId), eq(repositories.workspaceId, ws.id)))
      .limit(1);
    if (!repo) return { error: "Repository not found" };
    const rc = await getRepoContext(repo.id);
    const hook = await gh<{ id: number }>(rc.token, `/repos/${repo.owner}/${repo.name}/hooks`, {
      method: "POST",
      body: {
        name: "web",
        active: true,
        events: ["pull_request", "pull_request_review_comment"],
        config: { url: `${env().APP_URL}/api/github/webhook`, content_type: "json", secret: repoWebhookSecret(), insecure_ssl: "0" },
      },
    });
    await db.update(repositories).set({ webhookId: hook.id }).where(eq(repositories.id, repo.id));
    return done(ws, "/repos", "Webhook created.");
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) {
      return { error: "GitHub refused to create the webhook. The token needs admin access to the repository (admin:repo_hook)." };
    }
    return fail(err);
  }
}

/* AI + automation ---------------------------------------------------- */

export async function saveAiSettingsAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { user, ws } = await ctx(slug, "admin");
    const provider = String(form.get("provider") ?? "") as AiProvider | "";
    const intent = String(form.get("intent") ?? "save");
    if (intent === "clear") {
      await db
        .update(workspaces)
        .set({ aiProvider: null, aiModel: null, aiBaseUrl: null, aiApiKeyEnc: null })
        .where(eq(workspaces.id, ws.id));
      return done(ws, "/settings/ai", "AI provider removed.");
    }
    if (!provider) return { error: "Choose a provider" };
    const info = providerInfo(provider);
    const model = String(form.get("model") ?? "").trim() || info.defaultModel;
    const baseUrl = String(form.get("baseUrl") ?? "").trim();
    const apiKey = String(form.get("apiKey") ?? "").trim();
    if (!model) return { error: "Enter a model name" };
    if (baseUrl && !/^https?:\/\//.test(baseUrl)) return { error: "Base URL must start with http:// or https://" };
    const keepKey = !apiKey && ws.aiProvider === provider && ws.aiApiKeyEnc;
    if (info.keyRequired && !apiKey && !keepKey) return { error: "Enter an API key" };
    const values = {
      aiProvider: provider,
      aiModel: model,
      aiBaseUrl: baseUrl || null,
      aiApiKeyEnc: apiKey ? encrypt(apiKey) : keepKey ? ws.aiApiKeyEnc : null,
    };
    if (intent === "test") {
      const cfg = resolveAiConfig({ ...ws, ...values });
      if (!cfg) return { error: "Incomplete configuration" };
      const res = await testAiConfig(cfg);
      return res.ok ? { ok: true, message: res.message } : { error: res.message };
    }
    await db.update(workspaces).set(values).where(eq(workspaces.id, ws.id));
    await logActivity({ workspaceId: ws.id, type: "settings.updated", actorUserId: user.id, data: { section: "ai", provider, model } });
    return done(ws, "/settings/ai", "Saved.");
  } catch (err) {
    return fail(err);
  }
}

/** Extra instructions apply to whichever provider is in effect, including the instance default. */
export async function saveAiInstructionsAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { user, ws } = await ctx(slug, "admin");
    const instructions = String(form.get("instructions") ?? "").trim().slice(0, 4000);
    await db.update(workspaces).set({ aiInstructions: instructions || null }).where(eq(workspaces.id, ws.id));
    await logActivity({ workspaceId: ws.id, type: "settings.updated", actorUserId: user.id, data: { section: "ai-instructions" } });
    return done(ws, "/settings/ai", "Saved.");
  } catch (err) {
    return fail(err);
  }
}

export async function saveAutomationAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { user, ws } = await ctx(slug, "admin");
    const values = {
      autoGenerate: form.get("autoGenerate") === "on",
      regenerateOnPush: form.get("regenerateOnPush") === "on",
      postPrComment: form.get("postPrComment") === "on",
      skipDrafts: form.get("skipDrafts") === "on",
    };
    await db.update(workspaces).set(values).where(eq(workspaces.id, ws.id));
    await logActivity({ workspaceId: ws.id, type: "settings.updated", actorUserId: user.id, data: { section: "automation", ...values } });
    return done(ws, "/settings/automation", "Saved.");
  } catch (err) {
    return fail(err);
  }
}

/* API tokens --------------------------------------------------------- */

export async function createTokenAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { user, ws } = await ctx(slug, "member");
    const name = String(form.get("name") ?? "").trim().slice(0, 80) || "API token";
    const days = Number(form.get("expires") ?? 0);
    const token = newToken("omk");
    await db.insert(apiTokens).values({
      userId: user.id,
      workspaceId: ws.id,
      name,
      kind: "personal",
      tokenHash: sha256(token),
      tokenPrefix: token.slice(0, 12),
      expiresAt: days > 0 ? new Date(Date.now() + days * 86400_000) : null,
    });
    await logActivity({ workspaceId: ws.id, type: "token.created", actorUserId: user.id, data: { name } });
    revalidatePath(`/w/${ws.slug}/settings/tokens`);
    return { ok: true, message: "Token created. Copy it now; it is not shown again.", data: { token } };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeTokenAction(slug: string, tokenId: string): Promise<FormState> {
  try {
    const { user, ws, role } = await ctx(slug, "member");
    const [tok] = await db.select().from(apiTokens).where(and(eq(apiTokens.id, tokenId), eq(apiTokens.workspaceId, ws.id))).limit(1);
    if (!tok) return { error: "Token not found" };
    if (tok.userId !== user.id && role === "member") return { error: "You can only revoke your own tokens." };
    // For OAuth clients this also revokes the refresh token, so the client can't get a new access token.
    await revokeAccessToken(tok.id);
    return done(ws, "/settings/tokens");
  } catch (err) {
    return fail(err);
  }
}
