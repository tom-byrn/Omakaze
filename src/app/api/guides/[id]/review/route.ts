import { z } from "zod";
import { env } from "@/lib/env";
import { GitHubError } from "@/lib/github/client";
import { getRepoContext } from "@/lib/github/connections";
import { postIssueComment, submitReview } from "@/lib/github/review";
import { requireGuideAccess } from "@/lib/guides/access";
import { guidePath } from "@/lib/guides/service";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/http";

const schema = z.object({
  event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT", "ISSUE_COMMENT"]),
  body: z.string().max(65000).default(""),
});

/** Submit a GitHub review (or a plain PR comment) from the guide. */
export async function POST(req: Request, ctx: RouteContext<"/api/guides/[id]/review">) {
  try {
    assertSameOrigin(req);
    const { id } = await ctx.params;
    const { guide, principal, workspace, repo } = await requireGuideAccess(req, id);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "Invalid review");
    const { event, body } = parsed.data;
    if ((event === "REQUEST_CHANGES" || event === "ISSUE_COMMENT") && !body.trim()) {
      throw new HttpError(400, "Write a comment first.");
    }
    const rc = await getRepoContext(guide.repositoryId);
    const author = { id: principal.user.id, name: principal.user.name };
    const meta = {
      workspaceId: workspace.id,
      guideId: guide.id,
      link: `${env().APP_URL}${guidePath(workspace.slug, repo.fullName, guide.prNumber)}`,
    };
    try {
      if (event === "ISSUE_COMMENT") {
        const c = await postIssueComment(rc, guide.prNumber, author, body, meta);
        return Response.json({ ok: true, htmlUrl: c.html_url });
      }
      const r = await submitReview(rc, guide.prNumber, author, { event, body, commitSha: guide.headSha }, meta);
      return Response.json({ ok: true, htmlUrl: r.html_url, state: r.state, postedAs: r.postedAs });
    } catch (err) {
      if (err instanceof GitHubError) throw new HttpError(err.status === 403 ? 403 : 502, err.message);
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
