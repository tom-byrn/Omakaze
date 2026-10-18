import { openDatabase } from '../db/connection';
import { migrate } from '../db/migrate';
import { seed } from '../db/seed';
import { createApp } from '../src/app';

/** Fixed clock so seeded dates and date validation are deterministic. */
export const NOW = new Date('2026-10-18T16:00:00Z');
export const TODAY = '2026-10-18';

export function createTestApp() {
  const db = openDatabase(':memory:');
  migrate(db);
  seed(db, { now: NOW });
  const app = createApp({ db, now: () => NOW });
  return { db, app };
}

/** Header that pins the anonymous client id, standing in for the browser cookie. */
export function asClient(id: string) {
  return { 'x-hearth-client': id };
}
