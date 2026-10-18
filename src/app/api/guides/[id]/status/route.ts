import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { guideSections } from "@/db/schema";
import { requireGuideAccess } from "@/lib/guides/access";
import { errorResponse } from "@/lib/http";

/** Polled by the viewer while a guide is being generated. */
export async function GET(req: Request, ctx: RouteContext<"/api/guides/[id]/status">) {
  try {
    const { id } = await ctx.params;
    const { guide } = await requireGuideAccess(req, id);
    const [{ n }] = await db.select({ n: count() }).from(guideSections).where(eq(guideSections.guideId, id));
    return Response.json({
      status: guide.status,
      sections: n,
      title: guide.title,
      error: guide.error,
      events: guide.events.slice(-30),
      updatedAt: guide.updatedAt,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
