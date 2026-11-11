import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { guides, jobs, workspaces } from "@/db/schema";
import { gh, ghPaginate, type GhIssueComment, type GhReviewComment } from "@/lib/github/client";
import type { RepoContext } from "@/lib/github/connections";
import { listIssueComments, listReviewComments } from "@/lib/github/review";
import { appendGuideEvent, type Guide } from "@/lib/guides/service";
import { RescheduleJob, runQueuedJobsNow, type Job } from "@/lib/jobs/queue";
import type { Workspace } from "@/lib/workspaces";
import { enabledAiReviewers } from "./config";
import {
  collectFindings,
  describeStatuses,
  reviewerStates,
  waitDecision,
  type AiFinding,
  type GuideAiReviews,
  type ReviewerSignals,
  type ReviewerStatus,
} from "./signals";

/** How often a waiting job looks at GitHub again. Webhooks about reviews and checks wake it sooner. */
export const POLL_SECONDS = 20;

type GhCheckRun = { name: string; status: string; conclusion: string | null; html_url: string | null; details_url?: string | null };
type GhStatus = { context: string; state: string; target_url: string | null };
type GhReview = { id: number; user: { login: string } | null; state: string; body: string | null; commit_id: string | null; html_url: string };

/** Each read fails on its own (a token without the Checks permission, say) without hiding the others. */
async function orEmpty<T>(what: string, p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch (err) {
    console.warn(`[ai-reviewers] reading ${what} failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/** Check runs, commit statuses, reviews, comments and review requests of a pull request's head commit. */
export async function fetchReviewerSignals(ctx: RepoContext, prNumber: number, headSha: string): Promise<ReviewerSignals> {
  const repo = `/repos/${ctx.repo.owner}/${ctx.repo.name}`;
  const [checkRuns, statuses, reviews, reviewComments, issueComments, requested] = await Promise.all([
    orEmpty(
      "check runs",
      ghPaginate<GhCheckRun, { check_runs: GhCheckRun[] }>(ctx.token, `${repo}/commits/${headSha}/check-runs`, { pick: (p) => p.check_runs, maxItems: 300 }),
    ),
    orEmpty("commit statuses", ghPaginate<GhStatus>(ctx.token, `${repo}/commits/${headSha}/statuses`, { maxItems: 300 })),
    orEmpty("reviews", ghPaginate<GhReview>(ctx.token, `${repo}/pulls/${prNumber}/reviews`, { maxItems: 500 })),
    orEmpty<GhReviewComment>("review comments", listReviewComments(ctx, prNumber, true)),
    orEmpty<GhIssueComment>("comments", listIssueComments(ctx, prNumber)),
    orEmpty(
      "review requests",
      gh<{ users?: { login: string }[] }>(ctx.token, `${repo}/pulls/${prNumber}/requested_reviewers`, { noCache: true }).then((r) => (r.users ?? []).map((u) => u.login)),
    ),
  ]);
  return {
    headSha,
    checkRuns: checkRuns.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion, htmlUrl: c.html_url ?? c.details_url ?? null })),
    statuses: statuses.map((s) => ({ context: s.context, state: s.state, targetUrl: s.target_url })),
    reviews: reviews.map((r) => ({ id: r.id, login: r.user?.login ?? null, state: r.state, body: r.body ?? "", commitId: r.commit_id, htmlUrl: r.html_url })),
    reviewComments: reviewComments.map((c) => ({
      id: c.id,
      login: c.user?.login ?? null,
      inReplyTo: c.in_reply_to_id ?? null,
      path: c.path,
      line: c.line,
      side: c.side,
      body: c.body,
      htmlUrl: c.html_url,
    })),
    issueComments: issueComments.map((c) => ({ id: c.id, login: c.user?.login ?? null, body: c.body ?? "", htmlUrl: c.html_url, createdAt: c.created_at })),
    requestedReviewers: requested,
  };
}

/** Whether automatic generation for this workspace waits for AI reviewers. */
export function waitsForAiReviewers(ws: Pick<Workspace, "waitForAiReviewers" | "aiReviewers">): boolean {
  return ws.waitForAiReviewers && enabledAiReviewers(ws.aiReviewers).length > 0;
}

async function saveGuideReviews(guideId: string, value: GuideAiReviews): Promise<void> {
  await db.update(guides).set({ aiReviews: value }).where(eq(guides.id, guideId));
}

type WaitState = { startedAt: number; last?: string; done?: boolean };

const OUTCOME_TEXT: Record<NonNullable<GuideAiReviews["outcome"]>, string> = {
  all_done: "AI code reviews are in",
  timed_out: "Stopped waiting for AI code reviewers",
  skipped: "Skipped waiting for AI code reviewers",
  none: "No AI code reviewer reviewed this pull request",
};

/**
 * Before the built-in AI writes a guide: read the AI reviewers' findings. With `wait` (automatic
 * guides), the job is rescheduled (RescheduleJob) until the reviewers are done or the wait times
 * out; the state lives in the job's payload (`aiWait`), and the guide's `ai_reviews` shows it.
 * Returns the findings to write the guide with.
 */
export async function prepareAiReviews(job: Job, guide: Guide, ws: Workspace, ctx: RepoContext, opts: { wait: boolean }): Promise<AiFinding[]> {
  const reviewers = enabledAiReviewers(ws.aiReviewers);
  if (reviewers.length === 0) return [];
  // Read again: "Skip waiting" sets aiSkip while the job is queued.
  const [fresh] = await db.select({ payload: jobs.payload }).from(jobs).where(eq(jobs.id, job.id)).limit(1);
  const payload = fresh?.payload ?? job.payload;
  const state = (payload.aiWait as WaitState | undefined) ?? null;
  const wait = opts.wait && !state?.done;
  const now = Date.now();
  const startedAt = state?.startedAt ?? now;

  const signals = await fetchReviewerSignals(ctx, guide.prNumber, guide.headSha);
  const statuses = reviewerStates(reviewers, signals);
  const findings = collectFindings(reviewers, signals);
  const record = (phase: GuideAiReviews["phase"], outcome: GuideAiReviews["outcome"], list: ReviewerStatus[]): GuideAiReviews => ({
    phase,
    waited: opts.wait,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: phase === "complete" ? new Date(now).toISOString() : null,
    outcome,
    waitMinutes: ws.aiReviewerWaitMinutes,
    reviewers: list,
  });

  if (wait) {
    const decision = payload.aiSkip ? ({ wait: false, outcome: "skipped" } as const) : waitDecision(statuses, { startedAt, now, waitMinutes: ws.aiReviewerWaitMinutes });
    const line = describeStatuses(statuses);
    if (decision.wait) {
      if (!state) await appendGuideEvent(guide.id, `Waiting for AI code reviewers (up to ${ws.aiReviewerWaitMinutes} min): ${line}`);
      else if (state.last !== line) await appendGuideEvent(guide.id, line);
      await saveGuideReviews(guide.id, record("waiting", null, statuses));
      await setWaitState(job.id, { startedAt, last: line });
      throw new RescheduleJob(new Date(now + POLL_SECONDS * 1000), "waiting for AI code reviewers");
    }
    await appendGuideEvent(guide.id, `${OUTCOME_TEXT[decision.outcome]}: ${line}`, decision.outcome === "timed_out" ? "warn" : "info");
    await saveGuideReviews(guide.id, record("complete", decision.outcome, statuses));
    // A retry of this job writes the guide without waiting again.
    await setWaitState(job.id, { startedAt, last: line, done: true });
  } else if (statuses.some((s) => s.state !== "absent") || findings.length > 0) {
    await saveGuideReviews(guide.id, record("complete", null, statuses));
  }
  if (findings.length > 0) {
    const reviewersWithFindings = new Set(findings.map((f) => f.reviewer));
    await appendGuideEvent(guide.id, `Writing with ${findings.length} AI review finding${findings.length === 1 ? "" : "s"} from ${[...reviewersWithFindings].join(", ")}`);
  }
  return findings;
}

async function setWaitState(jobId: number, state: WaitState): Promise<void> {
  await db
    .update(jobs)
    .set({ payload: sql`jsonb_set(${jobs.payload}, '{aiWait}', ${JSON.stringify(state)}::jsonb)` })
    .where(eq(jobs.id, jobId));
}

/** A review, check run or status arrived for a commit: let jobs waiting on it look now. */
export async function nudgeAiReviewWait(repositoryId: string, opts: { prNumber?: number; headSha?: string }): Promise<number> {
  if (opts.prNumber !== undefined) return runQueuedJobsNow("generate_guide", { repositoryId, prNumber: String(opts.prNumber) });
  if (opts.headSha) return runQueuedJobsNow("generate_guide", { repositoryId, headSha: opts.headSha });
  return 0;
}

/** "Skip waiting" in the viewer: write the guide now with the reviews that are in. Returns false when nothing waits. */
export async function skipAiReviewWait(guideId: string): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ payload: sql`jsonb_set(${jobs.payload}, '{aiSkip}', 'true'::jsonb)`, runAt: new Date() })
    .where(and(eq(jobs.type, "generate_guide"), eq(jobs.status, "queued"), sql`${jobs.payload}->>'guideId' = ${guideId}`))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

/** The AI reviewers of a guide's workspace (the comments route labels their comments). */
export async function workspaceAiReviewers(workspaceId: string) {
  const [ws] = await db.select({ aiReviewers: workspaces.aiReviewers }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return enabledAiReviewers(ws?.aiReviewers ?? null);
}
