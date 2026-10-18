import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { guides, repositories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { errorResponse, HttpError } from "@/lib/http";
import { getMembership, getWorkspaceBySlug } from "@/lib/workspaces";

/** Latest guide version of a PR (polled by the PR page). */
export async function GET(req: Request, ctx: RouteContext<"/api/w/[slug]/latest-guide">) {
  try {
    const { slug } = await ctx.params;
    const url = new URL(req.url);
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "Sign in required");
    const ws = await getWorkspaceBySlug(slug);
    if (!ws || !(await getMembership(ws.id, user.id))) throw new HttpError(404, "Not found");
    const repositoryId = url.searchParams.get("repositoryId") ?? "";
    const number = Number(url.searchParams.get("number"));
    const [row] = await db
      .select({ version: guides.version, status: guides.status, author: guides.author })
      .from(guides)
      .innerJoin(repositories, eq(repositories.id, guides.repositoryId))
      .where(and(eq(guides.repositoryId, repositoryId), eq(guides.prNumber, number), eq(repositories.workspaceId, ws.id)))
      .orderBy(desc(guides.version))
      .limit(1);
    return Response.json({ latest: row ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
