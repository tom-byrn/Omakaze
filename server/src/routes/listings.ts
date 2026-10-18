import { Router } from 'express';
import { parseListingFilters, validateInquiry, type FilterSource } from '@hearth/shared';
import { today, type AppContext } from '../context';
import { notFound, parseId, validationError } from '../http';
import { createInquiry } from '../repositories/inquiries';
import { getListing, listingExists, searchListings } from '../repositories/listings';

export function listingsRouter(context: AppContext): Router {
  const { db } = context;
  const router = Router();

  router.get('/', (req, res) => {
    const filters = parseListingFilters(req.query as FilterSource);
    res.json(searchListings(db, filters, req.clientId));
  });

  router.get('/:id', (req, res) => {
    const listing = getListing(db, parseId(req.params.id, 'Listing'), req.clientId);
    if (!listing) throw notFound('Listing not found');
    res.json(listing);
  });

  router.post('/:id/inquiries', (req, res) => {
    const listingId = parseId(req.params.id, 'Listing');
    if (!listingExists(db, listingId)) throw notFound('Listing not found');

    const result = validateInquiry(req.body, today(context));
    if (!result.ok) throw validationError(result.errors);

    res.status(201).json(createInquiry(db, listingId, req.clientId, result.value));
  });

  return router;
}
