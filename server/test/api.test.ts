import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ListingDetail, ListingSearchResult, ListingSummary, Neighborhood } from '@hearth/shared';
import { NEIGHBORHOODS } from '../db/seed/neighborhoods';
import { RENTALS } from '../db/seed/rentals';
import { asClient, createTestApp } from './helpers';

let app: ReturnType<typeof createTestApp>['app'];
let db: ReturnType<typeof createTestApp>['db'];

beforeEach(() => {
  ({ app, db } = createTestApp());
});

async function search(query: string): Promise<ListingSearchResult> {
  const response = await request(app).get(`/api/listings${query}`).expect(200);
  return response.body;
}

describe('GET /api/listings', () => {
  it('returns the first page of every listing, newest first, with map points for all of them', async () => {
    const body = await search('');
    expect(body.total).toBe(RENTALS.length);
    expect(body.results).toHaveLength(12);
    expect(body.mapPoints).toHaveLength(RENTALS.length);
    expect(body).toMatchObject({ page: 1, pageSize: 12, pageCount: Math.ceil(RENTALS.length / 12) });

    const listed = body.results.map((listing) => listing.listedAt);
    expect(listed).toEqual([...listed].sort().reverse());
  });

  it('filters by neighborhood and price range', async () => {
    const body = await search('?neighborhood=canal-district&minPrice=2000&maxPrice=3000');
    const expected = RENTALS.filter(
      (r) => r.neighborhood === 'canal-district' && r.rent >= 2000 && r.rent <= 3000,
    );
    expect(body.total).toBe(expected.length);
    expect(body.results.every((l) => l.neighborhood.slug === 'canal-district')).toBe(true);
    expect(body.results.every((l) => l.rent >= 2000 && l.rent <= 3000)).toBe(true);
  });

  it('filters by bedrooms, bathrooms and pets', async () => {
    const body = await search('?beds=3&baths=2&pets=dogs');
    const expected = RENTALS.filter(
      (r) => r.beds >= 3 && r.baths >= 2 && (r.pets === 'dogs' || r.pets === 'cats_dogs'),
    );
    expect(body.total).toBe(expected.length);
    expect(body.total).toBeGreaterThan(0);
  });

  it('searches address, description and neighborhood name', async () => {
    const matches = (term: RegExp) =>
      RENTALS.filter((r) => {
        const hood = NEIGHBORHOODS.find((n) => n.slug === r.neighborhood)?.name ?? '';
        return term.test(r.address) || term.test(r.description) || term.test(hood);
      }).length;

    const lofts = await search('?q=loft');
    expect(lofts.total).toBe(matches(/loft/i));
    expect(lofts.total).toBeGreaterThan(0);

    const byNeighborhood = await search('?q=saltmarsh');
    expect(byNeighborhood.total).toBe(matches(/saltmarsh/i));
    expect(byNeighborhood.total).toBeGreaterThanOrEqual(5);

    const nothing = await search('?q=helicopter%20pad');
    expect(nothing.total).toBe(0);
    expect(nothing.results).toEqual([]);
  });

  it('sorts by price and paginates', async () => {
    const page1 = await search('?sort=price_asc');
    const rents = page1.results.map((l) => l.rent);
    expect(rents).toEqual([...rents].sort((a, b) => a - b));
    expect(rents[0]).toBe(Math.min(...RENTALS.map((r) => r.rent)));

    const last = await search(`?sort=price_asc&page=${page1.pageCount}`);
    expect(last.results).toHaveLength(RENTALS.length - (page1.pageCount - 1) * 12);
  });

  it('ignores malformed parameters instead of failing', async () => {
    const body = await search('?minPrice=cheap&beds=-1&sort=bogus&page=nope');
    expect(body.total).toBe(RENTALS.length);
    expect(body.page).toBe(1);
  });
});

describe('GET /api/listings/:id', () => {
  it('returns the full listing', async () => {
    const response = await request(app).get('/api/listings/1').expect(200);
    const listing: ListingDetail = response.body;
    expect(listing).toMatchObject({
      id: 1,
      address: RENTALS[0].address,
      rent: RENTALS[0].rent,
      neighborhood: { slug: 'harborview', name: 'Harborview' },
      agent: { name: 'Maya Okafor' },
      isFavorite: false,
    });
    expect(listing.amenities).toEqual(RENTALS[0].amenities);
  });

  it('responds 404 for unknown or malformed ids', async () => {
    await request(app).get('/api/listings/9999').expect(404);
    const response = await request(app).get('/api/listings/abc').expect(404);
    expect(response.body.error.message).toBe('Listing not found');
  });
});

describe('GET /api/neighborhoods', () => {
  it('lists every neighborhood with listing counts and median rent', async () => {
    const response = await request(app).get('/api/neighborhoods').expect(200);
    const neighborhoods: Neighborhood[] = response.body;
    expect(neighborhoods).toHaveLength(8);
    expect(neighborhoods.reduce((sum, n) => sum + n.listingCount, 0)).toBe(RENTALS.length);

    const saltmarsh = neighborhoods.find((n) => n.slug === 'saltmarsh');
    expect(saltmarsh?.medianRent).toBe(1950);
  });
});

describe('favorites', () => {
  it('saves, lists and removes favorites per client', async () => {
    const alice = asClient('client-alice');
    const bob = asClient('client-bob');

    await request(app).put('/api/favorites/3').set(alice).expect(201);
    await request(app).put('/api/favorites/3').set(alice).expect(200);
    await request(app).put('/api/favorites/7').set(alice).expect(201);

    const list = await request(app).get('/api/favorites').set(alice).expect(200);
    expect((list.body as ListingSummary[]).map((l) => l.id).sort()).toEqual([3, 7]);

    const asAlice = await request(app).get('/api/listings/3').set(alice);
    const asBob = await request(app).get('/api/listings/3').set(bob);
    expect(asAlice.body.isFavorite).toBe(true);
    expect(asBob.body.isFavorite).toBe(false);

    await request(app).delete('/api/favorites/3').set(alice).expect(204);
    const after = await request(app).get('/api/favorites').set(alice);
    expect((after.body as ListingSummary[]).map((l) => l.id)).toEqual([7]);
  });

  it('rejects favorites for listings that do not exist', async () => {
    await request(app).put('/api/favorites/4040').set(asClient('client-alice')).expect(404);
  });

  it('issues an anonymous client cookie when none is sent', async () => {
    const response = await request(app).get('/api/favorites').expect(200);
    expect(response.headers['set-cookie']?.[0]).toMatch(/^hearth_cid=[0-9a-f-]{36};.*HttpOnly/);
  });
});

describe('POST /api/listings/:id/inquiries', () => {
  const inquiry = {
    kind: 'tour',
    name: 'Jordan Lee',
    email: 'jordan@example.com',
    message: 'Could I see the apartment this weekend?',
    tourDate: '2026-10-24',
  };

  it('stores a valid inquiry', async () => {
    const response = await request(app)
      .post('/api/listings/5/inquiries')
      .set(asClient('client-jordan'))
      .send(inquiry)
      .expect(201);
    expect(response.body).toMatchObject({ listingId: 5, kind: 'tour', tourDate: '2026-10-24' });

    const row = db.prepare('SELECT client_id, email FROM inquiries WHERE id = ?').get(response.body.id);
    expect(row).toEqual({ client_id: 'client-jordan', email: 'jordan@example.com' });
  });

  it('returns field errors for invalid input', async () => {
    const response = await request(app)
      .post('/api/listings/5/inquiries')
      .send({ ...inquiry, email: 'nope', tourDate: '2026-10-01' })
      .expect(400);
    expect(response.body.error.fields).toEqual({
      email: 'Enter a valid email address',
      tourDate: 'Tours can be booked from tomorrow onwards',
    });
  });

  it('responds 404 for unknown listings and 400 for malformed JSON', async () => {
    await request(app).post('/api/listings/999/inquiries').send(inquiry).expect(404);
    await request(app)
      .post('/api/listings/5/inquiries')
      .set('Content-Type', 'application/json')
      .send('{"name": ')
      .expect(400);
  });
});

it('answers unknown API routes with a JSON 404', async () => {
  const response = await request(app).get('/api/nope').expect(404);
  expect(response.body).toEqual({ error: { message: 'No such API endpoint' } });
});
