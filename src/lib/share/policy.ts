/**
 * Rules for read-only share links that don't need the database: tokens, expiry, who may create
 * and revoke links, and which guide versions and uploads a link may serve. See links.ts.
 */
import { randomBytes } from "node:crypto";
import type { GuideStatus, Role } from "@/db/schema";
import { safeEqual, sha256 } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { roleAtLeast } from "@/lib/workspaces";
import type { ShareExpiry } from "./options";

/** Length of a link id from newId(), which starts the token. */
const ID_LENGTH = 16;
const SECRET_BYTES = 32;
const TOKEN_RE = /^[A-Za-z0-9_-]{59}$/;

/**
 * A new link's token: the link's id, then a random 256-bit secret. The id finds the row and the
 * secret is compared with its stored hash in constant time, so a lookup never reveals timing about
 * stored secrets. Only `secretHash` is stored.
 */
export function newShareToken(): { id: string; token: string; secretHash: string } {
  const id = newId();
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  return { id, token: `${id}${secret}`, secretHash: sha256(secret) };
}

export function parseShareToken(token: string | null | undefined): { id: string; secret: string } | null {
  if (!token || !TOKEN_RE.test(token)) return null;
  return { id: token.slice(0, ID_LENGTH), secret: token.slice(ID_LENGTH) };
}

export function shareSecretMatches(secret: string, secretHash: string): boolean {
  return safeEqual(sha256(secret), secretHash);
}

export function shareExpiresAt(choice: ShareExpiry, now = new Date()): Date | null {
  if (choice === "never") return null;
  return new Date(now.getTime() + Number(choice) * 24 * 60 * 60 * 1000);
}

export type ShareLinkState = "active" | "revoked" | "expired";

export function shareLinkState(link: { revokedAt: Date | null; expiresAt: Date | null }, now = new Date()): ShareLinkState {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

/** The workspace setting: the lowest role that can create links. */
export type ShareRole = "admin" | "member";

export function canCreateShareLinks(role: Role, setting: ShareRole): boolean {
  return roleAtLeast(role, setting);
}

/** Admins and owners revoke any link; members only the links they created. */
export function canRevokeShareLink(viewer: { userId: string; role: Role }, link: { createdByUserId: string | null }): boolean {
  return roleAtLeast(viewer.role, "admin") || link.createdByUserId === viewer.userId;
}

/** Versions a link to the latest version can show. Drafts and failed versions are never shared. */
const SHAREABLE: GuideStatus[] = ["ready", "generating"];

type LinkScope = { workspaceId: string; repositoryId: string; prNumber: number; guideId: string | null };
type GuideScope = { id: string; workspaceId: string; repositoryId: string; prNumber: number; status: GuideStatus };

/**
 * Whether a link gives access to a guide version: the version it was created for, or, for a link to
 * the latest version, any published version of the same pull request (including one being written).
 */
export function sharesGuide(link: LinkScope, guide: GuideScope): boolean {
  if (guide.workspaceId !== link.workspaceId || guide.repositoryId !== link.repositoryId || guide.prNumber !== link.prNumber) return false;
  if (link.guideId !== null) return guide.id === link.guideId && guide.status === "ready";
  return SHAREABLE.includes(guide.status);
}

/**
 * The version a share page opens: the requested one when the link shares it, otherwise the newest
 * ready version, or the newest one being written when none is ready yet.
 */
export function pickSharedVersion<T extends { version: number; status: GuideStatus }>(shared: T[], requested: number | null): T | null {
  const byNewest = [...shared].sort((a, b) => b.version - a.version);
  return (
    (requested !== null ? byNewest.find((v) => v.version === requested) : undefined) ??
    byNewest.find((v) => v.status === "ready") ??
    byNewest[0] ??
    null
  );
}

/** Whether guide text links to an upload (`/api/assets/<id>/…`). A share link only serves uploads its guide shows. */
export function referencesAsset(texts: string[], assetId: string): boolean {
  const needle = `/api/assets/${assetId}/`;
  return texts.some((t) => t.includes(needle));
}
