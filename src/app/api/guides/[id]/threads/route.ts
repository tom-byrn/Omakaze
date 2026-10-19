import { z } from "zod";
import { GitHubError } from "@/lib/github/client";
import { getRepoContext } from "@/lib/github/connections";
import { setReviewThreadResolved, ThreadNotFoundError } from "@/lib/github/threads";
import { requireGuideAccess } from "@/lib/guides/access";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/http";

const schema = z.object({
  threadId: z.string().trim().min(1).max(200),
  resolved: z.boolean(),
});

/** Resolve or unresolve a conversation (review thread) of the guide's pull request on GitHub. */
export async function POST(req: Request, ctx: RouteContext<"/api/guides/[id]/threads">) {
  try {
    assertSameOrigin(req);
    const { id } = await ctx.params;
    const { guide, principal, workspace } = await requireGuideAccess(req, id);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request");
    const rc = await getRepoContext(guide.repositoryId);
    try {
      const { thread } = await setReviewThreadResolved(
        rc,
        guide.prNumber,
        { id: principal.user.id },
        { threadId: parsed.data.threadId },
        parsed.data.resolved,
        { workspaceId: workspace.id, guideId: guide.id },
      );
      return Response.json({ ok: true, thread: { id: thread.id, isResolved: thread.isResolved, resolvedBy: thread.resolvedBy } });
    } catch (err) {
      if (err instanceof ThreadNotFoundError) throw new HttpError(404, err.message);
      if (err instanceof GitHubError) throw new HttpError(err.status === 403 ? 403 : 502, err.message);
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
