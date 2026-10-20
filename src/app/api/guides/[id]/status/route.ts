import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { guideSections } from "@/db/schema";
import { errorResponse } from "@/lib/http";
import { requireGuideReadAccess, SHARE_RESPONSE_HEADERS } from "@/lib/share/access";

/** Polled by the viewer while a guide is being generated (by members, or through a share link). */
export async function GET(req: Request, ctx: RouteContext<"/api/guides/[id]/status">) {
  try {
    const { id } = await ctx.params;
    const { guide, share } = await requireGuideReadAccess(req, id);
    const [{ n }] = await db.select({ n: count() }).from(guideSections).where(eq(guideSections.guideId, id));
    return Response.json(
      {
        status: guide.status,
        sections: n,
        title: guide.title,
        error: guide.error,
        events: guide.events.slice(-30),
        updatedAt: guide.updatedAt,
      },
      share ? { headers: SHARE_RESPONSE_HEADERS } : undefined,
    );
  } catch (err) {
    return errorResponse(err);
  }
}
