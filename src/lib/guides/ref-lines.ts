import { formatRef, normalizeRef, type RefInput, type SectionRef } from "./refs";

/** Editor format: one ref per line, optional caption after " | ". */
export function parseRefLines(text: string): RefInput[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [refPart, ...noteParts] = line.split(" | ");
      const ref = normalizeRef(refPart.trim());
      const note = noteParts.join(" | ").trim();
      return note ? { ...ref, note } : ref;
    });
}

export function formatRefLines(refs: SectionRef[]): string {
  return refs.map((r) => (r.note ? `${formatRef(r)} | ${r.note}` : formatRef(r))).join("\n");
}
