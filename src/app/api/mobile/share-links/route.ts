import { z } from "zod";
import { env } from "@/lib/env";
import { getGuide } from "@/lib/guides/service";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { mobileContext, NO_STORE, repoParam, type MobileContext } from "@/lib/mobile/context";
import { createShareLink, listShareLinks, revokeShareLink, ShareError } from "@/lib/share/links";
import { SHARE_EXPIRY_VALUES } from "@/lib/share/options";
import { canCreateShareLinks, canRevokeShareLink } from "@/lib/share/policy";

function assertShareLinksOn(ctx: MobileContext) {
  if (!env().SHARE_LINKS_ENABLED) throw new HttpError(409, "Share links are turned off on this instance.");
  if (!ctx.workspace.shareLinksEnabled) throw new HttpError(409, "Share links are turned off in this workspace.");
}

/** GET /api/mobile/share-links?repo=owner/name&number=412 — active links (of one pull request, or all). */
export async function GET(req: Request) {
  try {
    const ctx = await mobileContext(req);
    assertShareLinksOn(ctx);
    const params = new URL(req.url).searchParams;
    const repo = params.get("repo") ? await repoParam(ctx, params.get("repo")) : null;
    const number = Number(params.get("number"));
    const links = await listShareLinks(ctx.workspace.id, repo && Number.isInteger(number) ? { repositoryId: repo.id, prNumber: number } : undefined);
    const viewer = { userId: ctx.user.id, role: ctx.role };
    return Response.json(
      {
        canCreate: canCreateShareLinks(ctx.role, ctx.workspace.shareLinkRole),
        links: links.map((l) => ({
          id: l.id,
          repoFullName: l.repoFullName,
          prNumber: l.prNumber,
          version: l.guideId === null ? null : l.version,
          includeComments: l.includeComments,
          creatorName: l.creatorName,
          createdAt: l.createdAt,
          expiresAt: l.expiresAt,
          lastUsedAt: l.lastUsedAt,
          canRevoke: canRevokeShareLink(viewer, l),
        })),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({
  guideId: z.string().min(1),
  target: z.enum(["version", "latest"]),
  expires: z.enum(SHARE_EXPIRY_VALUES),
  comments: z.boolean().default(false),
});

/** POST /api/mobile/share-links {guideId, target, expires, comments} — returns the URL once. */
export async function POST(req: Request) {
  try {
    const ctx = await mobileContext(req);
    assertShareLinksOn(ctx);
    if (!canCreateShareLinks(ctx.role, ctx.workspace.shareLinkRole)) throw new HttpError(403, "Only admins and owners can create share links in this workspace.");
    const parsed = createSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "Choose what to share and when the link expires.");
    const guide = await getGuide(parsed.data.guideId);
    if (!guide || guide.workspaceId !== ctx.workspace.id) throw new HttpError(404, "Guide not found.");
    try {
      const { link, url } = await createShareLink({
        workspaceId: ctx.workspace.id,
        guide,
        latest: parsed.data.target === "latest",
        expires: parsed.data.expires,
        includeComments: parsed.data.comments,
        userId: ctx.user.id,
      });
      return Response.json({ id: link.id, url, expiresAt: link.expiresAt });
    } catch (err) {
      if (err instanceof ShareError) throw new HttpError(409, err.message);
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/mobile/share-links?id=<link id> — revoke a link. */
export async function DELETE(req: Request) {
  try {
    const ctx = await mobileContext(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "id is required");
    try {
      await revokeShareLink(ctx.workspace.id, id, { userId: ctx.user.id, role: ctx.role });
    } catch (err) {
      if (err instanceof ShareError) throw new HttpError(403, err.message);
      throw err;
    }
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
