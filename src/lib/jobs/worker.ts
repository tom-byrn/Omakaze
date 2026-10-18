import { hostname } from "node:os";
import { env } from "@/lib/env";
import { onJobGaveUp, PermanentJobError, runJob } from "./handlers";
import { claimJob, completeJob, enqueueJob, failJob, pruneOldJobs, recoverStuckJobs } from "./queue";

const WORKER_ID = `${hostname()}:${process.pid}`;
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 3);
const globalForWorker = globalThis as unknown as { __guidedPrsWorker?: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loop(slot: number) {
  for (;;) {
    let job = null;
    try {
      job = await claimJob(`${WORKER_ID}#${slot}`);
    } catch (err) {
      console.error("[worker] claim failed", err instanceof Error ? err.message : err);
      await sleep(5000);
      continue;
    }
    if (!job) {
      await sleep(1500 + Math.random() * 500);
      continue;
    }
    try {
      await runJob(job);
      await completeJob(job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] job ${job.id} (${job.type}) failed:`, message);
      const permanent = err instanceof PermanentJobError;
      await failJob(permanent ? { ...job, attempts: job.maxAttempts } : job, message);
      if (permanent || job.attempts >= job.maxAttempts) await onJobGaveUp(job, message).catch(() => {});
    }
  }
}

async function scheduler() {
  const interval = env().POLL_INTERVAL_SECONDS;
  for (;;) {
    try {
      await recoverStuckJobs();
      if (interval > 0) {
        const bucket = Math.floor(Date.now() / (interval * 1000));
        await enqueueJob("poll_repos", {}, { dedupeKey: `poll:${bucket}`, maxAttempts: 1 });
      }
      if (Math.random() < 0.05) await pruneOldJobs();
    } catch (err) {
      console.error("[worker] scheduler error", err instanceof Error ? err.message : err);
    }
    await sleep(Math.max(30, Math.min(interval || 60, 300)) * 1000);
  }
}

/** Start background workers in this process (idempotent). */
export function startWorker(): void {
  if (globalForWorker.__guidedPrsWorker) return;
  globalForWorker.__guidedPrsWorker = true;
  console.info(`[worker] starting ${CONCURRENCY} job loops (${WORKER_ID})`);
  for (let i = 0; i < CONCURRENCY; i++) void loop(i);
  void scheduler();
}
