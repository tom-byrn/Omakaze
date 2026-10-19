/**
 * Review progress across guide versions: carrying review marks to a newer version, flagging
 * sections whose code changed since the viewer reviewed them, and what is new since the viewer's
 * last visit. The comparisons are pure functions in carryover.ts.
 */
import { and, asc, desc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { guideSections, guides, guideViews, sectionReviews, type GuideStatus } from "@/db/schema";
import { parseFiles } from "@/lib/diff/parse";
import { getSnapshot } from "@/lib/github/pulls";
import { interdiff, marksToCarry, matchSections, visitSince, type SectionChange, type SectionMatch, type VersionSide } from "./carryover";

export type { SectionChange } from "./carryover";
import type { Guide } from "./service";

/** Earlier versions looked at for marks and comparisons, newest first. */
const MAX_EARLIER_VERSIONS = 10;

type VersionRow = { id: string; version: number; status: GuideStatus; snapshotId: string; publishedAt: Date | null; createdAt: Date };

const publishedAt = (g: { publishedAt: Date | null; createdAt: Date }) => g.publishedAt ?? g.createdAt;

export type VersionHistory = {
  /** Earlier versions of the pull request's guide that did not fail, newest first. */
  earlier(): Promise<VersionRow[]>;
  /** Sections of `guide` matched against the sections of an earlier version. */
  compare(earlier: VersionRow): Promise<Map<string, SectionMatch>>;
};

async function loadSide(guideId: string, snapshotId: string): Promise<VersionSide> {
  const [snapshot, sections] = await Promise.all([
    getSnapshot(snapshotId),
    db.select().from(guideSections).where(eq(guideSections.guideId, guideId)).orderBy(asc(guideSections.position)),
  ]);
  return { files: parseFiles(snapshot?.files ?? []), sections };
}

/** Loads and compares the versions of one guide at most once each. Pass `current` when it is already loaded. */
export function versionHistory(guide: Guide, current?: VersionSide): VersionHistory {
  let earlier: Promise<VersionRow[]> | null = null;
  let target: Promise<VersionSide> | null = current ? Promise.resolve(current) : null;
  const matches = new Map<string, Promise<Map<string, SectionMatch>>>();
  return {
    earlier() {
      earlier ??= db
        .select({ id: guides.id, version: guides.version, status: guides.status, snapshotId: guides.snapshotId, publishedAt: guides.publishedAt, createdAt: guides.createdAt })
        .from(guides)
        .where(and(eq(guides.repositoryId, guide.repositoryId), eq(guides.prNumber, guide.prNumber), lt(guides.version, guide.version), ne(guides.status, "failed")))
        .orderBy(desc(guides.version))
        .limit(MAX_EARLIER_VERSIONS);
      return earlier;
    },
    compare(v) {
      let m = matches.get(v.id);
      if (!m) {
        target ??= loadSide(guide.id, guide.snapshotId);
        const t = target;
        m = loadSide(v.id, v.snapshotId).then(async (side) => matchSections(side, await t));
        matches.set(v.id, m);
      }
      return m;
    },
  };
}

/**
 * Copy review marks from earlier versions to the sections of `guide` that cover the same code.
 * Runs for every member when a version is first published, and for the viewer when they open a
 * version, with `after` set to their previous view of it so a mark they removed here is not
 * carried again. `sectionIds` limits it to some sections, e.g. ones whose refs were just edited.
 * Returns how many marks were added.
 */
export async function carryReviewMarks(
  guide: Guide,
  opts: { userId?: string; after?: Date | null; sectionIds?: string[]; history?: VersionHistory } = {},
): Promise<number> {
  if (guide.status !== "ready") return 0;
  const history = opts.history ?? versionHistory(guide);
  const earlier = await history.earlier();
  if (earlier.length === 0) return 0;
  const marks = await db
    .select()
    .from(sectionReviews)
    .where(
      and(
        inArray(
          sectionReviews.guideId,
          earlier.map((v) => v.id),
        ),
        opts.userId ? eq(sectionReviews.userId, opts.userId) : undefined,
        opts.after ? gt(sectionReviews.reviewedAt, opts.after) : undefined,
      ),
    );
  if (marks.length === 0) return 0;
  const existing = new Set(
    (
      await db
        .select({ sectionId: sectionReviews.sectionId, userId: sectionReviews.userId })
        .from(sectionReviews)
        .where(and(eq(sectionReviews.guideId, guide.id), opts.userId ? eq(sectionReviews.userId, opts.userId) : undefined))
    ).map((r) => `${r.sectionId}:${r.userId}`),
  );
  const rows: (typeof sectionReviews.$inferInsert)[] = [];
  // Newest first, so a mark from the latest version wins.
  for (const v of earlier) {
    const own = marks.filter((m) => m.guideId === v.id);
    if (own.length === 0) continue;
    for (const m of marksToCarry(await history.compare(v), own, v.version, existing)) {
      if (!opts.sectionIds || opts.sectionIds.includes(m.sectionId)) rows.push({ ...m, guideId: guide.id });
    }
  }
  if (rows.length > 0) await db.insert(sectionReviews).values(rows).onConflictDoNothing();
  return rows.length;
}

export type Visit = {
  /** What "new since your last visit" compares against; null on the first visit. */
  since: Date | null;
  /** The viewer's previous view of this version. */
  previousView: Date | null;
};

/** Record a page view of a guide, after reading the viewer's previous visit to the pull request. */
export async function recordVisit(guide: Guide, userId: string, now = new Date()): Promise<Visit> {
  const rows = await db
    .select({ guideId: guideViews.guideId, lastViewedAt: guideViews.lastViewedAt, previousVisitAt: guideViews.previousVisitAt })
    .from(guideViews)
    .innerJoin(guides, eq(guides.id, guideViews.guideId))
    .where(and(eq(guideViews.userId, userId), eq(guides.repositoryId, guide.repositoryId), eq(guides.prNumber, guide.prNumber)));
  const since = visitSince(rows, now);
  await db
    .insert(guideViews)
    .values({ guideId: guide.id, userId, lastViewedAt: now, previousVisitAt: since })
    .onConflictDoUpdate({ target: [guideViews.guideId, guideViews.userId], set: { lastViewedAt: now, previousVisitAt: since } });
  return { since, previousView: rows.find((r) => r.guideId === guide.id)?.lastViewedAt ?? null };
}

export type ViewerChanges = {
  /** Sections whose code changed since the viewer reviewed them; `version` is the version they reviewed. */
  review: Map<string, SectionChange>;
  /** Sections that are new or changed compared to the version that was current at the viewer's last visit. */
  visit: Map<string, SectionChange>;
  /** Set when this version was published after the viewer's last visit. */
  sinceVisit: { at: Date; baselineVersion: number; versions: number[] } | null;
};

/** Earlier versions searched for the viewer's own marks. */
const MAX_REVIEW_LOOKBACK = 5;

/**
 * What changed for one viewer: sections they reviewed in an earlier version whose code changed
 * (with an interdiff against that version), and sections new or changed since their last visit.
 */
export async function viewerChanges(
  guide: Guide,
  viewerId: string,
  marked: Set<string>,
  visit: Visit,
  history: VersionHistory,
): Promise<ViewerChanges> {
  const out: ViewerChanges = { review: new Map(), visit: new Map(), sinceVisit: null };
  const earlier = await history.earlier();
  if (earlier.length === 0) return out;

  const mine = await db
    .select()
    .from(sectionReviews)
    .where(
      and(
        eq(sectionReviews.userId, viewerId),
        inArray(
          sectionReviews.guideId,
          earlier.slice(0, MAX_REVIEW_LOOKBACK).map((v) => v.id),
        ),
      ),
    );
  // Sections the viewer has not marked here; the newest earlier version with a mark on a matching section decides.
  const decided = new Set(marked);
  for (const v of earlier.slice(0, MAX_REVIEW_LOOKBACK)) {
    const byId = new Map(mine.filter((m) => m.guideId === v.id).map((m) => [m.sectionId, m]));
    if (byId.size === 0) continue;
    for (const [id, m] of await history.compare(v)) {
      if (decided.has(id) || m.status === "new") continue;
      const mark = byId.get(m.previousId);
      if (!mark) continue;
      decided.add(id);
      if (m.status === "changed") out.review.set(id, { status: "changed", version: mark.carriedFromVersion ?? v.version, files: interdiff(m.previous, m.current) });
    }
  }

  const since = visit.since;
  // Publishing again moves published_at, so a version the viewer saw on an earlier visit doesn't count as new.
  const seenBefore = visit.previousView !== null && since !== null && visit.previousView <= since;
  if (since && publishedAt(guide) > since && !seenBefore) {
    const baseline = earlier.find((v) => publishedAt(v) <= since);
    if (baseline) {
      out.sinceVisit = {
        at: since,
        baselineVersion: baseline.version,
        versions: [...earlier.filter((v) => v.version > baseline.version && v.status === "ready").map((v) => v.version), guide.version].sort((a, b) => a - b),
      };
      for (const [id, m] of await history.compare(baseline)) {
        if (m.status === "new") out.visit.set(id, { status: "new", version: baseline.version, files: [] });
        else if (m.status === "changed") {
          const same = out.review.get(id);
          out.visit.set(id, same?.version === baseline.version ? same : { status: "changed", version: baseline.version, files: interdiff(m.previous, m.current) });
        }
      }
    }
  }
  return out;
}
