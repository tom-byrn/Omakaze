/**
 * GitHub people on cached pull requests (requested reviewers, requested teams, assignees) and the
 * mapping from GitHub logins to workspace members through their linked GitHub account.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { githubAccounts, memberships, pullRequests, users, type GhPersonRef, type Role } from "@/db/schema";
import type { GhPull } from "./client";

export type { GhPersonRef };

type GhUserLike = { login: string; avatar_url?: string | null };
type GhTeamLike = { name: string; slug?: string };

/** GitHub logins are case-insensitive. */
export function loginKey(login: string): string {
  return login.trim().toLowerCase();
}

export function sameLogin(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b) && loginKey(a!) === loginKey(b!);
}

/** Whether `login` is in a list of logins or cached people. */
export function includesLogin(list: readonly (string | GhPersonRef)[], login: string | null | undefined): boolean {
  if (!login) return false;
  return list.some((p) => sameLogin(typeof p === "string" ? p : p.login, login));
}

function personRef(u: GhUserLike): GhPersonRef {
  return { login: u.login, avatarUrl: u.avatar_url ?? null };
}

function withPerson(list: GhUserLike[], add: GhUserLike): GhUserLike[] {
  return list.some((p) => sameLogin(p.login, add.login)) ? list : [...list, add];
}

function withoutPerson(list: GhUserLike[], remove: GhUserLike): GhUserLike[] {
  return list.filter((p) => !sameLogin(p.login, remove.login));
}

/**
 * Columns for the people on a pull request. A payload without a list leaves that column alone,
 * so partial objects never clear what was cached.
 */
export function pullPeopleValues(p: GhPull): Partial<Pick<typeof pullRequests.$inferInsert, "requestedReviewers" | "requestedTeams" | "assignees">> {
  return {
    ...(Array.isArray(p.requested_reviewers) ? { requestedReviewers: p.requested_reviewers.map(personRef) } : {}),
    ...(Array.isArray(p.requested_teams) ? { requestedTeams: p.requested_teams.map((t) => t.name) } : {}),
    ...(Array.isArray(p.assignees) ? { assignees: p.assignees.map(personRef) } : {}),
  };
}

export type PeopleEvent = {
  action?: string;
  requested_reviewer?: GhUserLike;
  requested_team?: GhTeamLike;
  assignee?: GhUserLike;
};

/**
 * Apply the change a `pull_request` webhook describes (review_requested, review_request_removed,
 * assigned, unassigned) to its pull request, so the change sticks even when deliveries for several
 * reviewers arrive out of order.
 */
export function applyPeopleEvent(pr: GhPull, event: PeopleEvent): GhPull {
  const reviewers = pr.requested_reviewers ?? [];
  const teams = pr.requested_teams ?? [];
  const assignees = pr.assignees ?? [];
  switch (event.action) {
    case "review_requested":
      return {
        ...pr,
        requested_reviewers: event.requested_reviewer ? withPerson(reviewers, event.requested_reviewer) : pr.requested_reviewers,
        requested_teams:
          event.requested_team && !teams.some((t) => t.name === event.requested_team!.name) ? [...teams, event.requested_team] : pr.requested_teams,
      };
    case "review_request_removed":
      return {
        ...pr,
        requested_reviewers: event.requested_reviewer ? withoutPerson(reviewers, event.requested_reviewer) : pr.requested_reviewers,
        requested_teams: event.requested_team ? teams.filter((t) => t.name !== event.requested_team!.name) : pr.requested_teams,
      };
    case "assigned":
      return event.assignee ? { ...pr, assignees: withPerson(assignees, event.assignee) } : pr;
    case "unassigned":
      return event.assignee ? { ...pr, assignees: withoutPerson(assignees, event.assignee) } : pr;
    default:
      return pr;
  }
}

/* ------------------------------------------------------------------ */
/* Workspace members by GitHub login                                   */
/* ------------------------------------------------------------------ */

export type GitHubMember = { userId: string; name: string; avatarUrl: string | null; role: Role; login: string };

/** The login of a user's linked GitHub account, or null when none is linked. */
export async function githubLoginOf(userId: string): Promise<string | null> {
  const [row] = await db.select({ login: githubAccounts.login }).from(githubAccounts).where(eq(githubAccounts.userId, userId)).limit(1);
  return row?.login ?? null;
}

/** Members of a workspace with a linked GitHub account, keyed by `loginKey(login)`. */
export async function workspaceMembersByLogin(workspaceId: string): Promise<Map<string, GitHubMember>> {
  const rows = await db
    .select({ userId: users.id, name: users.name, avatarUrl: users.avatarUrl, role: memberships.role, login: githubAccounts.login })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(githubAccounts, eq(githubAccounts.userId, users.id))
    .where(eq(memberships.workspaceId, workspaceId));
  return new Map(rows.map((r) => [loginKey(r.login), r]));
}

/** The members among a list of GitHub people (for example a pull request's requested reviewers). */
export function membersAmong(people: readonly (string | GhPersonRef)[], members: Map<string, GitHubMember>): GitHubMember[] {
  const out: GitHubMember[] = [];
  for (const p of people) {
    const m = members.get(loginKey(typeof p === "string" ? p : p.login));
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

/**
 * Drop a reviewer from a cached pull request's pending requests. GitHub does the same when the
 * reviewer submits a review; this keeps the dashboard current until the next sync.
 */
export async function clearReviewRequest(repositoryId: string, prNumber: number, login: string): Promise<void> {
  const [row] = await db
    .select({ requestedReviewers: pullRequests.requestedReviewers })
    .from(pullRequests)
    .where(and(eq(pullRequests.repositoryId, repositoryId), eq(pullRequests.number, prNumber)))
    .limit(1);
  if (!row || !includesLogin(row.requestedReviewers, login)) return;
  await db
    .update(pullRequests)
    .set({ requestedReviewers: row.requestedReviewers.filter((p) => !sameLogin(p.login, login)) })
    .where(and(eq(pullRequests.repositoryId, repositoryId), eq(pullRequests.number, prNumber)));
}
