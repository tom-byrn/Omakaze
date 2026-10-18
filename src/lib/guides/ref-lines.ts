import { formatRef, normalizeRef, type RefInput, type SectionRef } from "./refs";

const EXPAND_SUFFIX = /\s\+(function|file)$/;

/**
 * Editor format: one ref per line, an optional " +function" or " +file" to expand the context,
 * and an optional caption after " | ". For example: `src/a.ts#2 +function | Validation`.
 */
export function parseRefLines(text: string): RefInput[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [refPart, ...noteParts] = line.split(" | ");
      let spec = refPart.trim();
      let expand: SectionRef["expand"];
      const m = EXPAND_SUFFIX.exec(spec);
      if (m) {
        expand = m[1] as "function" | "file";
        spec = spec.slice(0, m.index).trim();
      }
      const ref = normalizeRef(spec);
      const note = noteParts.join(" | ").trim();
      return { ...ref, ...(expand ? { expand } : {}), ...(note ? { note } : {}) };
    });
}

export function formatRefLine(ref: SectionRef): string {
  const expand = ref.expand && ref.expand !== "none" ? ` +${ref.expand}` : "";
  return `${formatRef(ref)}${expand}${ref.note ? ` | ${ref.note}` : ""}`;
}

export function formatRefLines(refs: SectionRef[]): string {
  return refs.map(formatRefLine).join("\n");
}
