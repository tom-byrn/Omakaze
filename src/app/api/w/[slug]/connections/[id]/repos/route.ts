import { eq } from "drizzle-orm";
import { db } from "@/db";
import { repositories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getConnection, listConnectionRepos } from "@/lib/github/connections";
import { errorResponse, HttpError } from "@/lib/http";
import { getMembership, getWorkspaceBySlug, roleAtLeast } from "@/lib/workspaces";

/** Repositories a connection can access, for the "Add repository" picker. */
export async function GET(_req: Request, ctx: RouteContext<"/api/w/[slug]/connections/[id]/repos">) {
  try {
    const { slug, id } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "Sign in required");
    const ws = await getWorkspaceBySlug(slug);
    const role = ws ? await getMembership(ws.id, user.id) : null;
    if (!ws || !role || !roleAtLeast(role, "admin")) throw new HttpError(404, "Not found");
    const conn = await getConnection(id);
    if (!conn || conn.workspaceId !== ws.id) throw new HttpError(404, "Connection not found");
    const { repos, error } = await listConnectionRepos(conn);
    const added = new Set(
      (await db.select({ githubId: repositories.githubId }).from(repositories).where(eq(repositories.workspaceId, ws.id))).map(
        (r) => r.githubId,
      ),
    );
    return Response.json({
      error,
      repos: repos
        .filter((r) => !r.archived)
        .map((r) => ({
          fullName: r.full_name,
          private: r.private,
          description: r.description,
          pushedAt: r.pushed_at ?? null,
          added: added.has(r.id),
        })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
