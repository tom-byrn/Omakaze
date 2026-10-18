import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { signPayload } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getGitHubApp, installUrl } from "@/lib/github/app";
import { getMembership, getWorkspaceBySlug, roleAtLeast } from "@/lib/workspaces";

/** Send an admin to GitHub to install the app for their workspace. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${env().APP_URL}/login`);
  const ws = await getWorkspaceBySlug(url.searchParams.get("workspace") ?? "");
  const role = ws ? await getMembership(ws.id, user.id) : null;
  if (!ws || !role || !roleAtLeast(role, "admin")) return NextResponse.redirect(`${env().APP_URL}/`);
  const app = await getGitHubApp();
  if (!app) return NextResponse.redirect(`${env().APP_URL}/w/${ws.slug}/settings/github?error=GitHub%20App%20not%20configured`);
  const state = signPayload({ ws: ws.id, uid: user.id }, "github-install", 3600);
  return NextResponse.redirect(installUrl(app, state));
}
