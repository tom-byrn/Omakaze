import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { guideViews, memberships, sectionReviews, users } from "@/db/schema";
import { parseFiles } from "@/lib/diff/parse";
import type { ParsedFile } from "@/lib/diff/types";
import { getSnapshot } from "@/lib/github/pulls";
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

export async function loadGuideData(guide: Guide, viewerId: string) {
  const [snapshot, sections, reviews, members] = await Promise.all([
    getSnapshot(guide.snapshotId),
    getSections(guide.id),
    db.select().from(sectionReviews).where(eq(sectionReviews.guideId, guide.id)),
    db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.workspaceId, guide.workspaceId)),
  ]);
  const files = parseFiles(snapshot?.files ?? []);
  const coverage = computeCoverage(files, sections);
  const reviewedBy = new Map<string, string[]>();
  for (const r of reviews) reviewedBy.set(r.sectionId, [...(reviewedBy.get(r.sectionId) ?? []), r.userId]);

  await db
    .insert(guideViews)
    .values({ guideId: guide.id, userId: viewerId })
    .onConflictDoUpdate({ target: [guideViews.guideId, guideViews.userId], set: { lastViewedAt: sql`now()` } });

  return {
    snapshot,
    files,
    coverage,
    sections: sections.map((s: Section) => ({ ...s, stats: sectionStats(s.refs, files), reviewedBy: reviewedBy.get(s.id) ?? [] })),
    members: Object.fromEntries(members.map((m) => [m.id, { name: m.name, avatarUrl: m.avatarUrl }])),
    fileSections: coverage.fileSections,
  };
}
