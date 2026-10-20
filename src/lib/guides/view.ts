import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, sectionReviews, users } from "@/db/schema";
import { parseFiles } from "@/lib/diff/parse";
import type { ParsedFile } from "@/lib/diff/types";
import { getSnapshot } from "@/lib/github/pulls";
import { carryReviewMarks, recordVisit, versionHistory, viewerChanges, type ViewerChanges } from "./progress";
import { computeCoverage, refSelectsLine, type SectionRef } from "./refs";
import { getSections, type Guide, type Section } from "./service";

export type SectionStats = {
  files: { path: string; additions: number; deletions: number }[];
  additions: number;
  deletions: number;
};

/** Changed-line counts for the parts of the diff a section references. */
export function sectionStats(refs: SectionRef[], files: ParsedFile[]): SectionStats {
  const order: string[] = [];
  for (const r of refs) if (!order.includes(r.path)) order.push(r.path);
  const byPath = new Map(files.map((f) => [f.path, f]));
  const out: SectionStats = { files: [], additions: 0, deletions: 0 };
  for (const path of order) {
    const file = byPath.get(path);
    if (!file) continue;
    const fileRefs = refs.filter((r) => r.path === path);
    let additions = 0;
    let deletions = 0;
    for (const h of file.hunks) {
      h.lines.forEach((l, i) => {
        if (l.type === "context") return;
        if (!fileRefs.some((r) => refSelectsLine(r, file, h, i))) return;
        if (l.type === "add") additions++;
        else deletions++;
      });
    }
    if (file.hunks.length === 0) {
      additions = file.additions;
      deletions = file.deletions;
    }
    out.files.push({ path, additions, deletions });
    out.additions += additions;
    out.deletions += deletions;
  }
  return out;
}

/**
 * Everything the viewer shows for a guide version. `viewerId` null is a share link's anonymous
 * viewer: no visit is recorded, no marks are carried, and no member or review mark is returned.
 */
export async function loadGuideData(guide: Guide, viewerId: string | null) {
  const [visit, snapshot, sections, members] = await Promise.all([
    // Reads the viewer's previous visit before recording this one.
    viewerId ? recordVisit(guide, viewerId) : null,
    getSnapshot(guide.snapshotId),
    getSections(guide.id),
    viewerId
      ? db
          .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(eq(memberships.workspaceId, guide.workspaceId))
      : [],
  ]);
  const files = parseFiles(snapshot?.files ?? []);
  const coverage = computeCoverage(files, sections);
  const history = versionHistory(guide, { files, sections });
  // Marks the viewer made on earlier versions since they last opened this one (see progress.ts).
  if (viewerId && visit) {
    await carryReviewMarks(guide, { userId: viewerId, after: visit.previousView, history }).catch((err) => console.error("[guides] carrying review marks failed", err));
  }
  const reviews = viewerId ? await db.select().from(sectionReviews).where(eq(sectionReviews.guideId, guide.id)) : [];
  const reviewedBy = new Map<string, string[]>();
  const carriedFrom = new Map<string, Record<string, number>>();
  for (const r of reviews) {
    reviewedBy.set(r.sectionId, [...(reviewedBy.get(r.sectionId) ?? []), r.userId]);
    if (r.carriedFromVersion !== null) carriedFrom.set(r.sectionId, { ...carriedFrom.get(r.sectionId), [r.userId]: r.carriedFromVersion });
  }
  const marked = new Set(reviews.filter((r) => r.userId === viewerId).map((r) => r.sectionId));
  const none: ViewerChanges = { review: new Map(), visit: new Map(), sinceVisit: null };
  const changes: ViewerChanges =
    viewerId && visit
      ? await viewerChanges(guide, viewerId, marked, visit, history).catch((err) => {
          console.error("[guides] comparing versions failed", err);
          return none;
        })
      : none;

  return {
    snapshot,
    files,
    coverage,
    sections: sections.map((s: Section) => ({
      ...s,
      stats: sectionStats(s.refs, files),
      reviewedBy: reviewedBy.get(s.id) ?? [],
      carriedFrom: carriedFrom.get(s.id) ?? {},
      reviewChange: changes.review.get(s.id) ?? null,
      visitChange: changes.visit.get(s.id) ?? null,
    })),
    members: Object.fromEntries(members.map((m) => [m.id, { name: m.name, avatarUrl: m.avatarUrl }])),
    fileSections: coverage.fileSections,
    /** The viewer's previous visit, and the versions published since (when this is one of them). */
    lastVisitAt: visit?.since ?? null,
    sinceVisit: changes.sinceVisit,
  };
}
