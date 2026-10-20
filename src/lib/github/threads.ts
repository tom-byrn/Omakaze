import { logActivity } from "@/lib/activity";
import { getUserGitHubToken } from "@/lib/auth/users";
import { GitHubError } from "./client";
import type { RepoContext } from "./connections";
import { ghGraphql } from "./graphql";
import { listReviewComments } from "./review";

/**
 * Review threads ("conversations") of a pull request. GitHub's REST API has no thread objects or
 * resolution state, so they come from GraphQL: `pullRequest.reviewThreads` maps the REST
 * comment IDs (GraphQL `databaseId`) to thread node IDs, and `resolveReviewThread` /
 * `unresolveReviewThread` change the state.
 */
export type ReviewThread = {
  /** GraphQL node ID (`PRRT_…`), the input of the resolve mutations. */
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  /** Login of who resolved it, when resolved. */
  resolvedBy: string | null;
  /** REST IDs of the thread's comments, oldest first; the first is the thread's root comment. */
  commentIds: number[];
};

export type ThreadNode = {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  resolvedBy: { login: string } | null;
  comments: { nodes: ({ databaseId: number | null } | null)[] };
};

const THREAD_FIELDS = `fragment OmakazeThread on PullRequestReviewThread {
  id
  isResolved
  isOutdated
  resolvedBy { login }
  comments(first: 100) { nodes { databaseId } }
}`;

const THREADS_QUERY = `query OmakazeReviewThreads($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { ...OmakazeThread }
      }
    }
  }
}
${THREAD_FIELDS}`;

const RESOLVE_MUTATION = `mutation OmakazeResolveThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) { thread { ...OmakazeThread } }
}
${THREAD_FIELDS}`;

const UNRESOLVE_MUTATION = `mutation OmakazeUnresolveThread($threadId: ID!) {
  unresolveReviewThread(input: { threadId: $threadId }) { thread { ...OmakazeThread } }
}
${THREAD_FIELDS}`;

type ThreadsPage = {
  repository: {
    pullRequest: {
      reviewThreads: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: (ThreadNode | null)[] };
    } | null;
  } | null;
};

export function toReviewThread(node: ThreadNode): ReviewThread {
  return {
    id: node.id,
    isResolved: node.isResolved,
    isOutdated: node.isOutdated,
    resolvedBy: node.resolvedBy?.login ?? null,
    commentIds: (node.comments?.nodes ?? []).map((c) => c?.databaseId).filter((n): n is number => typeof n === "number"),
  };
}

/** Index threads by the REST IDs of their comments. */
export function threadIndex(threads: ReviewThread[]): Map<number, ReviewThread> {
  const out = new Map<number, ReviewThread>();
  for (const t of threads) for (const id of t.commentIds) out.set(id, t);
  return out;
}

/** Every review thread of a pull request (up to 2,000), straight from GitHub. */
export async function fetchReviewThreads(token: string, owner: string, name: string, prNumber: number, maxPages = 20): Promise<ReviewThread[]> {
  const out: ReviewThread[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const data: ThreadsPage = await ghGraphql<ThreadsPage>(token, THREADS_QUERY, { owner, name, number: prNumber, cursor });
    const threads = data.repository?.pullRequest?.reviewThreads;
    if (!threads) break;
    for (const node of threads.nodes) if (node) out.push(toReviewThread(node));
    if (!threads.pageInfo.hasNextPage || !threads.pageInfo.endCursor) break;
    cursor = threads.pageInfo.endCursor;
  }
  return out;
}

// Kept as long as review comments (10 seconds); failures too, so a GitHub without GraphQL access
// isn't asked again on every request. On globalThis, so the webhook route's invalidation reaches
// the cache other routes read (route modules aren't shared in development).
type ThreadCache = Map<string, { at: number; data: ReviewThread[] | null; error: unknown }>;
const globalForThreads = globalThis as unknown as { __omakazeReviewThreads?: ThreadCache };
const threadCache: ThreadCache = (globalForThreads.__omakazeReviewThreads ??= new Map());

/** Drop cached threads, e.g. when a webhook says a conversation was resolved on GitHub. */
export function invalidateReviewThreads(repositoryId: string, prNumber: number): void {
  threadCache.delete(`${repositoryId}:${prNumber}`);
}

export async function listReviewThreads(ctx: RepoContext, prNumber: number, fresh = false): Promise<ReviewThread[]> {
  const key = `${ctx.repo.id}:${prNumber}`;
  const hit = threadCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 10_000) {
    if (hit.data) return hit.data;
    throw hit.error;
  }
  try {
    const data = await fetchReviewThreads(ctx.token, ctx.repo.owner, ctx.repo.name, prNumber);
    threadCache.set(key, { at: Date.now(), data, error: null });
    return data;
  } catch (err) {
    threadCache.set(key, { at: Date.now(), data: null, error: err });
    throw err;
  }
}

export type ThreadRef = { threadId?: string | null; commentId?: number | null };

function matches(t: ReviewThread, ref: ThreadRef): boolean {
  return ref.threadId ? t.id === ref.threadId : ref.commentId ? t.commentIds.includes(ref.commentId) : false;
}

/**
 * The pull request's thread with this node ID, or the one containing this comment. Reads GitHub
 * again when the cached list doesn't have it (a comment posted a moment ago). Returns null for
 * threads of other pull requests, so a node ID can't be used to reach them.
 */
export async function findReviewThread(ctx: RepoContext, prNumber: number, ref: ThreadRef): Promise<ReviewThread | null> {
  const cached = await listReviewThreads(ctx, prNumber).catch(() => []);
  const hit = cached.find((t) => matches(t, ref));
  if (hit) return hit;
  return (await listReviewThreads(ctx, prNumber, true)).find((t) => matches(t, ref)) ?? null;
}

function remember(ctx: RepoContext, prNumber: number, thread: ReviewThread): void {
  const hit = threadCache.get(`${ctx.repo.id}:${prNumber}`);
  if (hit?.data) hit.data = hit.data.map((t) => (t.id === thread.id ? thread : t));
}

export class ThreadNotFoundError extends Error {
  constructor() {
    super("This conversation is not part of the pull request.");
    this.name = "ThreadNotFoundError";
  }
}

/**
 * Resolve or unresolve a review thread of the pull request with the user's own GitHub credential.
 * Like approvals, this never goes through the workspace connection: resolving can be required
 * before merging, so GitHub's rules on who may resolve apply to the user, and GitHub shows them.
 */
export async function setReviewThreadResolved(
  ctx: RepoContext,
  prNumber: number,
  user: { id: string },
  ref: ThreadRef,
  resolved: boolean,
  meta: { workspaceId: string; guideId: string | null; agent?: string },
): Promise<{ thread: ReviewThread }> {
  const token = await getUserGitHubToken(user.id).catch(() => null);
  if (!token) throw new GitHubError("Link your GitHub account to resolve conversations.", 403, "graphql");
  const found = await findReviewThread(ctx, prNumber, ref);
  if (!found) throw new ThreadNotFoundError();
  const field = resolved ? "resolveReviewThread" : "unresolveReviewThread";
  const data = await ghGraphql<Record<string, { thread: ThreadNode } | null>>(token, resolved ? RESOLVE_MUTATION : UNRESOLVE_MUTATION, {
    threadId: found.id,
  });
  const node = data[field]?.thread;
  const result = node ? toReviewThread(node) : { ...found, isResolved: resolved, resolvedBy: resolved ? found.resolvedBy : null };
  remember(ctx, prNumber, result);
  const root = (await listReviewComments(ctx, prNumber).catch(() => [])).find((c) => c.id === result.commentIds[0]);
  await logActivity({
    workspaceId: meta.workspaceId,
    type: resolved ? "thread.resolved" : "thread.unresolved",
    actorUserId: user.id,
    repositoryId: ctx.repo.id,
    prNumber,
    guideId: meta.guideId,
    data: { path: root?.path, line: root?.line ?? root?.original_line, url: root?.html_url, ...(meta.agent ? { agent: meta.agent } : {}) },
  });
  return { thread: result };
}
