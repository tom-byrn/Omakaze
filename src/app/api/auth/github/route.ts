import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signPayload } from "@/lib/crypto";
import { env, isSecureUrl } from "@/lib/env";
import { getOAuthClient } from "@/lib/github/app";
import { safeNext } from "@/lib/http";

import { OAUTH_NONCE_COOKIE } from "@/lib/auth/constants";

/** Start "Sign in with GitHub" (or link GitHub to the current account with ?link=1). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const client = await getOAuthClient();
  if (!client) {
    return NextResponse.redirect(`${env().APP_URL}/login?error=${encodeURIComponent("GitHub sign-in is not configured on this instance.")}`);
  }
  const nonce = randomBytes(16).toString("base64url");
  const state = signPayload(
    {
      n: nonce,
      next: safeNext(url.searchParams.get("next"), ""),
      link: url.searchParams.get("link") === "1",
      invite: url.searchParams.get("invite") ?? undefined,
    },
    "github-oauth",
    600,
  );
  (await cookies()).set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureUrl(),
    path: "/",
    maxAge: 600,
  });
  const authorize = new URL(`${env().GITHUB_URL}/login/oauth/authorize`);
  authorize.searchParams.set("client_id", client.clientId);
  authorize.searchParams.set("redirect_uri", `${env().APP_URL}/api/auth/github/callback`);
  authorize.searchParams.set("state", state);
  if (!client.isApp) authorize.searchParams.set("scope", "read:user user:email repo");
  return NextResponse.redirect(authorize.toString());
}
