import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { repositories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getGuideCheckView } from "@/lib/github/guide-check";
import { errorResponse, HttpError } from "@/lib/http";
import { getMembership, getWorkspaceBySlug } from "@/lib/workspaces";

/** The guide check of a pull request as last posted to GitHub (polled by the PR page). */
export async function GET(req: Request, ctx: RouteContext<"/api/w/[slug]/guide-check">) {
  try {
    const { slug } = await ctx.params;
    const url = new URL(req.url);
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "Sign in required");
    const ws = await getWorkspaceBySlug(slug);
    if (!ws || !(await getMembership(ws.id, user.id))) throw new HttpError(404, "Not found");
    const repositoryId = url.searchParams.get("repositoryId") ?? "";
    const number = Number(url.searchParams.get("number"));
    const [repo] = await db
      .select({ id: repositories.id })
      .from(repositories)
      .where(and(eq(repositories.id, repositoryId), eq(repositories.workspaceId, ws.id)))
      .limit(1);
    if (!repo || !Number.isInteger(number)) throw new HttpError(404, "Not found");
    return Response.json(await getGuideCheckView(repo.id, number), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
