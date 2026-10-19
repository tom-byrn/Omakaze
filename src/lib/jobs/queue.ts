import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";

export type JobType = "generate_guide" | "post_pr_comment" | "poll_repos" | "update_guide_check";
export type Job = typeof jobs.$inferSelect;

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  opts: { dedupeKey?: string; runAt?: Date; maxAttempts?: number; oncePerKey?: boolean } = {},
): Promise<Job | null> {
  if (opts.oncePerKey && opts.dedupeKey) {
    // The unique index only covers queued and running jobs; also skip keys that already ran.
    const [seen] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.dedupeKey, opts.dedupeKey)).limit(1);
    if (seen) return null;
  }
  try {
    const [job] = await db
      .insert(jobs)
      .values({
        type,
        payload,
        dedupeKey: opts.dedupeKey ?? null,
        runAt: opts.runAt ?? new Date(),
        maxAttempts: opts.maxAttempts ?? 3,
      })
      .returning();
    return job;
  } catch (err) {
    // Drizzle wraps the driver's error, which names the constraint, as the cause.
    const cause = err instanceof Error ? err.cause : undefined;
    if (`${String(err)} ${String(cause ?? "")}`.includes("jobs_dedupe_active_unique")) return null;
    throw err;
  }
}

/** Atomically claim the next runnable job (SKIP LOCKED makes multiple workers safe). */
export async function claimJob(workerId: string): Promise<Job | null> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    update ${jobs}
    set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1, updated_at = now()
    where id = (
      select id from ${jobs}
      where status = 'queued' and run_at <= now()
      order by run_at, id
      for update skip locked
      limit 1
    )
    returning id
  `);
  const id = (rows as unknown as { id: number }[])[0]?.id;
  if (id === undefined) return null;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, Number(id))).limit(1);
  return job ?? null;
}

export async function completeJob(id: number): Promise<void> {
  await db.update(jobs).set({ status: "done", lockedAt: null, lastError: null }).where(eq(jobs.id, id));
}

export async function failJob(job: Job, error: string): Promise<void> {
  const retry = job.attempts < job.maxAttempts;
  const backoffSeconds = Math.min(600, 15 * 2 ** (job.attempts - 1));
  await db
    .update(jobs)
    .set({
      status: retry ? "queued" : "failed",
      lockedAt: null,
      lastError: error.slice(0, 2000),
      runAt: retry ? new Date(Date.now() + backoffSeconds * 1000) : job.runAt,
    })
    .where(eq(jobs.id, job.id));
}

/** Requeue jobs whose worker died mid-run. */
export async function recoverStuckJobs(olderThanMinutes = 20): Promise<void> {
  await db
    .update(jobs)
    .set({ status: "queued", lockedAt: null })
    .where(and(eq(jobs.status, "running"), lt(jobs.lockedAt, new Date(Date.now() - olderThanMinutes * 60_000))));
}

export async function pruneOldJobs(days = 14): Promise<void> {
  await db.execute(sql`delete from ${jobs} where status in ('done', 'failed') and updated_at < now() - (${days} || ' days')::interval`);
}
