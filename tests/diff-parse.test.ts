import { describe, expect, it } from "vitest";
import { parseGitDiff, parsePatch } from "@/lib/diff/parse";

const PATCH = `@@ -1,4 +1,5 @@ export function total(items) {
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
 const e = 6;
@@ -20,3 +21,2 @@ function tail() {
 keep();
-drop();
 end();
\\ No newline at end of file`;

describe("parsePatch", () => {
  it("parses hunks with line numbers", () => {
    const hunks = parsePatch(PATCH);
    expect(hunks).toHaveLength(2);
    const [h1, h2] = hunks;
    expect(h1).toMatchObject({ index: 1, oldStart: 1, oldLines: 4, newStart: 1, newLines: 5, heading: "export function total(items) {" });
    expect(h1.lines.map((l) => [l.type, l.oldNumber, l.newNumber])).toEqual([
      ["context", 1, 1],
      ["del", 2, null],
      ["add", null, 2],
      ["add", null, 3],
      ["context", 3, 4],
      ["context", 4, 5],
    ]);
    expect(h2.lines.map((l) => [l.type, l.oldNumber, l.newNumber])).toEqual([
      ["context", 20, 21],
      ["del", 21, null],
      ["context", 22, 22],
    ]);
    expect(h2.lines[2].noNewline).toBe(true);
  });

  it("treats lines that look like hunk headers inside a hunk as content", () => {
    const hunks = parsePatch(`@@ -0,0 +1,2 @@\n+@@ -1 +1 @@\n+second`);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines.map((l) => l.content)).toEqual(["@@ -1 +1 @@", "second"]);
  });

  it("handles single-line hunks without counts", () => {
    const hunks = parsePatch(`@@ -1 +1 @@\n-a\n+b`);
    expect(hunks[0]).toMatchObject({ oldLines: 1, newLines: 1 });
    expect(hunks[0].lines).toHaveLength(2);
  });

  it("returns no hunks for empty patches", () => {
    expect(parsePatch(null)).toEqual([]);
    expect(parsePatch("")).toEqual([]);
  });
});

describe("parseGitDiff", () => {
  it("splits multi-file diffs and detects status", () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
 one
-two
+TWO
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+hello
+world
diff --git a/old.txt b/old.txt
deleted file mode 100644
--- a/old.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
diff --git a/x.ts b/y.ts
similarity index 90%
rename from x.ts
rename to y.ts
--- a/x.ts
+++ b/y.ts
@@ -1 +1 @@
-x
+y
`;
    const files = parseGitDiff(diff);
    expect(files.map((f) => [f.path, f.status, f.additions, f.deletions])).toEqual([
      ["src/a.ts", "modified", 1, 1],
      ["src/new.ts", "added", 2, 0],
      ["old.txt", "removed", 0, 1],
      ["y.ts", "renamed", 1, 1],
    ]);
    expect(files[3].previousPath).toBe("x.ts");
  });
});
