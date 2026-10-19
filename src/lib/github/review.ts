import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { getUserGitHubToken } from "@/lib/auth/users";
import { env } from "@/lib/env";
import { gh, ghPaginate, GitHubError, type GhIssueComment, type GhReviewComment } from "./client";
import type { RepoContext } from "./connections";

type Author = { id: string; name: string };

/** Where a post came from. `agent` is the MCP client's name when an agent posted it, kept in the activity log. */
type PostMeta = { workspaceId: string; guideId: string | null; link?: string; agent?: string };

const agentData = (meta: { agent?: string }) => (meta.agent ? { agent: meta.agent } : {});

/** Token used to post on behalf of a user: their own GitHub credential if linked, else the workspace connection. */
async function postingCredentials(user: Author, ctx: RepoContext): Promise<{ token: string; as: "user" | "connection" }[]> {
  const own = await getUserGitHubToken(user.id).catch(() => null);
  const list: { token: string; as: "user" | "connection" }[] = [];
  if (own) list.push({ token: own, as: "user" });
  list.push({ token: ctx.token, as: "connection" });
  return list;
}

function attributed(body: string, user: Author, as: "user" | "connection", link?: string): string {
  if (as === "user") return body;
  const via = link ? `[Omakaze](${link})` : "Omakaze";
  return `${body}\n\n<sub>Posted by ${user.name} via ${via}</sub>`;
}

/** Try each credential; fall back when the user's own token cannot access the repository. */
async function withPoster<T>(
  user: Author,
  ctx: RepoContext,
  fn: (token: string, as: "user" | "connection") => Promise<T>,
): Promise<{ result: T; as: "user" | "connection" }> {
  const creds = await postingCredentials(user, ctx);
  let lastErr: unknown;
  for (const c of creds) {
    try {
      return { result: await fn(c.token, c.as), as: c.as };
    } catch (err) {
      lastErr = err;
      if (c.as === "user" && err instanceof GitHubError && [401, 403, 404].includes(err.status)) continue;
      throw err;
    }
  }
  throw lastErr;
}

// On globalThis, so the webhook route's invalidation reaches the cache other routes read.
const globalForComments = globalThis as unknown as { __omakazeReviewComments?: Map<string, { at: number; data: GhReviewComment[] }> };
const commentCache = (globalForComments.__omakazeReviewComments ??= new Map());

/** Drop cached review comments, e.g. when a webhook says they changed on GitHub. */
export function invalidateReviewComments(repositoryId: string, prNumber: number): void {
  commentCache.delete(`${repositoryId}:${prNumber}`);
}

export async function listReviewComments(ctx: RepoContext, prNumber: number, fresh = false): Promise<GhReviewComment[]> {
  const key = `${ctx.repo.id}:${prNumber}`;
  const hit = commentCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 10_000) return hit.data;
  const data = await ghPaginate<GhReviewComment>(ctx.token, `/repos/${ctx.repo.owner}/${ctx.repo.name}/pulls/${prNumber}/comments`, {
    maxItems: 2000,
  });
  commentCache.set(key, { at: Date.now(), data });
  return data;
}

export async function listIssueComments(ctx: RepoContext, prNumber: number): Promise<GhIssueComment[]> {
  return ghPaginate<GhIssueComment>(ctx.token, `/repos/${ctx.repo.owner}/${ctx.repo.name}/issues/${prNumber}/comments`, {
    maxItems: 500,
  });
}

export type NewReviewComment = {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  startLine?: number | null;
  startSide?: "LEFT" | "RIGHT" | null;
  body: string;
  commitSha: string;
};

export async function createReviewComment(
  ctx: RepoContext,
  prNumber: number,
  user: Author,
  input: NewReviewComment,
  meta: PostMeta & { sectionId: string | null },
): Promise<GhReviewComment> {
  const { result, as } = await withPoster(user, ctx, (token, as) =>
    gh<GhReviewComment>(token, `/repos/${ctx.repo.owner}/${ctx.repo.name}/pulls/${prNumber}/comments`, {
      method: "POST",
      body: {
        body: attributed(input.body, user, as, meta.link),
        commit_id: input.commitSha,
        path: input.path,
        line: input.line,
        side: input.side,
        ...(input.startLine && input.startLine !== input.line
          ? { start_line: input.startLine, start_side: input.startSide ?? input.side }
          : {}),
      },
    }),
  );
  commentCache.delete(`${ctx.repo.id}:${prNumber}`);
  await db.insert(comments).values({
    workspaceId: meta.workspaceId,
    repositoryId: ctx.repo.id,
    prNumber,
    guideId: meta.guideId,
    sectionId: meta.sectionId,
    authorUserId: user.id,
    kind: "review",
    path: input.path,
    line: input.line,
    startLine: input.startLine ?? null,
    side: input.side,
    commitSha: input.commitSha,
    body: input.body,
    githubId: result.id,
    githubUrl: result.html_url,
    postedAs: as,
  });
  await logActivity({
    workspaceId: meta.workspaceId,
    type: "comment.posted",
    actorUserId: user.id,
    repositoryId: ctx.repo.id,
    prNumber,
    guideId: meta.guideId,
    data: { path: input.path, line: input.line, url: result.html_url, ...agentData(meta) },
  });
  return result;
}

export async function replyToReviewComment(
  ctx: RepoContext,
  prNumber: number,
  user: Author,
  inReplyTo: number,
  body: string,
  meta: PostMeta,
): Promise<GhReviewComment> {
  const { result, as } = await withPoster(user, ctx, (token, as) =>
    gh<GhReviewComment>(token, `/repos/${ctx.repo.owner}/${ctx.repo.name}/pulls/${prNumber}/comments/${inReplyTo}/replies`, {
      method: "POST",
      body: { body: attributed(body, user, as, meta.link) },
    }),
  );
  commentCache.delete(`${ctx.repo.id}:${prNumber}`);
  await db.insert(comments).values({
    workspaceId: meta.workspaceId,
    repositoryId: ctx.repo.id,
    prNumber,
    guideId: meta.guideId,
    authorUserId: user.id,
    kind: "reply",
    path: result.path,
    line: result.line,
    side: result.side,
    body,
    inReplyToGithubId: inReplyTo,
    githubId: result.id,
    githubUrl: result.html_url,
    postedAs: as,
  });
  await logActivity({
    workspaceId: meta.workspaceId,
    type: "comment.posted",
    actorUserId: user.id,
    repositoryId: ctx.repo.id,
    prNumber,
    guideId: meta.guideId,
    data: { path: result.path, reply: true, url: result.html_url, ...agentData(meta) },
  });
  return result;
}

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export async function submitReview(
  ctx: RepoContext,
  prNumber: number,
  user: Author,
  input: { event: ReviewEvent; body: string; commitSha: string },
  meta: PostMeta,
): Promise<{ id: number; html_url: string; state: string; postedAs: "user" | "connection" }> {
  const { result, as } = await withPoster(user, ctx, (token, as) => {
    // Approvals posted through a shared connection would be attributed to the connection owner.
    if (as === "connection" && input.event !== "COMMENT") {
      throw new GitHubError("Link your GitHub account to approve or request changes.", 403, "review");
    }
    return gh<{ id: number; html_url: string; state: string }>(token, `/repos/${ctx.repo.owner}/${ctx.repo.name}/pulls/${prNumber}/reviews`, {
      method: "POST",
      body: {
        commit_id: input.commitSha,
        event: input.event,
        body: input.body ? attributed(input.body, user, as, meta.link) : as === "connection" ? attributed("Reviewed.", user, as, meta.link) : "",
      },
    });
  });
  await db.insert(comments).values({
    workspaceId: meta.workspaceId,
    repositoryId: ctx.repo.id,
    prNumber,
    guideId: meta.guideId,
    authorUserId: user.id,
    kind: "review_submit",
    body: `${input.event}${input.body ? `: ${input.body}` : ""}`,
    githubId: result.id,
    githubUrl: result.html_url,
    postedAs: as,
  });
  await logActivity({
    workspaceId: meta.workspaceId,
    type: "review.submitted",
    actorUserId: user.id,
    repositoryId: ctx.repo.id,
    prNumber,
    guideId: meta.guideId,
    data: { event: input.event, url: result.html_url, ...agentData(meta) },
  });
  return { ...result, postedAs: as };
}

export async function postIssueComment(
  ctx: RepoContext,
  prNumber: number,
  user: Author,
  body: string,
  meta: PostMeta,
): Promise<GhIssueComment> {
  const { result, as } = await withPoster(user, ctx, (token, as) =>
    gh<GhIssueComment>(token, `/repos/${ctx.repo.owner}/${ctx.repo.name}/issues/${prNumber}/comments`, {
      method: "POST",
      body: { body: attributed(body, user, as, meta.link) },
    }),
  );
  await db.insert(comments).values({
    workspaceId: meta.workspaceId,
    repositoryId: ctx.repo.id,
    prNumber,
    guideId: meta.guideId,
    authorUserId: user.id,
    kind: "issue",
    body,
    githubId: result.id,
    githubUrl: result.html_url,
    postedAs: as,
  });
  await logActivity({
    workspaceId: meta.workspaceId,
    type: "comment.posted",
    actorUserId: user.id,
    repositoryId: ctx.repo.id,
    prNumber,
    guideId: meta.guideId,
    data: { conversation: true, url: result.html_url, ...agentData(meta) },
  });
  return result;
}

/** Delete a review comment the user wrote (directly or through the workspace connection). */
export async function deleteReviewComment(ctx: RepoContext, prNumber: number, user: Author, githubId: number): Promise<void> {
  const [ours] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.repositoryId, ctx.repo.id), eq(comments.githubId, githubId)))
    .limit(1);
  const own = await getUserGitHubToken(user.id).catch(() => null);
  let token: string | null = null;
  if (ours && ours.authorUserId === user.id) token = ours.postedAs === "user" && own ? own : ctx.token;
  else if (own) {
    const login = (await gh<{ login: string }>(own, "/user")).login;
    const c = await gh<GhReviewComment>(ctx.token, `/repos/${ctx.repo.owner}/${ctx.repo.name}/pulls/comments/${githubId}`).catch((err) => {
      if (err instanceof GitHubError && err.status === 404) return null;
      throw err;
    });
    if (!c) return; // already deleted
    if (c.user?.login === login) token = own;
  }
  if (!token) throw new GitHubError("You can only delete your own comments.", 403, "delete");
  try {
    await gh(token, `/repos/${ctx.repo.owner}/${ctx.repo.name}/pulls/comments/${githubId}`, { method: "DELETE" });
  } catch (err) {
    // Already gone (e.g. deleted on GitHub or a double click).
    if (!(err instanceof GitHubError && err.status === 404)) throw err;
  }
  commentCache.delete(`${ctx.repo.id}:${prNumber}`);
  if (ours) await db.delete(comments).where(eq(comments.id, ours.id));
}

/** GitHub ids of comments this user posted through Omakaze. */
export async function ownCommentIds(repositoryId: string, prNumber: number, userId: string): Promise<Set<number>> {
  const rows = await db
    .select({ githubId: comments.githubId })
    .from(comments)
    .where(and(eq(comments.repositoryId, repositoryId), eq(comments.prNumber, prNumber), eq(comments.authorUserId, userId)));
  return new Set(rows.map((r) => r.githubId).filter((x): x is number => x !== null));
}

export async function commentsPostedThroughApp(repositoryId: string, prNumber: number) {
  return db
    .select()
    .from(comments)
    .where(and(eq(comments.repositoryId, repositoryId), eq(comments.prNumber, prNumber)));
}

export function appLink(path: string): string {
  return `${env().APP_URL}${path}`;
}
