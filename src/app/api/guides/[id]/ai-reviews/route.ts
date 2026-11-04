import { skipAiReviewWait } from "@/lib/ai-reviewers/service";
import { logActivity } from "@/lib/activity";
import { requireGuideAccess } from "@/lib/guides/access";
import { appendGuideEvent } from "@/lib/guides/service";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/http";

/** "Skip waiting": write an automatic guide now, with the AI code reviews that are in. */
export async function POST(req: Request, ctx: RouteContext<"/api/guides/[id]/ai-reviews">) {
  try {
    assertSameOrigin(req);
    const { id } = await ctx.params;
    const { principal, guide } = await requireGuideAccess(req, id);
    if (guide.status !== "generating" || guide.aiReviews?.phase !== "waiting") throw new HttpError(409, "This guide is not waiting for AI code reviewers.");
    if (!(await skipAiReviewWait(guide.id))) throw new HttpError(409, "This guide is not waiting for AI code reviewers.");
    await appendGuideEvent(guide.id, `${principal.user.name} skipped waiting for AI code reviewers`);
    await logActivity({
      workspaceId: guide.workspaceId,
      type: "guide.ai_reviews_skipped",
      actorUserId: principal.user.id,
      repositoryId: guide.repositoryId,
      prNumber: guide.prNumber,
      guideId: guide.id,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
