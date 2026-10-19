/** Scales and labels for the insights charts (src/components/insights/Charts.tsx). */

/** A round step near `raw`: 1, 2, 2.5 or 5 times a power of ten. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * power;
}

/**
 * Ticks from 0 to a round maximum at or above `max`, about `count` steps apart. Counts (integer
 * data) never get fractional steps.
 */
export function niceTicks(max: number, count = 4, opts: { integer?: boolean } = {}): number[] {
  const top = max > 0 && Number.isFinite(max) ? max : 1;
  let step = niceStep(top / count);
  if (opts.integer) step = Math.max(1, Math.ceil(step));
  const n = Math.max(1, Math.ceil(top / step - 1e-9));
  return Array.from({ length: n + 1 }, (_, i) => round(i * step));
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** 1200 → "1.2K", 3 → "3", 2.5 → "2.5". */
export function compactNumber(n: number): string {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/**
 * Which of `count` x positions get a label so that labels are at least `minGap` positions apart.
 * The last position is always labelled; the first is labelled when it does not crowd the last.
 */
export function labelEvery(count: number, minGap: number): Set<number> {
  const out = new Set<number>();
  if (count <= 0) return out;
  const gap = Math.max(1, Math.ceil(minGap));
  for (let i = count - 1; i >= 0; i -= gap) out.add(i);
  return out;
}

/** Rough width of a line of 11px interface text, for sizing tooltips in SVG. */
export function textWidth(text: string, px = 11): number {
  return Math.ceil(text.length * px * 0.56);
}
