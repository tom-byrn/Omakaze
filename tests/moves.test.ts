import { describe, expect, it } from "vitest";
import { detectMoves } from "@/lib/diff/moves";
import { parseGitDiff } from "@/lib/diff/parse";

const CONVERT = ["  fn convert(&self, input: Response) -> Output {", "    let result = self.inner.transform(input);", "    result.into()", "  }"];

describe("detectMoves", () => {
  it("links a block deleted in one file and added in another", () => {
    const files = parseGitDiff(
      [
        "diff --git a/src/conversions.rs b/src/conversions.rs",
        "@@ -1,6 +1,2 @@",
        " impl ResponseConverter {",
        ...CONVERT.map((l) => `-${l}`),
        " }",
        "diff --git a/src/utils.rs b/src/utils.rs",
        "@@ -1,2 +1,6 @@",
        " mod helpers {",
        ...CONVERT.map((l) => `+${l}`),
        " }",
      ].join("\n"),
    );
    const moves = detectMoves(files);
    expect(moves.get("src/utils.rs")).toEqual([
      { kind: "moved", side: "new", start: 2, end: 5, other: { path: "src/conversions.rs", side: "old", start: 2, end: 5 } },
    ]);
    expect(moves.get("src/conversions.rs")).toEqual([
      { kind: "moved", side: "old", start: 2, end: 5, other: { path: "src/utils.rs", side: "new", start: 2, end: 5 } },
    ]);
  });

  it("ignores indentation and trims blank lines at the ends of a block", () => {
    const files = parseGitDiff(
      [
        "diff --git a/a.ts b/a.ts",
        "@@ -1,5 +1,1 @@",
        " keep();",
        ...CONVERT.map((l) => `-${l}`),
        "diff --git a/b.ts b/b.ts",
        "@@ -1,1 +1,7 @@",
        " other();",
        "+",
        ...CONVERT.map((l) => `+        ${l.trim()}`),
        "+",
      ].join("\n"),
    );
    expect(detectMoves(files).get("b.ts")?.[0]).toMatchObject({ kind: "moved", start: 3, end: 6, other: { path: "a.ts", start: 2, end: 5 } });
  });

  it("reports a copy when the original lines stay, using base contents", () => {
    const base = ["// header", ...CONVERT, "// footer"];
    const files = parseGitDiff(
      [
        "diff --git a/lib.rs b/lib.rs",
        "@@ -6,1 +6,2 @@",
        " // footer",
        "+// new",
        "diff --git a/copy.rs b/copy.rs",
        "new file mode 100644",
        "@@ -0,0 +1,4 @@",
        ...CONVERT.map((l) => `+${l}`),
      ].join("\n"),
    );
    const moves = detectMoves(files, new Map([["lib.rs", base]]));
    expect(moves.get("copy.rs")).toEqual([
      { kind: "copied", side: "new", start: 1, end: 4, other: { path: "lib.rs", side: "old", start: 2, end: 5 } },
    ]);
    // Copies leave the source untouched, so nothing is marked there.
    expect(moves.get("lib.rs")).toBeUndefined();
  });

  it("skips short or trivial blocks and edits within one hunk", () => {
    const files = parseGitDiff(
      [
        "diff --git a/a.ts b/a.ts",
        "@@ -1,7 +1,7 @@",
        "-  }",
        "-}",
        "-x();",
        ...CONVERT.map((l) => `-${l}`),
        "+  }",
        "+}",
        "+x();",
        ...CONVERT.map((l) => `+  ${l}`),
      ].join("\n"),
    );
    expect(detectMoves(files).size).toBe(0);
  });

  it("moves deleted lines to one place and counts further destinations as copies", () => {
    const files = parseGitDiff(
      [
        "diff --git a/a.ts b/a.ts",
        "@@ -1,5 +1,1 @@",
        " keep();",
        ...CONVERT.map((l) => `-${l}`),
        "diff --git a/b.ts b/b.ts",
        "@@ -1,1 +1,5 @@",
        " other();",
        ...CONVERT.map((l) => `+${l}`),
        "diff --git a/c.ts b/c.ts",
        "@@ -1,1 +1,5 @@",
        " third();",
        ...CONVERT.map((l) => `+${l}`),
      ].join("\n"),
    );
    const moves = detectMoves(files);
    expect(moves.get("b.ts")?.[0].kind).toBe("moved");
    expect(moves.get("c.ts")?.[0].kind).toBe("copied");
    expect(moves.get("a.ts")).toHaveLength(1);
  });
});
