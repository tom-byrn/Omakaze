import { and, eq, gt, isNull, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { apiTokens, guides, repositories, users, workspaces, type Role } from "@/db/schema";
import { SESSION_COOKIE, userFromSessionToken, type SessionUser } from "@/lib/auth/session";
import { sha256 } from "@/lib/crypto";
import { HttpError } from "@/lib/http";
import { getMembership } from "@/lib/workspaces";

export type ApiPrincipal = {
  user: SessionUser;
  /** Set when authenticated with an API/OAuth token (token is bound to one workspace). */
  tokenWorkspaceId: string | null;
  tokenId: string | null;
  via: "session" | "token";
};

const lastUsedWrites = new Map<string, number>();

/** Authenticate an API token (`Authorization: Bearer omk_…` or an OAuth access token). */
export async function principalFromToken(raw: string): Promise<ApiPrincipal | null> {
  const [row] = await db
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(
      and(
        eq(apiTokens.tokenHash, sha256(raw)),
        isNull(apiTokens.revokedAt),
        or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, new Date())),
      ),
    )
    .limit(1);
  if (!row) return null;
  // Tokens stop working when the user leaves the workspace.
  if (!(await getMembership(row.token.workspaceId, row.user.id))) return null;
  const last = lastUsedWrites.get(row.token.id) ?? 0;
  if (Date.now() - last > 60_000) {
    lastUsedWrites.set(row.token.id, Date.now());
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.token.id));
  }
  return { user: row.user, tokenWorkspaceId: row.token.workspaceId, tokenId: row.token.id, via: "token" };
}

/** Session cookie or bearer token. */
export async function getPrincipal(req: Request): Promise<ApiPrincipal | null> {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return principalFromToken(auth.slice(7).trim());
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await userFromSessionToken(token);
  return user ? { user, tokenWorkspaceId: null, tokenId: null, via: "session" } : null;
}

export async function requirePrincipal(req: Request): Promise<ApiPrincipal> {
  const p = await getPrincipal(req);
  if (!p) throw new HttpError(401, "Authentication required");
  return p;
}

export type GuideAccess = {
  principal: ApiPrincipal;
  guide: typeof guides.$inferSelect;
  repo: typeof repositories.$inferSelect;
  workspace: typeof workspaces.$inferSelect;
  role: Role;
};

export async function requireGuideAccess(req: Request, guideId: string): Promise<GuideAccess> {
  const principal = await requirePrincipal(req);
  const [row] = await db
    .select({ guide: guides, repo: repositories, workspace: workspaces })
    .from(guides)
    .innerJoin(repositories, eq(repositories.id, guides.repositoryId))
    .innerJoin(workspaces, eq(workspaces.id, guides.workspaceId))
    .where(eq(guides.id, guideId))
    .limit(1);
  if (!row) throw new HttpError(404, "Guide not found");
  if (principal.tokenWorkspaceId && principal.tokenWorkspaceId !== row.workspace.id) throw new HttpError(404, "Guide not found");
  const role = await getMembership(row.workspace.id, principal.user.id);
  if (!role) throw new HttpError(404, "Guide not found");
  return { principal, ...row, role };
}
