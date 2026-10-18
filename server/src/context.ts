import { toIsoDate } from '@hearth/shared';
import type { Database } from '../db/connection';

/** Dependencies handed to every router. */
export interface AppContext {
  db: Database;
  /** Injectable clock so date rules can be tested deterministically. */
  now: () => Date;
}

/** Today's calendar date (YYYY-MM-DD) according to the app clock. */
export function today(context: AppContext): string {
  return toIsoDate(context.now());
}
