import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { activity, repositories, users } from "@/db/schema";
import { describe } from "@/lib/activity-text";
import { errorResponse } from "@/lib/http";
import { mobileContext, NO_STORE } from "@/lib/mobile/context";

const PAGE = 50;

/** GET /api/mobile/activity?before=<ISO date> — the workspace activity log, newest first. */
export async function GET(req: Request) {
  try {
    const ctx = await mobileContext(req);
    const raw = new URL(req.url).searchParams.get("before");
    const before = raw ? new Date(raw) : null;
    const rows = await db
      .select({
        id: activity.id,
        type: activity.type,
        data: activity.data,
        createdAt: activity.createdAt,
        prNumber: activity.prNumber,
        actorLabel: activity.actorLabel,
        actorName: users.name,
        actorAvatar: users.avatarUrl,
        repoFullName: repositories.fullName,
      })
      .from(activity)
      .leftJoin(users, eq(users.id, activity.actorUserId))
      .leftJoin(repositories, eq(repositories.id, activity.repositoryId))
      .where(and(eq(activity.workspaceId, ctx.workspace.id), before && !Number.isNaN(before.getTime()) ? lt(activity.createdAt, before) : undefined))
      .orderBy(desc(activity.createdAt))
      .limit(PAGE);
    return Response.json(
      {
        items: rows.map((r) => ({
          id: r.id,
          type: r.type,
          at: r.createdAt,
          actor: { name: r.actorName ?? r.actorLabel ?? "Omakaze", avatarUrl: r.actorAvatar },
          text: describe(r),
          repo: r.repoFullName,
          prNumber: r.prNumber,
          url: typeof r.data.url === "string" ? r.data.url : null,
        })),
        next: rows.length === PAGE ? rows[rows.length - 1].createdAt : null,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
