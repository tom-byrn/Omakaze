import { Router } from 'express';
import type { AppContext } from '../context';
import { listNeighborhoods } from '../repositories/neighborhoods';

export function neighborhoodsRouter({ db }: AppContext): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(listNeighborhoods(db));
  });

  return router;
}
