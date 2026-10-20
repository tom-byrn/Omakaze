import { getPrincipal } from "@/lib/guides/access";
import { errorResponse, HttpError } from "@/lib/http";
import { assertSharedAsset, SHARE_RESPONSE_HEADERS, shareTokenOf } from "@/lib/share/access";
import { getAsset, readAssetData } from "@/lib/storage/assets";
import { getMembership } from "@/lib/workspaces";

/**
 * Serve an uploaded image or video to workspace members, or through a share link to a guide that
 * shows it (with Range support for video seeking).
 */
export async function GET(req: Request, ctx: RouteContext<"/api/assets/[id]/[name]">) {
  try {
    const { id } = await ctx.params;
    const shareToken = shareTokenOf(req);
    const principal = shareToken === null ? await getPrincipal(req) : null;
    if (shareToken === null && !principal) throw new HttpError(401, "Sign in to view this file");
    const asset = await getAsset(id);
    if (!asset) throw new HttpError(404, "Not found");
    if (shareToken !== null) await assertSharedAsset(req, shareToken, asset);
    else if (principal) {
      if (principal.tokenWorkspaceId && principal.tokenWorkspaceId !== asset.workspaceId) throw new HttpError(404, "Not found");
      if (!(await getMembership(asset.workspaceId, principal.user.id))) throw new HttpError(404, "Not found");
    }
    const data = await readAssetData(asset);
    const headers: Record<string, string> = {
      "Content-Type": asset.contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${asset.filename}"`,
      ...(shareToken !== null ? SHARE_RESPONSE_HEADERS : {}),
    };
    if (asset.contentType === "image/svg+xml") headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    const range = req.headers.get("range");
    const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (m) {
      const size = data.length;
      let start = m[1] ? Number(m[1]) : NaN;
      let end = m[2] ? Number(m[2]) : NaN;
      if (Number.isNaN(start)) {
        start = Math.max(0, size - (Number.isNaN(end) ? 0 : end));
        end = size - 1;
      } else if (Number.isNaN(end) || end >= size) end = size - 1;
      if (start >= size || start > end) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      return new Response(new Uint8Array(data.subarray(start, end + 1)), {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
      });
    }
    return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Length": String(data.length) } });
  } catch (err) {
    return errorResponse(err);
  }
}
