import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { githubConnections, workspaces } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth/session";
import { getGitHubAccount, getUserGitHubToken } from "@/lib/auth/users";
import { verifyPayload } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getInstallation, type GhInstallation } from "@/lib/github/app";
import { gh, ghPaginate } from "@/lib/github/client";
import { reattachRepositories } from "@/lib/github/connections";
import { getMembership, roleAtLeast } from "@/lib/workspaces";

/**
 * Whether the signed-in user may connect this installation. GitHub App user tokens can list the
 * installations they can access; other tokens (personal access tokens, OAuth Apps) can't, so for
 * them the user must be the account itself or an owner of the organization.
 */
async function canManageInstallation(token: string, userId: string, inst: GhInstallation): Promise<boolean> {
  const listed = await ghPaginate<{ id: number }, { installations: { id: number }[] }>(token, "/user/installations", {
    pick: (p) => p.installations,
    maxItems: 500,
  }).catch(() => null);
  if (listed?.some((i) => i.id === inst.id)) return true;
  const account = await getGitHubAccount(userId);
  if (!account) return false;
  if (inst.account.type === "User") return inst.account.id === account.githubId;
  const membership = await gh<{ state: string; role: string }>(token, `/user/memberships/orgs/${inst.account.login}`).catch(() => null);
  return membership?.state === "active" && membership.role === "admin";
}

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
  const inst = await getInstallation(installationId);
  if (!(await canManageInstallation(token, user.id, inst))) {
    return back(
      `error=${encodeURIComponent(`Your GitHub account can't manage the installation on ${inst.account.login}. Sign in with GitHub as an owner of ${inst.account.login} and try again.`)}`,
    );
  }

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
    const [conn] = await db
      .insert(githubConnections)
      .values({
        workspaceId: ws.id,
        type: "app",
        installationId,
        accountLogin: inst.account.login,
        accountType: inst.account.type === "Organization" ? "Organization" : "User",
        accountAvatarUrl: inst.account.avatar_url,
        createdByUserId: user.id,
      })
      .returning();
    await reattachRepositories(ws.id, conn);
    await logActivity({
      workspaceId: ws.id,
      type: "connection.created",
      actorUserId: user.id,
      data: { type: "app", login: inst.account.login },
    });
  }
  return back("connected=1");
}
