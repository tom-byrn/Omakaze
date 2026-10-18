import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { githubConnections, repositories } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { getUserGitHubToken } from "@/lib/auth/users";
import { getInstallationToken } from "./app";
import { gh, ghPaginate, GitHubError, type GhRepo } from "./client";

export type Connection = typeof githubConnections.$inferSelect;
export type Repository = typeof repositories.$inferSelect;

export class ConnectionError extends Error {}

/** Token for API calls made on behalf of a workspace connection. */
export async function getConnectionToken(conn: Connection): Promise<string> {
  if (conn.suspendedAt) throw new ConnectionError(`The GitHub connection for ${conn.accountLogin} is suspended.`);
  switch (conn.type) {
    case "app":
      if (!conn.installationId) throw new ConnectionError("Installation id missing");
      return getInstallationToken(conn.installationId);
    case "token":
      if (!conn.tokenEnc) throw new ConnectionError("Token missing");
      return decrypt(conn.tokenEnc);
    case "user": {
      if (!conn.userId) throw new ConnectionError("Connection user missing");
      const token = await getUserGitHubToken(conn.userId);
      if (!token) {
        throw new ConnectionError(
          `The GitHub account behind the ${conn.accountLogin} connection needs to sign in again.`,
        );
      }
      return token;
    }
  }
}

export async function getConnection(id: string): Promise<Connection | null> {
  const [c] = await db.select().from(githubConnections).where(eq(githubConnections.id, id)).limit(1);
  return c ?? null;
}

export async function listConnections(workspaceId: string): Promise<Connection[]> {
  return db.select().from(githubConnections).where(eq(githubConnections.workspaceId, workspaceId));
}

export type RepoContext = { repo: Repository; connection: Connection; token: string };

export async function getRepoContext(repoId: string): Promise<RepoContext> {
  const [row] = await db
    .select({ repo: repositories, connection: githubConnections })
    .from(repositories)
    .innerJoin(githubConnections, eq(githubConnections.id, repositories.connectionId))
    .where(eq(repositories.id, repoId))
    .limit(1);
  if (!row) throw new ConnectionError("Repository not found");
  return { ...row, token: await getConnectionToken(row.connection) };
}

export async function findWorkspaceRepo(workspaceId: string, owner: string, name: string): Promise<Repository | null> {
  const all = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.workspaceId, workspaceId), eq(repositories.owner, owner)));
  return all.find((r) => r.name.toLowerCase() === name.toLowerCase()) ?? null;
}

/** Repositories a connection can see on GitHub. Token connections may not be allowed to list. */
export async function listConnectionRepos(conn: Connection): Promise<{ repos: GhRepo[]; error: string | null }> {
  try {
    const token = await getConnectionToken(conn);
    if (conn.type === "app") {
      const repos = await ghPaginate<GhRepo, { repositories: GhRepo[] }>(token, "/installation/repositories", {
        maxItems: 500,
        pick: (p) => p.repositories,
      });
      return { repos, error: null };
    }
    const repos = await ghPaginate<GhRepo>(token, "/user/repos", {
      query: { sort: "pushed", affiliation: "owner,collaborator,organization_member" },
      maxItems: 300,
    });
    return { repos, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { repos: [], error: message };
  }
}

export async function lookupRepo(conn: Connection, fullName: string): Promise<GhRepo> {
  const token = await getConnectionToken(conn);
  const [owner, name] = fullName.trim().replace(/^https?:\/\/[^/]+\//, "").split("/");
  if (!owner || !name) throw new ConnectionError("Use the owner/name format, e.g. acme/web.");
  try {
    return await gh<GhRepo>(token, `/repos/${owner}/${name.replace(/\.git$/, "")}`, { noCache: true });
  } catch (err) {
    if (err instanceof GitHubError && (err.status === 404 || err.status === 403)) {
      throw new ConnectionError(`${owner}/${name} was not found or this connection cannot access it.`);
    }
    throw err;
  }
}

export async function addRepository(workspaceId: string, conn: Connection, ghRepo: GhRepo): Promise<Repository> {
  const values = {
    workspaceId,
    connectionId: conn.id,
    githubId: ghRepo.id,
    owner: ghRepo.owner.login,
    name: ghRepo.name,
    fullName: ghRepo.full_name,
    private: ghRepo.private,
    defaultBranch: ghRepo.default_branch,
    description: ghRepo.description,
    htmlUrl: ghRepo.html_url,
  };
  const [repo] = await db
    .insert(repositories)
    .values(values)
    .onConflictDoUpdate({
      target: [repositories.workspaceId, repositories.githubId],
      set: {
        connectionId: conn.id,
        owner: values.owner,
        name: values.name,
        fullName: values.fullName,
        private: values.private,
        defaultBranch: values.defaultBranch,
        description: values.description,
        htmlUrl: values.htmlUrl,
      },
    })
    .returning();
  return repo;
}
