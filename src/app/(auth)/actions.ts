"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import {
  AuthError,
  canCreateAccount,
  createUser,
  emailDomainAllowed,
  ensurePersonalWorkspace,
  findUserByEmail,
  upsertGitHubIdentity,
  verifyGitHubToken,
} from "@/lib/auth/users";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { env } from "@/lib/env";
import { clientIp, rateLimit, safeNext } from "@/lib/http";
import { acceptInvite, getInviteByToken, InviteError } from "@/lib/invites";
import { homePathFor } from "@/lib/workspaces";

export type AuthState = { error?: string; fields?: Record<string, string> } | undefined;

async function clientKey(): Promise<string> {
  return clientIp(await headers());
}

async function finish(
  user: { id: string; email: string | null; emailVerifiedAt: Date | null; name: string },
  invite: string | null,
  next: string | null,
) {
  if (invite) {
    try {
      const { slug } = await acceptInvite(invite, user);
      redirect(`/w/${slug}`);
    } catch (err) {
      if (err instanceof InviteError) redirect(`/invite/${invite}?error=${encodeURIComponent(err.message)}`);
      throw err;
    }
  }
  const dest = safeNext(next, "");
  redirect(dest || (await homePathFor(user as never)));
}

const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export async function signupAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!env().AUTH_EMAIL_ENABLED) return { error: "Email sign-up is disabled on this instance." };
  const invite = (form.get("invite") as string) || null;
  const next = (form.get("next") as string) || null;
  const parsed = signupSchema.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password"),
  });
  const fields = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, fields };
  if (!rateLimit(`signup:${await clientKey()}`, 10, 60 * 60 * 1000)) {
    return { error: "Too many attempts. Try again later.", fields };
  }
  const inviteRow = invite ? await getInviteByToken(invite) : null;
  if (!(await canCreateAccount(Boolean(inviteRow?.usable)))) {
    return { error: "Sign-ups are disabled on this instance. Ask an admin for an invite link.", fields };
  }
  // An invite is an admin's approval, so it also admits addresses outside AUTH_ALLOWED_EMAIL_DOMAINS.
  if (!inviteRow?.usable && !emailDomainAllowed(parsed.data.email)) {
    return { error: "This email domain is not allowed on this instance.", fields };
  }
  if (await findUserByEmail(parsed.data.email)) {
    return { error: "An account with this email already exists. Sign in instead.", fields };
  }
  const user = await createUser({
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash: await hashPassword(parsed.data.password),
  });
  await createSession(user.id);
  if (!invite) await ensurePersonalWorkspace(user, parsed.data.name);
  await finish(user, invite, next);
}

export async function loginAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!env().AUTH_EMAIL_ENABLED) return { error: "Email sign-in is disabled on this instance." };
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const invite = (form.get("invite") as string) || null;
  const next = (form.get("next") as string) || null;
  if (!email || !password) return { error: "Enter your email and password.", fields: { email } };
  // Limit per account (whatever the address) and per address (whatever the account).
  const perAccount = rateLimit(`login:${email.toLowerCase()}`, 10, 15 * 60 * 1000);
  const perAddress = rateLimit(`login-ip:${await clientKey()}`, 50, 15 * 60 * 1000);
  if (!perAccount || !perAddress) {
    return { error: "Too many attempts. Wait a few minutes and try again.", fields: { email } };
  }
  const user = await findUserByEmail(email);
  const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) return { error: "Email or password is incorrect.", fields: { email } };
  await createSession(user.id);
  await finish(user, invite, next);
}

export async function tokenLoginAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!env().AUTH_GITHUB_TOKEN_ENABLED) return { error: "Token sign-in is disabled on this instance." };
  const token = String(form.get("token") ?? "").trim();
  const invite = (form.get("invite") as string) || null;
  const next = (form.get("next") as string) || null;
  if (token.length < 10) return { error: "Paste a GitHub personal access token." };
  if (!rateLimit(`token-login:${await clientKey()}`, 20, 15 * 60 * 1000)) {
    return { error: "Too many attempts. Try again later." };
  }
  let user;
  try {
    const verified = await verifyGitHubToken(token);
    const inviteRow = invite ? await getInviteByToken(invite) : null;
    ({ user } = await upsertGitHubIdentity(
      verified.user,
      { accessToken: token, tokenType: "pat", scopes: verified.scopes },
      { allowCreate: Boolean(inviteRow?.usable) },
    ));
    await createSession(user.id);
    if (!invite) await ensurePersonalWorkspace(user, verified.user.login);
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    console.error("[auth] token sign-in failed", err);
    return { error: "Could not reach GitHub to verify the token." };
  }
  await finish(user, invite, next);
}
