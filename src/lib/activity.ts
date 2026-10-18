import { db } from "@/db";
import { activity } from "@/db/schema";

export type ActivityType =
  | "workspace.created"
  | "member.joined"
  | "member.removed"
  | "member.role_changed"
  | "invite.created"
  | "connection.created"
  | "connection.removed"
  | "repo.added"
  | "repo.removed"
  | "guide.started"
  | "guide.ready"
  | "guide.failed"
  | "guide.deleted"
  | "comment.posted"
  | "review.submitted"
  | "settings.updated"
  | "token.created";

export async function logActivity(input: {
  workspaceId: string;
  type: ActivityType;
  actorUserId?: string | null;
  actorLabel?: string | null;
  repositoryId?: string | null;
  prNumber?: number | null;
  guideId?: string | null;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(activity).values({
      workspaceId: input.workspaceId,
      type: input.type,
      actorUserId: input.actorUserId ?? null,
      actorLabel: input.actorLabel ?? null,
      repositoryId: input.repositoryId ?? null,
      prNumber: input.prNumber ?? null,
      guideId: input.guideId ?? null,
      data: input.data ?? {},
    });
  } catch (err) {
    console.error("[activity] failed to record", input.type, err);
  }
}
