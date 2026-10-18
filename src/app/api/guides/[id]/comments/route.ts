import { z } from "zod";
import { getRepoContext } from "@/lib/github/connections";
import { createReviewComment, listReviewComments, replyToReviewComment } from "@/lib/github/review";
import { requireGuideAccess } from "@/lib/guides/access";
import { guidePath } from "@/lib/guides/service";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/http";
import { env } from "@/lib/env";
import { GitHubError } from "@/lib/github/client";

export async function GET(req: Request, ctx: RouteContext<"/api/guides/[id]/comments">) {
  try {
    const { id } = await ctx.params;
    const { guide } = await requireGuideAccess(req, id);
    const rc = await getRepoContext(guide.repositoryId);
    const fresh = new URL(req.url).searchParams.get("fresh") === "1";
    const list = await listReviewComments(rc, guide.prNumber, fresh);
    return Response.json({
      comments: list.map((c) => ({
        id: c.id,
        inReplyTo: c.in_reply_to_id ?? null,
        path: c.path,
        line: c.line,
        originalLine: c.original_line,
        startLine: c.start_line,
        side: c.side ?? "RIGHT",
        body: c.body,
        user: c.user ? { login: c.user.login, avatarUrl: c.user.avatar_url } : null,
        createdAt: c.created_at,
        htmlUrl: c.html_url,
        outdated: c.line === null,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const postSchema = z.union([
  z.object({
    body: z.string().trim().min(1).max(65000),
    inReplyTo: z.number().int(),
  }),
  z.object({
    body: z.string().trim().min(1).max(65000),
    path: z.string().min(1),
    line: z.number().int().positive(),
    side: z.enum(["LEFT", "RIGHT"]),
    startLine: z.number().int().positive().nullish(),
    sectionId: z.string().nullish(),
  }),
]);

export async function POST(req: Request, ctx: RouteContext<"/api/guides/[id]/comments">) {
  try {
    assertSameOrigin(req);
    const { id } = await ctx.params;
    const { guide, principal, workspace, repo } = await requireGuideAccess(req, id);
    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid comment");
    const rc = await getRepoContext(guide.repositoryId);
    const link = `${env().APP_URL}${guidePath(workspace.slug, repo.fullName, guide.prNumber)}`;
    const author = { id: principal.user.id, name: principal.user.name };
    try {
      const created =
        "inReplyTo" in parsed.data
          ? await replyToReviewComment(rc, guide.prNumber, author, parsed.data.inReplyTo, parsed.data.body, {
              workspaceId: workspace.id,
              guideId: guide.id,
              link,
            })
          : await createReviewComment(
              rc,
              guide.prNumber,
              author,
              {
                path: parsed.data.path,
                line: parsed.data.line,
                side: parsed.data.side,
                startLine: parsed.data.startLine ?? null,
                body: parsed.data.body,
                commitSha: guide.headSha,
              },
              { workspaceId: workspace.id, guideId: guide.id, sectionId: parsed.data.sectionId ?? null, link },
            );
      return Response.json({ ok: true, id: created.id, htmlUrl: created.html_url });
    } catch (err) {
      if (err instanceof GitHubError) throw new HttpError(err.status === 422 ? 422 : 502, `GitHub: ${err.message}`);
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
