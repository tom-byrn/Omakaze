/**
 * A small stand-in for the GitHub REST API, serving the demo repository (acme/storefront).
 *
 * The e2e global setup starts it on E2E_GITHUB_PORT (default 3199) and the app under test gets
 * GITHUB_API_URL pointing at it. Run it on its own with `pnpm e2e:mock-github`.
 *
 * - Every request is recorded: GET /__mock/requests (DELETE to clear). Specs use `mockGitHub` below.
 * - Unknown requests get a 404 JSON response and are logged.
 * - Add endpoints to `routes`: `routes.push({ method: "POST", pattern: "/repos/:owner/:repo/check-runs", handle })`.
 *   A pattern segment `:name` matches one path segment and `*name` the rest of the path.
 * - State (comments, reviews, check runs) lives in memory and is rebuilt from the demo data by
 *   POST /__mock/reset.
 */
import http from "node:http";
import { pathToFileURL } from "node:url";
import { parsePatch } from "../src/lib/diff/parse";
import {
  buildDemo,
  DEMO_CONNECTION,
  DEMO_GITHUB_PEOPLE,
  DEMO_REPO,
  DEMO_REVIEWS,
  DEMO_USERS,
  githubAvatar,
  type Demo,
  type DemoPull,
} from "../scripts/demo-data";
import { E2E, githubApiUrl } from "./config";
import { graphqlRoute } from "./mock-github-graphql";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type MockRequest = {
  id: number;
  at: string;
  method: string;
  path: string;
  query: Record<string, string>;
  /** Login of the user the token belongs to, or null. */
  user: string | null;
  body: unknown;
  status: number;
  /** Pattern of the route that answered, "stub" or null (404). */
  route: string | null;
};

export type GhUserJson = { login: string; id: number; avatar_url: string; html_url: string; type: "User" | "Bot"; name: string };

export type ReviewCommentJson = {
  id: number;
  node_id: string;
  pull_request_review_id: number | null;
  in_reply_to_id?: number;
  path: string;
  line: number | null;
  original_line: number | null;
  start_line: number | null;
  original_start_line: number | null;
  side: "LEFT" | "RIGHT";
  start_side: "LEFT" | "RIGHT" | null;
  commit_id: string;
  original_commit_id: string;
  diff_hunk: string;
  body: string;
  user: GhUserJson;
  created_at: string;
  updated_at: string;
  html_url: string;
  subject_type: "line";
  /** Not part of GitHub's response: which pull request the comment belongs to. Stripped on output. */
  _pr: number;
};

export type MockState = {
  demo: Demo;
  nextId: number;
  reviewComments: ReviewCommentJson[];
  issueComments: { id: number; _pr: number; body: string; user: GhUserJson; created_at: string; updated_at: string; html_url: string }[];
  reviews: {
    id: number;
    _pr: number;
    state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED";
    body: string;
    commit_id: string;
    user: GhUserJson;
    submitted_at: string;
    html_url: string;
  }[];
  checkRuns: (Record<string, unknown> & { id: number; head_sha: string; name: string })[];
  hooks: { id: number; config: Record<string, unknown>; events: string[]; active: boolean }[];
  /** Free-form storage for routes added by features. */
  extra: Record<string, unknown>;
};

export type MockContext = {
  method: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  /** Parsed JSON body (or the raw text when it is not JSON). */
  body: unknown;
  token: string | null;
  /** The GitHub user the token belongs to (null without a known token). */
  user: GhUserJson | null;
  state: MockState;
};

export type MockReply = { status?: number; json?: unknown; text?: string; headers?: Record<string, string> };

export type MockRoute = {
  method: string;
  pattern: string;
  /** Requests without a known token are answered with 401 unless this is true. */
  public?: boolean;
  handle: (ctx: MockContext) => MockReply | Promise<MockReply>;
};

type Stub = { method: string; path: string; status: number; json?: unknown; times: number | null };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const GITHUB = "https://github.com";

export function ghUser(login: string): GhUserJson {
  const person = DEMO_GITHUB_PEOPLE[login];
  return {
    login,
    id: person?.id ?? 91_999_999,
    avatar_url: githubAvatar(login),
    html_url: `${GITHUB}/${login}`,
    type: login.endsWith("-bot") ? "Bot" : "User",
    name: person?.name ?? login,
  };
}

/** Tokens the mock accepts: the demo connection and each demo user's linked account. */
export const TOKENS: Record<string, string> = {
  [DEMO_CONNECTION.token]: DEMO_CONNECTION.login,
  ...Object.fromEntries(Object.values(DEMO_USERS).map((u) => [u.github.token, u.github.login])),
};

const notFound = (message = "Not Found"): MockReply => ({
  status: 404,
  json: { message, documentation_url: "https://docs.github.com/rest" },
});

export const validationFailed = (message: string): MockReply => ({
  status: 422,
  json: { message: "Validation Failed", errors: [{ message, code: "invalid" }], documentation_url: "https://docs.github.com/rest" },
});

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export function isDemoRepo(ctx: MockContext): boolean {
  return `${ctx.params.owner}/${ctx.params.repo}`.toLowerCase() === DEMO_REPO.fullName;
}

export function findPull(ctx: MockContext): DemoPull | null {
  if (!isDemoRepo(ctx)) return null;
  return ctx.state.demo.pulls.find((p) => p.number === Number(ctx.params.number)) ?? null;
}

function repoJson() {
  return {
    id: DEMO_REPO.githubId,
    name: DEMO_REPO.name,
    full_name: DEMO_REPO.fullName,
    owner: { login: DEMO_REPO.owner, type: "Organization", avatar_url: githubAvatar(DEMO_REPO.owner) },
    private: DEMO_REPO.private,
    default_branch: DEMO_REPO.defaultBranch,
    description: DEMO_REPO.description,
    html_url: DEMO_REPO.htmlUrl,
    archived: false,
    pushed_at: iso(new Date()),
    permissions: { admin: true, push: true, pull: true },
  };
}

function pullJson(p: DemoPull, details: boolean) {
  const base = {
    id: 92_000_000 + p.number,
    number: p.number,
    title: p.title,
    body: p.body,
    state: p.state,
    draft: p.draft,
    merged_at: p.mergedAt ? iso(p.mergedAt) : null,
    closed_at: p.closedAt ? iso(p.closedAt) : null,
    created_at: iso(p.createdAt),
    updated_at: iso(p.updatedAt),
    html_url: p.htmlUrl,
    user: ghUser(p.author),
    head: { ref: p.headRef, sha: p.headSha, repo: { full_name: DEMO_REPO.fullName } },
    base: { ref: DEMO_REPO.defaultBranch, sha: p.baseSha, repo: { full_name: DEMO_REPO.fullName } },
  };
  if (!details) return base;
  return { ...base, merged: p.merged, additions: p.additions, deletions: p.deletions, changed_files: p.changedFiles, commits: p.commits };
}

/** The lines of the hunk up to `line`, like GitHub's diff_hunk on review comments. */
function diffHunk(p: DemoPull, filePath: string, line: number, side: "LEFT" | "RIGHT", headSha?: string): string {
  const snapshot = p.snapshots.find((s) => s.headSha === headSha) ?? p.snapshots.at(-1);
  const file = snapshot?.files.find((f) => f.path === filePath);
  if (!file?.patch) return "";
  for (const h of parsePatch(file.patch)) {
    const idx = h.lines.findIndex((l) => (side === "RIGHT" ? l.newNumber : l.oldNumber) === line);
    if (idx === -1) continue;
    const prefix = { add: "+", del: "-", context: " " } as const;
    return [h.header, ...h.lines.slice(0, idx + 1).map((l) => prefix[l.type] + l.content)].join("\n");
  }
  return "";
}

/** Whether a line can be commented on: it must be inside a hunk of the pull request's current diff. */
function lineInDiff(p: DemoPull, filePath: string, line: number, side: "LEFT" | "RIGHT"): boolean {
  const file = p.snapshots.at(-1)?.files.find((f) => f.path === filePath);
  if (!file?.patch) return false;
  return parsePatch(file.patch).some((h) =>
    side === "RIGHT" ? line >= h.newStart && line < h.newStart + h.newLines : line >= h.oldStart && line < h.oldStart + h.oldLines,
  );
}

function strip<T extends { _pr: number }>(item: T): Omit<T, "_pr"> {
  const { _pr, ...rest } = item;
  void _pr;
  return rest;
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export function createState(now?: Date | number): MockState {
  const demo = buildDemo({ now });
  const reviewComments: ReviewCommentJson[] = demo.comments.map((c) => {
    const pull = demo.pulls.find((p) => p.number === c.pr)!;
    return {
      id: c.id,
      node_id: `PRRC_mock${c.id}`,
      pull_request_review_id: c.id + 1_000_000,
      ...(c.inReplyTo ? { in_reply_to_id: c.inReplyTo } : {}),
      path: c.path,
      line: c.line,
      original_line: c.originalLine,
      start_line: c.startLine,
      original_start_line: c.originalStartLine,
      side: "RIGHT",
      start_side: c.originalStartLine ? "RIGHT" : null,
      commit_id: c.commitSha,
      original_commit_id: c.commitSha,
      diff_hunk: diffHunk(pull, c.path, c.originalLine, "RIGHT", c.commitSha),
      body: c.body,
      user: ghUser(c.author),
      created_at: iso(c.createdAt),
      updated_at: iso(c.createdAt),
      html_url: c.htmlUrl,
      subject_type: "line",
      _pr: c.pr,
    };
  });
  const reviews = DEMO_REVIEWS.map((r) => ({
    id: r.id,
    _pr: r.pr,
    state: r.state,
    body: r.body,
    commit_id: demo.pulls.find((p) => p.number === r.pr)!.snapshots.find((s) => s.label === r.head)!.headSha,
    user: ghUser(r.author),
    submitted_at: iso(demo.ago(r.hoursAgo)),
    html_url: `${DEMO_REPO.htmlUrl}/pull/${r.pr}#pullrequestreview-${r.id}`,
  }));
  return { demo, nextId: 5_000_001, reviewComments, issueComments: [], reviews, checkRuns: [], hooks: [], extra: {} };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

const REPO = "/repos/:owner/:repo";

export const routes: MockRoute[] = [
  /* Users and repositories */
  { method: "GET", pattern: "/user", handle: (ctx) => ({ json: ctx.user }) },
  {
    method: "GET",
    pattern: "/user/emails",
    handle: (ctx) => {
      const member = Object.values(DEMO_USERS).find((u) => u.github.login === ctx.user?.login);
      return { json: member ? [{ email: member.email, primary: true, verified: true, visibility: "private" }] : [] };
    },
  },
  { method: "GET", pattern: "/user/repos", handle: () => ({ json: [repoJson()] }) },
  { method: "GET", pattern: "/installation/repositories", handle: () => ({ json: { total_count: 1, repositories: [repoJson()] } }) },
  { method: "GET", pattern: REPO, handle: (ctx) => (isDemoRepo(ctx) ? { json: repoJson() } : notFound()) },

  /* Pull requests */
  {
    method: "GET",
    pattern: `${REPO}/pulls`,
    handle: (ctx) => {
      if (!isDemoRepo(ctx)) return notFound();
      const state = ctx.query.get("state") ?? "open";
      const list = ctx.state.demo.pulls
        .filter((p) => state === "all" || p.state === state)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((p) => pullJson(p, false));
      return { json: list };
    },
  },
  {
    method: "GET",
    pattern: `${REPO}/pulls/:number`,
    handle: (ctx) => {
      const p = findPull(ctx);
      return p ? { json: pullJson(p, true) } : notFound();
    },
  },
  {
    method: "GET",
    pattern: `${REPO}/pulls/:number/files`,
    handle: (ctx) => {
      const p = findPull(ctx);
      if (!p) return notFound();
      const files = p.snapshots.at(-1)?.files ?? [];
      return {
        json: files.map((f) => ({
          sha: f.sha ?? null,
          filename: f.path,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          changes: f.additions + f.deletions,
          ...(f.patch !== null ? { patch: f.patch } : {}),
          ...(f.previousPath ? { previous_filename: f.previousPath } : {}),
        })),
      };
    },
  },
  {
    method: "GET",
    pattern: `${REPO}/compare/:range`,
    handle: (ctx) => {
      if (!isDemoRepo(ctx)) return notFound();
      const [base, head] = ctx.params.range.split("...");
      return { json: { status: "ahead", merge_base_commit: { sha: base }, base_commit: { sha: base }, commits: [{ sha: head }] } };
    },
  },
  {
    method: "GET",
    pattern: `${REPO}/contents/*path`,
    handle: (ctx) => {
      if (!isDemoRepo(ctx)) return notFound();
      const content = ctx.state.demo.contentAt(ctx.query.get("ref") ?? "", ctx.params.path);
      if (content === null) return notFound();
      return { text: content, headers: { "Content-Type": "application/vnd.github.raw; charset=utf-8" } };
    },
  },

  /* Review comments */
  {
    method: "GET",
    pattern: `${REPO}/pulls/:number/comments`,
    handle: (ctx) => {
      const p = findPull(ctx);
      if (!p) return notFound();
      return { json: ctx.state.reviewComments.filter((c) => c._pr === p.number).map(strip) };
    },
  },
  {
    method: "POST",
    pattern: `${REPO}/pulls/:number/comments`,
    handle: (ctx) => {
      const p = findPull(ctx);
      if (!p) return notFound();
      const b = (ctx.body ?? {}) as {
        body?: string;
        commit_id?: string;
        path?: string;
        line?: number;
        side?: "LEFT" | "RIGHT";
        start_line?: number;
        start_side?: "LEFT" | "RIGHT";
      };
      if (!b.body || !b.path || !b.line) return validationFailed("body, path and line are required");
      const side = b.side ?? "RIGHT";
      if (!p.snapshots.at(-1)?.files.some((f) => f.path === b.path)) return validationFailed("path is not part of the pull request");
      if (!lineInDiff(p, b.path, b.line, side)) return validationFailed("pull_request_review_thread.line must be part of the diff");
      const comment = newReviewComment(ctx, p, { body: b.body, path: b.path, line: b.line, side, startLine: b.start_line ?? null, commitId: b.commit_id });
      return { status: 201, json: strip(comment) };
    },
  },
  {
    method: "POST",
    pattern: `${REPO}/pulls/:number/comments/:id/replies`,
    handle: (ctx) => {
      const p = findPull(ctx);
      const parent = ctx.state.reviewComments.find((c) => c.id === Number(ctx.params.id));
      if (!p || !parent) return notFound();
      const b = (ctx.body ?? {}) as { body?: string };
      if (!b.body) return validationFailed("body is required");
      const root = parent.in_reply_to_id ? (ctx.state.reviewComments.find((c) => c.id === parent.in_reply_to_id) ?? parent) : parent;
      const reply = newReviewComment(ctx, p, {
        body: b.body,
        path: root.path,
        line: root.line ?? root.original_line ?? 1,
        side: root.side,
        startLine: root.start_line,
        commitId: root.commit_id,
        inReplyTo: root.id,
        outdated: root.line === null,
      });
      return { status: 201, json: strip(reply) };
    },
  },
  {
    method: "GET",
    pattern: `${REPO}/pulls/comments/:id`,
    handle: (ctx) => {
      const c = ctx.state.reviewComments.find((x) => x.id === Number(ctx.params.id));
      return c ? { json: strip(c) } : notFound();
    },
  },
  {
    method: "PATCH",
    pattern: `${REPO}/pulls/comments/:id`,
    handle: (ctx) => {
      const c = ctx.state.reviewComments.find((x) => x.id === Number(ctx.params.id));
      if (!c) return notFound();
      const b = (ctx.body ?? {}) as { body?: string };
      if (b.body) c.body = b.body;
      c.updated_at = iso(new Date());
      return { json: strip(c) };
    },
  },
  {
    method: "DELETE",
    pattern: `${REPO}/pulls/comments/:id`,
    handle: (ctx) => {
      const before = ctx.state.reviewComments.length;
      ctx.state.reviewComments = ctx.state.reviewComments.filter((x) => x.id !== Number(ctx.params.id));
      return before === ctx.state.reviewComments.length ? notFound() : { status: 204 };
    },
  },

  /* Reviews */
  {
    method: "GET",
    pattern: `${REPO}/pulls/:number/reviews`,
    handle: (ctx) => {
      const p = findPull(ctx);
      return p ? { json: ctx.state.reviews.filter((r) => r._pr === p.number).map(strip) } : notFound();
    },
  },
  {
    method: "POST",
    pattern: `${REPO}/pulls/:number/reviews`,
    handle: (ctx) => {
      const p = findPull(ctx);
      if (!p) return notFound();
      const b = (ctx.body ?? {}) as {
        event?: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
        body?: string;
        commit_id?: string;
        comments?: { path: string; line?: number; side?: "LEFT" | "RIGHT"; start_line?: number; body: string }[];
      };
      const state = b.event === "APPROVE" ? "APPROVED" : b.event === "REQUEST_CHANGES" ? "CHANGES_REQUESTED" : "COMMENTED";
      if (state === "CHANGES_REQUESTED" && !b.body?.trim()) return validationFailed("Review body is required for REQUEST_CHANGES");
      if (state === "APPROVED" && ctx.user?.login === p.author) return validationFailed("Can not approve your own pull request");
      const comments = b.comments ?? [];
      if (comments.some((c) => !c.line || !lineInDiff(p, c.path, c.line, c.side ?? "RIGHT"))) {
        return validationFailed("pull_request_review_thread.line must be part of the diff");
      }
      const id = ctx.state.nextId++;
      for (const c of comments) {
        newReviewComment(ctx, p, { body: c.body, path: c.path, line: c.line!, side: c.side ?? "RIGHT", startLine: c.start_line ?? null, commitId: b.commit_id, reviewId: id });
      }
      const review = {
        id,
        _pr: p.number,
        state: state as MockState["reviews"][number]["state"],
        body: b.body ?? "",
        commit_id: b.commit_id ?? p.headSha,
        user: ctx.user!,
        submitted_at: iso(new Date()),
        html_url: `${p.htmlUrl}#pullrequestreview-${id}`,
      };
      ctx.state.reviews.push(review);
      return { json: strip(review) };
    },
  },

  /* Issue comments (the pull request conversation) */
  {
    method: "GET",
    pattern: `${REPO}/issues/:number/comments`,
    handle: (ctx) => {
      const p = findPull(ctx);
      return p ? { json: ctx.state.issueComments.filter((c) => c._pr === p.number).map(strip) } : notFound();
    },
  },
  {
    method: "POST",
    pattern: `${REPO}/issues/:number/comments`,
    handle: (ctx) => {
      const p = findPull(ctx);
      if (!p) return notFound();
      const b = (ctx.body ?? {}) as { body?: string };
      if (!b.body) return validationFailed("body is required");
      const id = ctx.state.nextId++;
      const now = iso(new Date());
      const comment = { id, _pr: p.number, body: b.body, user: ctx.user!, created_at: now, updated_at: now, html_url: `${p.htmlUrl}#issuecomment-${id}` };
      ctx.state.issueComments.push(comment);
      return { status: 201, json: strip(comment) };
    },
  },
  {
    method: "PATCH",
    pattern: `${REPO}/issues/comments/:id`,
    handle: (ctx) => {
      const c = ctx.state.issueComments.find((x) => x.id === Number(ctx.params.id));
      if (!c) return notFound();
      const b = (ctx.body ?? {}) as { body?: string };
      if (b.body) c.body = b.body;
      c.updated_at = iso(new Date());
      return { json: strip(c) };
    },
  },

  /* Check runs */
  {
    method: "POST",
    pattern: `${REPO}/check-runs`,
    handle: (ctx) => {
      if (!isDemoRepo(ctx)) return notFound();
      const b = (ctx.body ?? {}) as Record<string, unknown> & { name?: string; head_sha?: string };
      if (!b.name || !b.head_sha) return validationFailed("name and head_sha are required");
      const id = ctx.state.nextId++;
      const run = { status: "queued", conclusion: null, ...b, id, name: b.name, head_sha: b.head_sha, html_url: `${DEMO_REPO.htmlUrl}/runs/${id}` };
      ctx.state.checkRuns.push(run);
      return { status: 201, json: run };
    },
  },
  {
    method: "PATCH",
    pattern: `${REPO}/check-runs/:id`,
    handle: (ctx) => {
      const run = ctx.state.checkRuns.find((r) => r.id === Number(ctx.params.id));
      if (!run) return notFound();
      Object.assign(run, ctx.body ?? {}, { id: run.id });
      return { json: run };
    },
  },
  {
    method: "GET",
    pattern: `${REPO}/commits/:ref/check-runs`,
    handle: (ctx) => {
      const runs = ctx.state.checkRuns.filter((r) => r.head_sha === ctx.params.ref);
      return { json: { total_count: runs.length, check_runs: runs } };
    },
  },

  /* Repository webhooks (created from the Repositories page) */
  {
    method: "POST",
    pattern: `${REPO}/hooks`,
    handle: (ctx) => {
      if (!isDemoRepo(ctx)) return notFound();
      const b = (ctx.body ?? {}) as { config?: Record<string, unknown>; events?: string[]; active?: boolean };
      const hook = { id: ctx.state.nextId++, config: b.config ?? {}, events: b.events ?? ["push"], active: b.active ?? true };
      ctx.state.hooks.push(hook);
      return { status: 201, json: hook };
    },
  },

  /* GraphQL (review threads; add resolvers in mock-github-graphql.ts) */
  graphqlRoute,
];

function newReviewComment(
  ctx: MockContext,
  p: DemoPull,
  input: {
    body: string;
    path: string;
    line: number;
    side: "LEFT" | "RIGHT";
    startLine: number | null;
    commitId?: string;
    inReplyTo?: number;
    reviewId?: number;
    outdated?: boolean;
  },
): ReviewCommentJson {
  const id = ctx.state.nextId++;
  const now = iso(new Date());
  const commit = input.commitId ?? p.headSha;
  const comment: ReviewCommentJson = {
    id,
    node_id: `PRRC_mock${id}`,
    pull_request_review_id: input.reviewId ?? id + 1_000_000,
    ...(input.inReplyTo ? { in_reply_to_id: input.inReplyTo } : {}),
    path: input.path,
    line: input.outdated ? null : input.line,
    original_line: input.line,
    start_line: input.outdated ? null : input.startLine,
    original_start_line: input.startLine,
    side: input.side,
    start_side: input.startLine ? input.side : null,
    commit_id: commit,
    original_commit_id: commit,
    diff_hunk: diffHunk(p, input.path, input.line, input.side, commit),
    body: input.body,
    user: ctx.user!,
    created_at: now,
    updated_at: now,
    html_url: `${p.htmlUrl}#discussion_r${id}`,
    subject_type: "line",
    _pr: p.number,
  };
  ctx.state.reviewComments.push(comment);
  return comment;
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

function match(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = pathname.split("/").filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith("*")) {
      if (i >= s.length) return null;
      params[p[i].slice(1)] = s.slice(i).map(decodeURIComponent).join("/");
      return params;
    }
    if (i >= s.length) return null;
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return p.length === s.length ? params : null;
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export type MockServer = { url: string; port: number; state: () => MockState; requests: MockRequest[]; close: () => Promise<void> };

/** Start the mock on 127.0.0.1:`port`. `now` anchors the demo timestamps (default DEMO_NOW or now). */
export async function startMockGitHub(opts: { port?: number; now?: Date | number; quiet?: boolean } = {}): Promise<MockServer> {
  const port = opts.port ?? E2E.githubPort;
  // The time anchor of the last reset, so a later reset without one keeps the timestamps.
  let anchor = opts.now;
  let state = createState(anchor);
  let requests: MockRequest[] = [];
  let stubs: Stub[] = [];
  let seq = 0;

  const send = (res: http.ServerResponse, reply: MockReply) => {
    const status = reply.status ?? 200;
    const headers: Record<string, string> = { "X-GitHub-Media-Type": "github.v3", "X-RateLimit-Remaining": "4999", ...reply.headers };
    if (reply.text !== undefined) {
      res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
      res.end(reply.text);
    } else if (reply.json !== undefined) {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
      res.end(JSON.stringify(reply.json));
    } else {
      res.writeHead(status, headers);
      res.end();
    }
    return status;
  };

  const control = async (req: http.IncomingMessage, url: URL, res: http.ServerResponse) => {
    const route = url.pathname.replace(/^\/__mock/, "");
    if (route === "/health") return send(res, { json: { ok: true, port } });
    if (route === "/requests" && req.method === "GET") return send(res, { json: { requests } });
    if (route === "/requests" && req.method === "DELETE") {
      requests = [];
      return send(res, { status: 204 });
    }
    if (route === "/reset" && req.method === "POST") {
      const body = ((await readBody(req)) ?? {}) as { now?: number };
      anchor = body.now ?? anchor;
      state = createState(anchor);
      requests = [];
      stubs = [];
      return send(res, { json: { ok: true } });
    }
    if (route === "/stub" && req.method === "POST") {
      const b = ((await readBody(req)) ?? {}) as Partial<Stub>;
      if (!b.method || !b.path) return send(res, { status: 400, json: { message: "method and path are required" } });
      stubs.unshift({ method: b.method.toUpperCase(), path: b.path, status: b.status ?? 200, json: b.json, times: b.times ?? null });
      return send(res, { json: { ok: true } });
    }
    if (route === "/state") {
      const { demo: _demo, ...rest } = state;
      void _demo;
      return send(res, { json: rest });
    }
    return send(res, notFound(`No mock control route ${req.method} ${url.pathname}`));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith("/__mock/")) {
      await control(req, url, res);
      return;
    }
    const method = (req.method ?? "GET").toUpperCase();
    const body = await readBody(req);
    const auth = req.headers.authorization ?? "";
    const token = /^(?:Bearer|token)\s+(.+)$/i.exec(auth)?.[1] ?? null;
    const login = token ? TOKENS[token] : undefined;
    const user = login ? ghUser(login) : null;
    const record: MockRequest = {
      id: ++seq,
      at: new Date().toISOString(),
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      user: login ?? null,
      body: body ?? null,
      status: 0,
      route: null,
    };
    requests.push(record);
    if (requests.length > 5000) requests.splice(0, requests.length - 5000);
    try {
      const stub = stubs.find((s) => s.method === method && (s.path.startsWith("re:") ? new RegExp(s.path.slice(3)).test(url.pathname) : s.path === url.pathname));
      if (stub) {
        if (stub.times !== null && --stub.times <= 0) stubs = stubs.filter((s) => s !== stub);
        record.route = "stub";
        record.status = send(res, { status: stub.status, json: stub.json ?? {} });
        return;
      }
      for (const route of routes) {
        if (route.method !== method) continue;
        const params = match(route.pattern, url.pathname);
        if (!params) continue;
        record.route = route.pattern;
        if (!route.public && !user) {
          record.status = send(res, { status: 401, json: { message: "Bad credentials", documentation_url: "https://docs.github.com/rest" } });
          return;
        }
        const reply = await route.handle({ method, path: url.pathname, query: url.searchParams, params, body, token, user, state });
        record.status = send(res, reply);
        return;
      }
      if (!opts.quiet) console.warn(`[mock-github] no route for ${method} ${url.pathname}${url.search}`);
      record.status = send(res, notFound(`Mock GitHub has no route for ${method} ${url.pathname}. Add one to routes in e2e/mock-github.ts.`));
    } catch (err) {
      console.error("[mock-github] handler failed", method, url.pathname, err);
      record.status = send(res, { status: 500, json: { message: err instanceof Error ? err.message : String(err) } });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    state: () => state,
    get requests() {
      return requests;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/* ------------------------------------------------------------------ */
/* Client for specs                                                    */
/* ------------------------------------------------------------------ */

async function control<T>(method: string, route: string, body?: unknown): Promise<T> {
  const res = await fetch(`${githubApiUrl}/__mock${route}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`mock GitHub ${method} ${route}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Talk to the running mock from a spec (it runs in the Playwright runner process, not the worker). */
export const mockGitHub = {
  url: githubApiUrl,
  /** Recorded requests, oldest first. `path` matches exactly (string) or by pattern (RegExp). */
  async requests(filter: { method?: string; path?: string | RegExp } = {}): Promise<MockRequest[]> {
    const { requests } = await control<{ requests: MockRequest[] }>("GET", "/requests");
    return requests.filter(
      (r) =>
        (!filter.method || r.method === filter.method.toUpperCase()) &&
        (!filter.path || (typeof filter.path === "string" ? r.path === filter.path : filter.path.test(r.path))),
    );
  },
  /** Forget recorded requests (state is kept). */
  clear: () => control<void>("DELETE", "/requests"),
  /** Rebuild state from the demo data, and drop recorded requests and stubs. */
  reset: (now?: number) => control<{ ok: true }>("POST", "/reset", now ? { now } : {}),
  /** Answer the next matching request(s) with a fixed response. `path` is exact, or "re:<regexp>". */
  stub: (stub: { method: string; path: string; status?: number; json?: unknown; times?: number }) => control<{ ok: true }>("POST", "/stub", stub),
  /** Current state without the demo data: reviewComments, issueComments, reviews, checkRuns, hooks, extra. */
  state: () => control<Omit<MockState, "demo">>("GET", "/state"),
  async isRunning(): Promise<boolean> {
    try {
      const res = await fetch(`${githubApiUrl}/__mock/health`, { signal: AbortSignal.timeout(1000) });
      return res.ok;
    } catch {
      return false;
    }
  },
};

/* Run on its own: pnpm e2e:mock-github [--port 3199] */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--port");
  const port = i > 0 ? Number(process.argv[i + 1]) : E2E.githubPort;
  const server = await startMockGitHub({ port });
  console.log(`Mock GitHub API on ${server.url} (requests: ${server.url}/__mock/requests)`);
}
