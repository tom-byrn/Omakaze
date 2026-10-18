/**
 * Inline math uses single dollar signs, which also appear in prices ("$400 to $500").
 * Following Pandoc's rule, a `$` only opens math when a non-space character follows it and a
 * closing `$` exists that has a non-space character before it and no digit after it, in the same
 * paragraph. Other dollar signs are escaped so they render as text. Code and `$$` blocks are left alone.
 */
export function escapeCurrencyDollars(markdown: string): string {
  if (!markdown.includes("$")) return markdown;
  const lines = markdown.split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    if (paragraph.length > 0) out.push(escapeInline(paragraph.join("\n")));
    paragraph = [];
  };

  for (const line of lines) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      out.push(line);
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null;
      continue;
    }
    if (marker) {
      flush();
      fence = marker;
      out.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
      out.push(line);
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return out.join("\n");
}

function escapeInline(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      out += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === "`") {
      const run = /^`+/.exec(text.slice(i))![0];
      const end = text.indexOf(run, i + run.length);
      const stop = end === -1 ? i + run.length : end + run.length;
      out += text.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch !== "$") {
      out += ch;
      i++;
      continue;
    }
    if (text[i + 1] === "$") {
      const end = text.indexOf("$$", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(i, stop);
      i = stop;
      continue;
    }
    const close = closingDollar(text, i);
    if (close === -1) {
      out += "\\$";
      i++;
      continue;
    }
    out += text.slice(i, close + 1);
    i = close + 1;
  }
  return out;
}

function closingDollar(text: string, open: number): number {
  const first = text[open + 1];
  if (first === undefined || /\s/.test(first)) return -1;
  for (let j = open + 1; j < text.length; j++) {
    const c = text[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "`") return -1;
    if (c !== "$") continue;
    if (text[j + 1] === "$") return -1;
    if (/\s/.test(text[j - 1]) || /\d/.test(text[j + 1] ?? "")) continue;
    return j;
  }
  return -1;
}
