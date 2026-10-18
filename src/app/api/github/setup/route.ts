import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { githubConnections, workspaces } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserGitHubToken } from "@/lib/auth/users";
import { verifyPayload } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getInstallation } from "@/lib/github/app";
import { ghPaginate } from "@/lib/github/client";
import { getMembership, roleAtLeast } from "@/lib/workspaces";

/** GitHub App "Setup URL": called after the app is installed or its repositories change. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = env().APP_URL;
  const installationId = Number(url.searchParams.get("installation_id"));
  const state = verifyPayload<{ ws: string; uid: string }>(url.searchParams.get("state"), "github-install");
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${base}/login`);
  if (!state || !installationId) return NextResponse.redirect(`${base}/`);
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, state.ws)).limit(1);
  const role = ws ? await getMembership(ws.id, user.id) : null;
  if (!ws || state.uid !== user.id || !role || !roleAtLeast(role, "admin")) return NextResponse.redirect(`${base}/`);
  const back = (q: string) => NextResponse.redirect(`${base}/w/${ws.slug}/settings/github?${q}`);

  // The installing user must be able to see the installation; this stops linking someone else's installation id.
  const token = await getUserGitHubToken(user.id);
  if (!token) return back(`error=${encodeURIComponent("Sign in with GitHub to finish connecting the app.")}`);
  const mine = await ghPaginate<{ id: number }, { installations: { id: number }[] }>(token, "/user/installations", {
    pick: (p) => p.installations,
    maxItems: 500,
  }).catch(() => []);
  if (!mine.some((i) => i.id === installationId)) {
    return back(`error=${encodeURIComponent("Your GitHub account cannot access that installation.")}`);
  }

  const inst = await getInstallation(installationId);
  const [existing] = await db
    .select()
    .from(githubConnections)
    .where(and(eq(githubConnections.workspaceId, ws.id), eq(githubConnections.installationId, installationId)))
    .limit(1);
  if (existing) {
    await db
      .update(githubConnections)
      .set({ accountLogin: inst.account.login, accountAvatarUrl: inst.account.avatar_url, suspendedAt: null })
      .where(eq(githubConnections.id, existing.id));
  } else {
    await db.insert(githubConnections).values({
      workspaceId: ws.id,
      type: "app",
      installationId,
      accountLogin: inst.account.login,
      accountType: inst.account.type === "Organization" ? "Organization" : "User",
      accountAvatarUrl: inst.account.avatar_url,
      createdByUserId: user.id,
    });
    await logActivity({
      workspaceId: ws.id,
      type: "connection.created",
      actorUserId: user.id,
      data: { type: "app", login: inst.account.login },
    });
  }
  return back("connected=1");
}
