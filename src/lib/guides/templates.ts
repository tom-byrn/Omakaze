import { z } from "zod";

/**
 * Guide templates: an ordered outline of sections plus free-text writing instructions. The outline
 * is set on the workspace and can be overridden per repository. The workspace's writing
 * instructions are `workspaces.ai_instructions` (they predate templates); a repository adds its own
 * after them. Kept free of database imports so it can be unit tested.
 */

export type TemplateSection = {
  title: string;
  /** What belongs in the section. Shown to writers and as placeholder text in the editor. */
  guidance: string;
  required: boolean;
};

/** `workspaces.guide_template`. null means no outline. */
export type TemplateOutline = { name: string; sections: TemplateSection[] };

/**
 * `repositories.guide_template`; null means nothing is set. `outline` null keeps the workspace
 * outline, and an outline without sections means none for this repository. `instructions` are added
 * after the workspace's.
 */
export type RepoTemplate = { outline: TemplateOutline | null; instructions: string };

/** The template in effect for one repository. Stored on each guide (`guides.template`) when it is started. */
export type ResolvedTemplate = {
  /** Name of the outline, or null when there is none (instructions only). */
  name: string | null;
  source: "workspace" | "repository";
  sections: TemplateSection[];
  instructions: string;
};

export const MAX_TEMPLATE_SECTIONS = 15;
export const MAX_INSTRUCTIONS = 4000;

/* ------------------------------------------------------------------ */
/* Starter templates                                                   */
/* ------------------------------------------------------------------ */

export type StarterTemplate = TemplateOutline & { id: "feature" | "bugfix" | "migration"; description: string };

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "feature",
    name: "Feature",
    description: "New behaviour, from the data model to the interface.",
    sections: [
      { title: "Data model", guidance: "Schema changes, migrations and new types. Say how existing rows are handled.", required: false },
      { title: "Core logic", guidance: "The main behaviour change and the decisions behind it. Call out edge cases.", required: true },
      { title: "API and UI", guidance: "Endpoints, server actions and interface changes. Add screenshots for visible changes.", required: false },
      { title: "Tests", guidance: "What is tested and how, and what is not covered.", required: true },
      { title: "Rollout", guidance: "Configuration, feature flags, docs, and how to turn the feature off.", required: false },
    ],
  },
  {
    id: "bugfix",
    name: "Bug fix",
    description: "What was broken, why, and how the fix is proven.",
    sections: [
      { title: "The bug", guidance: "Symptoms, how to reproduce it, and who or what was affected.", required: true },
      { title: "Root cause", guidance: "Why it happened, with diff: links to the faulty code.", required: true },
      { title: "Fix", guidance: "What changed and why it fixes the bug without side effects.", required: true },
      { title: "Regression test", guidance: "The test that fails without the fix.", required: true },
      { title: "Similar code", guidance: "Other places that could have the same bug, and whether they were checked.", required: false },
    ],
  },
  {
    id: "migration",
    name: "Migration",
    description: "Schema and data changes that need a careful deploy.",
    sections: [
      { title: "Schema changes", guidance: "Tables, columns, indexes and constraints that are added, changed or dropped.", required: true },
      { title: "Data backfill", guidance: "How existing rows are migrated, in what batches, and how long it takes.", required: false },
      { title: "Code changes", guidance: "Reads and writes that use the new schema, and how old and new code run side by side during the deploy.", required: true },
      { title: "Deploy and rollback", guidance: "Order of the deploy steps, locks taken, and how to roll back.", required: true },
      { title: "Tests", guidance: "How the migration was tested, for example against a copy of production data.", required: false },
    ],
  },
];

export function starterTemplate(id: string): StarterTemplate | null {
  return STARTER_TEMPLATES.find((t) => t.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const sectionSchema = z.object({
  title: z.string().trim().min(1, "Every section needs a title.").max(80, "Section titles can have up to 80 characters."),
  guidance: z.string().trim().max(500, "Guidance can have up to 500 characters.").default(""),
  required: z.boolean().default(false),
});

export const outlineSchema = z
  .object({
    name: z.string().trim().max(60, "The name can have up to 60 characters.").default(""),
    sections: z.array(sectionSchema).max(MAX_TEMPLATE_SECTIONS, `A template can have up to ${MAX_TEMPLATE_SECTIONS} sections.`),
  })
  .superRefine((t, ctx) => {
    const seen = new Set<string>();
    for (const s of t.sections) {
      const key = normalizeTitle(s.title);
      if (seen.has(key)) ctx.addIssue({ code: "custom", message: `"${s.title}" appears twice. Section titles must be different.` });
      seen.add(key);
    }
  });

/** Read a stored outline defensively: anything that does not parse counts as no outline. */
export function parseOutline(value: unknown): TemplateOutline | null {
  const parsed = outlineSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseRepoTemplate(value: unknown): RepoTemplate | null {
  if (!value || typeof value !== "object") return null;
  const { outline, instructions } = value as { outline?: unknown; instructions?: unknown };
  return {
    outline: outline ? parseOutline(outline) : null,
    instructions: typeof instructions === "string" ? instructions.slice(0, MAX_INSTRUCTIONS) : "",
  };
}

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

/**
 * The template for a repository: its own outline if it has one, otherwise the workspace's. The
 * workspace's instructions always apply; a repository's instructions are added after them.
 * Returns null when there is neither an outline nor instructions.
 */
export function resolveTemplate(
  ws: { guideTemplate: unknown; aiInstructions: string | null },
  repo: { guideTemplate: unknown } | null,
): ResolvedTemplate | null {
  const own = repo ? parseRepoTemplate(repo.guideTemplate) : null;
  const outline = own?.outline ?? parseOutline(ws.guideTemplate);
  const instructions = [ws.aiInstructions, own?.instructions]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join("\n\n");
  const sections = outline?.sections ?? [];
  if (sections.length === 0 && !instructions) return null;
  return {
    name: sections.length > 0 ? outline!.name || "Custom" : null,
    source: own?.outline ? "repository" : "workspace",
    sections,
    instructions,
  };
}

/** Short label for settings pages, e.g. "Feature · 5 sections". */
export function describeOutline(outline: TemplateOutline | null): string {
  if (!outline || outline.sections.length === 0) return "None";
  const n = outline.sections.length;
  return `${outline.name || "Custom"} · ${n} section${n === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------ */
/* Matching sections                                                   */
/* ------------------------------------------------------------------ */

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A guide section belongs to a template section when its title is the same, ignoring case and
 * punctuation, or starts with it as whole words ("Tests" matches "Tests and fixtures").
 */
export function titleMatches(templateTitle: string, sectionTitle: string): boolean {
  const t = normalizeTitle(templateTitle);
  const s = normalizeTitle(sectionTitle);
  return t.length > 0 && (s === t || s.startsWith(`${t} `));
}

export type SectionLike = { title: string; body?: string; refs?: unknown[]; generated?: boolean };

/**
 * Template sections with no matching guide section. When `body` is given, a section only counts
 * once it has a body or refs, so an untouched section pre-filled by the editor is still missing.
 * The automatic "Other changes" section never counts.
 */
export function missingSections(template: { sections: TemplateSection[] } | null, sections: SectionLike[]): TemplateSection[] {
  if (!template) return [];
  const present = sections.filter((s) => !s.generated && (s.body === undefined || s.body.trim() !== "" || (s.refs?.length ?? 0) > 0));
  return template.sections.filter((t) => !present.some((s) => titleMatches(t.title, s.title)));
}

export function missingRequired(template: { sections: TemplateSection[] } | null, sections: SectionLike[]): TemplateSection[] {
  return missingSections(template, sections).filter((s) => s.required);
}

/** The template section a guide section was written for, if any. */
export function templateSectionFor(template: { sections: TemplateSection[] } | null, title: string): TemplateSection | null {
  return template?.sections.find((t) => titleMatches(t.title, title)) ?? null;
}

/** Editor placeholder for a section body. */
export function placeholderFor(section: TemplateSection): string {
  return `${section.required ? "Required." : "Optional."} ${section.guidance || `What belongs in "${section.title}".`}`;
}

/* ------------------------------------------------------------------ */
/* Text for writers                                                    */
/* ------------------------------------------------------------------ */

export function quoteTitles(sections: TemplateSection[]): string {
  return sections.map((s) => `"${s.title}"`).join(", ");
}

/** The template as it is given to the built-in AI and to agents over MCP. Empty without a template. */
export function templatePrompt(t: ResolvedTemplate | null): string {
  if (!t) return "";
  const parts: string[] = [];
  if (t.sections.length > 0) {
    parts.push(
      [
        `Guide template "${t.name}" (${t.source === "repository" ? "set for this repository" : "workspace default"}):`,
        "Use these sections in this order where they apply, with exactly these titles. Required sections must be in every guide; leave out optional ones that do not apply. Add other sections where the pull request needs them. The template takes precedence over the general advice on section order.",
        ...t.sections.map((s, i) => `${i + 1}. ${s.title} (${s.required ? "required" : "optional"})${s.guidance ? `: ${s.guidance}` : ""}`),
      ].join("\n"),
    );
  }
  if (t.instructions) parts.push(`Writing instructions:\n${t.instructions}`);
  return parts.join("\n\n");
}

/** Feedback for a writer whose guide lacks required sections. Null when nothing is missing. */
export function missingMessage(t: ResolvedTemplate | null, sections: SectionLike[]): string | null {
  const missing = missingRequired(t, sections);
  if (!t || missing.length === 0) return null;
  return `The guide is missing ${missing.length === 1 ? "a required section" : "required sections"} of the "${t.name}" template: ${missing
    .map((s) => `"${s.title}"${s.guidance ? ` (${s.guidance})` : ""}`)
    .join("; ")}. Add ${missing.length === 1 ? "it" : "them"} with exactly ${missing.length === 1 ? "this title" : "these titles"}, in template order.`;
}
