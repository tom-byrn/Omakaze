/** What the server puts in a push notification's data (PushData on the server). */
export type PushData = { type: string; workspaceId: string; repo: string; prNumber: number; url: string };

export function isPushData(v: unknown): v is PushData {
  const d = v as Partial<PushData> | null;
  return Boolean(d && typeof d.workspaceId === 'string' && typeof d.repo === 'string' && typeof d.prNumber === 'number');
}

/** The in-app route for a notification: the guide, at the version and section the link names. */
export function routeForPush(d: PushData): string {
  let v: string | null = null;
  let section: string | null = null;
  try {
    const u = new URL(d.url);
    v = u.searchParams.get('v');
    section = u.searchParams.get('section');
  } catch {
    // no link details
  }
  const base = `/pr/${d.repo}/${d.prNumber}`;
  // `section` is the section's position (1-based), as in the web viewer's links.
  if (section && Number(section) > 0) return `${base}/section?position=${Number(section)}${v ? `&v=${v}` : ''}`;
  return v ? `${base}?v=${v}` : base;
}
