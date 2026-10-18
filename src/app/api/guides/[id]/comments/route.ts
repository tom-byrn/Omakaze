import { z } from "zod";
import { getRepoContext } from "@/lib/github/connections";
import { createReviewComment, deleteReviewComment, listReviewComments, ownCommentIds, replyToReviewComment } from "@/lib/github/review";
import { getGitHubAccount } from "@/lib/auth/users";
import { requireGuideAccess } from "@/lib/guides/access";
import { guidePath } from "@/lib/guides/service";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/http";
import { env } from "@/lib/env";
import { GitHubError } from "@/lib/github/client";

export async function GET(req: Request, ctx: RouteContext<"/api/guides/[id]/comments">) {
  try {
    const { id } = await ctx.params;
    const { guide, principal } = await requireGuideAccess(req, id);
    const rc = await getRepoContext(guide.repositoryId);
    const fresh = new URL(req.url).searchParams.get("fresh") === "1";
    const [list, mine, account] = await Promise.all([
      listReviewComments(rc, guide.prNumber, fresh),
      ownCommentIds(guide.repositoryId, guide.prNumber, principal.user.id),
      getGitHubAccount(principal.user.id),
    ]);
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
        mine: mine.has(c.id) || (account !== null && c.user?.login === account.login),
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
    const parsed = postSchema.safeParse(await readJson(req));
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
      return Response.json({
        ok: true,
        id: created.id,
        htmlUrl: created.html_url,
        comment: {
          id: created.id,
          inReplyTo: created.in_reply_to_id ?? null,
          path: created.path,
          line: created.line,
          originalLine: created.original_line,
          startLine: created.start_line,
          side: created.side ?? "RIGHT",
          body: created.body,
          user: created.user ? { login: created.user.login, avatarUrl: created.user.avatar_url } : null,
          createdAt: created.created_at,
          htmlUrl: created.html_url,
          outdated: created.line === null,
          mine: true,
        },
      });
    } catch (err) {
      if (err instanceof GitHubError) throw new HttpError(err.status === 422 ? 422 : 502, `GitHub: ${err.message}`);
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/guides/[id]/comments">) {
  try {
    assertSameOrigin(req);
    const { id } = await ctx.params;
    const { guide, principal } = await requireGuideAccess(req, id);
    const commentId = Number(new URL(req.url).searchParams.get("commentId"));
    if (!Number.isInteger(commentId) || commentId <= 0) throw new HttpError(400, "commentId is required");
    try {
      await deleteReviewComment(await getRepoContext(guide.repositoryId), guide.prNumber, { id: principal.user.id, name: principal.user.name }, commentId);
    } catch (err) {
      if (err instanceof GitHubError) throw new HttpError(err.status === 403 ? 403 : 502, err.message);
      throw err;
    }
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
