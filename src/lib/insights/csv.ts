/** CSV files for the insights panels (RFC 4180, with a guard against spreadsheet formulas). */

export type CsvCell = string | number | boolean | null | undefined;

/**
 * Section titles, file paths and names are written by members and agents. A cell that starts with
 * =, +, - or @ would run as a formula in a spreadsheet, so text cells like that get a leading
 * apostrophe. Numbers are written as they are.
 */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Hours with one decimal, or empty. */
export function hours(seconds: number | null): number | null {
  return seconds === null ? null : Math.round((seconds / 3600) * 10) / 10;
}

/** A share as a percentage with one decimal, or empty. */
export function pct(share: number | null): number | null {
  return share === null ? null : Math.round(share * 1000) / 10;
}
