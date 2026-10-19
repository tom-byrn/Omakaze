import { requireGuideAccess } from "@/lib/guides/access";
import { flag, guideMarkdownResponse } from "@/lib/guides/export-data";
import { errorResponse, HttpError } from "@/lib/http";

/** The guide as a Markdown file (the viewer's Export menu). `embed_images=1` inlines uploaded images. */
export async function GET(req: Request, ctx: RouteContext<"/api/guides/[id]/export">) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "md";
    if (format !== "md") throw new HttpError(400, "format must be md");
    const { guide, repo, workspace } = await requireGuideAccess(req, id);
    return await guideMarkdownResponse(guide, repo, workspace.slug, { embedImages: flag(url.searchParams.get("embed_images")) });
  } catch (err) {
    return errorResponse(err);
  }
}
