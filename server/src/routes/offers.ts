import { Router } from 'express';
import { OPEN_OFFER_STATUSES, validateOffer } from '@hearth/shared';
import { today, viewOf, type AppContext } from '../context';
import { conflict, notFound, parseId, validationError } from '../http';
import { getListing } from '../repositories/listings';
import { createOffer, findOffer, hasOpenOffer, listOffers, withdrawOffer } from '../repositories/offers';

/** POST /api/listings/:listingId/offers */
export function listingOffersRouter(context: AppContext): Router {
  const { db } = context;
  const router = Router({ mergeParams: true });

  router.post<'/', { listingId: string }>('/', (req, res) => {
    const listingId = parseId(req.params.listingId, 'Listing');
    const listing = getListing(db, listingId, viewOf(context, req));
    if (!listing) throw notFound('Listing not found');
    if (listing.listingType !== 'sale') throw conflict('Offers can only be made on homes for sale');
    if (listing.status === 'pending') throw conflict('This home is already under contract');
    if (listing.status === 'sold') throw conflict('This home has been sold');

    const result = validateOffer(req.body, { listPrice: listing.listPrice, today: today(context) });
    if (!result.ok) throw validationError(result.errors);

    if (hasOpenOffer(db, listingId, req.clientId)) {
      throw conflict('You already have an open offer on this home. Withdraw it to make a new one.');
    }
    res.status(201).json(createOffer(db, listingId, req.clientId, result.value));
  });

  return router;
}

/** GET /api/offers and PATCH /api/offers/:id */
export function offersRouter(context: AppContext): Router {
  const { db } = context;
  const router = Router();

  router.get('/', (req, res) => {
    res.json(listOffers(db, viewOf(context, req)));
  });

  router.patch('/:id', (req, res) => {
    const offer = findOffer(db, parseId(req.params.id, 'Offer'), req.clientId);
    if (!offer) throw notFound('Offer not found');
    if (req.body?.status !== 'withdrawn') {
      throw validationError({ status: 'Buyers can only withdraw an offer' });
    }
    if (!OPEN_OFFER_STATUSES.includes(offer.status)) {
      throw conflict(`This offer can no longer be withdrawn (it was ${offer.status})`);
    }
    res.json(withdrawOffer(db, offer.id));
  });

  return router;
}
