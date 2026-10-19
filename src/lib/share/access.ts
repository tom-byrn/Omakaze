/**
 * Access for the read-only routes a shared guide calls: file views, generation status, review
 * comments (when the link includes them) and uploads. A share token only opens the guide versions
 * its link shares, and only uploads those versions show; every other route ignores it.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { guideSections, guides } from "@/db/schema";
import { requireGuideAccess, type GuideAccess } from "@/lib/guides/access";
import { getGuide } from "@/lib/guides/service";
import { clientIp, HttpError } from "@/lib/http";
import type { Asset } from "@/lib/storage/assets";
import { openShareLink, sharedVersions, type ShareLink } from "./links";
import { referencesAsset, sharesGuide } from "./policy";
import { SHARE_PARAM } from "./url";

export function shareTokenOf(req: Request): string | null {
  return new URL(req.url).searchParams.get(SHARE_PARAM);
}

/** Headers for responses served through a share token: not cached, so revoking takes effect at once, and not indexed. */
export const SHARE_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

async function activeShare(req: Request, token: string) {
  const opened = await openShareLink(token, clientIp(req.headers));
  if (opened.state === "limited") throw new HttpError(429, "Too many requests. Try again later.");
  if (opened.state !== "active") throw new HttpError(404, "Not found");
  return opened;
}

export type GuideReadAccess = Pick<GuideAccess, "guide" | "repo" | "workspace"> &
  ({ share: null; principal: GuideAccess["principal"] } | { share: ShareLink; principal: null });

/**
 * A member's access to a guide (session or API token), or a share link's when the request carries
 * `?share=<token>`. `comments` is for the review comments route, which a link opens only when it
 * was created with comments.
 */
export async function requireGuideReadAccess(req: Request, guideId: string, opts: { comments?: boolean } = {}): Promise<GuideReadAccess> {
  const token = shareTokenOf(req);
  if (token === null) {
    const access = await requireGuideAccess(req, guideId);
    return { ...access, share: null };
  }
  const { link, workspace, repo } = await activeShare(req, token);
  if (opts.comments && !link.includeComments) throw new HttpError(404, "Guide not found");
  const guide = await getGuide(guideId);
  if (!guide || !sharesGuide(link, guide)) throw new HttpError(404, "Guide not found");
  return { guide, repo, workspace, share: link, principal: null };
}

/** Throws unless the share token's link shows a guide version whose text links to this upload. */
export async function assertSharedAsset(req: Request, token: string, asset: Asset): Promise<void> {
  const { link } = await activeShare(req, token);
  if (asset.workspaceId !== link.workspaceId) throw new HttpError(404, "Not found");
  const ids = (await sharedVersions(link)).map((v) => v.id);
  if (ids.length === 0) throw new HttpError(404, "Not found");
  const [summaries, bodies] = await Promise.all([
    db.select({ text: guides.summary }).from(guides).where(inArray(guides.id, ids)),
    db.select({ text: guideSections.body }).from(guideSections).where(inArray(guideSections.guideId, ids)),
  ]);
  if (!referencesAsset([...summaries, ...bodies].map((r) => r.text), asset.id)) throw new HttpError(404, "Not found");
}
