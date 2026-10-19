/**
 * A read-only share link in the demo (src/lib/share): Maya shared the latest version of the merged
 * pull request #127 three days ago. The token is fixed so the demo can be opened at `/s/<token>`
 * and the tests can use it; only its hash is stored, as for links created in the app.
 *
 * Runs after the seed's transaction, through the app's own database client.
 */
import { createHash } from "node:crypto";
import { DEMO_PRS, DEMO_USERS } from "./index";

const ID = "demoShareLink127";
const SECRET = createHash("sha256").update("omakaze-demo-share-link-127").digest("base64url");

export const DEMO_SHARE = {
  /** Opens #127 at `/s/<token>` (a link to the latest version, without comments). */
  token: `${ID}${SECRET}`,
  id: ID,
  pr: DEMO_PRS.merged,
  createdBy: "admin" as const,
};

export async function seedShareLinks(workspaceSlug: string, now = new Date(Number(process.env.DEMO_NOW) || Date.now())): Promise<void> {
  const { eq, sql } = await import("drizzle-orm");
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const [row] = await db
    .select({ workspaceId: s.workspaces.id, repositoryId: s.repositories.id })
    .from(s.workspaces)
    .innerJoin(s.repositories, eq(s.repositories.workspaceId, s.workspaces.id))
    .where(eq(s.workspaces.slug, workspaceSlug))
    .limit(1);
  const [creator] = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(sql`lower(${s.users.email}) = ${DEMO_USERS[DEMO_SHARE.createdBy].email}`);
  if (!row || !creator) throw new Error("Seed the demo workspace before its share links");
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000);
  await db.delete(s.shareLinks).where(eq(s.shareLinks.id, ID));
  await db.insert(s.shareLinks).values({
    id: ID,
    workspaceId: row.workspaceId,
    repositoryId: row.repositoryId,
    prNumber: DEMO_SHARE.pr,
    guideId: null,
    secretHash: createHash("sha256").update(SECRET).digest("hex"),
    includeComments: false,
    createdByUserId: creator.id,
    expiresAt: null,
    lastUsedAt: ago(20),
    createdAt: ago(72),
  });
  await db.insert(s.activity).values({
    workspaceId: row.workspaceId,
    actorUserId: creator.id,
    type: "share.created",
    repositoryId: row.repositoryId,
    prNumber: DEMO_SHARE.pr,
    data: { version: null, comments: false, expiresAt: null },
    createdAt: ago(72),
  });
}
