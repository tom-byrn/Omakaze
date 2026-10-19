"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { chatgptConnections, githubAccounts, memberships, sessions, users, workspaces } from "@/db/schema";
import {
  chatgptAccessToken,
  ChatgptError,
  chatgptPlansEnabled,
  finishChatgptSignIn,
  getChatgptConnection,
  listChatgptModels,
  signOutChatgpt,
  SIGN_IN_TTL_MS,
  startChatgptSignIn,
  type PendingSignIn,
} from "@/lib/ai/chatgpt";
import type { ModelOption } from "@/lib/ai/models";
import { currentSessionId, destroySession, requireUser } from "@/lib/auth/session";
import { AuthError, findUserByEmail, upsertGitHubIdentity, verifyGitHubToken } from "@/lib/auth/users";
import { decrypt, encrypt, hashPassword, verifyPassword } from "@/lib/crypto";
import { isSecureUrl } from "@/lib/env";
import { DIGEST_OPTIONS } from "@/lib/notifications/digest";
import { ConfirmEmailError, savePreferences, sendEmailConfirmation, setWorkspaceMuted } from "@/lib/notifications/prefs";
import { listUserWorkspaces, ownerCount } from "@/lib/workspaces";

type State = { ok?: boolean; error?: string; message?: string; data?: Record<string, string> } | undefined;

export async function updateProfileAction(_prev: State, form: FormData): Promise<State> {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!name) return { error: "Enter a name" };
  if (email && !z.email().safeParse(email).success) return { error: "Enter a valid email" };
  if (email && email !== user.email) {
    const other = await findUserByEmail(email);
    if (other && other.id !== user.id) return { error: "That email is used by another account" };
  }
  const emailChanged = (email || null) !== (user.email ?? null);
  await db
    .update(users)
    .set({ name: name.slice(0, 100), email: email || null, ...(emailChanged ? { emailVerifiedAt: null } : {}) })
    .where(eq(users.id, user.id));
  revalidatePath("/account");
  return { ok: true, message: "Saved." };
}

export async function changePasswordAction(_prev: State, form: FormData): Promise<State> {
  const user = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  if (next.length < 8) return { error: "Use at least 8 characters" };
  if (user.passwordHash && !(await verifyPassword(current, user.passwordHash))) return { error: "Current password is incorrect" };
  if (!user.email) return { error: "Add an email address before setting a password" };
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id));
  const sid = await currentSessionId();
  if (sid) await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, sid)));
  return { ok: true, message: "Password updated. Other sessions were signed out." };
}

export async function linkGitHubTokenAction(_prev: State, form: FormData): Promise<State> {
  const user = await requireUser();
  const token = String(form.get("token") ?? "").trim();
  if (token.length < 10) return { error: "Paste a personal access token" };
  try {
    const { user: ghUser } = await verifyGitHubToken(token);
    await upsertGitHubIdentity(ghUser, { accessToken: token, tokenType: "pat" }, { linkToUserId: user.id });
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    return { error: "Could not verify the token with GitHub" };
  }
  revalidatePath("/account");
  return { ok: true, message: "GitHub account linked." };
}

export async function unlinkGitHubAction(): Promise<State> {
  const user = await requireUser();
  if (!user.passwordHash) return { error: "Set a password first, otherwise you cannot sign in again." };
  await db.delete(githubAccounts).where(eq(githubAccounts.userId, user.id));
  revalidatePath("/account");
  return { ok: true };
}

export async function revokeSessionAction(sessionId: string): Promise<State> {
  const user = await requireUser();
  await db.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)));
  revalidatePath("/account");
  return { ok: true };
}

export async function deleteAccountAction(_prev: State, form: FormData): Promise<State> {
  const user = await requireUser();
  if (String(form.get("confirm") ?? "") !== "delete my account") return { error: 'Type "delete my account" to confirm.' };
  const owned = await db.select().from(memberships).where(and(eq(memberships.userId, user.id), eq(memberships.role, "owner")));
  const soleWorkspaces: string[] = [];
  for (const m of owned) {
    if ((await ownerCount(m.workspaceId)) <= 1) {
      const others = await db.select().from(memberships).where(and(eq(memberships.workspaceId, m.workspaceId), ne(memberships.userId, user.id)));
      if (others.length > 0) return { error: "You are the only owner of a workspace with other members. Transfer ownership first." };
      soleWorkspaces.push(m.workspaceId);
    }
  }
  if (soleWorkspaces.length > 0) await db.delete(workspaces).where(inArray(workspaces.id, soleWorkspaces));
  await signOutChatgpt(user.id).catch(() => {});
  await destroySession();
  await db.delete(users).where(eq(users.id, user.id));
  redirect("/");
}

/* Notifications ---------------------------------------------------------- */

export async function saveNotificationPrefsAction(_prev: State, form: FormData): Promise<State> {
  const user = await requireUser();
  const on = (name: string) => form.get(name) === "on";
  const digest = DIGEST_OPTIONS.find((o) => o.value === form.get("digest"))?.value ?? "minutes";
  await savePreferences(user.id, {
    email: on("email"),
    guideReady: on("guideReady"),
    newVersion: on("newVersion"),
    replies: on("replies"),
    pullActivity: on("pullActivity"),
    digest,
  });
  // Checked workspaces send email; the others are muted.
  const wanted = new Set(form.getAll("workspace").map(String));
  for (const { workspace } of await listUserWorkspaces(user.id)) {
    await setWorkspaceMuted(user.id, workspace.id, !wanted.has(workspace.id));
  }
  revalidatePath("/account");
  return { ok: true, message: "Saved." };
}

export async function sendEmailConfirmationAction(): Promise<State> {
  const user = await requireUser();
  try {
    await sendEmailConfirmation(user);
    return { ok: true, message: `We sent a confirmation link to ${user.email}. It expires in 24 hours.` };
  } catch (err) {
    if (err instanceof ConfirmEmailError) return { error: err.message };
    throw err;
  }
}

/* ChatGPT plan ----------------------------------------------------------- */

const CHATGPT_COOKIE = "omk_chatgpt_signin";

/** Start Sign in with ChatGPT. Returns the address to open; the user pastes back where it sends them. */
export async function startChatgptSignInAction(newAccount: boolean): Promise<{ url?: string; error?: string }> {
  const user = await requireUser();
  if (!chatgptPlansEnabled()) return { error: "ChatGPT plans are turned off on this instance." };
  try {
    const { pending, url } = await startChatgptSignIn(user.id, { newAccount });
    (await cookies()).set(CHATGPT_COOKIE, encrypt(JSON.stringify({ ...pending, userId: user.id })), {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureUrl(),
      maxAge: SIGN_IN_TTL_MS / 1000,
      path: "/account",
    });
    return { url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start signing in with ChatGPT" };
  }
}

export async function finishChatgptSignInAction(_prev: State, form: FormData): Promise<State> {
  const user = await requireUser();
  const jar = await cookies();
  const raw = jar.get(CHATGPT_COOKIE)?.value;
  let pending: (PendingSignIn & { userId: string }) | null = null;
  try {
    pending = raw ? (JSON.parse(decrypt(raw)) as PendingSignIn & { userId: string }) : null;
  } catch {
    pending = null;
  }
  if (!pending || pending.userId !== user.id) return { error: "This sign-in has expired. Start again." };
  try {
    const res = await finishChatgptSignIn(user.id, pending, String(form.get("callback") ?? ""));
    jar.delete({ name: CHATGPT_COOKIE, path: "/account" });
    revalidatePath("/account");
    if (!res.planUsage) {
      return { ok: true, message: "Signed in, but ChatGPT plan usage was not allowed. Sign in again and allow it to generate guides with your plan." };
    }
    return { ok: true, message: "ChatGPT connected.", data: res.firstTime ? { welcome: "1" } : undefined };
  } catch (err) {
    if (err instanceof ChatgptError) return { error: err.message };
    return { error: "Could not finish signing in with ChatGPT" };
  }
}

export async function signOutChatgptAction(): Promise<State> {
  const user = await requireUser();
  const { revoked } = await signOutChatgpt(user.id);
  revalidatePath("/account");
  if (!revoked) {
    return { error: "Signed out here, but OpenAI did not confirm the token was revoked. You can also disconnect Omakaze in ChatGPT settings." };
  }
  return { ok: true };
}

export async function saveChatgptPrefsAction(_prev: State, form: FormData): Promise<State> {
  const user = await requireUser();
  const conn = await getChatgptConnection(user.id);
  if (!conn) return { error: "Connect ChatGPT first" };
  const model = String(form.get("model") ?? "").trim().slice(0, 200);
  if (!model) return { error: "Choose a model" };
  await db
    .update(chatgptConnections)
    .set({ model, enabled: form.get("enabled") === "on" })
    .where(eq(chatgptConnections.id, conn.id));
  revalidatePath("/account");
  return { ok: true, message: "Saved." };
}

export async function listChatgptModelsAction(): Promise<{ models: ModelOption[] } | { error: string }> {
  const user = await requireUser();
  const conn = await getChatgptConnection(user.id);
  if (!conn?.refreshTokenEnc) return { error: "Connect ChatGPT first" };
  try {
    return { models: await listChatgptModels(await chatgptAccessToken(conn.id)) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load models" };
  }
}
