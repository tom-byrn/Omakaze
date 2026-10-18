import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession, getCurrentUser } from "@/lib/auth/session";
import { AuthError, ensurePersonalWorkspace, upsertGitHubIdentity } from "@/lib/auth/users";
import { verifyPayload } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getOAuthClient } from "@/lib/github/app";
import { gh, type GhUser } from "@/lib/github/client";
import { acceptInvite, getInviteByToken, InviteError } from "@/lib/invites";
import { homePathFor } from "@/lib/workspaces";
import { OAUTH_NONCE_COOKIE } from "@/lib/auth/constants";

type State = { n: string; next: string; link: boolean; invite?: string };

function fail(message: string, path = "/login") {
  return NextResponse.redirect(`${env().APP_URL}${path}?error=${encodeURIComponent(message)}`);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const nonce = jar.get(OAUTH_NONCE_COOKIE)?.value;
  jar.delete(OAUTH_NONCE_COOKIE);
  const state = verifyPayload<State>(url.searchParams.get("state"), "github-oauth");
  if (!state || !nonce || state.n !== nonce) return fail("Sign-in session expired. Try again.");
  const errorParam = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (errorParam) return fail(errorParam);
  const code = url.searchParams.get("code");
  if (!code) return fail("Missing authorization code.");

  const client = await getOAuthClient();
  if (!client) return fail("GitHub sign-in is not configured.");

  const tokenRes = await fetch(`${env().GITHUB_URL}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      redirect_uri: `${env().APP_URL}/api/auth/github/callback`,
    }),
  });
  const token = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    scope?: string;
    error_description?: string;
  };
  if (!token.access_token) return fail(token.error_description ?? "GitHub did not return a token.");

  const ghUser = await gh<GhUser>(token.access_token, "/user", { noCache: true });
  const current = await getCurrentUser();
  const invite = state.invite ? await getInviteByToken(state.invite) : null;

  try {
    const { user } = await upsertGitHubIdentity(
      ghUser,
      {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresIn: token.expires_in,
        refreshTokenExpiresIn: token.refresh_token_expires_in,
        scopes: token.scope ?? null,
        tokenType: "oauth",
      },
      { linkToUserId: state.link && current ? current.id : null, allowCreate: Boolean(invite?.usable) },
    );
    if (state.link && current) {
      return NextResponse.redirect(`${env().APP_URL}${state.next || "/account"}`);
    }
    await createSession(user.id);
    if (state.invite) {
      try {
        const { slug } = await acceptInvite(state.invite, user);
        return NextResponse.redirect(`${env().APP_URL}/w/${slug}`);
      } catch (err) {
        if (err instanceof InviteError) return fail(err.message, `/invite/${state.invite}`);
        throw err;
      }
    }
    await ensurePersonalWorkspace(user, ghUser.login);
    return NextResponse.redirect(`${env().APP_URL}${state.next || (await homePathFor(user))}`);
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message);
    throw err;
  }
}
