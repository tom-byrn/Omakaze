"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { githubAccounts, memberships, sessions, users, workspaces } from "@/db/schema";
import { currentSessionId, destroySession, requireUser } from "@/lib/auth/session";
import { AuthError, findUserByEmail, upsertGitHubIdentity, verifyGitHubToken } from "@/lib/auth/users";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { ownerCount } from "@/lib/workspaces";

type State = { ok?: boolean; error?: string; message?: string } | undefined;

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
  await db.update(users).set({ name: name.slice(0, 100), email: email || null }).where(eq(users.id, user.id));
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
  await destroySession();
  await db.delete(users).where(eq(users.id, user.id));
  redirect("/");
}
