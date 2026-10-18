import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { pullRequests, repositories, workspaces } from "@/db/schema";
import { resolveAiConfig } from "@/lib/ai/config";
import { getLatestGuide, isStaleGuide } from "@/lib/guides/service";
import { enqueueJob } from "@/lib/jobs/queue";

type PullLike = { number: number; headSha: string; draft: boolean; state: "open" | "closed" };

export async function effectiveAutoGenerate(repositoryId: string) {
  const [row] = await db
    .select({ repo: repositories, ws: workspaces })
    .from(repositories)
    .innerJoin(workspaces, eq(workspaces.id, repositories.workspaceId))
    .where(eq(repositories.id, repositoryId))
    .limit(1);
  if (!row) return null;
  return { ...row, enabled: row.repo.autoGenerate ?? row.ws.autoGenerate };
}

/** Queue AI generation for a PR if the workspace/repo settings ask for it. */
export async function maybeAutoGenerate(
  repositoryId: string,
  pull: PullLike,
  trigger: "webhook" | "poll",
): Promise<"queued" | "skipped"> {
  if (pull.state !== "open") return "skipped";
  const info = await effectiveAutoGenerate(repositoryId);
  if (!info?.enabled) return "skipped";
  if (pull.draft && info.ws.skipDrafts) return "skipped";
  if (!resolveAiConfig(info.ws)) return "skipped";
  const latest = await getLatestGuide(repositoryId, pull.number);
  if (latest) {
    if (latest.headSha === pull.headSha) return "skipped";
    if (latest.status === "generating" && !isStaleGuide(latest)) return "skipped";
    if (!info.ws.regenerateOnPush) return "skipped";
  }
  const job = await enqueueJob(
    "generate_guide",
    { repositoryId, prNumber: pull.number, headSha: pull.headSha, trigger },
    { dedupeKey: `gen:${repositoryId}:${pull.number}:${pull.headSha}`, maxAttempts: 2 },
  );
  return job ? "queued" : "skipped";
}

/** Recently updated open PRs in repos with auto-generation enabled. */
export async function autoGenerateCandidates(sinceDays = 3) {
  const rows = await db
    .select({ pull: pullRequests, repo: repositories, ws: workspaces })
    .from(pullRequests)
    .innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
    .innerJoin(workspaces, eq(workspaces.id, repositories.workspaceId))
    .where(
      and(eq(pullRequests.state, "open"), gt(pullRequests.githubUpdatedAt, new Date(Date.now() - sinceDays * 86400_000))),
    );
  return rows.filter((r) => r.repo.autoGenerate ?? r.ws.autoGenerate);
}
