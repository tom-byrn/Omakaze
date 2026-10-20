import { describe, expect, it } from "vitest";
import { parseFiles } from "@/lib/diff/parse";
import type { DiffFile } from "@/lib/diff/types";
import {
  assetIdOf,
  coverageSentences,
  coverageSummary,
  diffExcerpt,
  excerptPatch,
  exportFilename,
  guideMarkdown,
  headingSlug,
  imageAssetIds,
  rewriteUrls,
  shiftHeadings,
  type ExportInput,
} from "@/lib/guides/export";

const files = parseFiles([
  {
    path: "src/api.ts",
    status: "modified",
    additions: 3,
    deletions: 1,
    patch: `@@ -10,6 +10,7 @@ export function handler() {
 a();
 b();
 c();
-d();
+d2();
+d3();
 e();
 f();
@@ -40,2 +41,3 @@ function other() {
 x();
+y();
 z();`,
  },
  {
    path: "src/new.ts",
    status: "added",
    additions: 3,
    deletions: 0,
    patch: "@@ -0,0 +1,3 @@\n+one\n+two\n+three\n\\ No newline at end of file",
  },
  { path: "src/old.ts", previousPath: null, status: "removed", additions: 0, deletions: 2, patch: "@@ -1,2 +0,0 @@\n-gone\n-too" },
  { path: "src/b.ts", previousPath: "src/a.ts", status: "renamed", additions: 0, deletions: 0, patch: null },
  { path: "logo.png", status: "added", additions: 0, deletions: 0, patch: null },
] satisfies DiffFile[]);

const file = (path: string) => files.find((f) => f.path === path)!;

describe("diffExcerpt", () => {
  it("takes whole files and hunks", () => {
    const whole = diffExcerpt(file("src/api.ts"), [{ path: "src/api.ts" }]);
    expect(whole.runs.map((r) => r.header)).toEqual(["@@ -10,6 +10,7 @@ export function handler() {", "@@ -40,2 +41,3 @@ function other() {"]);
    expect([whole.additions, whole.deletions]).toEqual([3, 1]);

    const second = diffExcerpt(file("src/api.ts"), [{ path: "src/api.ts", hunks: [2] }]);
    expect(second.runs).toHaveLength(1);
    expect(second.runs[0].lines.map((l) => l.content)).toEqual(["x();", "y();", "z();"]);
    expect([second.additions, second.deletions]).toEqual([1, 0]);
  });

  it("cuts line ranges out of a hunk with a little context and a recomputed header", () => {
    const ex = diffExcerpt(file("src/api.ts"), [{ path: "src/api.ts", lines: { start: 13, end: 14 }, note: "The new calls" }]);
    expect(ex.runs).toHaveLength(1);
    // d2/d3 are new lines 13-14; d() sits between 12 and 13, so it is selected too. Three unchanged lines around.
    expect(ex.runs[0].lines.map((l) => l.content)).toEqual(["a();", "b();", "c();", "d();", "d2();", "d3();", "e();", "f();"]);
    expect(ex.notes).toEqual(["The new calls"]);

    const narrow = diffExcerpt(file("src/api.ts"), [{ path: "src/api.ts", lines: { start: 14, end: 14 } }]);
    expect(narrow.runs[0].header).toBe("@@ -14,2 +14,3 @@ export function handler() {");
    expect(narrow.runs[0].lines.map((l) => `${l.type}:${l.content}`)).toEqual(["add:d3();", "context:e();", "context:f();"]);
    expect([narrow.additions, narrow.deletions]).toEqual([1, 0]);
  });

  it("names the line before an empty side, as git does", () => {
    const ex = diffExcerpt(file("src/api.ts"), [{ path: "src/api.ts", lines: { start: 42, end: 42 } }]);
    expect(ex.runs[0].header).toBe("@@ -40,2 +41,3 @@ function other() {");
    const added = diffExcerpt(file("src/new.ts"), [{ path: "src/new.ts", lines: { start: 2, end: 2 } }]);
    expect(added.runs[0].header).toBe("@@ -0,0 +2 @@");
  });

  it("reports line ranges outside the diff", () => {
    const ex = diffExcerpt(file("src/api.ts"), [{ path: "src/api.ts", lines: { start: 100, end: 120 } }]);
    expect(ex.runs).toHaveLength(0);
    expect(ex.outside).toEqual([{ start: 100, end: 120, side: "new" }]);
  });
});

describe("excerptPatch", () => {
  it("writes file headers for added, removed and renamed files", () => {
    const added = excerptPatch(file("src/new.ts"), diffExcerpt(file("src/new.ts"), [{ path: "src/new.ts" }]));
    expect(added).toBe("--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1,3 @@\n+one\n+two\n+three\n\\ No newline at end of file");
    const removed = excerptPatch(file("src/old.ts"), diffExcerpt(file("src/old.ts"), [{ path: "src/old.ts" }]));
    expect(removed.split("\n").slice(0, 3)).toEqual(["--- a/src/old.ts", "+++ /dev/null", "@@ -1,2 +0,0 @@"]);
    expect(excerptPatch(file("src/b.ts"), { runs: [] })).toBe("--- a/src/a.ts\n+++ b/src/b.ts");
  });
});

const ctx = { guideUrl: "https://omk.example/w/acme/acme/web/pull/7?v=2", appUrl: "https://omk.example" };

describe("rewriteUrls", () => {
  const absolute = (md: string) => rewriteUrls(md, (url) => new URL(url, ctx.guideUrl).toString());

  it("resolves relative links and images", () => {
    expect(absolute("See ![chart](/api/assets/abc/chart.png) and [notes](notes.md).")).toBe(
      "See ![chart](https://omk.example/api/assets/abc/chart.png) and [notes](https://omk.example/w/acme/acme/web/pull/notes.md).",
    );
    expect(absolute('[x](<a b.png> "Title")')).toBe('[x](<https://omk.example/w/acme/acme/web/pull/a%20b.png> "Title")');
    expect(absolute("[ref]: /docs/ref.md")).toBe("[ref]: https://omk.example/docs/ref.md");
    expect(absolute('<img src="/a.png" width="200"> <video src=\'/b.mp4\' poster="/c.png"></video>')).toBe(
      '<img src="https://omk.example/a.png" width="200"> <video src=\'https://omk.example/b.mp4\' poster="https://omk.example/c.png"></video>',
    );
  });

  it("tells images from links", () => {
    const kinds: string[] = [];
    rewriteUrls('[![badge](/b.svg)](/target) ![a](/a.png) [`code`](/c) <img src="/i.png"> <a href="/h">h</a> <video src="/v.mp4">', (url, kind) => {
      kinds.push(`${kind}:${url}`);
      return url;
    });
    expect(kinds.sort()).toEqual(["image:/a.png", "image:/b.svg", "image:/i.png", "link:/c", "link:/h", "link:/target", "media:/v.mp4"].sort());
  });

  it("leaves code, Mermaid and math alone", () => {
    const md = [
      "Use `[x](/not-a-link)` here.",
      "```mermaid",
      "flowchart LR",
      '  a["[label](/x)"] --> b',
      "```",
      "$$",
      "f(x) = [a](b)",
      "$$",
      "Inline $$[y](/z)$$ math and \\[escaped](/e).",
      "~~~md",
      "![img](/raw.png)",
      "~~~",
      "[real](/real)",
    ].join("\n");
    const out = absolute(md);
    expect(out).toBe(md.replace("[real](/real)", "[real](https://omk.example/real)"));
  });
});

describe("shiftHeadings", () => {
  it("moves headings below the export's own levels, outside code", () => {
    expect(shiftHeadings("# Top\n\ntext\n\n## Sub\n\n```sh\n# comment\n```", 3)).toBe("### Top\n\ntext\n\n#### Sub\n\n```sh\n# comment\n```");
    expect(shiftHeadings("### Already\n#### Fine", 3)).toBe("### Already\n#### Fine");
    expect(shiftHeadings("# a\n###### deep", 3)).toBe("### a\n###### deep");
    expect(shiftHeadings("no headings", 3)).toBe("no headings");
  });
});

describe("headings and names", () => {
  it("builds GitHub-style anchors", () => {
    const seen = new Map<string, number>();
    expect(headingSlug("2. `checkPromo` rules", seen)).toBe("2-checkpromo-rules");
    expect(headingSlug("Diff", seen)).toBe("diff");
    expect(headingSlug("Diff", seen)).toBe("diff-1");
    expect(headingSlug("Ünïcode & more!")).toBe("ünïcode--more");
  });

  it("names the file after the repository, pull request and version", () => {
    expect(exportFilename("acme/storefront", 128, 2)).toBe("acme-storefront-pr128-v2.md");
  });

  it("finds this instance's uploads", () => {
    expect(assetIdOf("https://omk.example/api/assets/abc123/x.png", "https://omk.example/")).toBe("abc123");
    expect(assetIdOf("https://other.example/api/assets/abc123/x.png", "https://omk.example")).toBeNull();
    expect(imageAssetIds("![a](/api/assets/one/a.png) [b](/api/assets/two/b.png) <img src=\"https://omk.example/api/assets/three/c.png\">", ctx)).toEqual(["one", "three"]);
  });
});

describe("coverage", () => {
  it("describes what the sections cover", () => {
    const written = { title: "API", body: "", refs: [{ path: "src/api.ts" }], generated: false };
    const other = { title: "Other changes", body: "", refs: [{ path: "src/new.ts" }], generated: true };
    expect(coverageSentences(coverageSummary(files, [written, other], false))).toEqual(["Sections cover 7 of 9 changed lines (78%), 3 of them only in the automatic \"Other changes\" section.", "2 changed lines are in no section."]);
    const all = { ...other, refs: [{ path: "src/new.ts" }, { path: "src/old.ts" }] };
    expect(coverageSentences(coverageSummary(files, [written, all], true))).toEqual([
      'Sections cover all 9 changed lines, 5 of them only in the automatic "Other changes" section.',
      "GitHub listed more changed files than it returned; the guide covers the files it returned.",
    ]);
  });
});

function input(overrides: Partial<ExportInput> = {}): ExportInput {
  return {
    guide: {
      title: "Add the *handler*",
      version: 2,
      status: "ready",
      summary: "# Why\n\nThe handler calls `d2()`; see [the call](diff:src/api.ts#L13-L14) and the [old one](diff:src/api.ts#old:L13).\n\n![diagram](/api/assets/img1/diagram.png)",
      headSha: "1111111aaaaaaa",
      author: "Claude Code",
      createdVia: "mcp",
      createdAt: new Date("2026-10-17T12:00:00Z"),
      template: { name: "Feature", source: "workspace", instructions: "", sections: [{ title: "Tests", guidance: "", required: true }] },
    },
    repo: { fullName: "acme/web", htmlUrl: "https://github.com/acme/web" },
    pull: { number: 7, title: "Handler", htmlUrl: "https://github.com/acme/web/pull/7", authorLogin: "octocat", headRef: "feature", baseRef: "main", headSha: "2222222bbbbbbb" },
    snapshot: { mergeBaseSha: "0000000ccccccc", truncated: false },
    files,
    sections: [
      {
        title: "The handler",
        body: "## Flow\n\n```mermaid\nflowchart LR\n  a --> b\n```\n\n$$\nx = y\n$$",
        refs: [{ path: "src/api.ts", lines: { start: 13, end: 14 }, note: "New calls" }, { path: "src/b.ts" }],
        generated: false,
      },
      { title: "Other changes", body: "", refs: [{ path: "src/api.ts", hunks: [2] }, { path: "src/new.ts" }, { path: "src/old.ts" }, { path: "logo.png" }], generated: true },
    ],
    ...ctx,
    exportedAt: new Date("2026-10-19T08:00:00Z"),
    ...overrides,
  };
}

describe("guideMarkdown", () => {
  const md = guideMarkdown(input());

  it("starts with the title, the pull request and the head commit", () => {
    expect(md.startsWith("# Add the \\*handler\\*\n\nA guided walkthrough of [acme/web#7](https://github.com/acme/web/pull/7), exported from Omakaze.")).toBe(true);
    expect(md).toContain("- **Head commit:** [`1111111`](https://github.com/acme/web/commit/1111111aaaaaaa)");
    expect(md).toContain("- **Branches:** `feature` → `main`");
    expect(md).toContain("- **Guide:** version 2, ready, written by Claude Code via MCP on 2026-10-17");
    expect(md).toContain("- **Template:** Feature (workspace); missing required: Tests");
    expect(md).toContain("- **In Omakaze:** https://omk.example/w/acme/acme/web/pull/7?v=2");
    expect(md).toContain("> This guide covers [`1111111`](https://github.com/acme/web/commit/1111111aaaaaaa). The pull request now points to [`2222222`]");
  });

  it("links the contents to the headings", () => {
    expect(md).toContain("## Contents\n\n- [Overview](#overview)\n- [1. The handler](#1-the-handler)\n- [2. Other changes](#2-other-changes)\n- [Coverage](#coverage)");
    expect(md).toContain("\n## 1. The handler\n");
  });

  it("makes links work outside Omakaze", () => {
    expect(md).toContain("## Overview\n\n### Why");
    expect(md).toContain("[the call](https://github.com/acme/web/blob/1111111aaaaaaa/src/api.ts#L13-L14)");
    expect(md).toContain("[old one](https://github.com/acme/web/blob/0000000ccccccc/src/api.ts#L13)");
    expect(md).toContain("![diagram](https://omk.example/api/assets/img1/diagram.png)");
    expect(md).toContain("`d2()`");
  });

  it("escapes prices but not math", () => {
    const priced = guideMarkdown(input({ sections: [{ title: "Totals", body: "A $5 fee.\n\nWhere $x$ is the rate.", refs: [], generated: false }] }));
    expect(priced).toContain(String.raw`A \$5 fee.` + "\n\nWhere $x$ is the rate.");
  });

  it("embeds images when given their data", () => {
    const embedded = guideMarkdown(input({ embeds: new Map([["img1", "data:image/png;base64,AAAA"]]) }));
    expect(embedded).toContain("![diagram](data:image/png;base64,AAAA)");
  });

  it("keeps Mermaid and math as they are and nests the body's headings", () => {
    expect(md).toContain("### Flow\n\n```mermaid\nflowchart LR\n  a --> b\n```\n\n$$\nx = y\n$$");
  });

  it("follows each section with the diff it covers", () => {
    const section = md.slice(md.indexOf("## 1. The handler"), md.indexOf("## 2. Other changes"));
    expect(section).toContain("2 files · +2 −1");
    expect(section).toContain("### Diff\n\n#### `src/api.ts`\n\nModified · +2 −1 · [View on GitHub](https://github.com/acme/web/blob/1111111aaaaaaa/src/api.ts)\n\n_New calls_");
    expect(section).toContain("```diff\n--- a/src/api.ts\n+++ b/src/api.ts\n@@ -10,6 +10,7 @@ export function handler() {\n a();\n");
    expect(section).not.toContain("y();");
    expect(section).toContain("#### `src/b.ts`\n\nRenamed · from `src/a.ts` · +0 −0");
    expect(section).toContain("Binary file or diff too large to include.");

    const other = md.slice(md.indexOf("## 2. Other changes"), md.indexOf("## Coverage"));
    expect(other).toContain("Added automatically: changes that no other section covers.");
    expect(other).toContain("@@ -40,2 +41,3 @@ function other() {\n x();\n+y();\n z();");
    expect(other).toContain("--- /dev/null\n+++ b/src/new.ts");
    expect(other).toContain("--- a/src/old.ts\n+++ /dev/null");
    expect(other).toContain("[View on GitHub](https://github.com/acme/web/blob/0000000ccccccc/src/old.ts)");
  });

  it("ends with a coverage note", () => {
    expect(md).toContain('## Coverage\n\nSections cover all 9 changed lines, 6 of them only in the automatic "Other changes" section.');
    expect(md.trimEnd().endsWith("Exported from Omakaze on 2026-10-19. Diffs are from the guide's snapshot of the pull request at [`1111111`](https://github.com/acme/web/commit/1111111aaaaaaa).")).toBe(true);
  });

  it("uses a longer fence when the diff contains one", () => {
    const md2 = guideMarkdown(
      input({
        files: parseFiles([{ path: "README.md", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1,2 @@\n # Title\n+```sh" }]),
        sections: [{ title: "Docs", body: "", refs: [{ path: "README.md" }], generated: false }],
      }),
    );
    expect(md2).toContain("````diff\n--- a/README.md\n+++ b/README.md\n@@ -1 +1,2 @@\n # Title\n+```sh\n````");
  });
});
