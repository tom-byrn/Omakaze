import { Router } from 'express';
import { tourDates, tourSlots, validateTourRequest, type TourDay } from '@hearth/shared';
import { today, type AppContext } from '../context';
import { conflict, notFound, parseId, validationError } from '../http';
import { listingExists } from '../repositories/listings';
import { bookedSlots, createTour } from '../repositories/tours';

/** /api/listings/:listingId/tours */
export function toursRouter(context: AppContext): Router {
  const { db } = context;
  const router = Router({ mergeParams: true });

  router.get<'/availability', { listingId: string }>('/availability', (req, res) => {
    const listingId = parseId(req.params.listingId, 'Listing');
    if (!listingExists(db, listingId)) throw notFound('Listing not found');

    const dates = tourDates(today(context));
    const taken = bookedSlots(db, listingId, dates[0]);
    const days: TourDay[] = dates.map((date) => ({
      date,
      slots: tourSlots(date).map((time) => ({ time, available: !taken.has(`${date} ${time}`) })),
    }));
    res.json({ listingId, days });
  });

  router.post<'/', { listingId: string }>('/', (req, res) => {
    const listingId = parseId(req.params.listingId, 'Listing');
    if (!listingExists(db, listingId)) throw notFound('Listing not found');

    const result = validateTourRequest(req.body, today(context));
    if (!result.ok) throw validationError(result.errors);

    const { date, time } = result.value;
    if (bookedSlots(db, listingId, date).has(`${date} ${time}`)) {
      throw conflict('That time was just booked. Please pick another.');
    }
    res.status(201).json(createTour(db, listingId, req.clientId, result.value));
  });

  return router;
}
