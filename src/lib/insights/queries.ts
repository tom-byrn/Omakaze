/**
 * Review insights for a workspace: the aggregates behind each panel of /w/<slug>/insights and its CSV
 * files. Marks, comments and sections are counted in SQL; JavaScript only sees one row per guide
 * at most. The arithmetic is in model.ts.
 */
import { and, asc, count, eq, gte, inArray, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { activity, comments, guideSections, guides, memberships, pullRequests, repositories, sectionReviews, users, type Role } from "@/db/schema";
import { parseFiles } from "@/lib/diff/parse";
import { getSnapshot } from "@/lib/github/pulls";
import { computeCoverage } from "@/lib/guides/refs";
import { missingRequired, normalizeTitle, type ResolvedTemplate } from "@/lib/guides/templates";
import {
  bucketLabel,
  bucketStarts,
  COMPLETION_STATES,
  completionState,
  COVERAGE_BINS,
  coverageBin,
  coverageShare,
  createdUnit,
  emptyStats,
  fillBuckets,
  GUIDE_ORIGINS,
  guideOrigin,
  median,
  MEMBER_METRICS,
  rangeWindow,
  share,
  speedBuckets,
  speedUnit,
  visibleMembers,
  type BucketUnit,
  type CompletionState,
  type CoverageBin,
  type GuideOrigin,
  type GuideSpeed,
  type InsightRange,
  type MemberStats,
} from "./model";

export type InsightScope = {
  workspaceId: string;
  days: InsightRange;
  /** null = every repository of the workspace. */
  repositoryId: string | null;
  since: Date;
  until: Date;
};

export function insightScope(workspaceId: string, days: InsightRange, repositoryId: string | null, now = new Date()): InsightScope {
  return { workspaceId, days, repositoryId, ...rangeWindow(days, now) };
}

/** Repositories of the workspace, for the filter. */
export async function insightRepos(workspaceId: string) {
  return db
    .select({ id: repositories.id, fullName: repositories.fullName })
    .from(repositories)
    .where(eq(repositories.workspaceId, workspaceId))
    .orderBy(asc(repositories.fullName));
}

/** `date_trunc` in UTC as epoch seconds. `unit` is one of two literals, so it is inlined (and groups by the same text). */
function epochBucket(column: AnyPgColumn, unit: BucketUnit): SQL<number> {
  return sql<number>`extract(epoch from date_trunc(${sql.raw(`'${unit}'`)}, ${column}, 'UTC'))::float8`.mapWith(Number);
}

const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

function rows<T>(result: unknown): T[] {
  return result as T[];
}

/* ------------------------------------------------------------------ */
/* Guides created                                                      */
/* ------------------------------------------------------------------ */

export type GuidesCreated = {
  unit: BucketUnit;
  buckets: { start: Date; label: string; values: Record<GuideOrigin, number>; total: number }[];
  totals: Record<GuideOrigin, number>;
  total: number;
};

/** Guide versions created per day or week, by who wrote them. Failed generations are left out. */
export async function guidesCreated(scope: InsightScope): Promise<GuidesCreated> {
  const unit = createdUnit(scope.days);
  const bucket = epochBucket(guides.createdAt, unit);
  const grouped = await db
    .select({ bucket, source: guides.source, createdVia: guides.createdVia, aiSource: guides.aiSource, n: count() })
    .from(guides)
    .where(
      and(
        eq(guides.workspaceId, scope.workspaceId),
        gte(guides.createdAt, scope.since),
        ne(guides.status, "failed"),
        scope.repositoryId ? eq(guides.repositoryId, scope.repositoryId) : undefined,
      ),
    )
    .groupBy(bucket, guides.source, guides.createdVia, guides.aiSource);
  const filled = fillBuckets(
    bucketStarts(scope.since, scope.until, unit),
    GUIDE_ORIGINS,
    grouped.map((r) => ({ bucket: new Date(r.bucket * 1000), key: guideOrigin(r), n: r.n })),
  );
  const totals = Object.fromEntries(GUIDE_ORIGINS.map((o) => [o, 0])) as Record<GuideOrigin, number>;
  for (const b of filled) for (const o of GUIDE_ORIGINS) totals[o] += b.values[o];
  return {
    unit,
    buckets: filled.map((b) => ({ ...b, label: bucketLabel(b.start, unit), total: GUIDE_ORIGINS.reduce((n, o) => n + b.values[o], 0) })),
    totals,
    total: GUIDE_ORIGINS.reduce((n, o) => n + totals[o], 0),
  };
}

/* ------------------------------------------------------------------ */
/* Review speed                                                        */
/* ------------------------------------------------------------------ */

export type ReviewSpeed = {
  unit: BucketUnit;
  buckets: (ReturnType<typeof speedBuckets>[number] & { label: string })[];
  published: number;
  firstMedian: number | null;
  allMedian: number | null;
  reviewed: number;
  completed: number;
};

const repoFilter = (scope: InsightScope, column: SQL) => (scope.repositoryId ? sql`and ${column} = ${scope.repositoryId}` : sql``);

/**
 * Per guide published in the range: time from publishing to the first review mark and to the moment
 * every section had one. Marks carried over from an earlier version are left out: they were made
 * before this version was published, on the version the member actually read.
 */
export async function reviewSpeed(scope: InsightScope): Promise<ReviewSpeed> {
  const result = await db.execute(sql`
    select extract(epoch from g.published_at)::float8 as published,
      extract(epoch from min(s.first_mark) - g.published_at)::float8 as first_s,
      case when count(s.id) > 0 and count(s.id) = count(s.first_mark)
        then extract(epoch from max(s.first_mark) - g.published_at)::float8 end as all_s
    from ${guides} g
    left join lateral (
      select gs.id,
        (select min(sr.reviewed_at) from ${sectionReviews} sr where sr.section_id = gs.id and sr.carried_from_version is null) as first_mark
      from ${guideSections} gs where gs.guide_id = g.id
    ) s on true
    where g.workspace_id = ${scope.workspaceId} and g.status = 'ready' and g.published_at >= ${ts(scope.since)}
      ${repoFilter(scope, sql`g.repository_id`)}
    group by g.id, g.published_at
  `);
  const clamp = (s: number | null) => (s === null ? null : Math.max(0, Number(s)));
  const perGuide: GuideSpeed[] = rows<{ published: number; first_s: number | null; all_s: number | null }>(result).map((r) => ({
    publishedAt: new Date(Number(r.published) * 1000),
    firstSeconds: clamp(r.first_s),
    allSeconds: clamp(r.all_s),
  }));
  const unit = speedUnit(scope.days);
  return {
    unit,
    buckets: speedBuckets(bucketStarts(scope.since, scope.until, unit), unit, perGuide).map((b) => ({ ...b, label: bucketLabel(b.start, unit) })),
    published: perGuide.length,
    firstMedian: median(perGuide.map((g) => g.firstSeconds)),
    allMedian: median(perGuide.map((g) => g.allSeconds)),
    reviewed: perGuide.filter((g) => g.firstSeconds !== null).length,
    completed: perGuide.filter((g) => g.allSeconds !== null).length,
  };
}

/* ------------------------------------------------------------------ */
/* Completion and unreviewed sections                                  */
/* ------------------------------------------------------------------ */

/**
 * Sections of the latest published version of each pull request, where that version was published in
 * the range, with whether any member marked them (carried-over marks count: the code was reviewed).
 */
function latestSections(scope: InsightScope) {
  return sql`
    latest as (
      select distinct on (g.repository_id, g.pr_number) g.id, g.published_at, g.template
      from ${guides} g
      where g.workspace_id = ${scope.workspaceId} and g.status = 'ready' and g.published_at is not null
        ${repoFilter(scope, sql`g.repository_id`)}
      order by g.repository_id, g.pr_number, g.version desc
    ),
    sec as (
      select gs.guide_id, gs.title, gs.generated,
        exists (select 1 from ${sectionReviews} sr where sr.section_id = gs.id) as reviewed
      from ${guideSections} gs join latest l on l.id = gs.guide_id
      where l.published_at >= ${ts(scope.since)}
    )`;
}

export type Completion = {
  guides: number;
  states: Record<CompletionState, number>;
  sections: number;
  reviewedSections: number;
};

export async function completion(scope: InsightScope): Promise<Completion> {
  const result = await db.execute(sql`
    with ${latestSections(scope)}
    select guide_id, count(*)::int as sections, count(*) filter (where reviewed)::int as reviewed from sec group by guide_id
  `);
  const perGuide = rows<{ sections: number; reviewed: number }>(result);
  const states = Object.fromEntries(COMPLETION_STATES.map((s) => [s, 0])) as Record<CompletionState, number>;
  for (const g of perGuide) states[completionState(g.sections, g.reviewed)]++;
  return {
    guides: perGuide.length,
    states,
    sections: perGuide.reduce((n, g) => n + g.sections, 0),
    reviewedSections: perGuide.reduce((n, g) => n + g.reviewed, 0),
  };
}

export type UnreviewedSection = { title: string; unreviewed: number; appearances: number; share: number | null };

/** Section titles (compared like template titles) most often left without any review mark. */
export async function unreviewedSections(scope: InsightScope, limit = 8): Promise<UnreviewedSection[]> {
  const result = await db.execute(sql`
    with ${latestSections(scope)}
    select mode() within group (order by title) as title,
      count(*)::int as appearances, count(*) filter (where not reviewed)::int as unreviewed
    from sec
    group by lower(btrim(regexp_replace(title, '[^[:alnum:]]+', ' ', 'g')))
    having count(*) filter (where not reviewed) > 0
    order by unreviewed desc, appearances desc, title
    limit ${limit}
  `);
  return rows<{ title: string; appearances: number; unreviewed: number }>(result).map((r) => ({ ...r, share: share(r.unreviewed, r.appearances) }));
}

/* ------------------------------------------------------------------ */
/* Hot spots                                                           */
/* ------------------------------------------------------------------ */

export type HotSection = {
  sectionId: string;
  title: string;
  position: number;
  version: number;
  prNumber: number;
  prTitle: string | null;
  repoFullName: string;
  comments: number;
  /** Commenters. */
  people: number;
};

const lineComment = sql`${comments.kind} in ('review', 'reply')`;

/** Sections with the most line comments and replies posted through Omakaze in the range. */
export async function hotSections(scope: InsightScope, limit = 8): Promise<HotSection[]> {
  return db
    .select({
      sectionId: guideSections.id,
      title: guideSections.title,
      position: guideSections.position,
      version: guides.version,
      prNumber: guides.prNumber,
      prTitle: pullRequests.title,
      repoFullName: repositories.fullName,
      comments: count(),
      people: sql<number>`count(distinct ${comments.authorUserId})::int`.mapWith(Number),
    })
    .from(comments)
    .innerJoin(guideSections, eq(guideSections.id, comments.sectionId))
    .innerJoin(guides, eq(guides.id, guideSections.guideId))
    .innerJoin(repositories, eq(repositories.id, guides.repositoryId))
    .leftJoin(pullRequests, and(eq(pullRequests.repositoryId, guides.repositoryId), eq(pullRequests.number, guides.prNumber)))
    .where(
      and(
        eq(comments.workspaceId, scope.workspaceId),
        gte(comments.createdAt, scope.since),
        lineComment,
        scope.repositoryId ? eq(comments.repositoryId, scope.repositoryId) : undefined,
      ),
    )
    .groupBy(guideSections.id, guides.id, repositories.id, pullRequests.id)
    .orderBy(sql`count(*) desc`, asc(guides.prNumber), asc(guideSections.position))
    .limit(limit);
}

export type HotFile = {
  repoFullName: string;
  path: string;
  comments: number;
  pulls: number;
  /** Where the latest comment on the file was made, for the link. */
  link: { prNumber: number; version: number | null; position: number | null };
};

/** Files with the most line comments and replies posted through Omakaze in the range. */
export async function hotFiles(scope: InsightScope, limit = 8): Promise<HotFile[]> {
  const latest = (column: AnyPgColumn) =>
    sql<string | null>`(array_agg(${column} order by ${comments.createdAt} desc) filter (where ${column} is not null))[1]`;
  const top = await db
    .select({
      repoFullName: repositories.fullName,
      path: sql<string>`${comments.path}`,
      comments: count(),
      pulls: sql<number>`count(distinct ${comments.prNumber})::int`.mapWith(Number),
      prNumber: sql<number>`(array_agg(${comments.prNumber} order by ${comments.createdAt} desc))[1]`.mapWith(Number),
      guideId: latest(comments.guideId),
      sectionId: latest(comments.sectionId),
    })
    .from(comments)
    .innerJoin(repositories, eq(repositories.id, comments.repositoryId))
    .where(
      and(
        eq(comments.workspaceId, scope.workspaceId),
        gte(comments.createdAt, scope.since),
        lineComment,
        isNotNull(comments.path),
        scope.repositoryId ? eq(comments.repositoryId, scope.repositoryId) : undefined,
      ),
    )
    .groupBy(repositories.id, comments.path)
    .orderBy(sql`count(*) desc`, asc(comments.path))
    .limit(limit);
  const guideIds = top.map((t) => t.guideId).filter((x): x is string => !!x);
  const sectionIds = top.map((t) => t.sectionId).filter((x): x is string => !!x);
  const versions = new Map(
    guideIds.length ? (await db.select({ id: guides.id, version: guides.version }).from(guides).where(inArray(guides.id, guideIds))).map((g) => [g.id, g.version]) : [],
  );
  const positions = new Map(
    sectionIds.length
      ? (await db.select({ id: guideSections.id, position: guideSections.position }).from(guideSections).where(inArray(guideSections.id, sectionIds))).map((s) => [s.id, s.position])
      : [],
  );
  return top.map((t) => ({
    repoFullName: t.repoFullName,
    path: t.path,
    comments: t.comments,
    pulls: t.pulls,
    link: {
      prNumber: t.prNumber,
      version: t.guideId ? (versions.get(t.guideId) ?? null) : null,
      position: t.sectionId ? (positions.get(t.sectionId) ?? null) : null,
    },
  }));
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

/**
 * Coverage is stored on a guide when it is published (`changed_lines`, `covered_lines`). Guides
 * published before that have none, so they are measured here, a batch at a time.
 */
export async function backfillCoverage(workspaceId: string, limit = 40): Promise<number> {
  const missing = await db
    .select({ id: guides.id, snapshotId: guides.snapshotId })
    .from(guides)
    .where(and(eq(guides.workspaceId, workspaceId), eq(guides.status, "ready"), isNull(guides.changedLines)))
    .limit(limit);
  for (const g of missing) {
    const snapshot = await getSnapshot(g.snapshotId);
    if (!snapshot) continue;
    const sections = await db
      .select({ refs: guideSections.refs })
      .from(guideSections)
      .where(and(eq(guideSections.guideId, g.id), eq(guideSections.generated, false)));
    const c = computeCoverage(parseFiles(snapshot.files), sections);
    await db.update(guides).set({ changedLines: c.totalChanged, coveredLines: c.coveredChanged, updatedAt: sql`${guides.updatedAt}` }).where(eq(guides.id, g.id));
  }
  return missing.length;
}

export type Coverage = {
  bins: { key: CoverageBin; label: string; values: Record<GuideOrigin, number>; total: number }[];
  guides: number;
  median: number | null;
  /** Share of all changed lines in the range that went to "Other changes". */
  otherShare: number | null;
  bySource: { origin: GuideOrigin; guides: number; median: number | null }[];
};

/** The share of changed lines the author's own sections covered, for every version published in the range. */
export async function coverage(scope: InsightScope): Promise<Coverage> {
  const list = await db
    .select({ source: guides.source, createdVia: guides.createdVia, aiSource: guides.aiSource, changed: guides.changedLines, covered: guides.coveredLines })
    .from(guides)
    .where(
      and(
        eq(guides.workspaceId, scope.workspaceId),
        eq(guides.status, "ready"),
        gte(guides.publishedAt, scope.since),
        sql`${guides.changedLines} > 0`,
        scope.repositoryId ? eq(guides.repositoryId, scope.repositoryId) : undefined,
      ),
    );
  const items = list.map((g) => ({ origin: guideOrigin(g), share: coverageShare(g.changed ?? 0, g.covered ?? 0)!, changed: g.changed ?? 0, covered: g.covered ?? 0 }));
  const bins = COVERAGE_BINS.map((b) => ({
    key: b.key,
    label: b.label,
    values: Object.fromEntries(GUIDE_ORIGINS.map((o) => [o, 0])) as Record<GuideOrigin, number>,
    total: 0,
  }));
  for (const it of items) {
    const bin = bins.find((b) => b.key === coverageBin(it.share))!;
    bin.values[it.origin]++;
    bin.total++;
  }
  const changed = items.reduce((n, i) => n + i.changed, 0);
  const covered = items.reduce((n, i) => n + i.covered, 0);
  return {
    bins,
    guides: items.length,
    median: median(items.map((i) => i.share)),
    otherShare: share(changed - covered, changed),
    bySource: GUIDE_ORIGINS.map((origin) => {
      const of = items.filter((i) => i.origin === origin);
      return { origin, guides: of.length, median: median(of.map((i) => i.share)) };
    }).filter((s) => s.guides > 0),
  };
}

/* ------------------------------------------------------------------ */
/* Members                                                             */
/* ------------------------------------------------------------------ */

export type Members = ReturnType<typeof visibleMembers>;

/**
 * Per member: review marks made (fresh) and carried over, comments and replies, reviews submitted,
 * conversations resolved and guides started, in the range. The total includes people who have left.
 */
export async function memberStats(scope: InsightScope, viewer: { userId: string; role: Role }): Promise<Members> {
  const inRepo = (column: AnyPgColumn) => (scope.repositoryId ? eq(column, scope.repositoryId) : undefined);
  const [people, marks, posted, resolved, written] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.workspaceId, scope.workspaceId))
      .orderBy(asc(users.name)),
    db
      .select({
        userId: sectionReviews.userId,
        reviewed: sql<number>`count(*) filter (where ${sectionReviews.carriedFromVersion} is null)::int`.mapWith(Number),
        carried: sql<number>`count(*) filter (where ${sectionReviews.carriedFromVersion} is not null)::int`.mapWith(Number),
      })
      .from(sectionReviews)
      .innerJoin(guides, eq(guides.id, sectionReviews.guideId))
      .where(and(eq(guides.workspaceId, scope.workspaceId), gte(sectionReviews.reviewedAt, scope.since), inRepo(guides.repositoryId)))
      .groupBy(sectionReviews.userId),
    db
      .select({
        userId: comments.authorUserId,
        comments: sql<number>`count(*) filter (where ${comments.kind} <> 'review_submit')::int`.mapWith(Number),
        reviews: sql<number>`count(*) filter (where ${comments.kind} = 'review_submit')::int`.mapWith(Number),
      })
      .from(comments)
      .where(and(eq(comments.workspaceId, scope.workspaceId), gte(comments.createdAt, scope.since), inRepo(comments.repositoryId)))
      .groupBy(comments.authorUserId),
    db
      .select({ userId: activity.actorUserId, n: count() })
      .from(activity)
      .where(and(eq(activity.workspaceId, scope.workspaceId), eq(activity.type, "thread.resolved"), gte(activity.createdAt, scope.since), inRepo(activity.repositoryId)))
      .groupBy(activity.actorUserId),
    db
      .select({ userId: guides.createdByUserId, n: count() })
      .from(guides)
      .where(and(eq(guides.workspaceId, scope.workspaceId), gte(guides.createdAt, scope.since), ne(guides.status, "failed"), inRepo(guides.repositoryId)))
      .groupBy(guides.createdByUserId),
  ]);
  const byUser = new Map<string, MemberStats>(people.map((p) => [p.id, emptyStats(p.id, p.name, p.avatarUrl)]));
  // People who left (and rows without a user) still count towards the total.
  const former = emptyStats(null, "Former members");
  const row = (id: string | null) => (id ? byUser.get(id) : undefined) ?? former;
  for (const m of marks) {
    const r = row(m.userId);
    r.reviewed += m.reviewed;
    r.carried += m.carried;
  }
  for (const c of posted) {
    const r = row(c.userId);
    r.comments += c.comments;
    r.reviews += c.reviews;
  }
  for (const r of resolved) row(r.userId).resolved += r.n;
  // Guides started by automation have no user and are nobody's.
  for (const w of written) if (w.userId) row(w.userId).guides += w.n;
  const all = [...byUser.values()].sort((a, b) => b.reviewed - a.reviewed || b.comments - a.comments || a.name.localeCompare(b.name));
  const hasFormer = MEMBER_METRICS.some((k) => former[k] > 0);
  return visibleMembers(viewer.role, viewer.userId, hasFormer ? [...all, former] : all);
}

/* ------------------------------------------------------------------ */
/* Template compliance                                                 */
/* ------------------------------------------------------------------ */

export type TemplateCompliance = {
  /** Latest published versions in the range that were started with a template outline. */
  guides: number;
  missing: number;
  sections: { title: string; template: string; missing: number }[];
};

/** How many guides lack a required section of the template they were started with, and which. */
export async function templateCompliance(scope: InsightScope): Promise<TemplateCompliance> {
  const result = await db.execute(sql`
    with ${latestSections(scope)}
    select l.id, l.template from latest l
    where l.published_at >= ${ts(scope.since)} and l.template is not null and jsonb_array_length(l.template->'sections') > 0
  `);
  const list = rows<{ id: string; template: ResolvedTemplate }>(result);
  if (list.length === 0) return { guides: 0, missing: 0, sections: [] };
  const sections = await db
    .select({
      guideId: guideSections.guideId,
      title: guideSections.title,
      generated: guideSections.generated,
      hasBody: sql<boolean>`btrim(${guideSections.body}) <> ''`,
      refCount: sql<number>`jsonb_array_length(${guideSections.refs})`.mapWith(Number),
    })
    .from(guideSections)
    .where(inArray(guideSections.guideId, list.map((g) => g.id)));
  const counts = new Map<string, { title: string; template: string; missing: number }>();
  let missingGuides = 0;
  for (const g of list) {
    const template = typeof g.template === "string" ? (JSON.parse(g.template) as ResolvedTemplate) : g.template;
    // missingRequired only looks at whether a section has a body or refs, not at their content.
    const own = sections
      .filter((s) => s.guideId === g.id)
      .map((s) => ({ title: s.title, generated: s.generated, body: s.hasBody ? "-" : "", refs: Array.from({ length: s.refCount }) }));
    const missing = missingRequired(template, own);
    if (missing.length > 0) missingGuides++;
    for (const m of missing) {
      const key = `${template.name ?? ""}\u0000${normalizeTitle(m.title)}`;
      const c = counts.get(key) ?? { title: m.title, template: template.name ?? "Custom", missing: 0 };
      c.missing++;
      counts.set(key, c);
    }
  }
  return {
    guides: list.length,
    missing: missingGuides,
    sections: [...counts.values()].sort((a, b) => b.missing - a.missing || a.title.localeCompare(b.title)).slice(0, 8),
  };
}
