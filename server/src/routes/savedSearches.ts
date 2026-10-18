import { Router } from 'express';
import { validateSavedSearch } from '@hearth/shared';
import type { AppContext } from '../context';
import { conflict, notFound, parseId, validationError } from '../http';
import {
  createSavedSearch,
  deleteSavedSearch,
  findSavedSearch,
  listSavedSearches,
} from '../repositories/savedSearches';

const MAX_SAVED_SEARCHES = 25;

export function savedSearchesRouter({ db }: AppContext): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(listSavedSearches(db, req.clientId));
  });

  router.post('/', (req, res) => {
    const slug = (req.body?.criteria as { neighborhood?: unknown } | undefined)?.neighborhood;
    const hood = db.prepare('SELECT name FROM neighborhoods WHERE slug = ?').get(String(slug ?? '')) as
      | { name: string }
      | undefined;

    const result = validateSavedSearch(req.body, hood?.name);
    if (!result.ok) throw validationError(result.errors);

    if (findSavedSearch(db, req.clientId, result.value.criteria)) {
      throw conflict('You’ve already saved this search');
    }
    if (listSavedSearches(db, req.clientId).length >= MAX_SAVED_SEARCHES) {
      throw conflict(`You can save up to ${MAX_SAVED_SEARCHES} searches`);
    }
    res.status(201).json(createSavedSearch(db, req.clientId, result.value));
  });

  router.delete('/:id', (req, res) => {
    if (!deleteSavedSearch(db, req.clientId, parseId(req.params.id, 'Saved search'))) {
      throw notFound('Saved search not found');
    }
    res.status(204).end();
  });

  return router;
}
