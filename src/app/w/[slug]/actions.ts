"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { repositories } from "@/db/schema";
import { resolveAiConfigFor } from "@/lib/ai/chatgpt";
import { getCurrentUser } from "@/lib/auth/session";
import { getRepoContext } from "@/lib/github/connections";
import { failStaleGuides, getLatestGuide, guidePath, isStaleGuide, startGuide } from "@/lib/guides/service";
import { enqueueJob } from "@/lib/jobs/queue";
import { getMembership, getWorkspaceBySlug } from "@/lib/workspaces";

export type ActionResult = { ok?: boolean; error?: string; url?: string; message?: string };

async function memberContext(slug: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in required");
  const ws = await getWorkspaceBySlug(slug);
  if (!ws) throw new Error("Workspace not found");
  const role = await getMembership(ws.id, user.id);
  if (!role) throw new Error("Workspace not found");
  return { user, ws, role };
}

/** Start AI generation for a PR. Returns the guide URL to navigate to. */
export async function generateGuideAction(slug: string, repositoryId: string, prNumber: number): Promise<ActionResult> {
  try {
    const { user, ws } = await memberContext(slug);
    const cfg = await resolveAiConfigFor(ws, user.id);
    if (!cfg) return { error: "Add an AI provider in Settings → AI first, or copy the agent prompt." };
    const [repo] = await db
      .select()
      .from(repositories)
      .where(and(eq(repositories.id, repositoryId), eq(repositories.workspaceId, ws.id)))
      .limit(1);
    if (!repo) return { error: "Repository not found" };
    const latest = await getLatestGuide(repo.id, prNumber);
    // A guide that is still being written opens instead; an abandoned one is replaced.
    if (latest?.status === "generating" && !isStaleGuide(latest)) return { url: guidePath(ws.slug, repo.fullName, prNumber) };
    if (latest && isStaleGuide(latest)) await failStaleGuides();
    const ctx = await getRepoContext(repo.id);
    const { guide } = await startGuide({
      workspaceId: ws.id,
      ctx,
      prNumber,
      source: "ai",
      createdVia: "ui",
      author: cfg.model,
      userId: user.id,
    });
    await enqueueJob("generate_guide", { guideId: guide.id }, { dedupeKey: `gen-guide:${guide.id}`, maxAttempts: 2 });
    return { ok: true, url: guidePath(ws.slug, repo.fullName, prNumber) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start generation" };
  }
}
