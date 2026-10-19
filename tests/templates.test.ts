import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AiConfig } from "@/lib/ai/config";
import { systemPrompt } from "@/lib/ai/generate";
import { generateJson } from "@/lib/ai/providers";
import {
  describeOutline,
  missingMessage,
  missingRequired,
  missingSections,
  outlineSchema,
  parseOutline,
  placeholderFor,
  resolveTemplate,
  STARTER_TEMPLATES,
  starterTemplate,
  templatePrompt,
  templateSectionFor,
  titleMatches,
  type ResolvedTemplate,
  type TemplateOutline,
} from "@/lib/guides/templates";

const feature = starterTemplate("feature")!;
const migration: TemplateOutline = { name: "Migration", sections: starterTemplate("migration")!.sections };

describe("resolveTemplate", () => {
  it("uses the workspace outline and instructions", () => {
    const t = resolveTemplate({ guideTemplate: feature, aiInstructions: "Write in British English." }, null);
    expect(t).toMatchObject({ name: "Feature", source: "workspace", instructions: "Write in British English." });
    expect(t!.sections.map((s) => s.title)).toEqual(["Data model", "Core logic", "API and UI", "Tests", "Rollout"]);
  });

  it("lets a repository replace the outline and add instructions after the workspace's", () => {
    const t = resolveTemplate(
      { guideTemplate: feature, aiInstructions: "Write in British English." },
      { guideTemplate: { outline: migration, instructions: "Name the affected tables." } },
    );
    expect(t).toMatchObject({ name: "Migration", source: "repository" });
    expect(t!.sections[0].title).toBe("Schema changes");
    expect(t!.instructions).toBe("Write in British English.\n\nName the affected tables.");
  });

  it("keeps the workspace outline when a repository only adds instructions", () => {
    const t = resolveTemplate({ guideTemplate: feature, aiInstructions: null }, { guideTemplate: { outline: null, instructions: "Mention Terraform modules." } });
    expect(t).toMatchObject({ name: "Feature", source: "workspace", instructions: "Mention Terraform modules." });
  });

  it("treats a repository outline without sections as none", () => {
    const t = resolveTemplate({ guideTemplate: feature, aiInstructions: "Be brief." }, { guideTemplate: { outline: { name: "", sections: [] }, instructions: "" } });
    expect(t).toEqual({ name: null, source: "repository", sections: [], instructions: "Be brief." });
  });

  it("returns null without an outline or instructions, and ignores data that does not parse", () => {
    expect(resolveTemplate({ guideTemplate: null, aiInstructions: null }, null)).toBeNull();
    expect(resolveTemplate({ guideTemplate: null, aiInstructions: "  " }, { guideTemplate: null })).toBeNull();
    expect(resolveTemplate({ guideTemplate: { sections: "nope" }, aiInstructions: null }, { guideTemplate: { outline: 42 } })).toBeNull();
  });

  it("keeps instructions that existed before templates (ai_instructions only)", () => {
    expect(resolveTemplate({ guideTemplate: null, aiInstructions: "Always cover migrations." }, null)).toEqual({
      name: null,
      source: "workspace",
      sections: [],
      instructions: "Always cover migrations.",
    });
  });
});

describe("template validation", () => {
  it("accepts the starters", () => {
    for (const s of STARTER_TEMPLATES) {
      expect(outlineSchema.safeParse(s).success).toBe(true);
      expect(s.sections.some((x) => x.required)).toBe(true);
    }
  });

  it("rejects empty and duplicate titles and too many sections", () => {
    expect(outlineSchema.safeParse({ name: "x", sections: [{ title: " ", guidance: "", required: true }] }).success).toBe(false);
    const dup = outlineSchema.safeParse({ name: "x", sections: [{ title: "Tests" }, { title: "tests!" }] });
    expect(dup.success).toBe(false);
    expect(dup.error?.issues[0].message).toContain("appears twice");
    const many = Array.from({ length: 16 }, (_, i) => ({ title: `S${i}` }));
    expect(outlineSchema.safeParse({ name: "x", sections: many }).success).toBe(false);
  });

  it("fills defaults and trims", () => {
    expect(parseOutline({ sections: [{ title: "  Fix " }] })).toEqual({ name: "", sections: [{ title: "Fix", guidance: "", required: false }] });
    expect(describeOutline(feature)).toBe("Feature · 5 sections");
    expect(describeOutline(null)).toBe("None");
  });
});

describe("missing sections", () => {
  it("matches titles ignoring case and punctuation, and as a word prefix", () => {
    expect(titleMatches("Tests", "tests")).toBe(true);
    expect(titleMatches("API and UI", "API & UI")).toBe(false);
    expect(titleMatches("Deploy and rollback", "Deploy and rollback: two steps")).toBe(true);
    expect(titleMatches("Tests", "Tests and fixtures")).toBe(true);
    expect(titleMatches("Fix", "Fixture changes")).toBe(false);
    expect(titleMatches("Tests", "Testing")).toBe(false);
  });

  it("finds required sections a guide lacks, ignoring the automatic section", () => {
    const sections = [
      { title: "Core logic", body: "How it works", refs: [] },
      { title: "Tests", body: "", refs: [], generated: true },
    ];
    expect(missingRequired(feature, sections).map((s) => s.title)).toEqual(["Tests"]);
    expect(missingSections(feature, sections).map((s) => s.title)).toEqual(["Data model", "API and UI", "Tests", "Rollout"]);
  });

  it("does not count untouched sections pre-filled by the editor", () => {
    const prefilled = feature.sections.map((s) => ({ title: s.title, body: "", refs: [] }));
    expect(missingRequired(feature, prefilled).map((s) => s.title)).toEqual(["Core logic", "Tests"]);
    prefilled[1].body = "Explained";
    prefilled[3].refs = [{ path: "tests/promo.test.ts" }] as never[];
    expect(missingRequired(feature, prefilled)).toEqual([]);
  });

  it("judges plans by title alone", () => {
    expect(missingRequired(feature, [{ title: "Core logic" }, { title: "Tests" }])).toEqual([]);
    expect(missingRequired(null, [])).toEqual([]);
  });

  it("finds the template section of a guide section and its placeholder", () => {
    const t = templateSectionFor(feature, "core logic")!;
    expect(t.title).toBe("Core logic");
    expect(placeholderFor(t)).toBe("Required. The main behaviour change and the decisions behind it. Call out edge cases.");
    expect(templateSectionFor(feature, "Something else")).toBeNull();
  });
});

const resolved: ResolvedTemplate = { name: "Feature", source: "repository", sections: feature.sections, instructions: "Write in British English." };

describe("template text for writers", () => {
  it("lists the sections in order with what is required", () => {
    const text = templatePrompt(resolved);
    expect(text).toContain('Guide template "Feature" (set for this repository):');
    expect(text).toContain("1. Data model (optional): Schema changes");
    expect(text).toContain("4. Tests (required): What is tested");
    expect(text).toContain("Writing instructions:\nWrite in British English.");
    expect(templatePrompt(null)).toBe("");
    expect(templatePrompt({ name: null, source: "workspace", sections: [], instructions: "Be brief." })).toBe("Writing instructions:\nBe brief.");
  });

  it("explains what is missing", () => {
    expect(missingMessage(resolved, [{ title: "Core logic" }, { title: "Tests" }])).toBeNull();
    const msg = missingMessage(resolved, [{ title: "Core logic" }]);
    expect(msg).toContain('required section of the "Feature" template: "Tests" (What is tested and how');
  });

  it("goes into the built-in AI's system prompt, replacing the old instructions block", () => {
    const cfg: AiConfig = { provider: "ollama", model: "m", apiKey: null, baseUrl: "http://x", instructions: "Old instructions", source: "workspace" };
    const withTemplate = systemPrompt(cfg, resolved);
    expect(withTemplate).toContain("4. Tests (required)");
    expect(withTemplate).not.toContain("Old instructions");
    // Guides started before templates existed keep the configured instructions.
    expect(systemPrompt(cfg, null)).toContain("Additional instructions from this workspace:\nOld instructions");
  });
});

/* generateJson's soft check ------------------------------------------ */

const mock = vi.hoisted(() => ({ model: null as unknown }));
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: () => ({ chatModel: () => mock.model }),
}));

const cfg: AiConfig = { provider: "ollama", model: "qwen3:8b", apiKey: null, baseUrl: "http://localhost:11434/v1", instructions: null, source: "workspace" };
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };

function reply(text: string) {
  return {
    stream: convertArrayToReadableStream([
      { type: "stream-start" as const, warnings: [] },
      { type: "text-start" as const, id: "t" },
      { type: "text-delta" as const, id: "t", delta: text },
      { type: "text-end" as const, id: "t" },
      { type: "finish" as const, finishReason: { unified: "stop" as const, raw: "stop" }, usage },
    ]),
  };
}

const sectionsRequest = {
  system: "s",
  user: "Write the guide.",
  schema: z.object({ sections: z.array(z.object({ title: z.string() })) }),
  jsonSchema: { type: "object" },
  schemaName: "guide",
  check: (v: { sections: { title: string }[] }) => missingMessage(resolved, v.sections),
};

describe("generateJson with a template check", () => {
  beforeEach(() => {
    mock.model = null;
  });

  it("asks once more with what is missing and uses the second answer", async () => {
    const answers = ['{"sections":[{"title":"Core logic"}]}', '{"sections":[{"title":"Core logic"},{"title":"Tests"}]}'];
    const model = new MockLanguageModelV4({ doStream: async () => reply(answers.shift()!) });
    mock.model = model;
    const result = await generateJson(cfg, sectionsRequest);
    expect(result.sections.map((s) => s.title)).toEqual(["Core logic", "Tests"]);
    expect(model.doStreamCalls).toHaveLength(2);
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain('\\"Tests\\"');
  });

  it("accepts the second answer even if it still misses sections, and does not ask a third time", async () => {
    const model = new MockLanguageModelV4({ doStream: async () => reply('{"sections":[{"title":"Core logic"}]}') });
    mock.model = model;
    await expect(generateJson(cfg, sectionsRequest)).resolves.toEqual({ sections: [{ title: "Core logic" }] });
    expect(model.doStreamCalls).toHaveLength(2);
  });

  it("falls back to the first answer when the second is unusable", async () => {
    const answers = ['{"sections":[{"title":"Core logic"}]}', "not json"];
    mock.model = new MockLanguageModelV4({ doStream: async () => reply(answers.shift()!) });
    await expect(generateJson(cfg, sectionsRequest)).resolves.toEqual({ sections: [{ title: "Core logic" }] });
  });

  it("makes one request when nothing is missing", async () => {
    const model = new MockLanguageModelV4({ doStream: async () => reply('{"sections":[{"title":"Core logic"},{"title":"Tests"}]}') });
    mock.model = model;
    await generateJson(cfg, sectionsRequest);
    expect(model.doStreamCalls).toHaveLength(1);
  });
});
