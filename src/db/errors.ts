/**
 * The error, or one it wraps, is a violation of the named constraint. Drizzle wraps the driver's
 * error ("Failed query: …") and keeps it as `cause`, so the constraint name is not in the top error.
 */
export function violatesConstraint(err: unknown, constraint: string): boolean {
  let e: unknown = err;
  for (let depth = 0; e && depth < 5; depth++, e = (e as { cause?: unknown }).cause) {
    if ((e as { constraint_name?: string }).constraint_name === constraint || String(e).includes(constraint)) return true;
  }
  return false;
}
