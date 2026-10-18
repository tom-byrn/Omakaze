import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { addRepository, findWorkspaceRepo, getRepoContext, listConnections, lookupRepo } from "@/lib/github/connections";
import { parsePullUrl } from "@/lib/github/pulls";
import { requirePrincipal, type ApiPrincipal } from "@/lib/guides/access";
import { HttpError } from "@/lib/http";
import { getMembership, roleAtLeast } from "@/lib/workspaces";

/** REST API calls must use an API token (bound to one workspace). */
export async function apiPrincipal(req: Request): Promise<ApiPrincipal & { workspaceId: string }> {
  const p = await requirePrincipal(req);
  if (!p.tokenWorkspaceId) throw new HttpError(401, "Use an API token: Authorization: Bearer <token>");
  return { ...p, workspaceId: p.tokenWorkspaceId };
}

export async function workspaceOf(id: string) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  if (!ws) throw new HttpError(404, "Workspace not found");
  return ws;
}

/** Resolve a PR URL to a repository context in the token's workspace (adding the repository for admins). */
export async function resolvePullForApi(p: ApiPrincipal & { workspaceId: string }, pr: string) {
  const parsed = parsePullUrl(pr);
  if (!parsed) throw new HttpError(400, "pr must be a pull request URL or owner/repo#number");
  let repo = await findWorkspaceRepo(p.workspaceId, parsed.owner, parsed.repo);
  if (!repo || !repo.connectionId) {
    const role = await getMembership(p.workspaceId, p.user.id);
    const admin = role !== null && roleAtLeast(role, "admin");
    if (!repo && !admin) throw new HttpError(404, `${parsed.owner}/${parsed.repo} is not in this workspace`);
    if (admin) {
      for (const conn of await listConnections(p.workspaceId)) {
        try {
          repo = await addRepository(p.workspaceId, conn, await lookupRepo(conn, `${parsed.owner}/${parsed.repo}`));
          break;
        } catch {
          // next connection
        }
      }
      if (!repo) throw new HttpError(404, `No GitHub connection can access ${parsed.owner}/${parsed.repo}`);
    }
  }
  return { ctx: await getRepoContext(repo!.id), number: parsed.number };
}
