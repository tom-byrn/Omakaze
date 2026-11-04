import { describe, expect, it } from "vitest";
import {
  AI_REVIEWER_PRESETS,
  enabledAiReviewers,
  matchesCheck,
  normalizeLogin,
  resolveAiReviewers,
  reviewerForLogin,
  type AiReviewerConfig,
} from "@/lib/ai-reviewers/config";
import {
  cleanBody,
  collectFindings,
  describeStatuses,
  formatFindingsForPrompt,
  reviewerStates,
  waitDecision,
  type ReviewerSignals,
  type ReviewerStatus,
} from "@/lib/ai-reviewers/signals";
import { systemPrompt } from "@/lib/ai/generate";
import type { AiConfig } from "@/lib/ai/config";

const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);
const reviewers = enabledAiReviewers(null);

function signals(patch: Partial<ReviewerSignals> = {}): ReviewerSignals {
  return { headSha: HEAD, checkRuns: [], statuses: [], reviews: [], reviewComments: [], issueComments: [], requestedReviewers: [], ...patch };
}

const byKey = (list: ReviewerStatus[], key: string) => list.find((s) => s.key === key)!;

describe("reviewer configuration", () => {
  it("uses every preset when nothing is saved", () => {
    expect(resolveAiReviewers(null).map((r) => r.key)).toEqual(AI_REVIEWER_PRESETS.map((p) => p.key));
    expect(enabledAiReviewers(null)).toHaveLength(AI_REVIEWER_PRESETS.length);
  });

  it("keeps turned-off presets off and appends the workspace's own reviewers", () => {
    const saved: AiReviewerConfig[] = [
      { ...AI_REVIEWER_PRESETS[1], enabled: false },
      { key: "custom-1", name: "Sourcery", logins: ["sourcery-ai[bot]"], checks: [], enabled: true },
    ];
    const list = enabledAiReviewers(saved);
    expect(list.map((r) => r.key)).toEqual(["claude", "coderabbit", "copilot", "custom-1"]);
  });

  it("matches logins with or without [bot] and in any case", () => {
    expect(normalizeLogin("Greptile-Apps[bot]")).toBe("greptile-apps");
    expect(reviewerForLogin(reviewers, "claude[bot]")?.name).toBe("Claude Code Review");
    expect(reviewerForLogin(reviewers, "claude")?.name).toBe("Claude Code Review");
    expect(reviewerForLogin(reviewers, "Copilot")?.name).toBe("GitHub Copilot");
    expect(reviewerForLogin(reviewers, "mayachen")).toBeNull();
    expect(reviewerForLogin(reviewers, null)).toBeNull();
  });

  it("matches check names exactly or with a suffix after a space", () => {
    const claude = reviewers[0];
    expect(matchesCheck(claude, "claude-review")).toBe(true);
    expect(matchesCheck(claude, "Claude-Review (ubuntu-latest)")).toBe(true);
    expect(matchesCheck(claude, "claude-reviewer")).toBe(false);
    expect(matchesCheck(claude, "lint")).toBe(false);
  });
});

describe("reviewer states", () => {
  it("is running while a check run or a commit status is pending", () => {
    const list = reviewerStates(
      reviewers,
      signals({
        checkRuns: [{ name: "claude-review", status: "in_progress", conclusion: null, htmlUrl: "https://gh/runs/1" }],
        statuses: [{ context: "CodeRabbit", state: "pending", targetUrl: null }],
      }),
    );
    expect(byKey(list, "claude")).toMatchObject({ state: "running", detail: "check claude-review is in progress", url: "https://gh/runs/1" });
    expect(byKey(list, "coderabbit").state).toBe("running");
    expect(byKey(list, "greptile").state).toBe("absent");
  });

  it("uses the newest status per context", () => {
    const list = reviewerStates(
      reviewers,
      signals({
        statuses: [
          { context: "CodeRabbit", state: "success", targetUrl: null },
          { context: "CodeRabbit", state: "pending", targetUrl: null },
        ],
      }),
    );
    expect(byKey(list, "coderabbit").state).toBe("done");
  });

  it("is done when its check finished or it reviewed the head commit, and counts its inline findings", () => {
    const list = reviewerStates(
      reviewers,
      signals({
        checkRuns: [{ name: "claude-review", status: "completed", conclusion: "success", htmlUrl: null }],
        reviews: [
          { id: 1, login: "greptile-apps[bot]", state: "COMMENTED", body: "Looks fine", commitId: HEAD, htmlUrl: "https://gh/r/1" },
          { id: 2, login: "coderabbitai[bot]", state: "COMMENTED", body: "Old", commitId: OLD, htmlUrl: "https://gh/r/2" },
        ],
        reviewComments: [
          { id: 10, login: "claude[bot]", inReplyTo: null, path: "a.ts", line: 3, side: "RIGHT", body: "Bug", htmlUrl: "u" },
          { id: 11, login: "claude[bot]", inReplyTo: 10, path: "a.ts", line: 3, side: "RIGHT", body: "Reply", htmlUrl: "u" },
          { id: 12, login: "claude[bot]", inReplyTo: null, path: "a.ts", line: null, side: "RIGHT", body: "Outdated", htmlUrl: "u" },
        ],
      }),
    );
    expect(byKey(list, "claude")).toMatchObject({ state: "done", findings: 1 });
    expect(byKey(list, "greptile")).toMatchObject({ state: "done", url: "https://gh/r/1" });
    // A review of an earlier commit doesn't count for the head.
    expect(byKey(list, "coderabbit").state).toBe("absent");
  });

  it("expects a reviewer whose review is requested", () => {
    const list = reviewerStates(reviewers, signals({ requestedReviewers: ["Copilot"] }));
    expect(byKey(list, "copilot")).toMatchObject({ state: "expected", detail: "review requested" });
  });

  it("describes the reviewers that showed up", () => {
    const list = reviewerStates(
      reviewers,
      signals({
        checkRuns: [{ name: "claude-review", status: "queued", conclusion: null, htmlUrl: null }],
        reviews: [{ id: 1, login: "greptile-apps[bot]", state: "COMMENTED", body: "", commitId: HEAD, htmlUrl: "" }],
        reviewComments: [{ id: 10, login: "greptile-apps[bot]", inReplyTo: null, path: "a.ts", line: 3, side: "RIGHT", body: "x", htmlUrl: "" }],
      }),
    );
    expect(describeStatuses(list)).toBe("Claude Code Review: reviewing · Greptile: done, 1 finding");
    expect(describeStatuses(reviewerStates(reviewers, signals()))).toBe("no AI reviewer has started yet");
  });
});

describe("wait decision", () => {
  const status = (state: ReviewerStatus["state"]): ReviewerStatus => ({ key: state, name: state, state, detail: null, findings: 0, url: null });
  const t0 = Date.parse("2026-11-04T10:00:00Z");
  const at = (seconds: number) => ({ startedAt: t0, now: t0 + seconds * 1000, waitMinutes: 15 });

  it("does not wait without reviewers", () => {
    expect(waitDecision([], at(0))).toEqual({ wait: false, outcome: "none" });
  });

  it("waits while a reviewer is running or requested, until the limit", () => {
    expect(waitDecision([status("running"), status("absent")], at(300))).toEqual({ wait: true });
    expect(waitDecision([status("expected")], at(30))).toEqual({ wait: true });
    expect(waitDecision([status("running"), status("done")], at(15 * 60))).toEqual({ wait: false, outcome: "timed_out" });
  });

  it("gives reviewers time to show up after a push", () => {
    expect(waitDecision([status("absent"), status("absent")], at(30))).toEqual({ wait: true });
    expect(waitDecision([status("absent"), status("absent")], at(121))).toEqual({ wait: false, outcome: "none" });
    expect(waitDecision([status("done"), status("absent")], at(60))).toEqual({ wait: true });
    expect(waitDecision([status("done"), status("absent")], at(121))).toEqual({ wait: false, outcome: "all_done" });
  });

  it("stops as soon as every reviewer is done", () => {
    expect(waitDecision([status("done"), status("done")], at(5))).toEqual({ wait: false, outcome: "all_done" });
  });

  it("caps the discovery time at a short wait limit", () => {
    expect(waitDecision([status("absent")], { startedAt: t0, now: t0 + 61_000, waitMinutes: 1 })).toEqual({ wait: false, outcome: "none" });
  });
});

describe("findings", () => {
  const s = signals({
    reviews: [
      { id: 1, login: "claude[bot]", state: "COMMENTED", body: "<!-- state -->\n## Review\n\nTwo problems.", commitId: HEAD, htmlUrl: "https://gh/r/1" },
      { id: 2, login: "claude[bot]", state: "COMMENTED", body: "Older review", commitId: OLD, htmlUrl: "https://gh/r/2" },
      { id: 3, login: "mayachen", state: "APPROVED", body: "LGTM", commitId: HEAD, htmlUrl: "https://gh/r/3" },
    ],
    reviewComments: [
      { id: 10, login: "claude[bot]", inReplyTo: null, path: "src/lib/images.ts", line: 8, side: "RIGHT", body: "`src` may contain a query string.", htmlUrl: "https://gh/c/10" },
      { id: 11, login: "mayachen", inReplyTo: 10, path: "src/lib/images.ts", line: 8, side: "RIGHT", body: "Good catch", htmlUrl: "https://gh/c/11" },
      { id: 12, login: "greptile-apps[bot]", inReplyTo: null, path: "next.config.ts", line: 4, side: "LEFT", body: "Removed line", htmlUrl: "https://gh/c/12" },
    ],
    issueComments: [
      { id: 20, login: "greptile-apps[bot]", body: "Old summary", htmlUrl: "https://gh/i/20", createdAt: "2026-11-04T09:00:00Z" },
      { id: 21, login: "greptile-apps[bot]", body: "<details><summary>Summary</summary>\nConfidence 3/5</details>", htmlUrl: "https://gh/i/21", createdAt: "2026-11-04T10:00:00Z" },
    ],
  });

  it("collects head reviews, the latest summary comment and inline comments of AI reviewers only", () => {
    const f = collectFindings(reviewers, s);
    expect(f.map((x) => `${x.reviewer}:${x.kind}:${x.body}`)).toEqual([
      "Claude Code Review:summary:## Review\n\nTwo problems.",
      "Claude Code Review:inline:`src` may contain a query string.",
      "Greptile:summary:Summary\nConfidence 3/5",
      "Greptile:inline:Removed line",
    ]);
  });

  it("formats them for the model with line numbers as the diff shows them", () => {
    const text = formatFindingsForPrompt(collectFindings(reviewers, s));
    expect(text).toContain("Findings from AI code reviewers on this pull request:");
    expect(text).toContain("### Claude Code Review\nSummary:\n## Review");
    expect(text).toContain("- src/lib/images.ts line 8: `src` may contain a query string.");
    expect(text).toContain("- next.config.ts line o4 (removed): Removed line");
    expect(formatFindingsForPrompt([])).toBe("");
  });

  it("cuts long bodies and long lists", () => {
    expect(cleanBody("x".repeat(50), 10)).toBe("xxxxxxxxxx …");
    const many = Array.from({ length: 50 }, (_, i) => ({
      reviewerKey: "claude",
      reviewer: "Claude Code Review",
      kind: "inline" as const,
      path: "a.ts",
      line: i + 1,
      side: "RIGHT" as const,
      body: "y".repeat(100),
      url: "",
    }));
    expect(formatFindingsForPrompt(many, 500)).toContain("(more findings omitted for length)");
  });

  it("adds the instructions to the system prompt only when there are findings", () => {
    const cfg = { provider: "anthropic", model: "m", baseUrl: "", apiKey: null, instructions: null } as unknown as AiConfig;
    expect(systemPrompt(cfg, null)).not.toContain("AI code reviewers");
    const withFindings = systemPrompt(cfg, null, { findings: true });
    expect(withFindings).toContain("AI code reviewers (bots such as Claude Code Review");
    expect(withFindings).toContain("keep your response to it very brief");
    expect(withFindings).toContain("Do not restate, paraphrase or summarize the finding");
  });
});
