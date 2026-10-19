/**
 * Review marks carried over to later guide versions, as publishing those versions in the app does
 * (src/lib/guides/progress.ts). In the demo, Maya's and Sam's marks on the sections of #128 v1
 * whose code is the same in v2 carry over; the sections that changed are left for re-review.
 *
 * Runs after the seed's transaction, since it reads the rows the seed wrote through the app's own
 * database client.
 */
export async function seedReviewCarryover(workspaceSlug: string): Promise<void> {
  const { and, asc, eq, gt } = await import("drizzle-orm");
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const { carryReviewMarks } = await import("@/lib/guides/progress");
  const rows = await db
    .select({ guide: s.guides, repo: s.repositories.fullName })
    .from(s.guides)
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.guides.workspaceId))
    .innerJoin(s.repositories, eq(s.repositories.id, s.guides.repositoryId))
    .where(and(eq(s.workspaces.slug, workspaceSlug), gt(s.guides.version, 1)))
    .orderBy(asc(s.guides.prNumber), asc(s.guides.version));
  for (const { guide, repo } of rows) {
    const carried = await carryReviewMarks(guide);
    if (carried > 0) console.log(`  ${repo}#${guide.prNumber} v${guide.version}: ${carried} review marks carried over from earlier versions`);
  }
}
