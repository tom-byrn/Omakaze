import { describe, expect, it } from "vitest";
import { blocksOf, buildRows, functionRange, layoutItems, rowText, selectRows } from "@/components/guide/diff-model";
import type { FileView } from "@/lib/diff/fileview";
import type { Tok } from "@/lib/diff/highlight";

const tok = (s: string): Tok[] => [[s, 0]];

// New file (after change), 12 lines. Line 6 changed from "  return a + b;" to two lines.
const NEW = [
  "import x from 'x';",
  "",
  "export function add(a, b) {",
  "  const sum = a + b;",
  "  if (sum > 10) {",
  "    log(sum);",
  "    return sum;",
  "  }",
  "  return sum;",
  "}",
  "",
  "export const y = 1;",
];

const view: FileView = {
  path: "src/add.ts",
  previousPath: null,
  status: "modified",
  additions: 2,
  deletions: 1,
  language: "typescript",
  binary: false,
  hunks: [
    {
      index: 1,
      header: "@@ -4,4 +4,5 @@ export function add(a, b) {",
      heading: "export function add(a, b) {",
      oldStart: 4,
      oldLines: 4,
      newStart: 4,
      newLines: 5,
      lines: [
        { t: "c", o: 4, n: 4 },
        { t: "c", o: 5, n: 5 },
        { t: "d", o: 6, n: null },
        { t: "a", o: null, n: 6 },
        { t: "a", o: null, n: 7 },
        { t: "c", o: 7, n: 8 },
      ],
    },
  ],
  newFile: NEW.map(tok),
  oldLines: { 6: tok("    return sum;") },
  oldLineCount: 11,
  hunkTokens: null,
  palette: ["#000"],
};

describe("buildRows", () => {
  it("includes unchanged lines around hunks with correct old numbers", () => {
    const { rows, full } = buildRows(view);
    expect(full).toBe(true);
    expect(rows).toHaveLength(13); // 12 new lines + 1 deleted line
    expect(rows[0]).toMatchObject({ kind: "context", old: 1, new: 1, inHunk: false });
    const del = rows.find((r) => r.kind === "del")!;
    expect(del).toMatchObject({ old: 6, new: null, inHunk: true });
    expect(rowText(del)).toBe("    return sum;");
    // After the hunk the file is one line longer, so old = new - 1.
    const last = rows[rows.length - 1];
    expect(last).toMatchObject({ new: 12, old: 11, inHunk: false });
  });

  it("falls back to hunk rows when contents are missing", () => {
    const { rows, full } = buildRows({ ...view, newFile: null, hunkTokens: [view.hunks[0].lines.map(() => tok("x"))] });
    expect(full).toBe(false);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.inHunk)).toBe(true);
  });
});

describe("selectRows and layout", () => {
  it("shows hunk rows for whole-file refs and creates gaps", () => {
    const { rows, full } = buildRows(view);
    const visible = selectRows(rows, [{ path: "src/add.ts" }]);
    const items = layoutItems(rows, visible, view, full);
    expect(items[0]).toMatchObject({ type: "gap", leading: true, hidden: 3 });
    expect(items.filter((i) => i.type === "row")).toHaveLength(6);
    expect(items[items.length - 1]).toMatchObject({ type: "gap", trailing: true });
  });

  it("selects line ranges with a little context", () => {
    const { rows } = buildRows(view);
    const visible = selectRows(rows, [{ path: "src/add.ts", lines: { start: 6, end: 6 } }]);
    const shown = rows.filter((_, i) => visible[i]).map((r) => r.new ?? `o${r.old}`);
    // line 6 (added) plus the deleted line before it, and up to 3 context rows around
    expect(shown).toContain(6);
    expect(shown).toContain("o6");
    expect(blocksOf(visible)).toHaveLength(1);
  });
});

describe("functionRange", () => {
  it("expands a change to its enclosing block, then the function", () => {
    const { rows } = buildRows(view);
    const added = rows.map((r, i) => (r.kind === "add" ? i : -1)).filter((i) => i >= 0);
    const inner = functionRange(rows, added[0], added[added.length - 1])!;
    expect(rowText(rows[inner[0]])).toBe("  if (sum > 10) {");
    expect(rowText(rows[inner[1]])).toBe("  }");
    const outer = functionRange(rows, inner[0], inner[1])!;
    expect(rowText(rows[outer[0]])).toBe("export function add(a, b) {");
    expect(rowText(rows[outer[1]])).toBe("}");
  });

  it("returns null at the top level", () => {
    const { rows } = buildRows(view);
    const idx = rows.findIndex((r) => r.new === 12);
    expect(functionRange(rows, idx, idx)).toBeNull();
  });
});
