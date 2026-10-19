import { describe, expect, it } from "vitest";
import { parseFiles } from "@/lib/diff/parse";
import type { GhReviewComment } from "@/lib/github/client";
import type { ReviewThread } from "@/lib/github/threads";
import {
  commentPosition,
  formatPosition,
  formatReviewThreads,
  groupReviewThreads,
  hunkSpans,
  REVIEW_WORKFLOW,
  sectionForLine,
} from "@/lib/mcp/review";
import { reviewCommentsPrompt } from "@/lib/prompts";

// Hunk 1: old 10-15, new 10-17 (line 12 replaced by three lines). Hunk 2: old 40-42, new 42-43 (line 41 removed).
const PATCH = [
  "@@ -10,6 +10,8 @@ export function total() {",
  " const a = 1;",
  " const b = 2;",
  "-const c = a + b;",
  "+const c1 = a;",
  "+const c2 = b;",
  "+const c = c1 + c2;",
  " return c;",
  " }",
  " ",
  "@@ -40,3 +42,2 @@ function rest() {",
  " x();",
  "-y();",
  " z();",
].join("\n");

const files = parseFiles([
  { path: "src/a.ts", status: "modified", additions: 3, deletions: 2, patch: PATCH },
  { path: "public/logo.png", status: "added", additions: 0, deletions: 0, patch: null },
]);

describe("commentPosition", () => {
  const at = (input: Parameters<typeof commentPosition>[1]) => commentPosition(files, input);

  it("maps a new-side line (added or context) to RIGHT", () => {
    expect(at({ path: "src/a.ts", line: 13 })).toEqual({
      ok: true,
      position: { path: "src/a.ts", line: 13, side: "RIGHT", startLine: null, startSide: null, hunk: 1 },
    });
    expect(at({ path: "src/a.ts", line: 15, side: "new" })).toMatchObject({ ok: true, position: { line: 15, side: "RIGHT" } });
  });

  it("maps a removed line (o-number in get_diff) to LEFT", () => {
    expect(at({ path: "src/a.ts", line: 12, side: "old" })).toMatchObject({ ok: true, position: { line: 12, side: "LEFT", hunk: 1 } });
    expect(at({ path: "src/a.ts", line: 41, side: "old" })).toMatchObject({ ok: true, position: { line: 41, side: "LEFT", hunk: 2 } });
  });

  it("maps a range to start_line and start_side", () => {
    expect(at({ path: "src/a.ts", line: 14, startLine: 12 })).toMatchObject({
      ok: true,
      position: { line: 14, side: "RIGHT", startLine: 12, startSide: "RIGHT" },
    });
    // From the removed line to the last added one: GitHub's start_side LEFT, side RIGHT.
    expect(at({ path: "src/a.ts", line: 14, startLine: 12, startSide: "old" })).toMatchObject({
      ok: true,
      position: { line: 14, side: "RIGHT", startLine: 12, startSide: "LEFT" },
    });
  });

  it("treats a range of one line as a single-line comment", () => {
    expect(at({ path: "src/a.ts", line: 13, startLine: 13 })).toMatchObject({ ok: true, position: { startLine: null, startSide: null } });
  });

  it("explains which lines can be commented on", () => {
    const res = at({ path: "src/a.ts", line: 30 });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toBe(
      "Line 30 of src/a.ts is not in the diff. GitHub accepts comments only on lines of a hunk: #1 new 10-17, old 10-15; #2 new 42-43, old 40-42.",
    );
    // Line 41 was removed: it has no new-side number.
    expect(at({ path: "src/a.ts", line: 41 })).toMatchObject({ ok: false });
    expect(at({ path: "src/a.ts", line: 16, side: "old" })).toMatchObject({ ok: false, error: expect.stringContaining("Line 16 (old) of src/a.ts") });
    expect(at({ path: "src/a.ts", line: 13, startLine: 2 })).toMatchObject({ ok: false, error: expect.stringContaining("start_line 2 of src/a.ts is not in the diff") });
  });

  it("keeps a range within one hunk and in order", () => {
    expect(at({ path: "src/a.ts", line: 42, startLine: 13 })).toEqual({
      ok: false,
      error: "start_line 13 is in hunk #1 and line 42 in hunk #2. A comment can only span lines of one hunk.",
    });
    expect(at({ path: "src/a.ts", line: 12, startLine: 14 })).toEqual({ ok: false, error: "start_line must come before line." });
  });

  it("rejects files that are not in the diff or have no patch", () => {
    expect(at({ path: "a.ts", line: 1 })).toEqual({ ok: false, error: "a.ts is not part of the pull request. Did you mean: src/a.ts?" });
    expect(at({ path: "public/logo.png", line: 1 })).toMatchObject({ ok: false, error: expect.stringContaining("post_pr_comment") });
  });

  it("describes the hunks of a file", () => {
    expect(hunkSpans(files[0])).toBe("#1 new 10-17, old 10-15; #2 new 42-43, old 40-42");
  });
});

describe("formatPosition", () => {
  it("uses the string form of refs", () => {
    expect(formatPosition({ path: "src/a.ts", line: 13, side: "RIGHT" })).toBe("src/a.ts:13");
    expect(formatPosition({ path: "src/a.ts", line: 14, side: "RIGHT", startLine: 12, startSide: "RIGHT" })).toBe("src/a.ts:12-14");
    expect(formatPosition({ path: "src/a.ts", line: 41, side: "LEFT", startLine: null })).toBe("src/a.ts:old:41");
    expect(formatPosition({ path: "src/a.ts", line: 14, side: "RIGHT", startLine: 12, startSide: "LEFT" })).toBe("src/a.ts:old:12 to new:14");
  });
});

describe("sectionForLine", () => {
  const sections = [
    { id: "s1", position: 1, title: "Rest", refs: [{ path: "src/a.ts", hunks: [2] }] },
    { id: "s2", position: 2, title: "Totals", refs: [{ path: "src/a.ts", lines: { start: 12, end: 14 } }] },
    { id: "s3", position: 3, title: "Other changes", refs: [{ path: "src/a.ts" }] },
  ];

  it("finds the first section whose refs select the line", () => {
    expect(sectionForLine(sections, files, "src/a.ts", 13, "new")?.id).toBe("s2");
    expect(sectionForLine(sections, files, "src/a.ts", 41, "old")?.id).toBe("s1");
    expect(sectionForLine(sections, files, "src/a.ts", 10, "new")?.id).toBe("s3");
  });

  it("returns null for lines outside the diff", () => {
    expect(sectionForLine(sections, files, "src/a.ts", 30, "new")).toBeNull();
    expect(sectionForLine(sections, files, "src/b.ts", 1, "new")).toBeNull();
  });
});

const NOW = Date.parse("2026-10-19T12:00:00Z");

function comment(c: Partial<GhReviewComment> & Pick<GhReviewComment, "id" | "body">, login: string, minutesAgo: number): GhReviewComment {
  return {
    pull_request_review_id: null,
    path: "src/a.ts",
    line: 13,
    original_line: 13,
    start_line: null,
    side: "RIGHT",
    commit_id: "head",
    original_commit_id: "head",
    user: { login, avatar_url: "" },
    created_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
    updated_at: "",
    html_url: `https://github.com/acme/web/pull/1#discussion_r${c.id}`,
    ...c,
  };
}

describe("list_review_comments text", () => {
  const comments = [
    comment({ id: 3, body: "Is this still needed?", line: null, original_line: 12 }, "alexmorgan", 300),
    comment({ id: 1, body: "Why three variables?\n\n```suggestion\nconst c = a + b;\n```", start_line: 12 }, "samokafor", 90),
    comment({ id: 2, body: "For the debugger.", in_reply_to_id: 1 }, "mayachen", 30),
  ];
  const threads: ReviewThread[] = [
    { id: "PRRT_1", isResolved: false, isOutdated: false, resolvedBy: null, commentIds: [1, 2] },
    { id: "PRRT_3", isResolved: true, isOutdated: true, resolvedBy: "alexmorgan", commentIds: [3] },
  ];
  const byId = new Map(threads.flatMap((t) => t.commentIds.map((id) => [id, t] as const)));
  const views = groupReviewThreads(comments, (id) => byId.get(id) ?? null);
  const opts = {
    pr: "acme/web#1",
    state: "all" as const,
    threadsError: null,
    login: "mayachen",
    isMine: (c: GhReviewComment) => c.user?.login === "mayachen",
    sectionOf: (root: GhReviewComment) => (root.id === 1 ? { id: "s2", position: 2, title: "Totals" } : null),
    now: NOW,
  };

  it("groups replies under their root, open threads first", () => {
    expect(views.map((v) => [v.root.id, v.replies.map((r) => r.id), v.thread?.id])).toEqual([
      [1, [2], "PRRT_1"],
      [3, [], "PRRT_3"],
    ]);
  });

  it("shows IDs, state, section and every comment", () => {
    const out = formatReviewThreads(views, opts);
    expect(out).toContain("acme/web#1: 2 conversations, 1 open and 1 resolved.");
    expect(out).toContain("Comments marked (you) are yours: posted through Omakaze, or by your GitHub account mayachen.");
    expect(out).toContain(
      [
        "## src/a.ts:12-13 · open",
        "thread_id: PRRT_1",
        'Guide section 2 "Totals" (section_id s2)',
        "- comment_id 1 · samokafor · 2 h ago",
        "  Why three variables?",
        "",
        "  ```suggestion",
        "  const c = a + b;",
        "  ```",
        "- comment_id 2 · mayachen (you) · 30 min ago",
        "  For the debugger.",
      ].join("\n"),
    );
    expect(out).toContain("## src/a.ts:12 · resolved by alexmorgan · outdated (the code changed since)\nthread_id: PRRT_3");
  });

  it("filters by state", () => {
    const open = formatReviewThreads(views, { ...opts, state: "open" });
    expect(open).toContain("Showing the open ones.");
    expect(open).toContain("PRRT_1");
    expect(open).not.toContain("PRRT_3");
    const none = formatReviewThreads(groupReviewThreads([comments[0]], (id) => byId.get(id) ?? null), { ...opts, state: "open" });
    expect(none).toContain('No open conversations. Pass state: "all" to see every conversation.');
  });

  it("still lists comments when thread state is unavailable", () => {
    const out = formatReviewThreads(groupReviewThreads(comments, () => null), { ...opts, state: "open", threadsError: "Bad credentials" });
    expect(out).toContain("Thread IDs and resolved state are unavailable (Bad credentials). Reply with comment_id");
    expect(out).toContain("## src/a.ts:12-13 · state unknown");
    expect(out).toContain("comment_id 3 · alexmorgan");
    expect(out).not.toContain("thread_id:");
  });

  it("says when there are no comments", () => {
    expect(formatReviewThreads([], opts)).toBe("No review comments on acme/web#1.");
  });
});

describe("address_review_comments prompt", () => {
  it("names the tools in order", () => {
    expect(reviewCommentsPrompt("https://github.com/acme/web/pull/1")).toBe("Address the review comments on https://github.com/acme/web/pull/1 using the Omakaze MCP.");
    const order = ["list_review_comments", "reply_to_review_comment", "update_section", "resolve_review_thread"].map((t) => REVIEW_WORKFLOW.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
