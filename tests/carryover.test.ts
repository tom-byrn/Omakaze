import { describe, expect, it } from "vitest";
import { parseFiles } from "@/lib/diff/parse";
import type { DiffFile } from "@/lib/diff/types";
import {
  interdiff,
  marksToCarry,
  matchSections,
  sameCode,
  sectionCode,
  visitSince,
  type ComparableSection,
  type VersionSide,
} from "@/lib/guides/carryover";
import { computeCoverage, normalizeRef, refsForUncovered, type SectionRef } from "@/lib/guides/refs";
import { buildDemo } from "../scripts/demo-data";

function added(path: string, lines: string[], sha = "a1"): DiffFile {
  return {
    path,
    status: "added",
    additions: lines.length,
    deletions: 0,
    sha,
    patch: `@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}`,
  };
}

const API_V1: DiffFile = {
  path: "src/api.ts",
  status: "modified",
  additions: 2,
  deletions: 1,
  patch: `@@ -10,3 +10,4 @@ export function handler() {
 a();
-b();
+b2();
+b3();
 c();`,
};

// Same change, but an unrelated edit further up shifts every line by 5.
const API_V2_SHIFTED: DiffFile = {
  ...API_V1,
  additions: 3,
  patch: `@@ -1,2 +1,3 @@
 import x;
+import y;

@@ -10,3 +15,4 @@ export function handler() {
 a();
-b();
+b2();
+b3();
 c();`,
};

const section = (id: string, title: string, refs: SectionRef[], generated = false): ComparableSection => ({ id, title, refs, generated });

const side = (files: DiffFile[], sections: ComparableSection[]): VersionSide => ({ files: parseFiles(files), sections });

describe("sectionCode and sameCode", () => {
  it("compares the selected changed lines, not their line numbers", () => {
    const v1 = sectionCode([{ path: "src/api.ts" }], parseFiles([API_V1]));
    const v2 = sectionCode([{ path: "src/api.ts", hunks: [2] }], parseFiles([API_V2_SHIFTED]));
    expect(v1.get("src/api.ts")!.lines.map((l) => `${l.type}:${l.content}:${l.line}`)).toEqual(["del:b();:11", "add:b2();:11", "add:b3();:12"]);
    expect(v2.get("src/api.ts")!.lines.map((l) => l.line)).toEqual([11, 16, 17]);
    expect(sameCode(v1, v2)).toBe(true);
    // The whole file in v2 also has the new import.
    expect(sameCode(v1, sectionCode([{ path: "src/api.ts" }], parseFiles([API_V2_SHIFTED])))).toBe(false);
  });

  it("ignores context lines", () => {
    const changedContext = { ...API_V1, patch: API_V1.patch!.replace(" a();", " a(1);") };
    expect(sameCode(sectionCode([{ path: "src/api.ts" }], parseFiles([API_V1])), sectionCode([{ path: "src/api.ts" }], parseFiles([changedContext])))).toBe(true);
  });

  it("compares files without a patch by blob sha", () => {
    const bin = (sha: string | null): DiffFile => ({ path: "logo.png", status: "added", additions: 0, deletions: 0, patch: null, sha });
    const code = (f: DiffFile) => sectionCode([{ path: "logo.png" }], parseFiles([f]));
    expect(sameCode(code(bin("s1")), code(bin("s1")))).toBe(true);
    expect(sameCode(code(bin("s1")), code(bin("s2")))).toBe(false);
    // Without a sha nothing says the content is the same.
    expect(sameCode(code(bin(null)), code(bin(null)))).toBe(false);
  });
});

describe("matchSections", () => {
  const promoV1 = added("src/promo.ts", ["export function check(p) {", "  return p.used > p.max;", "}", "export function discount(p) {", "  return p.percent;", "}"]);
  const promoV2 = added("src/promo.ts", ["// Checks the limit.", "export function check(p) {", "  return p.used >= p.max;", "}", "export function discount(p) {", "  return p.percent;", "}"]);
  const testsV1 = added("tests/promo.test.ts", ["it('checks', () => {});"]);

  const v1 = side(
    [promoV1, testsV1, API_V1],
    [
      section("a1", "Validating a code", [{ path: "src/promo.ts", lines: { start: 1, end: 3 } }, { path: "tests/promo.test.ts" }]),
      section("b1", "Discounts", [{ path: "src/promo.ts", lines: { start: 4, end: 6 } }]),
      section("c1", "Handler", [{ path: "src/api.ts" }]),
      section("o1", "Other changes", [], true),
    ],
  );
  const v2 = side(
    [promoV2, testsV1, API_V2_SHIFTED],
    [
      // Reordered, retitled and with refs on new line numbers.
      section("b2", "Discount amounts", [{ path: "src/promo.ts", lines: { start: 5, end: 7 } }]),
      section("a2", "Validating a code", [{ path: "src/promo.ts", lines: { start: 1, end: 4 } }, { path: "tests/promo.test.ts" }]),
      section("c2", "Request handler", [{ path: "src/api.ts", hunks: [2] }]),
      section("n2", "Imports", [{ path: "src/api.ts", hunks: [1] }]),
      section("o2", "Other changes", [], true),
    ],
  );

  it("pairs sections by the code they cover and says what changed", () => {
    const m = matchSections(v1, v2);
    expect(m.get("b2")).toEqual({ status: "unchanged", previousId: "b1" });
    expect(m.get("c2")).toEqual({ status: "unchanged", previousId: "c1" });
    expect(m.get("a2")).toMatchObject({ status: "changed", previousId: "a1" });
    expect(m.get("n2")).toEqual({ status: "new" });
    expect(m.get("o2")).toEqual({ status: "unchanged", previousId: "o1" });
  });

  it("matches a rewritten section by its files and title", () => {
    const before = side([added("src/x.ts", ["const a = 1;", "const b = 2;"])], [section("s1", "Constants", [{ path: "src/x.ts" }])]);
    const after = side([added("src/x.ts", ["export const alpha = 10;", "export const beta = 20;"])], [section("s2", "Constants", [{ path: "src/x.ts" }])]);
    expect(matchSections(before, after).get("s2")).toMatchObject({ status: "changed", previousId: "s1" });
    // Same file, different title, no shared lines: a different section.
    const renamed = side(after.files.map((f) => ({ ...f })), [section("s3", "Exports", [{ path: "src/x.ts" }])]);
    expect(matchSections(before, renamed).get("s3")).toEqual({ status: "new" });
  });

  it("matches sections without code by exact title only", () => {
    const before = side([], [section("t1", "Background", [])]);
    expect(matchSections(before, side([], [section("t2", "Background", [])])).get("t2")).toEqual({ status: "unchanged", previousId: "t1" });
    expect(matchSections(before, side([], [section("t3", "Context", [])])).get("t3")).toEqual({ status: "new" });
  });

  it("pairs each older section at most once", () => {
    const before = side([API_V1], [section("x1", "Handler", [{ path: "src/api.ts" }])]);
    const after = side([API_V1], [section("x2", "Handler", [{ path: "src/api.ts" }]), section("y2", "Handler again", [{ path: "src/api.ts" }])]);
    const m = matchSections(before, after);
    expect(m.get("x2")).toEqual({ status: "unchanged", previousId: "x1" });
    expect(m.get("y2")).toEqual({ status: "new" });
  });
});

describe("interdiff", () => {
  it("lists new, different and removed lines with context", () => {
    const letters = "abcdefghijkl".split("");
    const before = sectionCode([{ path: "src/promo.ts" }], parseFiles([added("src/promo.ts", letters)]));
    const after = sectionCode([{ path: "src/promo.ts" }], parseFiles([added("src/promo.ts", [...letters.slice(0, 3), "X", ...letters.slice(4), "m"])]));
    const [file] = interdiff(before, after);
    expect(file).toMatchObject({ path: "src/promo.ts", status: "changed", added: 2, removed: 1, opaque: false, truncated: false, trailing: 0 });
    expect(file.chunks).toHaveLength(2);
    expect(file.chunks[0].skipped).toBe(1);
    expect(file.chunks[0].rows.map((r) => `${r.op}:${r.content}`)).toEqual(["same:b", "same:c", "removed:d", "added:X", "same:e", "same:f"]);
    expect(file.chunks[1].skipped).toBe(4);
    expect(file.chunks[1].rows.map((r) => `${r.op}:${r.content}:${r.line}`)).toEqual(["same:k:11", "same:l:12", "added:m:13"]);
    expect(file.marks).toEqual({ add: [4, 13], del: [] });
  });

  it("marks deleted lines by their old-side number", () => {
    const before = sectionCode([{ path: "src/api.ts" }], parseFiles([API_V1]));
    const after = sectionCode([{ path: "src/api.ts" }], parseFiles([{ ...API_V1, patch: API_V1.patch!.replace(" c();", "-c();") }]));
    const [file] = interdiff(before, after);
    expect(file.marks).toEqual({ add: [], del: [12] });
  });

  it("reports files the section started or stopped covering", () => {
    const files = parseFiles([API_V1, added("src/b.ts", ["one"])]);
    const result = interdiff(sectionCode([{ path: "src/api.ts" }], files), sectionCode([{ path: "src/b.ts" }], files));
    expect(result.map((f) => [f.path, f.status, f.added, f.removed])).toEqual([
      ["src/b.ts", "added", 1, 0],
      ["src/api.ts", "removed", 0, 3],
    ]);
  });

  it("skips files whose covered lines are the same", () => {
    const files = parseFiles([API_V1, added("src/b.ts", ["one"])]);
    const result = interdiff(sectionCode([{ path: "src/api.ts" }, { path: "src/b.ts" }], files), sectionCode([{ path: "src/api.ts" }], files));
    expect(result.map((f) => f.path)).toEqual(["src/b.ts"]);
  });

  it("only says that a file without a patch changed", () => {
    const bin = (sha: string): DiffFile => ({ path: "logo.png", status: "modified", additions: 0, deletions: 0, patch: null, sha });
    const [file] = interdiff(sectionCode([{ path: "logo.png" }], parseFiles([bin("s1")])), sectionCode([{ path: "logo.png" }], parseFiles([bin("s2")])));
    expect(file).toMatchObject({ status: "changed", opaque: true, added: 0, removed: 0, chunks: [] });
  });
});

describe("marksToCarry", () => {
  it("carries marks on unchanged sections and keeps the version that was reviewed", () => {
    const matches = new Map([
      ["s2", { status: "unchanged" as const, previousId: "s1" }],
      ["t2", { status: "new" as const }],
    ]);
    const reviewedAt = new Date("2026-01-01T10:00:00Z");
    const marks = [
      { sectionId: "s1", userId: "maya", reviewedAt, carriedFromVersion: null },
      { sectionId: "s1", userId: "sam", reviewedAt, carriedFromVersion: 1 },
      { sectionId: "s1", userId: "alex", reviewedAt, carriedFromVersion: null },
      { sectionId: "u1", userId: "maya", reviewedAt, carriedFromVersion: null },
    ];
    expect(marksToCarry(matches, marks, 2, new Set(["s2:alex"]))).toEqual([
      { sectionId: "s2", userId: "maya", reviewedAt, carriedFromVersion: 2 },
      { sectionId: "s2", userId: "sam", reviewedAt, carriedFromVersion: 1 },
    ]);
  });
});

describe("the demo pull request", () => {
  it("carries the unchanged sections of #128 from version 1 to version 2", () => {
    const demo = buildDemo({ now: Date.UTC(2026, 0, 1) });
    const versions = [1, 2].map((v) => {
      const g = demo.guides.find((x) => x.pr === 128 && x.version === v)!;
      const snapshot = demo.pulls.flatMap((p) => p.snapshots).find((s) => s.headSha === g.headSha)!;
      const files = parseFiles(snapshot.files);
      const known = new Set(files.map((f) => f.path));
      const sections: ComparableSection[] = g.builtSections.map((s) => section(`${v}:${s.key}`, s.title, s.refs.map((r) => normalizeRef(r, known))));
      const coverage = computeCoverage(files, sections);
      if (coverage.uncovered.length > 0) sections.push(section(`${v}:other`, "Other changes", refsForUncovered(coverage.uncovered), true));
      return { files, sections };
    });
    const m = matchSections(versions[0], versions[1]);
    const status = Object.fromEntries([...m].map(([id, x]) => [id, x.status === "new" ? "new" : `${x.status} ${x.previousId}`]));
    expect(status).toEqual({
      "2:table": "unchanged 1:table",
      "2:validation": "changed 1:validation",
      "2:totals": "unchanged 1:totals",
      "2:checkout": "changed 1:checkout",
      "2:ui": "unchanged 1:ui",
      "2:other": "unchanged 1:other",
    });
    const validation = m.get("2:validation");
    if (validation?.status !== "changed") throw new Error("expected a change");
    const diff = interdiff(validation.previous, validation.current);
    expect(diff.map((f) => [f.path, f.added, f.removed])).toEqual([
      ["src/lib/promo.ts", 3, 2],
      ["tests/promo.test.ts", 6, 0],
    ]);
    const promo = diff[0].chunks.flatMap((c) => c.rows).filter((r) => r.op !== "same");
    expect(promo.map((r) => `${r.op} ${r.content.trim()}`)).toContain("added if (promo.maxRedemptions !== null && promo.redemptions >= promo.maxRedemptions) {");
  });
});

describe("visitSince", () => {
  const now = new Date("2026-03-01T12:00:00Z");
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);

  it("is null on the first visit", () => {
    expect(visitSince([], now)).toBeNull();
  });

  it("starts a new visit after a gap, from the latest view of any version", () => {
    expect(visitSince([{ lastViewedAt: at(3000), previousVisitAt: null }, { lastViewedAt: at(600), previousVisitAt: at(5000) }], now)).toEqual(at(600));
  });

  it("keeps the reference point while the visit lasts", () => {
    expect(visitSince([{ lastViewedAt: at(5), previousVisitAt: at(3000) }, { lastViewedAt: at(3000), previousVisitAt: null }], now)).toEqual(at(3000));
    expect(visitSince([{ lastViewedAt: at(5), previousVisitAt: null }], now)).toBeNull();
  });
});
