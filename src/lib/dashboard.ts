import { and, asc, count, desc, eq, ilike, inArray, or, sql, type AnyColumn } from "drizzle-orm";
import { db } from "@/db";
import { guides, guideSections, pullRequests, repositories, sectionReviews } from "@/db/schema";
import { includesLogin, sameLogin } from "@/lib/github/people";

export type StateFilter = "open" | "closed" | "merged" | "all";

/** Who the list is for: "needs-review", "mine" (authored), "assigned" or "all". */
export type PullFilter = "needs-review" | "mine" | "assigned" | "all";

export const STATE_FILTERS: StateFilter[] = ["open", "merged", "closed", "all"];
export const PULL_FILTERS: PullFilter[] = ["needs-review", "mine", "assigned", "all"];

export function parseStateFilter(v: unknown): StateFilter {
  return v === "closed" || v === "merged" || v === "all" ? v : "open";
}

export function isPullFilter(v: unknown): v is PullFilter {
  return typeof v === "string" && (PULL_FILTERS as string[]).includes(v);
}

export function parsePullFilter(v: unknown): PullFilter {
  return isPullFilter(v) ? v : "all";
}

/** Link to a pull request list (dashboard or repository page), leaving out default values. */
export function pullListHref(base: string, opts: { state?: StateFilter; filter?: PullFilter; q?: string }): string {
  const params = new URLSearchParams();
  if (opts.filter && opts.filter !== "all") params.set("filter", opts.filter);
  if (opts.state && opts.state !== "open") params.set("state", opts.state);
  if (opts.q) params.set("q", opts.q);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/* ------------------------------------------------------------------ */
/* Filtering                                                           */
/* ------------------------------------------------------------------ */

/** A member's review marks on the latest published guide of a pull request. */
export type ReviewProgress = { guideId: string; version: number; sections: number; reviewed: number };

/** What the filters need to know about one pull request. */
export type PullFacts = {
  state: "open" | "closed";
  merged: boolean;
  authorLogin: string | null;
  reviewerLogins: string[];
  assigneeLogins: string[];
  /** The viewer's progress on the latest published guide, or null without one. */
  progress: Pick<ReviewProgress, "sections" | "reviewed"> | null;
};

export function matchesState(p: Pick<PullFacts, "state" | "merged">, state: StateFilter): boolean {
  switch (state) {
    case "open":
      return p.state === "open";
    case "closed":
      return p.state === "closed" && !p.merged;
    case "merged":
      return p.merged;
    default:
      return true;
  }
}

/**
 * How the viewer is involved in a pull request. `login` is the viewer's linked GitHub login; without
 * one, only the guide progress can be matched.
 */
export function involvement(p: PullFacts, login: string | null) {
  const mine = sameLogin(p.authorLogin, login);
  const requested = includesLogin(p.reviewerLogins, login);
  const assigned = includesLogin(p.assigneeLogins, login);
  const unreviewed = p.progress !== null && p.progress.reviewed < p.progress.sections;
  // Only open pull requests wait for a review, and authors don't review their own guide. A pending
  // request counts even when every section is marked: the review on GitHub is still missing.
  const needsReview = p.state === "open" && (requested || (unreviewed && !mine));
  return { mine, requested, assigned, unreviewed, needsReview };
}

export function matchesFilter(p: PullFacts, filter: PullFilter, login: string | null): boolean {
  if (filter === "all") return true;
  const i = involvement(p, login);
  if (filter === "needs-review") return i.needsReview;
  return filter === "mine" ? i.mine : i.assigned;
}

/** Counts for both rows of tabs: every state within the current filter, and every filter within the current state. */
export function countPulls(pulls: PullFacts[], opts: { state: StateFilter; filter: PullFilter; login: string | null }) {
  const states: Record<StateFilter, number> = { open: 0, merged: 0, closed: 0, all: 0 };
  const filters: Record<PullFilter, number> = { "needs-review": 0, mine: 0, assigned: 0, all: 0 };
  for (const p of pulls) {
    if (matchesFilter(p, opts.filter, opts.login)) {
      for (const s of STATE_FILTERS) if (matchesState(p, s)) states[s]++;
    }
    if (matchesState(p, opts.state)) {
      for (const f of PULL_FILTERS) if (matchesFilter(p, f, opts.login)) filters[f]++;
    }
  }
  return { states, filters };
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

export type LatestGuide = {
  id: string;
  repositoryId: string;
  prNumber: number;
  version: number;
  status: "draft" | "generating" | "ready" | "failed";
  headSha: string;
};

export async function latestGuidesFor(workspaceId: string, repositoryIds?: string[]): Promise<Map<string, LatestGuide>> {
  const rows = await db
    .selectDistinctOn([guides.repositoryId, guides.prNumber], {
      id: guides.id,
      repositoryId: guides.repositoryId,
      prNumber: guides.prNumber,
      version: guides.version,
      status: guides.status,
      headSha: guides.headSha,
    })
    .from(guides)
    .where(
      and(
        eq(guides.workspaceId, workspaceId),
        repositoryIds && repositoryIds.length > 0 ? inArray(guides.repositoryId, repositoryIds) : undefined,
      ),
    )
    .orderBy(guides.repositoryId, guides.prNumber, desc(guides.version));
  return new Map(rows.map((r) => [`${r.repositoryId}:${r.prNumber}`, r]));
}

/** A user's review marks on the latest published guide of each pull request, keyed by `repositoryId:number`. */
export async function reviewProgressFor(workspaceId: string, userId: string, repositoryIds?: string[]): Promise<Map<string, ReviewProgress>> {
  const latest = db
    .selectDistinctOn([guides.repositoryId, guides.prNumber], {
      id: guides.id,
      repositoryId: guides.repositoryId,
      prNumber: guides.prNumber,
      version: guides.version,
    })
    .from(guides)
    .where(
      and(
        eq(guides.workspaceId, workspaceId),
        eq(guides.status, "ready"),
        repositoryIds && repositoryIds.length > 0 ? inArray(guides.repositoryId, repositoryIds) : undefined,
      ),
    )
    .orderBy(guides.repositoryId, guides.prNumber, desc(guides.version))
    .as("latest");
  const rows = await db
    .select({
      guideId: latest.id,
      repositoryId: latest.repositoryId,
      prNumber: latest.prNumber,
      version: latest.version,
      sections: count(guideSections.id),
      reviewed: count(sectionReviews.sectionId),
    })
    .from(latest)
    .innerJoin(guideSections, eq(guideSections.guideId, latest.id))
    .leftJoin(sectionReviews, and(eq(sectionReviews.sectionId, guideSections.id), eq(sectionReviews.userId, userId)))
    .groupBy(latest.id, latest.repositoryId, latest.prNumber, latest.version);
  return new Map(rows.map(({ repositoryId, prNumber, ...r }) => [`${repositoryId}:${prNumber}`, r]));
}

/** The logins in a cached list of people, without their avatars. */
const loginsOf = (column: AnyColumn) =>
  sql<string[]>`jsonb_path_query_array(${column}, '$[*].login')`.mapWith((v: unknown) => (typeof v === "string" ? JSON.parse(v) : v) as string[]);

const LIST_LIMIT = 500;

/**
 * Pull requests of a workspace (or one repository) for a state, a filter and a search, with the
 * counts for the state and filter tabs. Filters other than "all" need the `viewer`: their user ID
 * for guide progress and their linked GitHub login (or null) for requests, authorship and assignees.
 */
export async function loadDashboard(
  workspaceId: string,
  opts: { state: StateFilter; filter?: PullFilter; q?: string; repositoryId?: string; viewer?: { userId: string; login: string | null } },
) {
  const filter = opts.filter ?? "all";
  const login = opts.viewer?.login ?? null;
  const repos = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.workspaceId, workspaceId), opts.repositoryId ? eq(repositories.id, opts.repositoryId) : undefined))
    .orderBy(asc(repositories.fullName));
  const repoIds = repos.map((r) => r.id);
  if (repoIds.length === 0) {
    return {
      repos,
      pulls: [],
      counts: { open: 0, closed: 0, merged: 0, all: 0 },
      filterCounts: { "needs-review": 0, mine: 0, assigned: 0, all: 0 },
      guides: new Map<string, LatestGuide>(),
      progress: new Map<string, ReviewProgress>(),
      viewerLogin: login,
    };
  }
  const q = opts.q?.trim();
  const search = q
    ? or(
        ilike(pullRequests.title, `%${q}%`),
        ilike(pullRequests.authorLogin, `%${q}%`),
        ilike(pullRequests.headRef, `%${q}%`),
        /^\d+$/.test(q.replace(/^#/, "")) ? eq(pullRequests.number, Number(q.replace(/^#/, ""))) : undefined,
      )
    : undefined;
  // Classify every matching pull request on small rows, then load the full rows of the ones shown.
  const [facts, progress, latest] = await Promise.all([
    db
      .select({
        id: pullRequests.id,
        repositoryId: pullRequests.repositoryId,
        number: pullRequests.number,
        state: pullRequests.state,
        merged: pullRequests.merged,
        authorLogin: pullRequests.authorLogin,
        reviewerLogins: loginsOf(pullRequests.requestedReviewers),
        assigneeLogins: loginsOf(pullRequests.assignees),
      })
      .from(pullRequests)
      .where(and(inArray(pullRequests.repositoryId, repoIds), search))
      .orderBy(desc(pullRequests.githubUpdatedAt)),
    opts.viewer ? reviewProgressFor(workspaceId, opts.viewer.userId, repoIds) : new Map<string, ReviewProgress>(),
    latestGuidesFor(workspaceId, repoIds),
  ]);
  const classified = facts.map((f) => ({ ...f, progress: progress.get(`${f.repositoryId}:${f.number}`) ?? null }));
  const { states, filters } = countPulls(classified, { state: opts.state, filter, login });
  const ids = classified
    .filter((p) => matchesState(p, opts.state) && matchesFilter(p, filter, login))
    .slice(0, LIST_LIMIT)
    .map((p) => p.id);
  const pulls =
    ids.length > 0
      ? await db.select().from(pullRequests).where(inArray(pullRequests.id, ids)).orderBy(desc(pullRequests.githubUpdatedAt))
      : [];
  return { repos, pulls, counts: states, filterCounts: filters, guides: latest, progress, viewerLogin: login };
}

export function isStale(repos: { lastSyncedAt: Date | null }[], ms = 60_000): boolean {
  return repos.some((r) => !r.lastSyncedAt || Date.now() - r.lastSyncedAt.getTime() > ms);
}
