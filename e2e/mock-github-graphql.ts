/**
 * GraphQL for the mock GitHub API (`POST /graphql`, registered in mock-github.ts).
 *
 * The endpoint hands each request to the resolvers in `graphqlResolvers` in turn; the first one
 * that returns a reply answers it. A resolver looks at the query text, since the mock doesn't
 * parse GraphQL. To support another query:
 *
 *   graphqlResolvers.push(({ query, variables }, ctx) => (query.includes("search(") ? { json: { data: … } } : null));
 *
 * Review threads are built from the mock's review comments: each root comment and its replies
 * form one thread with the node ID `PRRT_mock<root comment id>`. Resolution state lives in
 * `state.extra.reviewThreads` (root comment id → who resolved it), starting from
 * DEMO_RESOLVED_THREADS.
 */
import { DEMO_REPO, DEMO_RESOLVED_THREADS } from "../scripts/demo-data";
import type { MockContext, MockReply, MockRoute, MockState, ReviewCommentJson } from "./mock-github";

export type GraphqlRequest = { query: string; variables: Record<string, unknown> };
export type GraphqlResolver = (req: GraphqlRequest, ctx: MockContext) => MockReply | null | Promise<MockReply | null>;

export const graphqlResolvers: GraphqlResolver[] = [];

export const graphqlRoute: MockRoute = {
  method: "POST",
  pattern: "/graphql",
  handle: async (ctx) => {
    const b = (ctx.body ?? {}) as { query?: unknown; variables?: unknown };
    if (typeof b.query !== "string") return { status: 400, json: { message: "Problems parsing JSON" } };
    const req = { query: b.query, variables: (b.variables ?? {}) as Record<string, unknown> };
    for (const resolve of graphqlResolvers) {
      const reply = await resolve(req, ctx);
      if (reply) return reply;
    }
    const first = req.query.trim().split("\n")[0];
    console.warn(`[mock-github] no GraphQL resolver for ${first}`);
    return { json: { errors: [{ message: `Mock GitHub has no GraphQL resolver for "${first}". Add one to graphqlResolvers in e2e/mock-github-graphql.ts.` }] } };
  },
};

/* Review threads -------------------------------------------------------------------------- */

type Resolution = { resolvedBy: string };

function resolutions(state: MockState): Record<string, Resolution | null> {
  state.extra.reviewThreads ??= Object.fromEntries(Object.entries(DEMO_RESOLVED_THREADS).map(([id, login]) => [id, { resolvedBy: login }]));
  return state.extra.reviewThreads as Record<string, Resolution | null>;
}

export function threadNodeId(rootId: number): string {
  return `PRRT_mock${rootId}`;
}

function rootOf(state: MockState, c: ReviewCommentJson): ReviewCommentJson {
  return c.in_reply_to_id ? (state.reviewComments.find((x) => x.id === c.in_reply_to_id) ?? c) : c;
}

function threadNode(state: MockState, root: ReviewCommentJson) {
  const comments = state.reviewComments.filter((c) => c.id === root.id || rootOf(state, c).id === root.id).sort((a, b) => a.id - b.id);
  const resolution = resolutions(state)[root.id];
  return {
    id: threadNodeId(root.id),
    isResolved: Boolean(resolution),
    isOutdated: root.line === null,
    resolvedBy: resolution ? { login: resolution.resolvedBy } : null,
    comments: { nodes: comments.map((c) => ({ databaseId: c.id })) },
  };
}

const notFound = (path: string[], message: string): MockReply => ({
  json: { data: { [path[0]]: null }, errors: [{ type: "NOT_FOUND", path, message }] },
});

// query { repository(owner, name) { pullRequest(number) { reviewThreads { … } } } }
graphqlResolvers.push(({ query, variables }, ctx) => {
  if (!/\breviewThreads\b/.test(query)) return null;
  const { owner, name, number } = variables as { owner?: string; name?: string; number?: number };
  if (`${owner}/${name}`.toLowerCase() !== DEMO_REPO.fullName) {
    return notFound(["repository"], `Could not resolve to a Repository with the name '${owner}/${name}'.`);
  }
  const pull = ctx.state.demo.pulls.find((p) => p.number === number);
  if (!pull) return { json: { data: { repository: { pullRequest: null } }, errors: [{ type: "NOT_FOUND", path: ["repository", "pullRequest"], message: `Could not resolve to a PullRequest with the number of ${number}.` }] } };
  const roots = ctx.state.reviewComments.filter((c) => c._pr === pull.number && rootOf(ctx.state, c).id === c.id).sort((a, b) => a.id - b.id);
  return {
    json: {
      data: {
        repository: {
          pullRequest: {
            reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: roots.map((r) => threadNode(ctx.state, r)) },
          },
        },
      },
    },
  };
});

// mutation { resolveReviewThread(input: { threadId }) { thread { … } } }, and unresolveReviewThread
graphqlResolvers.push(({ query, variables }, ctx) => {
  const op = /\bunresolveReviewThread\b/.test(query) ? "unresolveReviewThread" : /\bresolveReviewThread\b/.test(query) ? "resolveReviewThread" : null;
  if (!op) return null;
  const threadId = String(variables.threadId ?? "");
  const rootId = Number(/^PRRT_mock(\d+)$/.exec(threadId)?.[1]);
  const root = ctx.state.reviewComments.find((c) => c.id === rootId && !c.in_reply_to_id);
  if (!root) return notFound([op], `Could not resolve to a node with the global id of '${threadId}'.`);
  resolutions(ctx.state)[root.id] = op === "resolveReviewThread" ? { resolvedBy: ctx.user!.login } : null;
  return { json: { data: { [op]: { thread: threadNode(ctx.state, root) } } } };
});
