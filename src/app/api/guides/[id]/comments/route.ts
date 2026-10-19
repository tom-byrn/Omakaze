import { z } from "zod";
import { ConnectionError, getRepoContext } from "@/lib/github/connections";
import { createReviewComment, deleteReviewComment, listReviewComments, ownCommentIds, replyToReviewComment } from "@/lib/github/review";
import { getGitHubAccount } from "@/lib/auth/users";
import { requireGuideAccess } from "@/lib/guides/access";
import { guidePath } from "@/lib/guides/service";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/http";
import { requireGuideReadAccess, SHARE_RESPONSE_HEADERS } from "@/lib/share/access";
import { env } from "@/lib/env";
import { GitHubError, type GhReviewComment } from "@/lib/github/client";
import { commentedLines, hasSuggestion } from "@/lib/github/suggestions";
import { findReviewThread, listReviewThreads, threadIndex, type ReviewThread } from "@/lib/github/threads";

/** A review comment as the viewer uses it (src/components/guide/types.ts). */
function viewerComment(c: GhReviewComment, opts: { mine: boolean; threadId: string | null }) {
  return {
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
    mine: opts.mine,
    threadId: opts.threadId,
    // The lines a suggestion replaces, from the hunk GitHub sends with the comment.
    commentedLines: hasSuggestion(c.body)
      ? commentedLines(c.diff_hunk, { side: c.side ?? "RIGHT", line: c.original_line, startLine: c.original_start_line })
      : null,
  };
}

function viewerThreads(threads: ReviewThread[]) {
  return threads.map((t) => ({ id: t.id, isResolved: t.isResolved, resolvedBy: t.resolvedBy }));
}

export async function GET(req: Request, ctx: RouteContext<"/api/guides/[id]/comments">) {
  try {
    const { id } = await ctx.params;
    // Members, or a share link created with comments (read-only, nothing is "mine").
    const { guide, principal, share } = await requireGuideReadAccess(req, id, { comments: true });
    const init = share ? { headers: SHARE_RESPONSE_HEADERS } : undefined;
    const rc = await getRepoContext(guide.repositoryId).catch((err) => {
      if (err instanceof ConnectionError) return null;
      throw err;
    });
    // Without a GitHub connection there is nothing to read; the guide itself stays available.
    if (!rc) return Response.json({ comments: [], disconnected: true }, init);
    const fresh = !share && new URL(req.url).searchParams.get("fresh") === "1";
    // Thread state comes from GraphQL; without it the comments still load, just without resolving.
    const threadList = (fresh: boolean) =>
      listReviewThreads(rc, guide.prNumber, fresh).catch((err) => {
        console.warn("[comments] review threads unavailable:", err instanceof Error ? err.message : err);
        return null;
      });
    const [list, mine, account, cached] = await Promise.all([
      listReviewComments(rc, guide.prNumber, fresh),
      principal ? ownCommentIds(guide.repositoryId, guide.prNumber, principal.user.id) : new Set<number>(),
      principal ? getGitHubAccount(principal.user.id) : null,
      threadList(fresh),
    ]);
    let threads = cached;
    let index = threadIndex(threads ?? []);
    // A conversation started after the threads were cached (a minute ago at most): read them again.
    const isNew = (c: GhReviewComment) => !c.in_reply_to_id && !index.has(c.id) && Date.now() - Date.parse(c.created_at) < 60_000;
    if (threads && !fresh && list.some(isNew)) {
      threads = (await threadList(true)) ?? threads;
      index = threadIndex(threads);
    }
    return Response.json(
      {
        comments: list.map((c) =>
          viewerComment(c, {
            mine: mine.has(c.id) || (account !== null && c.user?.login === account.login),
            // A thread lists its first 100 comments; later replies belong to their root's thread.
            threadId: (index.get(c.id) ?? (c.in_reply_to_id ? index.get(c.in_reply_to_id) : undefined))?.id ?? null,
          }),
        ),
        threads: threads ? viewerThreads(threads) : null,
      },
      init,
    );
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
      // The new comment's thread, so it can be resolved right away (null if GraphQL is unavailable).
      const thread = await findReviewThread(rc, guide.prNumber, { commentId: created.id }).catch(() => null);
      return Response.json({
        ok: true,
        id: created.id,
        htmlUrl: created.html_url,
        comment: viewerComment(created, { mine: true, threadId: thread?.id ?? null }),
        thread: thread ? viewerThreads([thread])[0] : null,
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
