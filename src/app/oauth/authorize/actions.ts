"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createAuthorizationCode, issuer, OAuthError, validateAuthorizeRequest } from "@/lib/oauth/server";
import { getMembership } from "@/lib/workspaces";

export async function authorizeAction(form: FormData) {
  const user = await requireUser();
  const params = new URLSearchParams(String(form.get("query") ?? ""));
  let validated;
  try {
    validated = await validateAuthorizeRequest(params);
  } catch (err) {
    const message = err instanceof OAuthError ? err.message : "Invalid authorization request";
    redirect(`/oauth/authorize?error=${encodeURIComponent(message)}`);
  }
  const { req } = validated;
  const target = new URL(req.redirectUri);
  if (req.state) target.searchParams.set("state", req.state);
  target.searchParams.set("iss", issuer());
  if (form.get("decision") !== "allow") {
    target.searchParams.set("error", "access_denied");
    redirect(target.toString());
  }
  const workspaceId = String(form.get("workspaceId") ?? "");
  if (!(await getMembership(workspaceId, user.id))) redirect(`/oauth/authorize?${params.toString()}`);
  const code = await createAuthorizationCode(req, user.id, workspaceId);
  target.searchParams.set("code", code);
  redirect(target.toString());
}
