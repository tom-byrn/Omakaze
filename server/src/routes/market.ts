import { Router } from 'express';
import { today, type AppContext } from '../context';
import { notFound } from '../http';
import { getMarketStats } from '../services/marketStats';

export function marketRouter(context: AppContext): Router {
  const router = Router();

  router.get('/:neighborhood', (req, res) => {
    const stats = getMarketStats(context.db, req.params.neighborhood, today(context));
    if (!stats) throw notFound('Neighborhood not found');
    res.json(stats);
  });

  return router;
}
