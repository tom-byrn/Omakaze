import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Offer, OfferWithListing } from '@hearth/shared';
import { DEMO_CLIENT_ID } from '../db/seed/demo';
import { asClient, createTestApp } from './helpers';

let app: ReturnType<typeof createTestApp>['app'];
let db: ReturnType<typeof createTestApp>['db'];

const buyer = asClient('client-buyer');

beforeEach(() => {
  ({ app, db } = createTestApp());
});

const listingId = (address: string) =>
  (db.prepare('SELECT id FROM listings WHERE address = ? AND listing_type = ?').get(address, 'sale') as { id: number }).id;

const offer = {
  buyerName: 'Sam Rivera',
  buyerEmail: 'sam@example.com',
  amount: 960_000,
  financing: 'conventional',
  downPaymentPercent: 20,
  contingencies: ['inspection', 'appraisal', 'financing'],
  closingDate: '2026-12-01',
  message: 'Pre-approved and flexible on the closing date.',
};

const submit = (address: string, body: object = offer, client = buyer) =>
  request(app).post(`/api/listings/${listingId(address)}/offers`).set(client).send(body);

describe('POST /api/listings/:id/offers', () => {
  it('creates a submitted offer that shows up on the buyer’s dashboard', async () => {
    const created = await submit('19 Wren Street').expect(201);
    expect(created.body).toMatchObject({ status: 'submitted', amount: 960_000, counterAmount: null });

    const dashboard = await request(app).get('/api/offers').set(buyer).expect(200);
    const offers: OfferWithListing[] = dashboard.body;
    expect(offers).toHaveLength(1);
    expect(offers[0].listing).toMatchObject({ address: '19 Wren Street', listingType: 'sale', listPrice: 975_000 });
  });

  it('returns field errors for offers that break the rules', async () => {
    const response = await submit('19 Wren Street', {
      ...offer,
      amount: 500_000,
      financing: 'fha',
      downPaymentPercent: 2,
      closingDate: '2026-10-25',
    }).expect(400);
    expect(Object.keys(response.body.error.fields).sort()).toEqual(['amount', 'closingDate', 'downPaymentPercent']);
  });

  it('refuses offers on homes that are pending, sold or for rent', async () => {
    expect((await submit('9 Bell Buoy Lane', { ...offer, amount: 1_250_000 }).expect(409)).body.error.message).toBe(
      'This home is already under contract',
    );
    await submit('44 Lookout Street').expect(409);
    await request(app).post('/api/listings/1/offers').set(buyer).send(offer).expect(409);
    await request(app).post('/api/listings/999/offers').set(buyer).send(offer).expect(404);
  });

  it('allows one open offer per home per buyer', async () => {
    const first = await submit('19 Wren Street').expect(201);
    await submit('19 Wren Street').expect(409);
    await submit('19 Wren Street', offer, asClient('someone-else')).expect(201);

    await request(app).patch(`/api/offers/${first.body.id}`).set(buyer).send({ status: 'withdrawn' }).expect(200);
    await submit('19 Wren Street', { ...offer, amount: 975_000 }).expect(201);
  });
});

describe('PATCH /api/offers/:id', () => {
  it('withdraws an open offer once', async () => {
    const { body: created } = await submit('19 Wren Street').expect(201);
    const withdrawn = await request(app).patch(`/api/offers/${created.id}`).set(buyer).send({ status: 'withdrawn' });
    expect(withdrawn.status).toBe(200);
    expect((withdrawn.body as Offer).status).toBe('withdrawn');

    await request(app).patch(`/api/offers/${created.id}`).set(buyer).send({ status: 'withdrawn' }).expect(409);
  });

  it('only lets the buyer withdraw their own offers', async () => {
    const { body: created } = await submit('19 Wren Street').expect(201);
    await request(app).patch(`/api/offers/${created.id}`).set(asClient('someone-else')).send({ status: 'withdrawn' }).expect(404);
    await request(app).patch(`/api/offers/${created.id}`).set(buyer).send({ status: 'accepted' }).expect(400);
  });
});

it('seeds sample offers for the demo client', async () => {
  const response = await request(app).get('/api/offers').set(asClient(DEMO_CLIENT_ID)).expect(200);
  const offers: OfferWithListing[] = response.body;
  expect(offers.map((o) => o.status)).toEqual(['countered', 'accepted', 'withdrawn', 'rejected']);
  expect(offers[0]).toMatchObject({ counterAmount: 935_000, listing: { address: '2210 Shore Drive' } });
});
