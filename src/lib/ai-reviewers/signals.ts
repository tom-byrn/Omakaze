import { DISCOVERY_SECONDS, matchesCheck, normalizeLogin, reviewerForLogin, type AiReviewerConfig } from "./config";

/**
 * What GitHub says about AI reviewers on a pull request's head commit, and the decisions taken
 * from it: which reviewers are still working, whether automatic generation keeps waiting, and the
 * findings the guide is written with. Plain data in and out, so it is unit tested.
 */

export type ReviewerSignals = {
  headSha: string;
  checkRuns: { name: string; status: string; conclusion: string | null; htmlUrl: string | null }[];
  /** Commit statuses, newest first (as GitHub lists them). */
  statuses: { context: string; state: string; targetUrl: string | null }[];
  reviews: { id: number; login: string | null; state: string; body: string; commitId: string | null; htmlUrl: string }[];
  reviewComments: {
    id: number;
    login: string | null;
    inReplyTo: number | null;
    path: string;
    line: number | null;
    side: "LEFT" | "RIGHT" | null;
    body: string;
    htmlUrl: string;
  }[];
  issueComments: { id: number; login: string | null; body: string; htmlUrl: string; createdAt: string }[];
  /** Logins whose review is requested (e.g. "Copilot"). */
  requestedReviewers: string[];
};

/**
 * running: a check run or commit status of the reviewer is pending.
 * done: its check finished, or it reviewed the head commit.
 * expected: its review is requested but nothing has started.
 * absent: no sign of it on this pull request.
 */
export type ReviewerState = "running" | "done" | "expected" | "absent";

export type ReviewerStatus = {
  key: string;
  name: string;
  state: ReviewerState;
  /** What the state was taken from, e.g. "check claude-review is in progress". */
  detail: string | null;
  /** Inline comments it left on lines of the current diff. */
  findings: number;
  url: string | null;
};

/** Recorded on a guide (`guides.ai_reviews`): the wait, and the reviewers the guide was written with. */
export type GuideAiReviews = {
  /** "waiting" while automatic generation waits; "complete" once the guide is being written. */
  phase: "waiting" | "complete";
  /** Whether generation waited (automatic guides); false when the reviews were read once. */
  waited: boolean;
  startedAt: string;
  finishedAt: string | null;
  /** Why the wait ended. */
  outcome: "all_done" | "timed_out" | "skipped" | "none" | null;
  /** Minutes the wait may last (for "waiting up to …"). */
  waitMinutes: number;
  reviewers: ReviewerStatus[];
};

const shortSha = (sha: string) => sha.slice(0, 7);

/** The state of each reviewer from the signals. Reviewers without any sign are included as absent. */
export function reviewerStates(reviewers: AiReviewerConfig[], s: ReviewerSignals): ReviewerStatus[] {
  const requested = new Set(s.requestedReviewers.map(normalizeLogin));
  // GitHub lists statuses newest first; the first per context is the current one.
  const latestStatus = new Map<string, ReviewerSignals["statuses"][number]>();
  for (const st of s.statuses) if (!latestStatus.has(st.context)) latestStatus.set(st.context, st);

  return reviewers.map((r) => {
    const mine = (login: string | null) => reviewerForLogin([r], login) !== null;
    const findings = s.reviewComments.filter((c) => !c.inReplyTo && c.line !== null && mine(c.login)).length;
    const base = { key: r.key, name: r.name, findings };

    const runs = s.checkRuns.filter((c) => matchesCheck(r, c.name));
    const statuses = [...latestStatus.values()].filter((st) => matchesCheck(r, st.context));
    const pendingRun = runs.find((c) => c.status !== "completed");
    if (pendingRun) {
      return { ...base, state: "running" as const, detail: `check ${pendingRun.name} is ${pendingRun.status.replace(/_/g, " ")}`, url: pendingRun.htmlUrl };
    }
    const pendingStatus = statuses.find((st) => st.state === "pending");
    if (pendingStatus) return { ...base, state: "running" as const, detail: `status ${pendingStatus.context} is pending`, url: pendingStatus.targetUrl };

    const headReview = [...s.reviews].reverse().find((rv) => mine(rv.login) && rv.commitId === s.headSha);
    const doneRun = runs.find((c) => c.status === "completed");
    if (doneRun) {
      return { ...base, state: "done" as const, detail: `check ${doneRun.name} ${doneRun.conclusion ?? "completed"}`, url: headReview?.htmlUrl ?? doneRun.htmlUrl };
    }
    const doneStatus = statuses[0];
    if (doneStatus) return { ...base, state: "done" as const, detail: `status ${doneStatus.context}: ${doneStatus.state}`, url: headReview?.htmlUrl ?? doneStatus.targetUrl };
    if (headReview) return { ...base, state: "done" as const, detail: `reviewed ${shortSha(s.headSha)}`, url: headReview.htmlUrl };

    if (r.logins.some((l) => requested.has(normalizeLogin(l)))) {
      return { ...base, state: "expected" as const, detail: "review requested", url: null };
    }
    return { ...base, state: "absent" as const, detail: null, url: null };
  });
}

export type WaitDecision = { wait: true } | { wait: false; outcome: NonNullable<GuideAiReviews["outcome"]> };

/**
 * Whether automatic generation keeps waiting. It waits while a reviewer is running or expected,
 * up to `waitMinutes`, and for at least DISCOVERY_SECONDS so reviewers have time to show up after
 * a push, unless every enabled reviewer is already done.
 */
export function waitDecision(statuses: ReviewerStatus[], opts: { startedAt: number; now: number; waitMinutes: number }): WaitDecision {
  if (statuses.length === 0) return { wait: false, outcome: "none" };
  const elapsed = (opts.now - opts.startedAt) / 1000;
  const busy = statuses.some((s) => s.state === "running" || s.state === "expected");
  const anyDone = statuses.some((s) => s.state === "done");
  if (statuses.every((s) => s.state === "done")) return { wait: false, outcome: "all_done" };
  if (elapsed >= opts.waitMinutes * 60) return { wait: false, outcome: busy ? "timed_out" : anyDone ? "all_done" : "none" };
  if (busy) return { wait: true };
  if (elapsed < Math.min(DISCOVERY_SECONDS, opts.waitMinutes * 60)) return { wait: true };
  return { wait: false, outcome: anyDone ? "all_done" : "none" };
}

/** One line for the guide's progress log, e.g. "Claude Code Review: running · Greptile: done, 2 findings". */
export function describeStatuses(statuses: ReviewerStatus[]): string {
  const seen = statuses.filter((s) => s.state !== "absent");
  if (seen.length === 0) return "no AI reviewer has started yet";
  return seen
    .map((s) => {
      const label = s.state === "done" ? `done${s.findings ? `, ${s.findings} finding${s.findings === 1 ? "" : "s"}` : ""}` : s.state === "expected" ? "requested" : "reviewing";
      return `${s.name}: ${label}`;
    })
    .join(" · ");
}

/* ------------------------------------------------------------------ */
/* Findings                                                            */
/* ------------------------------------------------------------------ */

export type AiFinding = {
  reviewerKey: string;
  reviewer: string;
  /** "inline": a comment on a line. "summary": a review body or a comment on the conversation. */
  kind: "inline" | "summary";
  path: string | null;
  line: number | null;
  side: "LEFT" | "RIGHT" | null;
  body: string;
  url: string;
};

/** Remove HTML comments and markup noise bots add (hidden state, badges), and keep it short. */
export function cleanBody(body: string, max = 2000): string {
  let s = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(details|summary|sub|sup|div|p|br|img|picture|source|a|b|i|strong|em|span)\b[^>]*>/gi, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (s.length > max) s = `${s.slice(0, max).trimEnd()} …`;
  return s;
}

/**
 * The findings of enabled reviewers: inline comments on lines of the current diff (not replies),
 * review bodies on the head commit, and each reviewer's latest comment on the conversation (bots
 * such as CodeRabbit and Greptile keep one summary comment up to date).
 */
export function collectFindings(reviewers: AiReviewerConfig[], s: ReviewerSignals): AiFinding[] {
  const out: AiFinding[] = [];
  for (const r of reviewers) {
    const mine = (login: string | null) => reviewerForLogin([r], login) !== null;
    const who = { reviewerKey: r.key, reviewer: r.name };
    for (const rv of s.reviews) {
      if (!mine(rv.login) || rv.commitId !== s.headSha) continue;
      const body = cleanBody(rv.body, 4000);
      if (body) out.push({ ...who, kind: "summary", path: null, line: null, side: null, body, url: rv.htmlUrl });
    }
    const latest = s.issueComments.filter((c) => mine(c.login)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (latest) {
      const body = cleanBody(latest.body, 4000);
      if (body) out.push({ ...who, kind: "summary", path: null, line: null, side: null, body, url: latest.htmlUrl });
    }
    for (const c of s.reviewComments) {
      if (!mine(c.login) || c.inReplyTo || c.line === null) continue;
      const body = cleanBody(c.body);
      if (body) out.push({ ...who, kind: "inline", path: c.path, line: c.line, side: c.side ?? "RIGHT", body, url: c.htmlUrl });
    }
  }
  return out;
}

/** Instructions added to the system prompt when a guide is written with AI reviewer findings. */
export const AI_FINDINGS_INSTRUCTIONS = `AI code reviewers (bots such as Claude Code Review, Greptile, CodeRabbit or GitHub Copilot) reviewed this pull request; their findings are listed after the diff.
- Reviewers see each finding as a comment next to its line, so keep your response to it very brief: in the section that covers the line, one short sentence with the reviewer's name, a diff: link to the line and your verdict (whether it holds, in a few words). For example: "Claude Code Review flagged [the host check](diff:src/a.ts#L8): holds, local images break." Use a > [!WARNING] alert for likely bugs and security problems; minor ones need no alert.
- Do not restate, paraphrase or summarize the finding itself, and do not invent findings that are not listed.
- In the summary, at most one sentence on which findings matter.`;

/** The findings as text for the model, after the diff. Long lists are cut at `maxChars`. */
export function formatFindingsForPrompt(findings: AiFinding[], maxChars = 24_000): string {
  if (findings.length === 0) return "";
  const parts: string[] = [];
  const byReviewer = new Map<string, AiFinding[]>();
  for (const f of findings) byReviewer.set(f.reviewer, [...(byReviewer.get(f.reviewer) ?? []), f]);
  for (const [name, list] of byReviewer) {
    const lines = [`### ${name}`];
    for (const f of list.filter((x) => x.kind === "summary")) lines.push(`Summary:\n${f.body}`);
    const inline = list.filter((x) => x.kind === "inline");
    if (inline.length > 0) {
      lines.push("Inline findings:");
      for (const f of inline) {
        const where = `${f.path} line ${f.side === "LEFT" ? `o${f.line} (removed)` : f.line}`;
        lines.push(`- ${where}: ${f.body.replace(/\n+/g, "\n  ")}`);
      }
    }
    parts.push(lines.join("\n"));
  }
  let text = parts.join("\n\n");
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n(more findings omitted for length)`;
  return `Findings from AI code reviewers on this pull request:\n\n${text}`;
}
