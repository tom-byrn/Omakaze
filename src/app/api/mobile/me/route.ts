import { resolveAiConfigFor } from "@/lib/ai/chatgpt";
import { getGitHubAccount } from "@/lib/auth/users";
import { env } from "@/lib/env";
import { errorResponse } from "@/lib/http";
import { mobileContext, NO_STORE } from "@/lib/mobile/context";
import { pushEnabled } from "@/lib/notifications/push";
import { canCreateShareLinks } from "@/lib/share/policy";
import { db } from "@/db";
import { repositories } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

/** GET /api/mobile/me — who the token belongs to, its workspace and what the app may offer there. */
export async function GET(req: Request) {
  try {
    const { user, workspace, role } = await mobileContext(req);
    const [account, ai, repos] = await Promise.all([
      getGitHubAccount(user.id),
      resolveAiConfigFor(workspace, user.id),
      db
        .select({ id: repositories.id, fullName: repositories.fullName, htmlUrl: repositories.htmlUrl, connected: repositories.connectionId })
        .from(repositories)
        .where(eq(repositories.workspaceId, workspace.id))
        .orderBy(asc(repositories.fullName)),
    ]);
    const shareOn = env().SHARE_LINKS_ENABLED && workspace.shareLinksEnabled;
    return Response.json(
      {
        instance: { url: env().APP_URL },
        user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, githubLogin: account?.login ?? null },
        workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
        role,
        repos: repos.map((r) => ({ id: r.id, fullName: r.fullName, htmlUrl: r.htmlUrl, connected: Boolean(r.connected) })),
        features: {
          ai: ai ? { model: ai.model, chatgptPlan: ai.source === "chatgpt" } : null,
          shareLinks: shareOn ? { canCreate: canCreateShareLinks(role, workspace.shareLinkRole) } : null,
          notifications: env().NOTIFICATIONS_ENABLED,
          push: pushEnabled(),
        },
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
