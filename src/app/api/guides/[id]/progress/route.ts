import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { guideSections } from "@/db/schema";
import { requestGuideCheck } from "@/lib/github/guide-check";
import { requireGuideAccess } from "@/lib/guides/access";
import { setSectionReviewed } from "@/lib/guides/service";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/http";

const schema = z.object({ sectionId: z.string(), reviewed: z.boolean() });

export async function POST(req: Request, ctx: RouteContext<"/api/guides/[id]/progress">) {
  try {
    assertSameOrigin(req);
    const { id } = await ctx.params;
    const { principal, guide } = await requireGuideAccess(req, id);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    const [section] = await db
      .select({ id: guideSections.id })
      .from(guideSections)
      .where(and(eq(guideSections.id, parsed.data.sectionId), eq(guideSections.guideId, id)))
      .limit(1);
    if (!section) throw new HttpError(404, "Section not found");
    await setSectionReviewed(id, section.id, principal.user.id, parsed.data.reviewed);
    await requestGuideCheck(guide.repositoryId, guide.prNumber);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
