import { afterEach, describe, expect, it, vi } from "vitest";
import { groupThreads, type ReviewComment } from "@/components/guide/types";
import { GitHubError } from "@/lib/github/client";
import { ghGraphql, graphqlUrl } from "@/lib/github/graphql";
import { fetchReviewThreads, threadIndex, toReviewThread, type ThreadNode } from "@/lib/github/threads";

describe("graphqlUrl", () => {
  it("uses /graphql on github.com", () => {
    expect(graphqlUrl("https://api.github.com")).toBe("https://api.github.com/graphql");
    expect(graphqlUrl("https://api.github.com/")).toBe("https://api.github.com/graphql");
  });

  it("uses /api/graphql on GitHub Enterprise Server", () => {
    expect(graphqlUrl("https://github.acme.com/api/v3")).toBe("https://github.acme.com/api/graphql");
    expect(graphqlUrl("https://github.acme.com/api/v3/")).toBe("https://github.acme.com/api/graphql");
  });

  it("appends /graphql to other bases", () => {
    expect(graphqlUrl("https://api.acme.ghe.com")).toBe("https://api.acme.ghe.com/graphql");
    expect(graphqlUrl("http://127.0.0.1:3199")).toBe("http://127.0.0.1:3199/graphql");
  });

  it("defaults to GITHUB_API_URL", () => {
    expect(graphqlUrl()).toBe("https://api.github.com/graphql");
  });
});

const node = (id: string, ids: (number | null)[], resolved = false): ThreadNode => ({
  id,
  isResolved: resolved,
  isOutdated: false,
  resolvedBy: resolved ? { login: "mayachen" } : null,
  comments: { nodes: ids.map((databaseId) => ({ databaseId })) },
});

describe("review thread mapping", () => {
  it("maps GraphQL nodes to threads with REST comment IDs", () => {
    expect(toReviewThread(node("PRRT_1", [11, null, 12], true))).toEqual({
      id: "PRRT_1",
      isResolved: true,
      isOutdated: false,
      resolvedBy: "mayachen",
      commentIds: [11, 12],
    });
  });

  it("indexes threads by every comment ID", () => {
    const threads = [toReviewThread(node("PRRT_1", [11, 12])), toReviewThread(node("PRRT_2", [20]))];
    const index = threadIndex(threads);
    expect(index.get(11)?.id).toBe("PRRT_1");
    expect(index.get(12)?.id).toBe("PRRT_1");
    expect(index.get(20)?.id).toBe("PRRT_2");
    expect(index.has(99)).toBe(false);
  });

  it("attaches thread state to grouped threads in the viewer", () => {
    const c = (id: number, extra: Partial<ReviewComment>): ReviewComment => ({
      id,
      inReplyTo: null,
      path: "a.ts",
      line: 3,
      originalLine: 3,
      startLine: null,
      side: "RIGHT",
      body: "x",
      user: null,
      createdAt: `2026-01-0${id % 9}T00:00:00Z`,
      htmlUrl: "",
      outdated: false,
      ...extra,
    });
    // The root has no thread ID (e.g. posted a moment ago), the reply does.
    const comments = [c(1, {}), c(2, { inReplyTo: 1, threadId: "PRRT_1" }), c(3, { line: 9, threadId: "PRRT_9" })];
    const states = new Map([
      ["PRRT_1", { id: "PRRT_1", isResolved: true, resolvedBy: "alexmorgan" }],
      ["PRRT_9", { id: "PRRT_9", isResolved: false, resolvedBy: null }],
    ]);
    const file = groupThreads(comments, states).get("a.ts")!;
    expect(file.get("RIGHT:3")![0].state).toEqual({ id: "PRRT_1", isResolved: true, resolvedBy: "alexmorgan" });
    expect(file.get("RIGHT:9")![0].state?.isResolved).toBe(false);
    expect(groupThreads(comments).get("a.ts")!.get("RIGHT:3")![0].state).toBeUndefined();
  });
});

/** The error a request fails with (fails the test when it succeeds). */
async function failure(p: Promise<unknown>): Promise<GitHubError> {
  return p.then(
    () => {
      throw new Error("expected the request to fail");
    },
    (err: unknown) => err as GitHubError,
  );
}

describe("GitHub GraphQL requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (body: unknown, status = 200) =>
    vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  it("posts the query and variables with the token", async () => {
    const fetch = respond({ data: { viewer: { login: "alexmorgan" } } });
    vi.stubGlobal("fetch", fetch);
    expect(await ghGraphql("tok", "query { viewer { login } }", { a: 1 })).toEqual({ viewer: { login: "alexmorgan" } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.github.com/graphql");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init?.body))).toEqual({ query: "query { viewer { login } }", variables: { a: 1 } });
  });

  it("turns GraphQL errors into GitHubErrors by type", async () => {
    vi.stubGlobal("fetch", respond({ data: { resolveReviewThread: null }, errors: [{ type: "FORBIDDEN", message: "Resource not accessible by integration" }] }));
    const err = await failure(ghGraphql("tok", "mutation { x }"));
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.status).toBe(403);
    expect(err.message).toContain("Resource not accessible by integration");

    vi.stubGlobal("fetch", respond({ errors: [{ type: "NOT_FOUND", message: "Could not resolve to a node" }] }));
    expect((await failure(ghGraphql("tok", "q"))).status).toBe(404);
    vi.stubGlobal("fetch", respond({ errors: [{ message: "Something else" }] }));
    expect((await failure(ghGraphql("tok", "q"))).status).toBe(422);
  });

  it("keeps HTTP errors", async () => {
    vi.stubGlobal("fetch", respond({ message: "Bad credentials" }, 401));
    const err = await failure(ghGraphql("tok", "q"));
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.status).toBe(401);
  });

  it("follows review thread pages", async () => {
    const page = (nodes: ThreadNode[], endCursor: string | null) => ({
      data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes } } } },
    });
    const bodies = [page([node("PRRT_1", [1])], "c1"), page([node("PRRT_2", [2, 3], true)], null)];
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(bodies.shift())));
    vi.stubGlobal("fetch", fetch);
    const threads = await fetchReviewThreads("tok", "acme", "storefront", 128);
    expect(threads.map((t) => [t.id, t.commentIds, t.isResolved])).toEqual([
      ["PRRT_1", [1], false],
      ["PRRT_2", [2, 3], true],
    ]);
    const vars = fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).variables);
    expect(vars).toEqual([
      { owner: "acme", name: "storefront", number: 128, cursor: null },
      { owner: "acme", name: "storefront", number: 128, cursor: "c1" },
    ]);
  });
});
