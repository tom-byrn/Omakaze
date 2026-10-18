import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guides } from "@/db/schema";
import { getPrincipal } from "@/lib/guides/access";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/http";
import { AssetError, assetUrl, markdownFor, storeAsset } from "@/lib/storage/assets";
import { getMembership } from "@/lib/workspaces";

/** Upload an image or video for a guide (multipart: file, guideId). */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const principal = await getPrincipal(req);
    if (!principal) throw new HttpError(401, "Sign in required");
    const form = await req.formData();
    const file = form.get("file");
    const guideId = String(form.get("guideId") ?? "");
    if (!(file instanceof File)) throw new HttpError(400, "file is required");
    const [guide] = await db.select().from(guides).where(and(eq(guides.id, guideId))).limit(1);
    if (!guide) throw new HttpError(404, "Guide not found");
    if (principal.tokenWorkspaceId && principal.tokenWorkspaceId !== guide.workspaceId) throw new HttpError(404, "Guide not found");
    if (!(await getMembership(guide.workspaceId, principal.user.id))) throw new HttpError(404, "Guide not found");
    try {
      const asset = await storeAsset({
        workspaceId: guide.workspaceId,
        guideId: guide.id,
        filename: file.name,
        contentType: file.type,
        data: Buffer.from(await file.arrayBuffer()),
        userId: principal.user.id,
      });
      return Response.json({ id: asset.id, url: assetUrl(asset), markdown: markdownFor(asset) }, { status: 201 });
    } catch (err) {
      if (err instanceof AssetError) throw new HttpError(400, err.message);
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
