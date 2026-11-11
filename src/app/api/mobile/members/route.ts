import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { githubAccounts, memberships, users } from "@/db/schema";
import { errorResponse } from "@/lib/http";
import { mobileContext, NO_STORE } from "@/lib/mobile/context";

/** GET /api/mobile/members — the workspace's members and their roles. */
export async function GET(req: Request) {
  try {
    const ctx = await mobileContext(req);
    const rows = await db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl, role: memberships.role, joinedAt: memberships.createdAt, login: githubAccounts.login })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(githubAccounts, eq(githubAccounts.userId, users.id))
      .where(eq(memberships.workspaceId, ctx.workspace.id))
      .orderBy(asc(users.name));
    return Response.json({ members: rows, me: ctx.user.id, role: ctx.role }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}
