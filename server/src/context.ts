import type { Request } from 'express';
import { toIsoDate } from '@hearth/shared';
import type { Database } from '../db/connection';
import type { ViewContext } from './lib/serializers';

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

/** The client making the request and today's date, as listing serializers need them. */
export function viewOf(context: AppContext, req: Request): ViewContext {
  return { clientId: req.clientId, today: today(context) };
}
