/**
 * The guide check: review progress reported on a pull request's head commit, as a check run
 * (GitHub App connections) or a commit status (token and account connections).
 *
 * Updates go through the job queue. `requestGuideCheck` queues one `update_guide_check` job per
 * pull request a few seconds ahead, and requests that arrive while it is queued are coalesced
 * into it. A request that arrives while the job runs bumps `guide_checks.requests`, and the job
 * queues another update when it sees that number change.
 */
import { and, asc, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  guideChecks,
  jobs,
  memberships,
  pullRequests,
  repositories,
  sectionReviews,
  users,
  workspaces,
  type GuideCheckMode,
} from "@/db/schema";
import { buildGuideCheck, checkRunBody, commitStatusBody, type GuideCheckReport, type GuideCheckSubject } from "@/lib/guides/check";
import { computeReviewProgress, type ReviewProgress } from "@/lib/guides/review-progress";
import { getSections, guideUrl, isStaleGuide, listGuideVersions } from "@/lib/guides/service";
import { enqueueJob, type Job } from "@/lib/jobs/queue";
import { gh, GitHubError } from "./client";
import { ConnectionError, getRepoContext, type RepoContext } from "./connections";

/** How long an update waits for more review marks before it is sent. */
export const GUIDE_CHECK_DEBOUNCE_MS = 5_000;

export type GuideCheckRow = typeof guideChecks.$inferSelect;
type PullRow = typeof pullRequests.$inferSelect;

const jobKey = (repositoryId: string, prNumber: number) => `guide-check:${repositoryId}:${prNumber}`;
const rowWhere = (repositoryId: string, prNumber: number) =>
  and(eq(guideChecks.repositoryId, repositoryId), eq(guideChecks.prNumber, prNumber));

type Settings = { mode: GuideCheckMode; required: number; workspaceId: string; slug: string; fullName: string };

/** The repository's mode (its override, or the workspace's) and the reviewers each section needs. */
export async function guideCheckSettings(repositoryId: string): Promise<Settings | null> {
  const [row] = await db
    .select({
      repoMode: repositories.guideCheck,
      wsMode: workspaces.guideCheck,
      required: workspaces.guideCheckReviewers,
      workspaceId: workspaces.id,
      slug: workspaces.slug,
      fullName: repositories.fullName,
    })
    .from(repositories)
    .innerJoin(workspaces, eq(workspaces.id, repositories.workspaceId))
    .where(eq(repositories.id, repositoryId))
    .limit(1);
  if (!row) return null;
  return { mode: row.repoMode ?? row.wsMode, required: row.required, workspaceId: row.workspaceId, slug: row.slug, fullName: row.fullName };
}

/**
 * Ask for a pull request's guide check to be brought up to date. Does nothing while the check is
 * off, unless `force` is set and something was posted before (it then gets a last, neutral update).
 * Never throws: the review mark or publish that caused it must not fail because of the check.
 */
export async function requestGuideCheck(repositoryId: string, prNumber: number, opts: { force?: boolean } = {}): Promise<void> {
  try {
    const settings = await guideCheckSettings(repositoryId);
    if (!settings) return;
    if (settings.mode === "off") {
      if (!opts.force) return;
      const bumped = await db
        .update(guideChecks)
        .set({ requests: sql`${guideChecks.requests} + 1` })
        .where(and(rowWhere(repositoryId, prNumber), isNotNull(guideChecks.postedAt), ne(guideChecks.conclusion, "off")))
        .returning({ id: guideChecks.id });
      if (bumped.length === 0) return;
    } else {
      await db
        .insert(guideChecks)
        .values({ repositoryId, prNumber, requests: 1 })
        .onConflictDoUpdate({
          target: [guideChecks.repositoryId, guideChecks.prNumber],
          set: { requests: sql`${guideChecks.requests} + 1` },
        });
    }
    await enqueueJob(
      "update_guide_check",
      { repositoryId, prNumber },
      { dedupeKey: jobKey(repositoryId, prNumber), runAt: new Date(Date.now() + GUIDE_CHECK_DEBOUNCE_MS), maxAttempts: 3 },
    );
  } catch (err) {
    console.warn("[guide-check] could not queue an update", err instanceof Error ? err.message : err);
  }
}

/**
 * Queue updates for open pull requests whose head commit has no guide check yet: new pull
 * requests and new pushes. Called after pull requests are synced and on pull request webhooks.
 */
export async function reconcileGuideChecks(repositoryId: string, numbers?: number[]): Promise<void> {
  if (numbers && numbers.length === 0) return;
  try {
    const settings = await guideCheckSettings(repositoryId);
    if (!settings || settings.mode === "off") return;
    const rows = await db
      .select({ number: pullRequests.number })
      .from(pullRequests)
      .leftJoin(guideChecks, and(eq(guideChecks.repositoryId, pullRequests.repositoryId), eq(guideChecks.prNumber, pullRequests.number)))
      .where(
        and(
          eq(pullRequests.repositoryId, repositoryId),
          eq(pullRequests.state, "open"),
          numbers ? inArray(pullRequests.number, numbers) : undefined,
          sql`${guideChecks.headSha} is distinct from ${pullRequests.headSha}`,
        ),
      );
    for (const r of rows) await requestGuideCheck(repositoryId, r.number);
  } catch (err) {
    console.warn("[guide-check] reconcile failed", err instanceof Error ? err.message : err);
  }
}

/** After the setting changed: update the check of every open pull request in scope. */
export async function refreshGuideChecks(scope: { workspaceId: string } | { repositoryId: string }): Promise<void> {
  const rows = await db
    .select({ repositoryId: pullRequests.repositoryId, number: pullRequests.number })
    .from(pullRequests)
    .innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
    .where(
      and(
        eq(pullRequests.state, "open"),
        "workspaceId" in scope ? eq(repositories.workspaceId, scope.workspaceId) : eq(repositories.id, scope.repositoryId),
      ),
    );
  for (const r of rows) await requestGuideCheck(r.repositoryId, r.number, { force: true });
}

/* ------------------------------------------------------------------ */
/* The job                                                             */
/* ------------------------------------------------------------------ */

async function loadProgress(guideId: string, settings: Settings): Promise<{ progress: ReviewProgress; names: Record<string, string> }> {
  const [sections, marks, members] = await Promise.all([
    getSections(guideId),
    db
      .select({ sectionId: sectionReviews.sectionId, userId: sectionReviews.userId })
      .from(sectionReviews)
      .where(eq(sectionReviews.guideId, guideId))
      .orderBy(asc(sectionReviews.reviewedAt)),
    db
      .select({ id: users.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.workspaceId, settings.workspaceId)),
  ]);
  const progress = computeReviewProgress(sections, marks, { required: settings.required, memberIds: members.map((m) => m.id) });
  return { progress, names: Object.fromEntries(members.map((m) => [m.id, m.name])) };
}

/** What to report for the pull request's head: the latest published guide, a guide being written, or none. */
async function subjectFor(
  pull: PullRow,
  settings: Settings,
): Promise<{ subject: GuideCheckSubject; guideId: string | null; names: Record<string, string> }> {
  const versions = await listGuideVersions(pull.repositoryId, pull.number);
  const ready = versions.find((v) => v.status === "ready");
  const writing = versions.find((v) => v.status === "generating" && v.headSha === pull.headSha && !isStaleGuide(v));
  const headSha = pull.headSha;
  if (ready && ready.headSha === headSha) {
    const { progress, names } = await loadProgress(ready.id, settings);
    return { subject: { kind: "current", headSha, version: ready.version, progress }, guideId: ready.id, names };
  }
  if (writing) return { subject: { kind: "generating", headSha }, guideId: writing.id, names: {} };
  if (ready) {
    const { progress, names } = await loadProgress(ready.id, settings);
    return { subject: { kind: "outdated", headSha, version: ready.version, guideSha: ready.headSha, progress }, guideId: ready.id, names };
  }
  return { subject: { kind: "none", headSha }, guideId: null, names: {} };
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof GitHubError)) return true; // network errors and timeouts
  return err.status >= 500 || err.status === 429 || /rate limit/i.test(err.message);
}

function describeError(err: unknown, method: "check_run" | "status"): string {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof GitHubError && (err.status === 403 || err.status === 404) && !/rate limit/i.test(message)) {
    return method === "check_run"
      ? `${message}. The GitHub App needs the Checks permission (read and write); an instance admin can add it on /admin.`
      : `${message}. The connection needs Commit statuses: read and write (fine-grained token) or the repo scope (classic token).`;
  }
  return message;
}

async function postCheckRun(ctx: RepoContext, row: GuideCheckRow, headSha: string, report: GuideCheckReport, url: string): Promise<number> {
  const base = `/repos/${ctx.repo.owner}/${ctx.repo.name}/check-runs`;
  const body = checkRunBody(report, { detailsUrl: url, externalId: `${row.repositoryId}:${row.prNumber}` });
  if (row.method === "check_run" && row.checkRunId && row.headSha === headSha) {
    try {
      await gh(ctx.token, `${base}/${row.checkRunId}`, { method: "PATCH", body });
      return row.checkRunId;
    } catch (err) {
      // The run was deleted or can't change any more: start a new one.
      if (!(err instanceof GitHubError && (err.status === 404 || err.status === 422))) throw err;
    }
  }
  const run = await gh<{ id: number }>(ctx.token, base, { method: "POST", body: { ...body, head_sha: headSha } });
  return run.id;
}

/** Bring one pull request's check up to date. Throws only for errors worth retrying. */
async function updateGuideCheck(repositoryId: string, prNumber: number): Promise<void> {
  const settings = await guideCheckSettings(repositoryId);
  if (!settings) return;
  const [pull] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repositoryId, repositoryId), eq(pullRequests.number, prNumber)))
    .limit(1);
  if (!pull || pull.state !== "open") return;
  let [row] = await db.select().from(guideChecks).where(rowWhere(repositoryId, prNumber)).limit(1);

  let found: Awaited<ReturnType<typeof subjectFor>>;
  if (settings.mode === "off") {
    // One last update so a check that blocked merging doesn't keep blocking it.
    if (!row?.postedAt || row.conclusion === "off" || row.headSha !== pull.headSha) return;
    found = { subject: { kind: "off", headSha: pull.headSha }, guideId: row.guideId, names: {} };
  } else {
    found = await subjectFor(pull, settings);
  }
  const url = guideUrl(settings.slug, settings.fullName, prNumber);
  const report = buildGuideCheck({
    mode: settings.mode === "off" ? "informational" : settings.mode,
    subject: found.subject,
    url,
    required: settings.required,
    names: found.names,
  });

  if (!row) {
    [row] = await db.insert(guideChecks).values({ repositoryId, prNumber }).onConflictDoNothing().returning();
    row ??= (await db.select().from(guideChecks).where(rowWhere(repositoryId, prNumber)).limit(1))[0];
  }
  const sameCommit = row.headSha === pull.headSha;
  let ctx: RepoContext;
  try {
    ctx = await getRepoContext(repositoryId);
  } catch (err) {
    if (!(err instanceof ConnectionError)) throw err;
    await db.update(guideChecks).set({ headSha: pull.headSha, error: err.message, checkRunId: sameCommit ? row.checkRunId : null }).where(eq(guideChecks.id, row.id));
    return;
  }
  const method = ctx.connection.type === "app" ? "check_run" : "status";
  const unchanged =
    sameCommit && row.postedAt && !row.error && row.method === method && row.conclusion === report.conclusion && row.title === report.title && row.summary === report.summary;
  if (unchanged) return;

  try {
    let checkRunId: number | null = null;
    if (method === "check_run") {
      checkRunId = await postCheckRun(ctx, row, pull.headSha, report, url);
    } else {
      await gh(ctx.token, `/repos/${ctx.repo.owner}/${ctx.repo.name}/statuses/${pull.headSha}`, {
        method: "POST",
        body: commitStatusBody(report, url),
      });
    }
    await db
      .update(guideChecks)
      .set({
        headSha: pull.headSha,
        method,
        checkRunId,
        guideId: found.guideId,
        conclusion: report.conclusion,
        title: report.title,
        summary: report.summary,
        detailsUrl: url,
        postedAt: new Date(),
        error: null,
      })
      .where(eq(guideChecks.id, row.id));
  } catch (err) {
    await db
      .update(guideChecks)
      .set({ headSha: pull.headSha, method, error: describeError(err, method).slice(0, 1000), checkRunId: sameCommit ? row.checkRunId : null })
      .where(eq(guideChecks.id, row.id));
    if (isRetryable(err)) throw err;
  }
}

/** Handler of the `update_guide_check` job. */
export async function runGuideCheckJob(job: Job): Promise<void> {
  const repositoryId = String(job.payload.repositoryId);
  const prNumber = Number(job.payload.prNumber);
  const count = async () =>
    (await db.select({ requests: guideChecks.requests }).from(guideChecks).where(rowWhere(repositoryId, prNumber)).limit(1))[0]?.requests ?? 0;
  const before = await count();
  await updateGuideCheck(repositoryId, prNumber);
  // Release the key so the next request can queue a job, then catch requests made while this ran.
  await db.update(jobs).set({ dedupeKey: null }).where(eq(jobs.id, job.id));
  if ((await count()) !== before) {
    await enqueueJob(
      "update_guide_check",
      { repositoryId, prNumber },
      { dedupeKey: jobKey(repositoryId, prNumber), runAt: new Date(Date.now() + GUIDE_CHECK_DEBOUNCE_MS), maxAttempts: 3 },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Reading the state for the UI                                        */
/* ------------------------------------------------------------------ */

export type GuideCheckView = {
  mode: GuideCheckMode;
  /** The last update, or null before the first one. */
  check: {
    conclusion: GuideCheckRow["conclusion"];
    title: string | null;
    method: GuideCheckRow["method"];
    headSha: string | null;
    postedAt: string | null;
    error: string | null;
  } | null;
};

export async function getGuideCheckView(repositoryId: string, prNumber: number): Promise<GuideCheckView> {
  const settings = await guideCheckSettings(repositoryId);
  const [row] = await db.select().from(guideChecks).where(rowWhere(repositoryId, prNumber)).limit(1);
  return {
    mode: settings?.mode ?? "off",
    check:
      row && (row.postedAt || row.error)
        ? {
            conclusion: row.conclusion,
            title: row.title,
            method: row.method,
            headSha: row.headSha,
            postedAt: row.postedAt?.toISOString() ?? null,
            error: row.error,
          }
        : null,
  };
}

/** The workspace's most recently updated checks, for Settings → Automation. */
export async function recentGuideChecks(workspaceId: string, limit = 8) {
  return db
    .select({ check: guideChecks, fullName: repositories.fullName, htmlUrl: pullRequests.htmlUrl, prTitle: pullRequests.title })
    .from(guideChecks)
    .innerJoin(repositories, eq(repositories.id, guideChecks.repositoryId))
    .leftJoin(pullRequests, and(eq(pullRequests.repositoryId, guideChecks.repositoryId), eq(pullRequests.number, guideChecks.prNumber)))
    .where(and(eq(repositories.workspaceId, workspaceId), or(isNotNull(guideChecks.postedAt), isNotNull(guideChecks.error))))
    .orderBy(desc(guideChecks.updatedAt))
    .limit(limit);
}
