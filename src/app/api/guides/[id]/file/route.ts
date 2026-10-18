import { buildFileView } from "@/lib/diff/fileview";
import { ConnectionError, getRepoContext } from "@/lib/github/connections";
import { getSnapshot } from "@/lib/github/pulls";
import { requireGuideAccess } from "@/lib/guides/access";
import { errorResponse, HttpError } from "@/lib/http";

/** Diff + highlighted contents for one file of a guide's snapshot. */
export async function GET(req: Request, ctx: RouteContext<"/api/guides/[id]/file">) {
  try {
    const { id } = await ctx.params;
    const path = new URL(req.url).searchParams.get("path");
    if (!path) throw new HttpError(400, "path is required");
    const { guide } = await requireGuideAccess(req, id);
    const snapshot = await getSnapshot(guide.snapshotId);
    const file = snapshot?.files.find((f) => f.path === path);
    if (!snapshot || !file) throw new HttpError(404, "File not in this pull request");
    // Without a GitHub connection the stored patch is still shown, without expandable context.
    const repoCtx = await getRepoContext(guide.repositoryId).catch((err) => {
      if (err instanceof ConnectionError) return null;
      throw err;
    });
    const view = await buildFileView(repoCtx, file, {
      head: snapshot.headSha,
      mergeBase: snapshot.mergeBaseSha,
      snapshotId: snapshot.id,
    });
    return Response.json(view, { headers: { "Cache-Control": repoCtx ? "private, max-age=3600" : "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
