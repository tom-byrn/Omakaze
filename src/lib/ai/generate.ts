import { z } from "zod";
import { fileHeaderText, renderFileText, renderHunkText } from "@/lib/diff/render-text";
import type { DiffHunk, ParsedFile } from "@/lib/diff/types";
import { getRepoContext } from "@/lib/github/connections";
import { getCachedPull } from "@/lib/github/pulls";
import { GUIDE_GUIDELINES } from "@/lib/guides/guidelines";
import { formatRef, normalizeRef, refSelectsLine, type SectionRef } from "@/lib/guides/refs";
import { missingMessage, missingRequired, quoteTitles, templatePrompt, type ResolvedTemplate } from "@/lib/guides/templates";
import {
  addSection,
  appendGuideEvent,
  finishGuide,
  GuideError,
  loadParsedFiles,
  updateGuideMeta,
  type Guide,
} from "@/lib/guides/service";
import type { AiConfig } from "./config";
import { AiError, generateJson } from "./providers";

/* ------------------------------------------------------------------ */
/* Prompt rendering                                                    */
/* ------------------------------------------------------------------ */

const renderHunk = (_file: ParsedFile, hunk: DiffHunk, filter?: (lineIndex: number) => boolean) => renderHunkText(hunk, filter);
const fileHeader = fileHeaderText;
const renderFile = renderFileText;

function renderRefs(files: ParsedFile[], refs: SectionRef[], maxChars: number): string {
  const out: string[] = [];
  let used = 0;
  for (const file of files) {
    const fileRefs = refs.filter((r) => r.path === file.path);
    if (fileRefs.length === 0) continue;
    const parts = [fileHeader(file)];
    for (const h of file.hunks) {
      const selected = h.lines.map((_, i) => fileRefs.some((r) => refSelectsLine(r, file, h, i)));
      if (!selected.some(Boolean)) continue;
      parts.push(renderHunk(file, h, (i) => selected[i]));
    }
    const text = parts.join("\n");
    if (used + text.length > maxChars) {
      out.push(`${fileHeader(file)}\n(omitted for length)`);
      continue;
    }
    out.push(text);
    used += text.length;
  }
  return out.join("\n\n");
}

function prContext(pull: { title: string; body: string | null; headRef: string; baseRef: string } | null, files: ParsedFile[]) {
  const adds = files.reduce((n, f) => n + f.additions, 0);
  const dels = files.reduce((n, f) => n + f.deletions, 0);
  return [
    `Pull request: ${pull?.title ?? "(untitled)"}`,
    pull ? `Branches: ${pull.headRef} -> ${pull.baseRef}` : "",
    `Size: ${files.length} files, +${adds} -${dels}`,
    pull?.body ? `Description from the author:\n${pull.body.slice(0, 8000)}` : "Description from the author: (none)",
  ]
    .filter(Boolean)
    .join("\n");
}

export function systemPrompt(cfg: AiConfig, template: ResolvedTemplate | null): string {
  return [
    "You write guided pull request walkthroughs for code reviewers.",
    GUIDE_GUIDELINES,
    "Diff format used in this conversation: each hunk starts with '#<n> @@ ... @@'. Lines show '+<new line number> |' for additions, '-o<old line number> |' for removals and ' <new line number> |' for context. Use these numbers for line-range refs and diff: links.",
    "Output JSON only, matching the schema you are given.",
    // Guides started before templates existed carry none; their instructions come from the config.
    template ? templatePrompt(template) : cfg.instructions ? `Additional instructions from this workspace:\n${cfg.instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const sectionSchema = z.object({
  title: z.string().min(1),
  body: z.string(),
  refs: z.array(z.string()),
});
const guideSchema = z.object({
  title: z.string().min(1),
  summary: z.string(),
  sections: z.array(sectionSchema).min(1),
});
const GUIDE_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Guide title, usually close to the PR title" },
    summary: { type: "string", description: "Markdown summary shown before the first section" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string", description: "Markdown explanation" },
          refs: { type: "array", items: { type: "string" }, description: "Diff references" },
        },
        required: ["title", "body", "refs"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "summary", "sections"],
  additionalProperties: false,
};

const hunkSummarySchema = z.object({
  hunks: z.array(z.object({ id: z.string(), summary: z.string() })),
});
const HUNK_SUMMARY_JSON_SCHEMA = {
  type: "object",
  properties: {
    hunks: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, summary: { type: "string" } },
        required: ["id", "summary"],
        additionalProperties: false,
      },
    },
  },
  required: ["hunks"],
  additionalProperties: false,
};

const planSchema = z.object({
  title: z.string().min(1),
  summary: z.string(),
  sections: z.array(z.object({ title: z.string().min(1), intent: z.string(), refs: z.array(z.string()) })).min(1),
});
const PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          intent: { type: "string", description: "What this section should explain" },
          refs: { type: "array", items: { type: "string" } },
        },
        required: ["title", "intent", "refs"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "summary", "sections"],
  additionalProperties: false,
};

const bodySchema = z.object({ body: z.string() });
const BODY_JSON_SCHEMA = {
  type: "object",
  properties: { body: { type: "string" } },
  required: ["body"],
  additionalProperties: false,
};

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

function budgetFor(cfg: AiConfig): number {
  const big = cfg.provider === "anthropic" || cfg.provider === "google" || /claude|gemini/i.test(cfg.model);
  return big ? 600_000 : 240_000;
}

function cleanRefs(raw: string[], files: ParsedFile[]): { refs: SectionRef[]; dropped: string[] } {
  const known = new Set(files.map((f) => f.path));
  const byPath = new Map(files.map((f) => [f.path, f]));
  const refs: SectionRef[] = [];
  const dropped: string[] = [];
  for (const r of raw) {
    const ref = normalizeRef(r, known);
    const file = byPath.get(ref.path);
    if (!file) {
      dropped.push(r);
      continue;
    }
    if (ref.hunks) ref.hunks = ref.hunks.filter((h) => h >= 1 && h <= file.hunks.length);
    if (ref.hunks && ref.hunks.length === 0) {
      dropped.push(r);
      continue;
    }
    refs.push(ref);
  }
  return { refs, dropped };
}

async function addGeneratedSection(guide: Guide, files: ParsedFile[], title: string, body: string, rawRefs: string[]) {
  const { refs, dropped } = cleanRefs(rawRefs, files);
  if (dropped.length > 0) {
    await appendGuideEvent(guide.id, `Ignored ${dropped.length} invalid reference(s) in "${title}": ${dropped.slice(0, 5).join(", ")}`, "warn");
  }
  try {
    await addSection(guide.id, { title, body, refs: refs.map((r) => ({ ...r })) });
  } catch (err) {
    if (err instanceof GuideError) {
      await appendGuideEvent(guide.id, `Section "${title}" added without references: ${err.message}`, "warn");
      await addSection(guide.id, { title, body, refs: [] });
    } else throw err;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Generate a guide with the configured model. The guide must be in `generating` state. */
export async function generateGuideWithAi(guide: Guide, cfg: AiConfig): Promise<void> {
  const { files } = await loadParsedFiles(guide);
  const pull = await getCachedPull(guide.repositoryId, guide.prNumber);
  await getRepoContext(guide.repositoryId); // fail early if the connection is broken
  const template = guide.template;
  const system = systemPrompt(cfg, template);
  const context = prContext(pull, files);
  const budget = budgetFor(cfg);
  // Asks once more when required template sections are missing; a guide never fails for it.
  const checkTemplate = (r: { sections: { title: string }[] }) => missingMessage(template, r.sections);

  await appendGuideEvent(guide.id, `Reading ${files.length} files with ${cfg.model}`);

  if (files.length === 0) {
    await updateGuideMeta(guide.id, { summary: "This pull request has no file changes." });
    await finishGuide(guide.id, { actorLabel: cfg.model });
    return;
  }

  const fullDiff = files.map((f) => renderFile(f, budget)).join("\n\n");

  if (fullDiff.length <= budget) {
    await appendGuideEvent(guide.id, "Writing sections");
    const result = await generateJson(cfg, {
      system,
      user: `${context}\n\nDiff:\n${fullDiff}\n\nWrite the guided walkthrough for this pull request.`,
      schema: guideSchema,
      jsonSchema: GUIDE_JSON_SCHEMA,
      schemaName: "guided_pr",
      check: checkTemplate,
    });
    await updateGuideMeta(guide.id, { title: result.title, summary: result.summary });
    for (const s of result.sections) await addGeneratedSection(guide, files, s.title, s.body, s.refs);
    await noteMissingSections(guide, template, result.sections);
    await finishGuide(guide.id, { actorLabel: cfg.model });
    return;
  }

  // Large PR: summarize hunks in batches, plan sections, then write each section with its own code.
  const batches: ParsedFile[][] = [];
  let current: ParsedFile[] = [];
  let size = 0;
  const batchBudget = Math.floor(budget / 3);
  for (const f of files) {
    const len = renderFile(f, batchBudget).length;
    if (current.length > 0 && size + len > batchBudget) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(f);
    size += len;
  }
  if (current.length > 0) batches.push(current);

  await appendGuideEvent(guide.id, `Large diff: summarizing in ${batches.length} batches`);
  const summaries = (
    await mapLimit(batches, 3, async (batch, i) => {
      const res = await generateJson(cfg, {
        system,
        user: `${context}\n\nSummarize each hunk below in one sentence (what changes and why it matters). Use ids of the form "path#n".\n\n${batch.map((f) => renderFile(f, batchBudget)).join("\n\n")}`,
        schema: hunkSummarySchema,
        jsonSchema: HUNK_SUMMARY_JSON_SCHEMA,
        schemaName: "hunk_summaries",
        maxTokens: 32000,
      });
      await appendGuideEvent(guide.id, `Summarized batch ${i + 1}/${batches.length}`);
      return res.hunks;
    })
  ).flat();

  const outline = files
    .map((f) => {
      const lines = [fileHeader(f)];
      for (const h of f.hunks) {
        const id = `${f.path}#${h.index}`;
        const s = summaries.find((x) => x.id === id)?.summary ?? "";
        lines.push(`- ${id} ${h.header} ${s}`);
      }
      return lines.join("\n");
    })
    .join("\n");

  await appendGuideEvent(guide.id, "Planning sections");
  const plan = await generateJson(cfg, {
    system,
    user: `${context}\n\nChanged files and hunk summaries:\n${outline}\n\nPlan the guided walkthrough: the title, the markdown summary, and the ordered sections with the refs each one covers.`,
    schema: planSchema,
    jsonSchema: PLAN_JSON_SCHEMA,
    schemaName: "guide_plan",
    maxTokens: 32000,
    check: checkTemplate,
  });
  await updateGuideMeta(guide.id, { title: plan.title, summary: plan.summary });

  const sectionBudget = Math.floor(budget / 2);
  for (let i = 0; i < plan.sections.length; i++) {
    const s = plan.sections[i];
    await appendGuideEvent(guide.id, `Writing section ${i + 1}/${plan.sections.length}: ${s.title}`);
    const { refs } = cleanRefs(s.refs, files);
    const code = renderRefs(files, refs, sectionBudget);
    const res = await generateJson(cfg, {
      system,
      user: `${context}\n\nGuide summary:\n${plan.summary}\n\nSection ${i + 1} of ${plan.sections.length}: ${s.title}\nIntent: ${s.intent}\nRefs: ${refs.map(formatRef).join(", ")}\n\nCode in this section:\n${code}\n\nWrite the markdown body for this section.`,
      schema: bodySchema,
      jsonSchema: BODY_JSON_SCHEMA,
      schemaName: "section_body",
      maxTokens: 32000,
    });
    await addGeneratedSection(guide, files, s.title, res.body, s.refs);
  }
  await noteMissingSections(guide, template, plan.sections);
  await finishGuide(guide.id, { actorLabel: cfg.model });
}

/** Record required template sections the model left out in the guide's progress log. */
async function noteMissingSections(guide: Guide, template: ResolvedTemplate | null, sections: { title: string }[]) {
  const missing = missingRequired(template, sections);
  if (missing.length === 0) return;
  await appendGuideEvent(guide.id, `Missing required sections of the "${template!.name}" template: ${quoteTitles(missing)}`, "warn");
}

export { AiError };
