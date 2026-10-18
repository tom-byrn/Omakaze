import { and, asc, desc, eq, gt, gte, max, sql } from "drizzle-orm";
import { db } from "@/db";
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
      return { guide, snapshot, pull };
    } catch (err) {
      if (attempt < 4 && String(err).includes("guides_repo_pr_version_unique")) continue;
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
  });
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

/**
 * Mark a guide as ready. Uncovered changes go to an automatic "Other changes"
 * section so reviewers always see the full diff.
 */
export async function finishGuide(
  guideId: string,
  opts: { autoCover?: boolean; actorUserId?: string | null; actorLabel?: string | null } = {},
): Promise<{ guide: Guide; coverage: Coverage }> {
  const guide = await getGuide(guideId);
  if (!guide) throw new GuideError("Guide not found");
  const { files } = await loadParsedFiles(guide);
  let sections = await getSections(guideId);
  // Remove a previous automatic section before recomputing.
  for (const s of sections.filter((x) => x.generated)) await deleteSection(s.id);
  sections = await getSections(guideId);
  const userSections = sections.filter((s) => !s.generated);
  if (userSections.length === 0 && files.length > 0 && opts.autoCover === false) {
    throw new GuideError("Add at least one section before finishing the guide.");
  }
  let coverage = computeCoverage(files, sections);
  if ((opts.autoCover ?? true) && coverage.uncovered.length > 0) {
    const refs = refsForUncovered(coverage.uncovered);
    await db.insert(guideSections).values({
      guideId,
      position: sections.length + 1,
      title: OTHER_CHANGES_TITLE,
      body:
        "Changes that are not part of the sections above. Most are small supporting edits; review them before approving.",
      refs,
      generated: true,
    });
    coverage = computeCoverage(files, await getSections(guideId));
  }
  const [updated] = await db
    .update(guides)
    .set({ status: "ready", error: null, publishedAt: new Date() })
    .where(eq(guides.id, guideId))
    .returning();
  await appendGuideEvent(guideId, "Guide published");
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
  return { guide: updated, coverage };
}

export async function failGuide(guideId: string, error: string): Promise<void> {
  const [g] = await db
    .update(guides)
    .set({ status: "failed", error: error.slice(0, 4000) })
    .where(eq(guides.id, guideId))
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
}

export async function deleteGuide(guideId: string): Promise<void> {
  await db.delete(guides).where(eq(guides.id, guideId));
}

/** One-shot creation used by the MCP `create_guide` tool and the REST API. */
export async function createCompleteGuide(
  input: StartGuideInput & { sections: SectionInput[]; autoCover?: boolean },
): Promise<{ guide: Guide; coverage: Coverage; warnings: RefProblem[] }> {
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
  const { guide: finished, coverage } = await finishGuide(guide.id, {
    autoCover: input.autoCover,
    actorUserId: input.userId,
    actorLabel: input.author,
  });
  return { guide: finished, coverage, warnings: prepared.flatMap((p) => p.warnings) };
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
}
