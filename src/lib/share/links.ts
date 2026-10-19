/**
 * Read-only share links: `/s/<token>` shows one guide version, or the latest version of a pull
 * request, to anyone with the link. The rules that don't need the database are in policy.ts.
 */
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { guides, repositories, shareLinks, users, workspaces, type Role } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/http";
import type { Guide } from "@/lib/guides/service";
import {
  canRevokeShareLink,
  newShareToken,
  parseShareToken,
  shareExpiresAt,
  shareLinkState,
  shareSecretMatches,
  sharesGuide,
} from "./policy";
import type { ShareExpiry } from "./options";

export type ShareLink = typeof shareLinks.$inferSelect;

export class ShareError extends Error {}

export function shareUrl(token: string): string {
  return `${env().APP_URL}/s/${token}`;
}

export async function createShareLink(input: {
  workspaceId: string;
  guide: Guide;
  /** Follow the pull request's latest version instead of sharing this one. */
  latest: boolean;
  expires: ShareExpiry;
  includeComments: boolean;
  userId: string;
}): Promise<{ link: ShareLink; url: string }> {
  const { guide } = input;
  if (guide.workspaceId !== input.workspaceId) throw new ShareError("Guide not found.");
  if (!input.latest && guide.status !== "ready") {
    throw new ShareError(`Version ${guide.version} isn't published. Share the latest version instead.`);
  }
  const { id, token, secretHash } = newShareToken();
  const [link] = await db
    .insert(shareLinks)
    .values({
      id,
      workspaceId: input.workspaceId,
      repositoryId: guide.repositoryId,
      prNumber: guide.prNumber,
      guideId: input.latest ? null : guide.id,
      secretHash,
      includeComments: input.includeComments,
      createdByUserId: input.userId,
      expiresAt: shareExpiresAt(input.expires),
    })
    .returning();
  await logActivity({
    workspaceId: input.workspaceId,
    type: "share.created",
    actorUserId: input.userId,
    repositoryId: guide.repositoryId,
    prNumber: guide.prNumber,
    guideId: link.guideId,
    data: { version: input.latest ? null : guide.version, comments: input.includeComments, expiresAt: link.expiresAt?.toISOString() ?? null },
  });
  return { link, url: shareUrl(token) };
}

/** Links that work now (not revoked or expired), newest first, optionally for one pull request. */
export async function listShareLinks(workspaceId: string, pull?: { repositoryId: string; prNumber: number }) {
  return db
    .select({
      id: shareLinks.id,
      repositoryId: shareLinks.repositoryId,
      prNumber: shareLinks.prNumber,
      guideId: shareLinks.guideId,
      version: guides.version,
      includeComments: shareLinks.includeComments,
      createdByUserId: shareLinks.createdByUserId,
      creatorName: users.name,
      repoFullName: repositories.fullName,
      createdAt: shareLinks.createdAt,
      expiresAt: shareLinks.expiresAt,
      lastUsedAt: shareLinks.lastUsedAt,
    })
    .from(shareLinks)
    .innerJoin(repositories, eq(repositories.id, shareLinks.repositoryId))
    .leftJoin(guides, eq(guides.id, shareLinks.guideId))
    .leftJoin(users, eq(users.id, shareLinks.createdByUserId))
    .where(
      and(
        eq(shareLinks.workspaceId, workspaceId),
        isNull(shareLinks.revokedAt),
        or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, new Date())),
        pull ? and(eq(shareLinks.repositoryId, pull.repositoryId), eq(shareLinks.prNumber, pull.prNumber)) : undefined,
      ),
    )
    .orderBy(desc(shareLinks.createdAt));
}

export type ShareLinkListItem = Awaited<ReturnType<typeof listShareLinks>>[number];

export async function revokeShareLink(workspaceId: string, linkId: string, actor: { userId: string; role: Role }): Promise<ShareLink> {
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.id, linkId), eq(shareLinks.workspaceId, workspaceId)))
    .limit(1);
  if (!link) throw new ShareError("Share link not found.");
  if (!canRevokeShareLink(actor, link)) throw new ShareError("You can only revoke share links you created.");
  if (link.revokedAt) return link;
  const [guide] = link.guideId ? await db.select({ version: guides.version }).from(guides).where(eq(guides.id, link.guideId)) : [];
  await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, link.id));
  await logActivity({
    workspaceId,
    type: "share.revoked",
    actorUserId: actor.userId,
    repositoryId: link.repositoryId,
    prNumber: link.prNumber,
    guideId: link.guideId,
    data: { version: guide?.version ?? null },
  });
  return link;
}

/* ------------------------------------------------------------------ */
/* Opening a link                                                      */
/* ------------------------------------------------------------------ */

/** Failed lookups per client address before further ones are refused, and the window. */
const MISS_LIMIT = 30;
const MISS_WINDOW_MS = 15 * 60 * 1000;
/** All lookups per client address: a page and its file views, uploads and polling each make one. */
const LOOKUP_LIMIT = 600;
const LOOKUP_WINDOW_MS = 60 * 1000;

export type OpenedShare =
  | {
      state: "active";
      link: ShareLink;
      workspace: typeof workspaces.$inferSelect;
      repo: typeof repositories.$inferSelect;
    }
  /** `limited`: too many lookups from this address. */
  | { state: "invalid" | "limited" }
  /** Share links are turned off on the instance or in the link's workspace. */
  | { state: "disabled"; scope: "instance" | "workspace" }
  | { state: "revoked" | "expired"; link: ShareLink };

const lastUsedWrites = new Map<string, number>();

/** Find the link for a token, rate limited per client address. Never throws for a bad token. */
export async function openShareLink(token: string, clientAddress: string): Promise<OpenedShare> {
  if (!env().SHARE_LINKS_ENABLED) return { state: "disabled", scope: "instance" };
  const missKey = `share-miss:${clientAddress}`;
  // Refused once MISS_LIMIT lookups have failed in the window.
  if (!rateLimit(missKey, MISS_LIMIT - 1, MISS_WINDOW_MS, 0)) return { state: "limited" };
  if (!rateLimit(`share-lookup:${clientAddress}`, LOOKUP_LIMIT, LOOKUP_WINDOW_MS)) return { state: "limited" };
  const parsed = parseShareToken(token);
  const [row] = parsed
    ? await db
        .select({ link: shareLinks, workspace: workspaces, repo: repositories })
        .from(shareLinks)
        .innerJoin(workspaces, eq(workspaces.id, shareLinks.workspaceId))
        .innerJoin(repositories, eq(repositories.id, shareLinks.repositoryId))
        .where(eq(shareLinks.id, parsed.id))
        .limit(1)
    : [];
  if (!parsed || !row || !shareSecretMatches(parsed.secret, row.link.secretHash)) {
    rateLimit(missKey, MISS_LIMIT, MISS_WINDOW_MS);
    return { state: "invalid" };
  }
  const state = shareLinkState(row.link);
  if (state !== "active") return { state, link: row.link };
  if (!row.workspace.shareLinksEnabled) return { state: "disabled", scope: "workspace" };
  const last = lastUsedWrites.get(row.link.id) ?? 0;
  if (Date.now() - last > 60_000) {
    lastUsedWrites.set(row.link.id, Date.now());
    await db.update(shareLinks).set({ lastUsedAt: new Date() }).where(eq(shareLinks.id, row.link.id));
  }
  return { state: "active", link: row.link, workspace: row.workspace, repo: row.repo };
}

/** The versions a link shows, newest first (see sharesGuide). */
export async function sharedVersions(link: ShareLink) {
  const rows = await db
    .select({
      id: guides.id,
      workspaceId: guides.workspaceId,
      repositoryId: guides.repositoryId,
      prNumber: guides.prNumber,
      version: guides.version,
      status: guides.status,
      headSha: guides.headSha,
    })
    .from(guides)
    .where(and(eq(guides.repositoryId, link.repositoryId), eq(guides.prNumber, link.prNumber)))
    .orderBy(desc(guides.version));
  return rows.filter((g) => sharesGuide(link, g));
}
