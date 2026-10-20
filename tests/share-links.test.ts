import { describe, expect, it } from "vitest";
import { sha256 } from "@/lib/crypto";
import { rateLimit } from "@/lib/http";
import {
  canCreateShareLinks,
  canRevokeShareLink,
  newShareToken,
  parseShareToken,
  pickSharedVersion,
  referencesAsset,
  shareExpiresAt,
  shareLinkState,
  shareSecretMatches,
  sharesGuide,
} from "@/lib/share/policy";
import { shareAssetUrl, withShareToken } from "@/lib/share/url";

const link = { workspaceId: "ws1", repositoryId: "repo1", prNumber: 128, guideId: null as string | null };
const guide = (over: Partial<{ id: string; workspaceId: string; repositoryId: string; prNumber: number; status: "draft" | "generating" | "ready" | "failed" }> = {}) => ({
  id: "g2",
  workspaceId: "ws1",
  repositoryId: "repo1",
  prNumber: 128,
  status: "ready" as const,
  ...over,
});

describe("share tokens", () => {
  it("start with the link id and store only the secret's hash", () => {
    const { id, token, secretHash } = newShareToken();
    expect(token).toHaveLength(59);
    expect(token.startsWith(id)).toBe(true);
    const parsed = parseShareToken(token)!;
    expect(parsed.id).toBe(id);
    expect(secretHash).toBe(sha256(parsed.secret));
    expect(secretHash).not.toContain(parsed.secret);
    expect(shareSecretMatches(parsed.secret, secretHash)).toBe(true);
  });

  it("are unguessable: every token is different", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newShareToken().token));
    expect(tokens.size).toBe(200);
  });

  it("reject other secrets, including ones of a different length", () => {
    const { token, secretHash } = newShareToken();
    const { secret } = parseShareToken(token)!;
    const flipped = `${secret.slice(0, -1)}${secret.endsWith("A") ? "B" : "A"}`;
    expect(shareSecretMatches(flipped, secretHash)).toBe(false);
    expect(shareSecretMatches("", secretHash)).toBe(false);
    expect(shareSecretMatches(secret, secretHash.slice(1))).toBe(false);
  });

  it("parse only well-formed tokens", () => {
    const { token } = newShareToken();
    expect(parseShareToken(null)).toBeNull();
    expect(parseShareToken("")).toBeNull();
    expect(parseShareToken(token.slice(1))).toBeNull();
    expect(parseShareToken(`${token}x`)).toBeNull();
    expect(parseShareToken(`${token.slice(0, -1)}/`)).toBeNull();
    expect(parseShareToken(`${token.slice(0, -1)}=`)).toBeNull();
  });
});

describe("expiry and state", () => {
  const now = new Date("2026-10-19T12:00:00Z");

  it("computes the expiry from the choice", () => {
    expect(shareExpiresAt("1", now)?.toISOString()).toBe("2026-10-20T12:00:00.000Z");
    expect(shareExpiresAt("7", now)?.toISOString()).toBe("2026-10-26T12:00:00.000Z");
    expect(shareExpiresAt("30", now)?.toISOString()).toBe("2026-11-18T12:00:00.000Z");
    expect(shareExpiresAt("never", now)).toBeNull();
  });

  it("is revoked before expired, and expired from the expiry time on", () => {
    expect(shareLinkState({ revokedAt: null, expiresAt: null }, now)).toBe("active");
    expect(shareLinkState({ revokedAt: null, expiresAt: new Date(now.getTime() + 1000) }, now)).toBe("active");
    expect(shareLinkState({ revokedAt: null, expiresAt: now }, now)).toBe("expired");
    expect(shareLinkState({ revokedAt: now, expiresAt: new Date(now.getTime() - 1000) }, now)).toBe("revoked");
  });
});

describe("who can create and revoke links", () => {
  it("follows the workspace setting", () => {
    expect(canCreateShareLinks("member", "admin")).toBe(false);
    expect(canCreateShareLinks("admin", "admin")).toBe(true);
    expect(canCreateShareLinks("owner", "admin")).toBe(true);
    expect(canCreateShareLinks("member", "member")).toBe(true);
  });

  it("lets members revoke only their own links", () => {
    expect(canRevokeShareLink({ userId: "sam", role: "member" }, { createdByUserId: "sam" })).toBe(true);
    expect(canRevokeShareLink({ userId: "sam", role: "member" }, { createdByUserId: "maya" })).toBe(false);
    expect(canRevokeShareLink({ userId: "sam", role: "member" }, { createdByUserId: null })).toBe(false);
    expect(canRevokeShareLink({ userId: "maya", role: "admin" }, { createdByUserId: "alex" })).toBe(true);
    expect(canRevokeShareLink({ userId: "alex", role: "owner" }, { createdByUserId: null })).toBe(true);
  });
});

describe("what a link gives access to", () => {
  it("a version link: that version only, while it is published", () => {
    const fixed = { ...link, guideId: "g2" };
    expect(sharesGuide(fixed, guide())).toBe(true);
    expect(sharesGuide(fixed, guide({ id: "g1" }))).toBe(false);
    expect(sharesGuide(fixed, guide({ status: "draft" }))).toBe(false);
  });

  it("a latest link: published versions of the same pull request, never drafts or failed ones", () => {
    expect(sharesGuide(link, guide({ id: "g1" }))).toBe(true);
    expect(sharesGuide(link, guide({ status: "generating" }))).toBe(true);
    expect(sharesGuide(link, guide({ status: "draft" }))).toBe(false);
    expect(sharesGuide(link, guide({ status: "failed" }))).toBe(false);
  });

  it("nothing in another pull request, repository or workspace", () => {
    expect(sharesGuide(link, guide({ prNumber: 129 }))).toBe(false);
    expect(sharesGuide(link, guide({ repositoryId: "repo2" }))).toBe(false);
    expect(sharesGuide(link, guide({ workspaceId: "ws2" }))).toBe(false);
    expect(sharesGuide({ ...link, guideId: "g2" }, guide({ workspaceId: "ws2" }))).toBe(false);
  });

  it("opens the requested version, else the newest ready one, else one being written", () => {
    const v = (version: number, status: "generating" | "ready") => ({ version, status });
    expect(pickSharedVersion([v(1, "ready"), v(2, "ready")], null)?.version).toBe(2);
    expect(pickSharedVersion([v(1, "ready"), v(2, "ready")], 1)?.version).toBe(1);
    expect(pickSharedVersion([v(1, "ready"), v(2, "ready")], 5)?.version).toBe(2);
    expect(pickSharedVersion([v(3, "generating"), v(2, "ready")], null)?.version).toBe(2);
    expect(pickSharedVersion([v(3, "generating"), v(2, "ready")], 3)?.version).toBe(3);
    expect(pickSharedVersion([v(1, "generating")], null)?.version).toBe(1);
    expect(pickSharedVersion([], null)).toBeNull();
  });

  it("serves an upload only when the guide's text links to it", () => {
    const texts = ["Before and after:\n\n![](http://localhost:3000/api/assets/abc_-123/shot.png)", "No media here."];
    expect(referencesAsset(texts, "abc_-123")).toBe(true);
    expect(referencesAsset(texts, "abc")).toBe(false);
    expect(referencesAsset(texts, "other")).toBe(false);
    expect(referencesAsset([], "abc_-123")).toBe(false);
  });
});

describe("share URLs", () => {
  it("adds the token as a query parameter", () => {
    expect(withShareToken("/api/guides/g1/status", "tok")).toBe("/api/guides/g1/status?share=tok");
    expect(withShareToken("/api/guides/g1/file?path=a.ts", "tok")).toBe("/api/guides/g1/file?path=a.ts&share=tok");
    expect(withShareToken("/api/guides/g1/comments", null)).toBe("/api/guides/g1/comments");
  });

  it("adds it to upload URLs of this instance only", () => {
    const app = "https://omakaze.example.com";
    expect(shareAssetUrl(`${app}/api/assets/a1/x.png`, "tok", app)).toBe(`${app}/api/assets/a1/x.png?share=tok`);
    expect(shareAssetUrl("/api/assets/a1/x.png", "tok", app)).toBe("/api/assets/a1/x.png?share=tok");
    expect(shareAssetUrl("https://example.org/api/assets/a1/x.png", "tok", app)).toBe("https://example.org/api/assets/a1/x.png");
    expect(shareAssetUrl(`${app}/w/demo`, "tok", app)).toBe(`${app}/w/demo`);
    expect(shareAssetUrl("diff:src/a.ts#1", "tok", app)).toBe("diff:src/a.ts#1");
  });
});

describe("rate limit checks", () => {
  it("can check a limit without counting", () => {
    const key = `test-peek:${Math.random()}`;
    expect(rateLimit(key, 2, 60_000, 0)).toBe(true);
    expect(rateLimit(key, 2, 60_000)).toBe(true);
    expect(rateLimit(key, 2, 60_000)).toBe(true);
    expect(rateLimit(key, 2, 60_000, 0)).toBe(true);
    expect(rateLimit(key, 2, 60_000)).toBe(false);
    expect(rateLimit(key, 2, 60_000, 0)).toBe(false);
  });
});
