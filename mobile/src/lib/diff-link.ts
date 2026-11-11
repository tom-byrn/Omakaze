/** `diff:path#L10-L24` / `diff:path#old:L5` (docs/mcp.md, "diff: links"). */
export type DiffLink = { path: string; start: number | null; end: number | null; side: 'new' | 'old' };

export function parseDiffLink(href: string): DiffLink | null {
  if (!href.startsWith('diff:')) return null;
  let raw = href.slice(5);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep as written
  }
  const m = /^(.*?)(?:#(old:|new:)?L?(\d+)(?:-L?(\d+))?)?$/.exec(raw);
  if (!m || !m[1]) return null;
  const start = m[3] ? Number(m[3]) : null;
  return { path: m[1], start, end: m[4] ? Number(m[4]) : start, side: m[2] === 'old:' ? 'old' : 'new' };
}
