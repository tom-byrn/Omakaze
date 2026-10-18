import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Express } from 'express';
import type { Database } from '../db/connection';
import type { AppContext } from './context';
import { errorHandler, notFound } from './http';
import { clientId } from './middleware/clientId';
import { favoritesRouter } from './routes/favorites';
import { listingsRouter } from './routes/listings';
import { marketRouter } from './routes/market';
import { neighborhoodsRouter } from './routes/neighborhoods';

export interface AppOptions {
  db: Database;
  now?: () => Date;
  /** Directory containing the built client. When set, it is served alongside the API. */
  clientDist?: string | null;
}

export function createApp({ db, now = () => new Date(), clientDist = null }: AppOptions): Express {
  const context: AppContext = { db, now };
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.use('/api', clientId());
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/neighborhoods', neighborhoodsRouter(context));
  app.use('/api/listings', listingsRouter(context));
  app.use('/api/favorites', favoritesRouter(context));
  app.use('/api/market', marketRouter(context));
  app.use('/api', (_req, _res, next) => next(notFound('No such API endpoint')));

  if (clientDist && existsSync(join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    // Client-side routes: anything else that accepts HTML gets the SPA shell.
    app.use((req, res, next) => {
      if (req.method !== 'GET' || !req.accepts('html')) return next();
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
