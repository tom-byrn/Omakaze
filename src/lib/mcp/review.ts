import type { DiffHunk, ParsedFile } from "@/lib/diff/types";
import type { GhReviewComment } from "@/lib/github/client";
import type { ReviewThread } from "@/lib/github/threads";
import { closestPaths, refSelectsLine, type SectionRef } from "@/lib/guides/refs";

/**
 * Helpers for the MCP review tools (src/lib/mcp/server.ts): mapping the line numbers agents read
 * in get_diff to GitHub review comment positions, and the text of list_review_comments. They
 * take plain data, so they are unit tested without a database or GitHub.
 */

/** Sides as get_diff shows them: "new" numbers for added and context lines, "o" numbers for removed lines. */
export type DiffSide = "new" | "old";
export type GitHubSide = "LEFT" | "RIGHT";

export const toGitHubSide = (side: DiffSide): GitHubSide => (side === "old" ? "LEFT" : "RIGHT");
export const toDiffSide = (side: GitHubSide | null | undefined): DiffSide => (side === "LEFT" ? "old" : "new");

/** Where a review comment goes, in GitHub's terms (`line`, `side`, `start_line`, `start_side`). */
export type CommentPosition = {
  path: string;
  line: number;
  side: GitHubSide;
  /** First line of a multi-line comment; null for a single line. */
  startLine: number | null;
  startSide: GitHubSide | null;
  /** Hunk number of the lines, as in get_diff. */
  hunk: number;
};

function findRow(file: ParsedFile, line: number, side: DiffSide): { hunk: DiffHunk; index: number } | null {
  for (const hunk of file.hunks) {
    const index = hunk.lines.findIndex((l) => (side === "new" ? l.newNumber : l.oldNumber) === line);
    if (index !== -1) return { hunk, index };
  }
  return null;
}

function span(start: number, count: number): string {
  if (count <= 0) return "none";
  return count === 1 ? `${start}` : `${start}-${start + count - 1}`;
}

/** The lines each hunk of a file covers, e.g. "#1 new 10-29, old 10-16; #2 new 102-136, old 88-94". */
export function hunkSpans(file: ParsedFile): string {
  return file.hunks.map((h) => `#${h.index} new ${span(h.newStart, h.newLines)}, old ${span(h.oldStart, h.oldLines)}`).join("; ");
}

function sideLabel(side: DiffSide): string {
  return side === "old" ? " (old)" : "";
}

/**
 * Map a line (or range) as get_diff numbers it to a GitHub review comment position. GitHub only
 * accepts lines inside a hunk of the diff, and a multi-line comment must stay within one hunk, so
 * these are checked here with a message that says which lines can be used.
 */
export function commentPosition(
  files: ParsedFile[],
  input: { path: string; line: number; side?: DiffSide; startLine?: number | null; startSide?: DiffSide | null },
): { ok: true; position: CommentPosition } | { ok: false; error: string } {
  const file = files.find((f) => f.path === input.path);
  if (!file) {
    const similar = closestPaths(input.path, files);
    return { ok: false, error: `${input.path} is not part of the pull request.${similar.length ? ` Did you mean: ${similar.join(", ")}?` : ""}` };
  }
  if (file.hunks.length === 0) {
    return {
      ok: false,
      error: `${file.path} has no diff lines to comment on (binary, too large or renamed without changes). Comment on the pull request with post_pr_comment instead.`,
    };
  }
  const side = input.side ?? "new";
  const end = findRow(file, input.line, side);
  if (!end) {
    return {
      ok: false,
      error: `Line ${input.line}${sideLabel(side)} of ${file.path} is not in the diff. GitHub accepts comments only on lines of a hunk: ${hunkSpans(file)}.`,
    };
  }
  const position = { path: file.path, line: input.line, side: toGitHubSide(side), hunk: end.hunk.index };
  const startSide = input.startSide ?? side;
  if (input.startLine == null || (input.startLine === input.line && startSide === side)) {
    return { ok: true, position: { ...position, startLine: null, startSide: null } };
  }
  const start = findRow(file, input.startLine, startSide);
  if (!start) {
    return {
      ok: false,
      error: `start_line ${input.startLine}${sideLabel(startSide)} of ${file.path} is not in the diff. GitHub accepts comments only on lines of a hunk: ${hunkSpans(file)}.`,
    };
  }
  if (start.hunk !== end.hunk) {
    return {
      ok: false,
      error: `start_line ${input.startLine} is in hunk #${start.hunk.index} and line ${input.line} in hunk #${end.hunk.index}. A comment can only span lines of one hunk.`,
    };
  }
  if (start.index > end.index) return { ok: false, error: "start_line must come before line." };
  return { ok: true, position: { ...position, startLine: input.startLine, startSide: toGitHubSide(startSide) } };
}

/**
 * A position in the string form of refs: "src/a.ts:16-17", "src/a.ts:old:5" (so an agent can pass
 * it to update_section as is), or "src/a.ts:old:5 to new:7" for a range that changes sides.
 */
export function formatPosition(p: { path: string; line: number; side: GitHubSide | null; startLine?: number | null; startSide?: GitHubSide | null }): string {
  const side = toDiffSide(p.side);
  const prefix = side === "old" ? "old:" : "";
  if (p.startLine == null || (p.startLine === p.line && (p.startSide ?? p.side) === p.side)) return `${p.path}:${prefix}${p.line}`;
  if ((p.startSide ?? p.side) === p.side) return `${p.path}:${prefix}${p.startLine}-${p.line}`;
  return `${p.path}:${toDiffSide(p.startSide)}:${p.startLine} to ${side}:${p.line}`;
}

export type SectionInfo = { id: string; position: number; title: string; refs: SectionRef[] };

/** The first section of a guide whose refs select this line of the guide's diff. */
export function sectionForLine<S extends SectionInfo>(sections: S[], files: ParsedFile[], path: string, line: number, side: DiffSide): S | null {
  const file = files.find((f) => f.path === path);
  const row = file ? findRow(file, line, side) : null;
  if (!file || !row) return null;
  return sections.find((s) => s.refs.some((r) => refSelectsLine(r, file, row.hunk, row.index))) ?? null;
}

/* ------------------------------------------------------------------ */
/* list_review_comments                                                */
/* ------------------------------------------------------------------ */

export type ThreadView = { root: GhReviewComment; replies: GhReviewComment[]; thread: ReviewThread | null };

/**
 * Group comments into threads (a root comment and its replies, oldest first). `threadOf` finds
 * the GraphQL thread of a comment; a thread lists its first 100 comments, so later replies are
 * found through their root.
 */
export function groupReviewThreads(comments: GhReviewComment[], threadOf: (commentId: number) => ReviewThread | null): ThreadView[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (c: GhReviewComment) => {
    let cur = c;
    const seen = new Set<number>();
    while (cur.in_reply_to_id && byId.has(cur.in_reply_to_id) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.in_reply_to_id)!;
    }
    return cur;
  };
  const views = new Map<number, ThreadView>();
  for (const c of comments) {
    const root = rootOf(c);
    const view = views.get(root.id) ?? { root, replies: [], thread: null };
    if (c.id !== root.id) view.replies.push(c);
    views.set(root.id, view);
  }
  for (const v of views.values()) {
    v.replies.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
    v.thread = threadOf(v.root.id) ?? v.replies.map((r) => threadOf(r.id)).find(Boolean) ?? null;
  }
  // Open conversations first, then by file and line.
  return [...views.values()].sort(
    (a, b) =>
      Number(a.thread?.isResolved ?? false) - Number(b.thread?.isResolved ?? false) ||
      a.root.path.localeCompare(b.root.path) ||
      (a.root.line ?? a.root.original_line ?? 0) - (b.root.line ?? b.root.original_line ?? 0) ||
      a.root.id - b.root.id,
  );
}

export type ThreadState = "open" | "resolved" | "all";

const BODY_LIMIT = 1500;

function ago(iso: string, now: number): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function indent(body: string): string {
  const trimmed = body.trim();
  const text = trimmed.length > BODY_LIMIT ? `${trimmed.slice(0, BODY_LIMIT)}… (${trimmed.length - BODY_LIMIT} more characters)` : trimmed;
  return text
    .split(/\r?\n/)
    .map((l) => `  ${l}`.trimEnd())
    .join("\n");
}

/** Where a thread's root comment sits: its current lines, or its original ones when outdated. */
export function threadPosition(root: GhReviewComment): string {
  const outdated = root.line === null;
  return formatPosition({
    path: root.path,
    line: (outdated ? root.original_line : root.line) ?? 0,
    side: root.side ?? "RIGHT",
    startLine: outdated ? (root.original_start_line ?? null) : root.start_line,
    startSide: root.start_side ?? null,
  });
}

/** The text list_review_comments returns: one block per conversation with its IDs, state and comments. */
export function formatReviewThreads(
  views: ThreadView[],
  opts: {
    pr: string;
    state: ThreadState;
    /** Why thread IDs are missing (GraphQL unavailable), or null. */
    threadsError: string | null;
    isMine: (c: GhReviewComment) => boolean;
    login: string | null;
    sectionOf: (root: GhReviewComment) => { id: string; position: number; title: string } | null;
    now?: number;
  },
): string {
  const now = opts.now ?? Date.now();
  if (views.length === 0) return `No review comments on ${opts.pr}.`;
  const known = opts.threadsError === null;
  const resolved = views.filter((v) => v.thread?.isResolved).length;
  const open = views.length - resolved;
  const shown = !known || opts.state === "all" ? views : views.filter((v) => Boolean(v.thread?.isResolved) === (opts.state === "resolved"));
  const out: string[] = [];
  out.push(
    known
      ? `${opts.pr}: ${views.length} conversation${views.length === 1 ? "" : "s"}, ${open} open and ${resolved} resolved.${opts.state === "all" ? "" : ` Showing the ${opts.state} ones.`}`
      : `${opts.pr}: ${views.length} conversation${views.length === 1 ? "" : "s"}.`,
  );
  if (!known) {
    out.push(`Thread IDs and resolved state are unavailable (${opts.threadsError}). Reply with comment_id; resolve_review_thread needs GitHub's GraphQL API.`);
  }
  out.push(
    opts.login
      ? `Comments marked (you) are yours: posted through Omakaze, or by your GitHub account ${opts.login}.`
      : "Comments marked (you) were posted by you through Omakaze. You have no linked GitHub account.",
  );
  if (shown.length === 0) {
    out.push("", `No ${opts.state} conversations. Pass state: "all" to see every conversation.`);
    return out.join("\n");
  }
  for (const v of shown) {
    const t = v.thread;
    const state = !t ? (known ? "open" : "state unknown") : t.isResolved ? `resolved${t.resolvedBy ? ` by ${t.resolvedBy}` : ""}` : "open";
    const outdated = v.root.line === null ? " · outdated (the code changed since)" : "";
    out.push("", `## ${threadPosition(v.root)} · ${state}${outdated}`);
    if (t) out.push(`thread_id: ${t.id}`);
    const section = opts.sectionOf(v.root);
    if (section) out.push(`Guide section ${section.position} "${section.title}" (section_id ${section.id})`);
    for (const c of [v.root, ...v.replies]) {
      out.push(`- comment_id ${c.id} · ${c.user?.login ?? "unknown"}${opts.isMine(c) ? " (you)" : ""} · ${ago(c.created_at, now)}`);
      out.push(indent(c.body));
    }
  }
  out.push("", "Answer in a thread with reply_to_review_comment and resolve answered threads with resolve_review_thread.");
  return out.join("\n");
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

/** Part of the server instructions. */
export const REVIEW_TOOLS_NOTE = `Review comments
list_review_comments reads the conversations on a pull request with their thread_id and comment_id values. reply_to_review_comment, post_review_comment (line comments and suggested changes), resolve_review_thread, submit_review and post_pr_comment post to GitHub as the user this connection belongs to, so only post what the user asked for. The address_review_comments prompt has the steps for answering review comments.`;

/** Steps of the address_review_comments prompt. */
export const REVIEW_WORKFLOW = `Workflow for review comments
1. list_review_comments with the PR URL and state "open" to read the open conversations: each one's thread_id, the commented lines, the guide section that shows them and every comment. Comments marked (you) are yours.
2. Read the code a conversation is about with get_diff (hunks: ["path#n"]) or read_file before answering.
3. Answer questions in their own thread with reply_to_review_comment. Keep replies short and factual, based on the code. If you are not sure, say so rather than guess.
4. When a question shows that the guide explained something badly or left it out, improve that section: get_guide shows its section_id, body and refs; change it with update_section. Mention the change in your reply.
5. Resolve a thread with resolve_review_thread only when your reply or the guide change fully answers it. Leave threads open that ask for a code change you have not made, need a decision from a person, or that you could not answer.
6. Do not submit an approval or request changes unless you were asked to. Everything you post goes to GitHub as the user you work for.
7. Reply with a summary: the threads you answered and resolved, the sections you changed, and the threads still open with what each one needs.`;
