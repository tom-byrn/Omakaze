import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { githubConnections, repositories } from "@/db/schema";
import { maybeAutoGenerate } from "@/lib/automation";
import { safeEqual } from "@/lib/crypto";
import type { GhPull } from "./client";
import { applyPeopleEvent, type PeopleEvent } from "./people";
import { upsertPull } from "./pulls";
import { invalidateReviewComments } from "./review";
import { invalidateReviewThreads } from "./threads";

export function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return safeEqual(expected, signature);
}

type Payload = PeopleEvent & {
  action?: string;
  installation?: { id: number };
  repository?: { id: number; full_name: string };
  pull_request?: GhPull;
};

/** Handle one webhook event. Returns "processed" or "ignored". */
export async function handleWebhook(event: string, payload: Payload): Promise<"processed" | "ignored"> {
  switch (event) {
    case "ping":
      return "ignored";
    case "installation": {
      const id = payload.installation?.id;
      if (!id) return "ignored";
      if (payload.action === "deleted") {
        await db.delete(githubConnections).where(eq(githubConnections.installationId, id));
        return "processed";
      }
      if (payload.action === "suspend" || payload.action === "unsuspend") {
        await db
          .update(githubConnections)
          .set({ suspendedAt: payload.action === "suspend" ? new Date() : null })
          .where(eq(githubConnections.installationId, id));
        return "processed";
      }
      return "ignored";
    }
    case "pull_request": {
      // review_requested, review_request_removed, assigned and unassigned name the person they changed.
      const pr = payload.pull_request ? applyPeopleEvent(payload.pull_request, payload) : undefined;
      const repoId = payload.repository?.id;
      if (!pr || !repoId) return "ignored";
      const repos = await db.select().from(repositories).where(eq(repositories.githubId, repoId));
      if (repos.length === 0) return "ignored";
      for (const repo of repos) {
        const row = await upsertPull(repo.id, pr);
        if (["opened", "reopened", "synchronize", "ready_for_review"].includes(payload.action ?? "")) {
          await maybeAutoGenerate(repo.id, row, "webhook");
        }
      }
      return "processed";
    }
    case "pull_request_review":
    case "pull_request_review_comment":
    case "pull_request_review_thread": {
      // Reviews, comments and resolved conversations on GitHub: refresh the pull request and the
      // cached comments and threads.
      const pr = payload.pull_request;
      const repoId = payload.repository?.id;
      if (!pr || !repoId) return "ignored";
      const repos = await db.select().from(repositories).where(eq(repositories.githubId, repoId));
      if (repos.length === 0) return "ignored";
      for (const repo of repos) {
        await upsertPull(repo.id, pr);
        invalidateReviewComments(repo.id, pr.number);
        invalidateReviewThreads(repo.id, pr.number);
      }
      return "processed";
    }
    default:
      return "ignored";
  }
}
