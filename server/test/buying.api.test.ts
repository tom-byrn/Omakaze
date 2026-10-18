import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SavedSearch, TourDay } from '@hearth/shared';
import { DEMO_CLIENT_ID } from '../db/seed/demo';
import { asClient, createTestApp } from './helpers';

let app: ReturnType<typeof createTestApp>['app'];
let db: ReturnType<typeof createTestApp>['db'];
const client = asClient('client-tours');

beforeEach(() => {
  ({ app, db } = createTestApp());
});

const saleId = (address: string) =>
  (db.prepare("SELECT id FROM listings WHERE address = ? AND listing_type = 'sale'").get(address) as { id: number }).id;

describe('tours', () => {
  const tour = { tourType: 'in_person', date: '2026-10-20', time: '11:00', name: 'Ana Park', email: 'ana@example.com' };

  it('lists a week of slots and takes booked ones off the table', async () => {
    const id = saleId('19 Wren Street');
    const before = await request(app).get(`/api/listings/${id}/tours/availability`).expect(200);
    const days: TourDay[] = before.body.days;
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ date: '2026-10-19' });

    const booked = await request(app).post(`/api/listings/${id}/tours`).set(client).send(tour).expect(201);
    expect(booked.body).toMatchObject({ listingId: id, date: '2026-10-20', time: '11:00', status: 'requested' });

    const after = await request(app).get(`/api/listings/${id}/tours/availability`);
    const tuesday = (after.body.days as TourDay[]).find((day) => day.date === '2026-10-20');
    expect(tuesday?.slots.find((slot) => slot.time === '11:00')?.available).toBe(false);

    await request(app).post(`/api/listings/${id}/tours`).set(asClient('client-other')).send(tour).expect(409);
  });

  it('validates the request', async () => {
    const id = saleId('19 Wren Street');
    const response = await request(app)
      .post(`/api/listings/${id}/tours`)
      .send({ ...tour, date: '2026-12-01', email: 'nope' })
      .expect(400);
    expect(Object.keys(response.body.error.fields).sort()).toEqual(['date', 'email']);
    await request(app).post('/api/listings/999/tours').send(tour).expect(404);
  });
});

describe('saved searches', () => {
  const criteria = { type: 'sale', neighborhood: 'kestrel-park', minPrice: '900000' };

  it('saves, lists and deletes searches with match counts', async () => {
    const created = await request(app)
      .post('/api/saved-searches')
      .set(client)
      .send({ criteria, alertFrequency: 'weekly' })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Homes for sale in Kestrel Park · $900K+',
      alertFrequency: 'weekly',
      criteria: { type: 'sale', neighborhood: 'kestrel-park', minPrice: 900_000 },
    });
    // 19 Wren Street, 37 Meadowlark Drive (pending) and 88 Kestrel Parkway.
    expect(created.body.matchCount).toBe(3);

    await request(app).post('/api/saved-searches').set(client).send({ criteria }).expect(409);

    const list = await request(app).get('/api/saved-searches').set(client).expect(200);
    expect((list.body as SavedSearch[]).map((search) => search.id)).toEqual([created.body.id]);

    await request(app).delete(`/api/saved-searches/${created.body.id}`).set(asClient('client-other')).expect(404);
    await request(app).delete(`/api/saved-searches/${created.body.id}`).set(client).expect(204);
    expect((await request(app).get('/api/saved-searches').set(client)).body).toEqual([]);
  });

  it('counts homes listed since the search was saved', async () => {
    const response = await request(app).get('/api/saved-searches').set(asClient(DEMO_CLIENT_ID)).expect(200);
    const [rentals, kestrel] = response.body as SavedSearch[];
    expect(kestrel).toMatchObject({ name: 'Homes for sale in Kestrel Park · up to $1.3M · 3+ beds', matchCount: 3 });
    // Saved 20 days ago; 19 Wren Street and 4 Aspen Court were listed since.
    expect(kestrel.newCount).toBe(2);
    expect(rentals.name).toBe('Rentals in Canal District · 1+ beds · dogs OK');
  });
});

describe('mortgage estimates', () => {
  it('serves today’s rates', async () => {
    const response = await request(app).get('/api/mortgage/rates').expect(200);
    expect(response.body.rates.conventional[30]).toBe(6.375);
    expect(response.body.assumptions.downPaymentPercent).toBe(20);
  });

  it('prices a listing with its own tax rate and HOA dues', async () => {
    const response = await request(app)
      .post('/api/mortgage/estimate')
      .send({ listingId: saleId('2210 Shore Drive'), downPaymentPercent: 10, termYears: 15, includeSchedule: true })
      .expect(200);
    expect(response.body.input).toMatchObject({ homePrice: 949_000, annualRate: 5.75, hoaMonthly: 640, propertyTaxRate: 0.0102 });
    expect(response.body.estimate.loanAmount).toBe(854_100);
    expect(response.body.estimate.monthly.mortgageInsurance).toBeCloseTo(355.88, 2);
    expect(response.body.schedule).toHaveLength(15);
  });

  it('validates explicit inputs', async () => {
    const response = await request(app)
      .post('/api/mortgage/estimate')
      .send({ homePrice: 500, termYears: 40, program: 'balloon' })
      .expect(400);
    expect(Object.keys(response.body.error.fields).sort()).toEqual(['annualRate', 'homePrice', 'program', 'termYears']);
    await request(app).post('/api/mortgage/estimate').send({ listingId: 1 }).expect(404);
  });
});
