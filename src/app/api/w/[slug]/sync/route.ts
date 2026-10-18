import { and, eq, lt, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { repositories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getRepoContext } from "@/lib/github/connections";
import { syncRepositoryPulls } from "@/lib/github/pulls";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/http";
import { getMembership, getWorkspaceBySlug } from "@/lib/workspaces";

const STALE_MS = 60_000;

/** Refresh the PR cache for a workspace (or one repository). */
export async function POST(req: Request, ctx: RouteContext<"/api/w/[slug]/sync">) {
  try {
    assertSameOrigin(req);
    const { slug } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "Sign in required");
    const ws = await getWorkspaceBySlug(slug);
    if (!ws || !(await getMembership(ws.id, user.id))) throw new HttpError(404, "Workspace not found");
    const body = (await req.json().catch(() => ({}))) as { force?: boolean; repositoryId?: string };
    const staleBefore = new Date(Date.now() - (body.force ? 0 : STALE_MS));
    const repos = await db
      .select()
      .from(repositories)
      .where(
        and(
          eq(repositories.workspaceId, ws.id),
          body.repositoryId ? eq(repositories.id, body.repositoryId) : undefined,
          body.force ? undefined : or(isNull(repositories.lastSyncedAt), lt(repositories.lastSyncedAt, staleBefore)),
        ),
      );
    const errors: string[] = [];
    let synced = 0;
    await Promise.all(
      repos.map(async (repo) => {
        try {
          const result = await syncRepositoryPulls(await getRepoContext(repo.id));
          if (result.error) errors.push(`${repo.fullName}: ${result.error}`);
          synced += result.synced;
        } catch (err) {
          errors.push(`${repo.fullName}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );
    return Response.json({ repos: repos.length, synced, errors });
  } catch (err) {
    return errorResponse(err);
  }
}
