import { env } from "@/lib/env";
import { getOAuthClient } from "@/lib/github/app";

export type AuthMethods = { github: boolean; email: boolean; token: boolean; signup: boolean };

export async function getAuthMethods(): Promise<AuthMethods> {
  const e = env();
  const oauth = await getOAuthClient().catch(() => null);
  return {
    github: Boolean(oauth),
    email: e.AUTH_EMAIL_ENABLED,
    token: e.AUTH_GITHUB_TOKEN_ENABLED,
    signup: e.AUTH_SIGNUP_ENABLED,
  };
}
