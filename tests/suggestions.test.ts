import { describe, expect, it } from "vitest";
import {
  bodyWithoutSuggestions,
  commentedLines,
  hasSuggestion,
  insertSuggestion,
  isNoopSuggestion,
  parseSuggestions,
  suggestionBlock,
  suggestionRows,
} from "@/lib/github/suggestions";

describe("parseSuggestions", () => {
  it("keeps a body without suggestions as one markdown segment", () => {
    expect(parseSuggestions("Looks good.\n\n```ts\nconst a = 1;\n```")).toEqual([{ type: "markdown", text: "Looks good.\n\n```ts\nconst a = 1;\n```" }]);
    expect(hasSuggestion("Looks good.")).toBe(false);
  });

  it("splits text and suggestion blocks in order", () => {
    const body = "Rename it:\n\n```suggestion\nconst total = 1;\n```\n\nAnd here:\n```suggestion\na\nb\n```";
    expect(parseSuggestions(body)).toEqual([
      { type: "markdown", text: "Rename it:\n" },
      { type: "suggestion", lines: ["const total = 1;"] },
      { type: "markdown", text: "\nAnd here:" },
      { type: "suggestion", lines: ["a", "b"] },
    ]);
    expect(hasSuggestion(body)).toBe(true);
  });

  it("accepts tildes, longer fences, CRLF and surrounding spaces", () => {
    expect(parseSuggestions("~~~ suggestion \r\nx\r\n~~~")).toEqual([{ type: "suggestion", lines: ["x"] }]);
    // A longer fence can hold a ``` line, and only a fence at least as long closes it.
    expect(parseSuggestions("````suggestion\n```js\n```\n````")).toEqual([{ type: "suggestion", lines: ["```js", "```"] }]);
  });

  it("removes the opening fence's indentation from the lines", () => {
    expect(parseSuggestions("  ```suggestion\n    return a;\n  b\n  ```")).toEqual([{ type: "suggestion", lines: ["  return a;", "b"] }]);
  });

  it("treats an empty block as removing the lines", () => {
    expect(parseSuggestions("```suggestion\n```")).toEqual([{ type: "suggestion", lines: [] }]);
  });

  it("runs an unclosed block to the end", () => {
    expect(parseSuggestions("Try:\n```suggestion\nlet x = 2;")).toEqual([
      { type: "markdown", text: "Try:" },
      { type: "suggestion", lines: ["let x = 2;"] },
    ]);
  });

  it("ignores a suggestion fence inside another code block", () => {
    const body = "Write it like this:\n\n````markdown\n```suggestion\nnew line\n```\n````";
    expect(parseSuggestions(body)).toEqual([{ type: "markdown", text: body }]);
  });

  it("needs the info string to be exactly suggestion", () => {
    expect(hasSuggestion("```suggestions\nx\n```")).toBe(false);
    expect(hasSuggestion("```suggestion ts\nx\n```")).toBe(false);
  });
});

describe("suggestionBlock and insertSuggestion", () => {
  it("builds a block that parses back to the same lines", () => {
    expect(suggestionBlock(["a", "  b"])).toBe("```suggestion\na\n  b\n```");
    const tricky = ["```ts", "x", "```"];
    const block = suggestionBlock(tricky);
    expect(block.startsWith("````suggestion\n")).toBe(true);
    expect(parseSuggestions(block)).toEqual([{ type: "suggestion", lines: tricky }]);
  });

  it("inserts into an empty draft with the caret after the last line", () => {
    const { text, caret } = insertSuggestion("", { start: 0, end: 0 }, ["const a = 1;", "const b = 2;"]);
    expect(text).toBe("```suggestion\nconst a = 1;\nconst b = 2;\n```\n");
    expect(text.slice(0, caret).endsWith("const b = 2;")).toBe(true);
  });

  it("puts the block on its own lines after text", () => {
    const { text, caret } = insertSuggestion("Simpler:", { start: 8, end: 8 }, ["x"]);
    expect(text).toBe("Simpler:\n```suggestion\nx\n```\n");
    expect(text.slice(caret)).toBe("\n```\n");
  });

  it("replaces the selection and keeps the rest", () => {
    const { text } = insertSuggestion("Before\nREPLACE\nAfter", { start: 7, end: 14 }, ["y"]);
    expect(text).toBe("Before\n```suggestion\ny\n```\nAfter");
  });
});

describe("commentedLines", () => {
  const hunk = ["@@ -10,4 +10,5 @@ export function totals(lines) {", "   const sub = subtotal(lines);", "-  const tax = sub * rate;", "+  const taxable = sub - discount;", "+  const tax = taxable * rate;", "   return { sub, tax };"].join("\n");

  it("reads the commented head-side line from the hunk", () => {
    expect(commentedLines(hunk, { side: "RIGHT", line: 12 })).toEqual(["  const tax = taxable * rate;"]);
  });

  it("reads a multi-line range", () => {
    expect(commentedLines(hunk, { side: "RIGHT", line: 12, startLine: 10 })).toEqual([
      "  const sub = subtotal(lines);",
      "  const taxable = sub - discount;",
      "  const tax = taxable * rate;",
    ]);
  });

  it("reads the base side for LEFT comments", () => {
    expect(commentedLines(hunk, { side: "LEFT", line: 11 })).toEqual(["  const tax = sub * rate;"]);
  });

  it("returns null when lines are missing", () => {
    expect(commentedLines(hunk, { side: "RIGHT", line: 40 })).toBeNull();
    expect(commentedLines(hunk, { side: "RIGHT", line: 12, startLine: 2 })).toBeNull();
    expect(commentedLines(undefined, { side: "RIGHT", line: 12 })).toBeNull();
    expect(commentedLines(hunk, { side: "RIGHT", line: null })).toBeNull();
  });
});

describe("suggestionRows", () => {
  it("shows the replaced lines, then the suggested ones, numbered from the first line", () => {
    const rows = suggestionRows(["a", "b"], ["c"], 7);
    expect(rows.map((r) => [r.kind, r.text, r.number])).toEqual([
      ["del", "a", 7],
      ["del", "b", 8],
      ["add", "c", 7],
    ]);
    expect(rows.every((r) => r.change === null)).toBe(true);
  });

  it("marks the changed characters of paired lines", () => {
    const [del, add] = suggestionRows(['  expired: "This code has expired.",'], ['  expired: "This code expired.",'], 1);
    expect(del.text.slice(...del.change!)).toBe("has ");
    expect(add.change![0]).toBe(add.change![1]);
    const [d2, a2] = suggestionRows(["return a + b;"], ["return a - b;"]);
    expect(d2.text.slice(...d2.change!)).toBe("+");
    expect(a2.text.slice(...a2.change!)).toBe("-");
  });

  it("doesn't mark lines that share nothing or don't change", () => {
    expect(suggestionRows(["abc"], ["xyz"]).map((r) => r.change)).toEqual([null, null]);
    expect(suggestionRows(["same"], ["same"]).map((r) => r.change)).toEqual([null, null]);
  });

  it("shows only suggested lines when the replaced ones are unknown", () => {
    expect(suggestionRows(null, ["x"], null)).toEqual([{ kind: "add", text: "x", number: null, change: null }]);
  });
});

describe("suggestion helpers", () => {
  it("detects suggestions that change nothing", () => {
    expect(isNoopSuggestion(["a"], ["a"])).toBe(true);
    expect(isNoopSuggestion(["a"], ["a", "b"])).toBe(false);
    expect(isNoopSuggestion(null, ["a"])).toBe(false);
  });

  it("strips suggestion blocks for previews", () => {
    expect(bodyWithoutSuggestions("Nit:\n\n```suggestion\nx\n```\n\nThanks")).toBe("Nit:\n\nThanks");
    expect(bodyWithoutSuggestions("```suggestion\nx\n```")).toBe("");
  });
});
