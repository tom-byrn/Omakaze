import { and, asc, desc, eq, gt, gte, isNotNull, lt, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { violatesConstraint } from "@/db/errors";
import {
  guideSections,
  guides,
  repositories,
  sectionReviews,
  workspaces,
  type GuideEvent,
  type GuideSource,
  type GuideStatus,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { parseFiles } from "@/lib/diff/parse";
import type { ParsedFile } from "@/lib/diff/types";
import { env } from "@/lib/env";
import { getOrCreateSnapshot, getSnapshot, type PullRow, type Snapshot } from "@/lib/github/pulls";
import type { RepoContext } from "@/lib/github/connections";
import { notifyGuidePublished } from "@/lib/notifications/hooks";
import { carryReviewMarks } from "./progress";
import {
  computeCoverage,
  formatRef,
  normalizeRef,
  refsForUncovered,
  validateRefs,
  type Coverage,
  type RefInput,
  type RefProblem,
  type SectionRef,
} from "./refs";
import { templateFor } from "./template-store";

export type Guide = typeof guides.$inferSelect;
export type Section = typeof guideSections.$inferSelect;

export class GuideError extends Error {
  constructor(
    message: string,
    public problems: RefProblem[] = [],
  ) {
    super(message);
  }
}

export const OTHER_CHANGES_TITLE = "Other changes";

/**
 * A guide that stays in `generating` this long without any change (a section, an event, a
 * metadata edit) was abandoned, e.g. by an agent that never called `finish_guide`.
 */
export const STALE_GUIDE_MINUTES = 60;

export function isStaleGuide(guide: { status: GuideStatus; updatedAt: Date }, now = Date.now()): boolean {
  return guide.status === "generating" && now - guide.updatedAt.getTime() > STALE_GUIDE_MINUTES * 60_000;
}

export function guidePath(workspaceSlug: string, repoFullName: string, prNumber: number, version?: number): string {
  const base = `/w/${workspaceSlug}/${repoFullName}/pull/${prNumber}`;
  return version ? `${base}?v=${version}` : base;
}

export function guideUrl(workspaceSlug: string, repoFullName: string, prNumber: number, version?: number): string {
  return `${env().APP_URL}${guidePath(workspaceSlug, repoFullName, prNumber, version)}`;
}

export async function getGuide(id: string): Promise<Guide | null> {
  const [g] = await db.select().from(guides).where(eq(guides.id, id)).limit(1);
  return g ?? null;
}

export async function getSections(guideId: string): Promise<Section[]> {
  return db.select().from(guideSections).where(eq(guideSections.guideId, guideId)).orderBy(asc(guideSections.position));
}

export async function listGuideVersions(repositoryId: string, prNumber: number) {
  return db
    .select({
      id: guides.id,
      version: guides.version,
      status: guides.status,
      headSha: guides.headSha,
      title: guides.title,
      source: guides.source,
      author: guides.author,
      createdAt: guides.createdAt,
      updatedAt: guides.updatedAt,
    })
    .from(guides)
    .where(and(eq(guides.repositoryId, repositoryId), eq(guides.prNumber, prNumber)))
    .orderBy(desc(guides.version));
}

export async function getLatestGuide(repositoryId: string, prNumber: number, opts: { readyOnly?: boolean } = {}) {
  const rows = await db
    .select()
    .from(guides)
    .where(
      and(
        eq(guides.repositoryId, repositoryId),
        eq(guides.prNumber, prNumber),
        opts.readyOnly ? eq(guides.status, "ready") : undefined,
      ),
    )
    .orderBy(desc(guides.version))
    .limit(1);
  return rows[0] ?? null;
}

export async function appendGuideEvent(guideId: string, message: string, level: GuideEvent["level"] = "info") {
  const event: GuideEvent = { at: new Date().toISOString(), message, level };
  await db
    .update(guides)
    .set({ events: sql`${guides.events} || ${JSON.stringify([event])}::jsonb` })
    .where(eq(guides.id, guideId));
}

/* ------------------------------------------------------------------ */
/* Creating guides                                                     */
/* ------------------------------------------------------------------ */

export type StartGuideInput = {
  workspaceId: string;
  ctx: RepoContext;
  prNumber: number;
  title?: string | null;
  summary?: string | null;
  source: GuideSource;
  createdVia: "mcp" | "api" | "ui" | "webhook" | "poll";
  author?: string | null;
  userId?: string | null;
  expectedHeadSha?: string | null;
  status?: Extract<GuideStatus, "generating" | "draft">;
};

/** Snapshot the PR diff and create a new guide version in `generating` (or `draft`) state. */
export async function startGuide(input: StartGuideInput): Promise<{ guide: Guide; snapshot: Snapshot; pull: PullRow }> {
  const { snapshot, pull } = await getOrCreateSnapshot(input.ctx, input.prNumber, {
    expectedHeadSha: input.expectedHeadSha,
  });
  // Recorded with the guide, so checks and the editor use the template the guide was written for.
  const template = await templateFor(input.workspaceId, input.ctx.repo);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const guide = await db.transaction(async (tx) => {
        const [{ v }] = await tx
          .select({ v: max(guides.version) })
          .from(guides)
          .where(and(eq(guides.repositoryId, input.ctx.repo.id), eq(guides.prNumber, input.prNumber)));
        const [row] = await tx
          .insert(guides)
          .values({
            workspaceId: input.workspaceId,
            repositoryId: input.ctx.repo.id,
            prNumber: input.prNumber,
            version: (v ?? 0) + 1,
            snapshotId: snapshot.id,
            status: input.status ?? "generating",
            source: input.source,
            title: (input.title?.trim() || pull.title).slice(0, 300),
            summary: input.summary ?? "",
            headSha: snapshot.headSha,
            createdByUserId: input.userId ?? null,
            createdVia: input.createdVia,
            author: input.author ?? null,
            events: [{ at: new Date().toISOString(), message: "Guide started", level: "info" }],
            template,
          })
          .returning();
        return row;
      });
      await logActivity({
        workspaceId: input.workspaceId,
        type: "guide.started",
        actorUserId: input.userId ?? null,
        actorLabel: input.author ?? null,
        repositoryId: input.ctx.repo.id,
        prNumber: input.prNumber,
        guideId: guide.id,
        data: { version: guide.version, via: input.createdVia },
      });
      await updateGuideCheckFor(guide);
      return { guide, snapshot, pull };
    } catch (err) {
      // Another guide took this version number at the same time: try the next one.
      if (attempt < 4 && violatesConstraint(err, "guides_repo_pr_version_unique")) continue;
      throw err;
    }
  }
  throw new Error("Could not allocate a guide version");
}

export async function loadParsedFiles(guide: Guide): Promise<{ snapshot: Snapshot; files: ParsedFile[] }> {
  const snapshot = await getSnapshot(guide.snapshotId);
  if (!snapshot) throw new GuideError("Diff snapshot missing");
  return { snapshot, files: parseFiles(snapshot.files) };
}

export type SectionInput = {
  title: string;
  body?: string;
  refs?: RefInput[];
};

function prepareRefs(input: RefInput[] | undefined, files: ParsedFile[]): { refs: SectionRef[]; warnings: RefProblem[] } {
  const known = new Set(files.map((f) => f.path));
  const refs = (input ?? []).map((r) => normalizeRef(r, known));
  const problems = validateRefs(refs, files);
  const errors = problems.filter((p) => p.level === "error");
  if (errors.length > 0) {
    throw new GuideError(
      `Invalid diff references:\n${errors.map((e) => `- ${e.ref}: ${e.message}`).join("\n")}`,
      problems,
    );
  }
  return { refs, warnings: problems.filter((p) => p.level === "warning") };
}

function assertEditable(guide: Guide) {
  if (guide.status === "failed") throw new GuideError("This guide failed. Start a new one.");
}

export async function addSection(
  guideId: string,
  input: SectionInput & { position?: number },
): Promise<{ section: Section; warnings: RefProblem[] }> {
  const guide = await getGuide(guideId);
  if (!guide) throw new GuideError("Guide not found");
  assertEditable(guide);
  const { files } = await loadParsedFiles(guide);
  const { refs, warnings } = prepareRefs(input.refs, files);
  const section = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: guideSections.id, position: guideSections.position, generated: guideSections.generated })
      .from(guideSections)
      .where(eq(guideSections.guideId, guideId))
      .orderBy(asc(guideSections.position));
    // Keep the automatic "Other changes" section last.
    const userCount = existing.filter((s) => !s.generated).length;
    const position =
      input.position !== undefined ? Math.max(1, Math.min(input.position, userCount + 1)) : userCount + 1;
    await tx
      .update(guideSections)
      .set({ position: sql`${guideSections.position} + 1` })
      .where(and(eq(guideSections.guideId, guideId), gte(guideSections.position, position)));
    const [row] = await tx
      .insert(guideSections)
      .values({ guideId, position, title: input.title.trim().slice(0, 200), body: input.body ?? "", refs })
      .returning();
    await tx.update(guides).set({ updatedAt: new Date() }).where(eq(guides.id, guideId));
    return row;
  });
  await appendGuideEvent(guideId, `Section ${section.position} added: ${section.title}`);
  return { section, warnings };
}

export async function updateSection(
  sectionId: string,
  patch: { title?: string; body?: string; refs?: RefInput[] },
): Promise<{ section: Section; warnings: RefProblem[] }> {
  const [current] = await db.select().from(guideSections).where(eq(guideSections.id, sectionId)).limit(1);
  if (!current) throw new GuideError("Section not found");
  const guide = await getGuide(current.guideId);
  if (!guide) throw new GuideError("Guide not found");
  assertEditable(guide);
  let refs: SectionRef[] | undefined;
  let warnings: RefProblem[] = [];
  if (patch.refs) {
    const { files } = await loadParsedFiles(guide);
    ({ refs, warnings } = prepareRefs(patch.refs, files));
  }
  const [section] = await db
    .update(guideSections)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 200) } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(refs ? { refs } : {}),
    })
    .where(eq(guideSections.id, sectionId))
    .returning();
  // A carried mark says the code was the same as in the version the member reviewed; new refs need a new comparison.
  if (refs && JSON.stringify(refs) !== JSON.stringify(current.refs)) {
    await db.delete(sectionReviews).where(and(eq(sectionReviews.sectionId, sectionId), isNotNull(sectionReviews.carriedFromVersion)));
    await carryReviewMarks(guide, { sectionIds: [sectionId] }).catch((err) => console.error("[guides] carrying review marks failed", err));
  }
  await db.update(guides).set({ updatedAt: new Date() }).where(eq(guides.id, guide.id));
  return { section, warnings };
}

export async function deleteSection(sectionId: string): Promise<void> {
  const [current] = await db.select().from(guideSections).where(eq(guideSections.id, sectionId)).limit(1);
  if (!current) throw new GuideError("Section not found");
  await db.transaction(async (tx) => {
    await tx.delete(guideSections).where(eq(guideSections.id, sectionId));
    await tx
      .update(guideSections)
      .set({ position: sql`${guideSections.position} - 1` })
      .where(and(eq(guideSections.guideId, current.guideId), gt(guideSections.position, current.position)));
    await tx.update(guides).set({ updatedAt: new Date() }).where(eq(guides.id, current.guideId));
  });
}

/** Remove every section, e.g. before generation starts over after a failed attempt. */
export async function clearSections(guideId: string): Promise<number> {
  const removed = await db.delete(guideSections).where(eq(guideSections.guideId, guideId)).returning({ id: guideSections.id });
  await db.update(guides).set({ updatedAt: new Date() }).where(eq(guides.id, guideId));
  return removed.length;
}

export async function reorderSections(guideId: string, sectionIds: string[]): Promise<Section[]> {
  const sections = await getSections(guideId);
  const known = new Set(sections.map((s) => s.id));
  if (sectionIds.length !== sections.length || sectionIds.some((id) => !known.has(id))) {
    throw new GuideError("Provide every section id of the guide exactly once.");
  }
  await db.transaction(async (tx) => {
    // Two passes to avoid transient duplicates.
    for (let i = 0; i < sectionIds.length; i++) {
      await tx.update(guideSections).set({ position: 10_000 + i }).where(eq(guideSections.id, sectionIds[i]));
    }
    for (let i = 0; i < sectionIds.length; i++) {
      await tx.update(guideSections).set({ position: i + 1 }).where(eq(guideSections.id, sectionIds[i]));
    }
    await tx.update(guides).set({ updatedAt: new Date() }).where(eq(guides.id, guideId));
  });
  return getSections(guideId);
}

export async function updateGuideMeta(guideId: string, patch: { title?: string; summary?: string }): Promise<Guide> {
  const [g] = await db
    .update(guides)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 300) } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
    })
    .where(eq(guides.id, guideId))
    .returning();
  if (!g) throw new GuideError("Guide not found");
  return g;
}

export async function getCoverage(guide: Guide): Promise<Coverage> {
  const { files } = await loadParsedFiles(guide);
  const sections = await getSections(guide.id);
  return computeCoverage(files, sections);
}

export function describeCoverage(c: Coverage): string {
  if (c.totalChanged === 0) return "No changed lines.";
  const pct = Math.round((c.coveredChanged / c.totalChanged) * 100);
  const lines = [`${c.coveredChanged}/${c.totalChanged} changed lines covered (${pct}%).`];
  if (c.uncovered.length > 0) {
    lines.push("Not covered by any section:");
    for (const u of c.uncovered.slice(0, 40)) {
      lines.push(
        `- ${formatRef({ path: u.path, hunks: u.wholeHunk ? [u.hunk] : undefined, lines: u.wholeHunk ? undefined : { start: u.start, end: u.end, side: u.side } })} (${u.changedLines} changed line${u.changedLines === 1 ? "" : "s"})`,
      );
    }
    if (c.uncovered.length > 40) lines.push(`…and ${c.uncovered.length - 40} more.`);
  }
  return lines.join("\n");
}

/** Coverage report for a published guide: what the author's sections covered, and what was filled in. */
export function describeFinishedCoverage(sectionCoverage: Coverage, finalCoverage: Coverage): string {
  if (sectionCoverage.uncovered.length === 0) return describeCoverage(sectionCoverage);
  const filled = finalCoverage.uncovered.length === 0;
  return [
    `Your sections: ${describeCoverage(sectionCoverage)}`,
    filled
      ? `These changes were added to the "${OTHER_CHANGES_TITLE}" section. Move important ones into your own sections with update_section.`
      : "These changes are not shown in any section.",
  ].join("\n");
}

/**
 * Mark a guide as ready. Uncovered changes go to an automatic "Other changes"
 * section so reviewers always see the full diff.
 */
export async function finishGuide(
  guideId: string,
  opts: { autoCover?: boolean; actorUserId?: string | null; actorLabel?: string | null } = {},
): Promise<{ guide: Guide; coverage: Coverage; sectionCoverage: Coverage }> {
  const guide = await getGuide(guideId);
  if (!guide) throw new GuideError("Guide not found");
  assertEditable(guide);
  const { files } = await loadParsedFiles(guide);
  let sections = await getSections(guideId);
  // Remove a previous automatic section before recomputing.
  for (const s of sections.filter((x) => x.generated)) await deleteSection(s.id);
  sections = await getSections(guideId);
  const userSections = sections.filter((s) => !s.generated);
  if (userSections.length === 0 && files.length > 0 && opts.autoCover === false) {
    throw new GuideError("Add at least one section before finishing the guide.");
  }
  // Coverage of the author's own sections, before "Other changes" fills the gaps.
  const sectionCoverage = computeCoverage(files, sections);
  let coverage = sectionCoverage;
  let otherChangesId: string | null = null;
  if ((opts.autoCover ?? true) && coverage.uncovered.length > 0) {
    const refs = refsForUncovered(coverage.uncovered);
    const [other] = await db
      .insert(guideSections)
      .values({
        guideId,
        position: sections.length + 1,
        title: OTHER_CHANGES_TITLE,
        body:
          "Changes that are not part of the sections above. Most are small supporting edits; review them before approving.",
        refs,
        generated: true,
      })
      .returning({ id: guideSections.id });
    otherChangesId = other.id;
    coverage = computeCoverage(files, await getSections(guideId));
  }
  const [updated] = await db
    .update(guides)
    // Coverage of the author's own sections is kept for insights.
    .set({ status: "ready", error: null, publishedAt: new Date(), changedLines: sectionCoverage.totalChanged, coveredLines: sectionCoverage.coveredChanged })
    .where(eq(guides.id, guideId))
    .returning();
  await appendGuideEvent(guideId, "Guide published");
  // Members keep their marks on sections whose code did not change since an earlier version. Publishing
  // again only recreates "Other changes", so only that section is compared again.
  if (!guide.publishedAt || otherChangesId) {
    const carried = await carryReviewMarks(updated, guide.publishedAt ? { sectionIds: [otherChangesId!] } : {}).catch((err) => {
      console.error("[guides] carrying review marks failed", err);
      return 0;
    });
    if (carried > 0) await appendGuideEvent(guideId, `Carried ${carried} review mark${carried === 1 ? "" : "s"} over from earlier versions`);
  }
  await logActivity({
    workspaceId: guide.workspaceId,
    type: "guide.ready",
    actorUserId: opts.actorUserId ?? guide.createdByUserId,
    actorLabel: opts.actorLabel ?? guide.author,
    repositoryId: guide.repositoryId,
    prNumber: guide.prNumber,
    guideId,
    data: { version: guide.version, sections: (await getSections(guideId)).length },
  });
  await afterGuideReady(updated);
  // Members hear about a version when it is first published.
  if (!guide.publishedAt) await notifyGuidePublished(updated.id, opts.actorUserId ?? guide.createdByUserId);
  return { guide: updated, coverage, sectionCoverage };
}

/** Mark a guide that is still being written as failed. Published guides are left alone. */
export async function failGuide(guideId: string, error: string): Promise<void> {
  const [g] = await db
    .update(guides)
    .set({ status: "failed", error: error.slice(0, 4000) })
    .where(and(eq(guides.id, guideId), eq(guides.status, "generating")))
    .returning();
  if (!g) return;
  await appendGuideEvent(guideId, error.slice(0, 500), "error");
  await logActivity({
    workspaceId: g.workspaceId,
    type: "guide.failed",
    actorLabel: g.author,
    repositoryId: g.repositoryId,
    prNumber: g.prNumber,
    guideId,
    data: { error: error.slice(0, 300) },
  });
  await updateGuideCheckFor(g);
}

/** Fail guides that were left in `generating` (see STALE_GUIDE_MINUTES). Returns how many. */
export async function failStaleGuides(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_GUIDE_MINUTES * 60_000);
  // Built-in generation can spend a long time in one model call; its job is the judge there.
  const stale = await db
    .select({ id: guides.id })
    .from(guides)
    .where(
      and(
        eq(guides.status, "generating"),
        lt(guides.updatedAt, cutoff),
        sql`not exists (select 1 from jobs j where j.type = 'generate_guide' and j.status in ('queued', 'running') and j.payload->>'guideId' = ${guides.id})`,
      ),
    );
  for (const g of stale) {
    await failGuide(g.id, `Nothing changed for ${STALE_GUIDE_MINUTES} minutes, so the guide was marked as abandoned. Start a new version.`);
  }
  return stale.length;
}

export async function deleteGuide(guideId: string): Promise<void> {
  const [g] = await db.delete(guides).where(eq(guides.id, guideId)).returning({ repositoryId: guides.repositoryId, prNumber: guides.prNumber });
  if (g) await updateGuideCheckFor(g);
}

/** One-shot creation used by the MCP `create_guide` tool and the REST API. */
export async function createCompleteGuide(
  input: StartGuideInput & { sections: SectionInput[]; autoCover?: boolean },
): Promise<{ guide: Guide; coverage: Coverage; sectionCoverage: Coverage; warnings: RefProblem[] }> {
  // Validate everything before creating anything.
  const { snapshot } = await getOrCreateSnapshot(input.ctx, input.prNumber, { expectedHeadSha: input.expectedHeadSha });
  const files = parseFiles(snapshot.files);
  const prepared = input.sections.map((s, i) => {
    try {
      return { ...s, ...prepareRefs(s.refs, files) };
    } catch (err) {
      if (err instanceof GuideError) throw new GuideError(`Section ${i + 1} (${s.title}): ${err.message}`, err.problems);
      throw err;
    }
  });
  const { guide } = await startGuide({ ...input, expectedHeadSha: snapshot.headSha });
  if (prepared.length > 0) {
    await db.insert(guideSections).values(
      prepared.map((s, i) => ({
        guideId: guide.id,
        position: i + 1,
        title: s.title.trim().slice(0, 200),
        body: s.body ?? "",
        refs: s.refs,
      })),
    );
  }
  const { guide: finished, coverage, sectionCoverage } = await finishGuide(guide.id, {
    autoCover: input.autoCover,
    actorUserId: input.userId,
    actorLabel: input.author,
  });
  return { guide: finished, coverage, sectionCoverage, warnings: prepared.flatMap((p) => p.warnings) };
}

/* ------------------------------------------------------------------ */
/* Review progress                                                     */
/* ------------------------------------------------------------------ */

export async function setSectionReviewed(guideId: string, sectionId: string, userId: string, reviewed: boolean) {
  if (reviewed) {
    await db.insert(sectionReviews).values({ guideId, sectionId, userId }).onConflictDoNothing();
  } else {
    await db
      .delete(sectionReviews)
      .where(and(eq(sectionReviews.sectionId, sectionId), eq(sectionReviews.userId, userId)));
  }
}

/* ------------------------------------------------------------------ */
/* Hooks after a guide is ready                                        */
/* ------------------------------------------------------------------ */

async function afterGuideReady(guide: Guide): Promise<void> {
  const [row] = await db
    .select({ postPrComment: workspaces.postPrComment })
    .from(workspaces)
    .innerJoin(repositories, eq(repositories.workspaceId, workspaces.id))
    .where(eq(repositories.id, guide.repositoryId))
    .limit(1);
  if (row?.postPrComment) {
    const { enqueueJob } = await import("@/lib/jobs/queue");
    await enqueueJob("post_pr_comment", { guideId: guide.id }, { dedupeKey: `pr-comment:${guide.id}` });
  }
  await updateGuideCheckFor(guide);
}

/** Queue an update of the pull request's guide check on GitHub (src/lib/github/guide-check.ts). */
async function updateGuideCheckFor(guide: { repositoryId: string; prNumber: number }): Promise<void> {
  // Imported here: the guide check module imports this one.
  const { requestGuideCheck } = await import("@/lib/github/guide-check");
  await requestGuideCheck(guide.repositoryId, guide.prNumber);
}
