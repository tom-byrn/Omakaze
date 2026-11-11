/**
 * The mobile app's API (src/app/api/mobile). The app signs in through the instance's OAuth server,
 * so every request carries an access token bound to one workspace, like the REST API.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces, type Role } from "@/db/schema";
import { apiPrincipal } from "@/lib/api-v1";
import { findWorkspaceRepo } from "@/lib/github/connections";
import { HttpError } from "@/lib/http";
import { getMembership, roleAtLeast } from "@/lib/workspaces";

export async function mobileContext(req: Request, minRole: Role = "member") {
  const p = await apiPrincipal(req);
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, p.workspaceId)).limit(1);
  const role = workspace ? await getMembership(workspace.id, p.user.id) : null;
  if (!workspace || !role) throw new HttpError(401, "This token's workspace is no longer available");
  if (!roleAtLeast(role, minRole)) throw new HttpError(403, `Only ${minRole}s can do this`);
  return { principal: p, user: p.user, workspace, role };
}

export type MobileContext = Awaited<ReturnType<typeof mobileContext>>;

/** A followed repository from an `owner/name` query parameter. */
export async function repoParam(ctx: MobileContext, value: string | null) {
  const [owner, name] = (value ?? "").trim().split("/");
  const repo = owner && name ? await findWorkspaceRepo(ctx.workspace.id, owner, name) : null;
  if (!repo) throw new HttpError(404, `${value ?? "The repository"} is not followed by this workspace`);
  return repo;
}

export const NO_STORE = { "Cache-Control": "private, no-store" };
