import { eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { repositories, workspaces } from "@/db/schema";
import { resolveAiConfig } from "@/lib/ai/config";
import { generateGuideWithAi } from "@/lib/ai/generate";
import { AiError } from "@/lib/ai/providers";
import { autoGenerateCandidates, maybeAutoGenerate } from "@/lib/automation";
import { getRepoContext } from "@/lib/github/connections";
import { syncRepositoryPulls } from "@/lib/github/pulls";
import { postGuideSummaryComment } from "@/lib/github/summary-comment";
import { failGuide, getGuide, startGuide } from "@/lib/guides/service";
import type { Job } from "./queue";

/** Errors that should not be retried. */
export class PermanentJobError extends Error {}

async function workspaceForRepo(repositoryId: string) {
  const [row] = await db
    .select({ ws: workspaces })
    .from(repositories)
    .innerJoin(workspaces, eq(workspaces.id, repositories.workspaceId))
    .where(eq(repositories.id, repositoryId))
    .limit(1);
  return row?.ws ?? null;
}

async function generateGuide(payload: Record<string, unknown>) {
  let guideId = payload.guideId as string | undefined;
  if (!guideId) {
    const repositoryId = payload.repositoryId as string;
    const ws = await workspaceForRepo(repositoryId);
    if (!ws) return;
    const ctx = await getRepoContext(repositoryId);
    const { guide } = await startGuide({
      workspaceId: ws.id,
      ctx,
      prNumber: Number(payload.prNumber),
      source: "ai",
      createdVia: (payload.trigger as "webhook" | "poll") ?? "webhook",
      author: resolveAiConfig(ws)?.model ?? "AI",
    });
    guideId = guide.id;
  }
  const guide = await getGuide(guideId);
  if (!guide || guide.status !== "generating") return;
  const ws = await workspaceForRepo(guide.repositoryId);
  const cfg = ws ? resolveAiConfig(ws) : null;
  if (!cfg) {
    await failGuide(guide.id, "No AI provider is configured. Add one in Settings → AI.");
    return;
  }
  try {
    await generateGuideWithAi(guide, cfg);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof AiError ? err.retryable : false;
    if (!retryable) {
      await failGuide(guide.id, message);
      return;
    }
    throw err;
  }
}

async function pollRepos() {
  const repos = await db
    .select({ id: repositories.id })
    .from(repositories)
    .innerJoin(workspaces, eq(workspaces.id, repositories.workspaceId))
    .where(or(eq(repositories.autoGenerate, true), isNull(repositories.autoGenerate)));
  for (const r of repos) {
    const ws = await workspaceForRepo(r.id);
    const [repo] = await db.select().from(repositories).where(eq(repositories.id, r.id)).limit(1);
    if (!ws || !(repo.autoGenerate ?? ws.autoGenerate)) continue;
    try {
      await syncRepositoryPulls(await getRepoContext(r.id), { detailsLimit: 5 });
    } catch (err) {
      console.warn("[poll] sync failed", repo.fullName, err instanceof Error ? err.message : err);
    }
  }
  for (const c of await autoGenerateCandidates()) {
    await maybeAutoGenerate(c.repo.id, c.pull, "poll");
  }
}

export async function runJob(job: Job): Promise<void> {
  switch (job.type) {
    case "generate_guide":
      return generateGuide(job.payload);
    case "post_pr_comment":
      return postGuideSummaryComment(String(job.payload.guideId));
    case "poll_repos":
      return pollRepos();
    case "sync_repo":
      await syncRepositoryPulls(await getRepoContext(String(job.payload.repositoryId)));
      return;
    default:
      throw new PermanentJobError(`Unknown job type ${job.type}`);
  }
}

export async function onJobGaveUp(job: Job, error: string): Promise<void> {
  if (job.type === "generate_guide" && typeof job.payload.guideId === "string") {
    await failGuide(job.payload.guideId, error);
  }
}
