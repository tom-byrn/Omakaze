import { describe, expect, it } from "vitest";
import { parseFiles } from "@/lib/diff/parse";
import type { DiffFile } from "@/lib/diff/types";
import {
  computeCoverage,
  formatRef,
  normalizeRef,
  parseRefString,
  refsForUncovered,
  serializeRef,
  validateRefs,
} from "@/lib/guides/refs";

const files: DiffFile[] = [
  {
    path: "src/api.ts",
    status: "modified",
    additions: 3,
    deletions: 1,
    patch: `@@ -10,3 +10,4 @@ export function handler() {
 a();
-b();
+b2();
+b3();
 c();
@@ -40,2 +41,3 @@ function other() {
 x();
+y();
 z();`,
  },
  {
    path: "src/new.ts",
    status: "added",
    additions: 6,
    deletions: 0,
    patch: `@@ -0,0 +1,6 @@
+line1
+line2
+line3
+line4
+line5
+line6`,
  },
];
const parsed = parseFiles(files);
const known = new Set(parsed.map((f) => f.path));

describe("parseRefString", () => {
  it("parses paths, hunks and line ranges", () => {
    expect(parseRefString("src/api.ts", known)).toEqual({ path: "src/api.ts" });
    expect(parseRefString("src/api.ts#2", known)).toEqual({ path: "src/api.ts", hunks: [2] });
    expect(parseRefString("src/api.ts#1,2", known)).toEqual({ path: "src/api.ts", hunks: [1, 2] });
    expect(parseRefString("src/api.ts#1-2", known)).toEqual({ path: "src/api.ts", hunks: [1, 2] });
    expect(parseRefString("src/new.ts:2-4", known)).toEqual({ path: "src/new.ts", lines: { start: 2, end: 4, side: "new" } });
    expect(parseRefString("src/new.ts:L2-L4", known)).toEqual({ path: "src/new.ts", lines: { start: 2, end: 4, side: "new" } });
    expect(parseRefString("src/api.ts:old:11", known)).toEqual({ path: "src/api.ts", lines: { start: 11, end: 11, side: "old" } });
  });

  it("parses line ranges within hunks", () => {
    expect(parseRefString("src/api.ts#2:41-43", known)).toEqual({
      path: "src/api.ts",
      hunks: [2],
      lines: { start: 41, end: 43, side: "new" },
    });
    expect(parseRefString("src/api.ts#1:old:11", known)).toEqual({
      path: "src/api.ts",
      hunks: [1],
      lines: { start: 11, end: 11, side: "old" },
    });
  });

  it("round-trips through formatRef", () => {
    for (const s of ["src/api.ts", "src/api.ts#1,2", "src/new.ts:2-4", "src/api.ts:old:11", "src/api.ts#2:41-43"]) {
      expect(formatRef(parseRefString(s, known))).toBe(s);
    }
  });
});

describe("serializeRef", () => {
  it("uses the string form only when it is lossless", () => {
    expect(serializeRef({ path: "src/api.ts", hunks: [2] })).toBe("src/api.ts#2");
    expect(serializeRef({ path: "src/api.ts", expand: "none" })).toBe("src/api.ts");
    const rich = { path: "src/api.ts", hunks: [2], lines: { start: 41, end: 43, side: "new" as const }, note: "Retry", expand: "function" as const };
    expect(serializeRef(rich)).toEqual(rich);
    expect(normalizeRef(serializeRef(rich))).toEqual(rich);
  });
});

describe("validateRefs", () => {
  it("reports unknown files and hunks", () => {
    const problems = validateRefs(
      [normalizeRef("src/missing.ts", known), normalizeRef({ path: "src/api.ts", hunks: [3] }, known)],
      parsed,
    );
    expect(problems.map((p) => p.level)).toEqual(["error", "error"]);
    expect(problems[1].message).toContain("has 2 hunk(s)");
  });

  it("warns when a range misses every change", () => {
    const problems = validateRefs([normalizeRef("src/api.ts:100-120", known)], parsed);
    expect(problems).toHaveLength(1);
    expect(problems[0].level).toBe("warning");
  });
});

describe("computeCoverage", () => {
  it("counts covered and uncovered changed lines", () => {
    const coverage = computeCoverage(parsed, [{ refs: [normalizeRef("src/api.ts#1", known), normalizeRef("src/new.ts:1-3", known)] }]);
    expect(coverage.totalChanged).toBe(3 + 1 + 6);
    expect(coverage.coveredChanged).toBe(3 + 3);
    expect(coverage.uncovered).toEqual([
      { path: "src/api.ts", hunk: 2, start: 42, end: 42, side: "new", changedLines: 1, wholeHunk: true },
      { path: "src/new.ts", hunk: 1, start: 4, end: 6, side: "new", changedLines: 3, wholeHunk: false },
    ]);
    expect(refsForUncovered(coverage.uncovered)).toEqual([
      { path: "src/api.ts", hunks: [2] },
      { path: "src/new.ts", lines: { start: 4, end: 6, side: "new" } },
    ]);
  });

  it("treats deleted lines next to a range as covered", () => {
    // del line (old 11) sits between new lines 10 and 11
    const coverage = computeCoverage(parsed, [{ refs: [normalizeRef("src/api.ts:11-12", known)] }]);
    const apiUncovered = coverage.uncovered.filter((u) => u.path === "src/api.ts");
    expect(apiUncovered.map((u) => u.hunk)).toEqual([2]);
  });

  it("whole-file refs cover every hunk", () => {
    const coverage = computeCoverage(parsed, [{ refs: [{ path: "src/api.ts" }, { path: "src/new.ts" }] }]);
    expect(coverage.coveredChanged).toBe(coverage.totalChanged);
    expect(coverage.uncovered).toEqual([]);
  });
});
