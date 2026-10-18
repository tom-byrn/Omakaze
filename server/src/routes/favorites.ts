import { Router } from 'express';
import { viewOf, type AppContext } from '../context';
import { notFound, parseId } from '../http';
import { addFavorite, listFavorites, removeFavorite } from '../repositories/favorites';
import { listingExists } from '../repositories/listings';

export function favoritesRouter(context: AppContext): Router {
  const { db } = context;
  const router = Router();

  router.get('/', (req, res) => {
    res.json(listFavorites(db, viewOf(context, req)));
  });

  router.put('/:listingId', (req, res) => {
    const listingId = parseId(req.params.listingId, 'Listing');
    if (!listingExists(db, listingId)) throw notFound('Listing not found');
    const created = addFavorite(db, req.clientId, listingId);
    res.status(created ? 201 : 200).json({ listingId, isFavorite: true });
  });

  router.delete('/:listingId', (req, res) => {
    removeFavorite(db, req.clientId, parseId(req.params.listingId, 'Listing'));
    res.status(204).end();
  });

  return router;
}
