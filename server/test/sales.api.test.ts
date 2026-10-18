import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ListingSearchResult, PriceEvent, SaleDetail, SaleSummary } from '@hearth/shared';
import { SALES } from '../db/seed/sales';
import { createTestApp } from './helpers';

let app: ReturnType<typeof createTestApp>['app'];

beforeEach(() => {
  ({ app } = createTestApp());
});

async function searchSales(query = ''): Promise<{ body: ListingSearchResult; homes: SaleSummary[] }> {
  const response = await request(app).get(`/api/listings?type=sale${query}`).expect(200);
  return { body: response.body, homes: response.body.results };
}

const soldHomeId = async (address: string) => {
  const { homes } = await searchSales(`&status=sold&q=${encodeURIComponent(address)}`);
  return homes[0]?.id;
};

describe('GET /api/listings?type=sale', () => {
  it('returns homes that are for sale or pending, with an estimated payment', async () => {
    const { body, homes } = await searchSales();
    expect(body.total).toBe(22);
    expect(body.mapPoints).toHaveLength(22);
    expect(homes.every((home) => home.listingType === 'sale' && home.status !== 'sold')).toBe(true);
    expect(homes.every((home) => home.estimatedPayment > home.listPrice * 0.004)).toBe(true);
    expect(body.mapPoints.filter((point) => point.status === 'pending')).toHaveLength(4);
  });

  it('keeps rental searches separate', async () => {
    const response = await request(app).get('/api/listings?maxPrice=3000').expect(200);
    expect(response.body.results.every((listing: { listingType: string }) => listing.listingType === 'rent')).toBe(true);
  });

  it('filters by asking price and sorts by price per square foot', async () => {
    const { homes } = await searchSales('&minPrice=600000&maxPrice=900000&sort=price_per_sqft');
    expect(homes.length).toBeGreaterThan(0);
    expect(homes.every((home) => home.listPrice >= 600_000 && home.listPrice <= 900_000)).toBe(true);
    const perSqft = homes.map((home) => home.listPrice / home.sqft);
    expect(perSqft).toEqual([...perSqft].sort((a, b) => a - b));
  });

  it('shows recently sold homes with what they sold for', async () => {
    const { body, homes } = await searchSales('&status=sold');
    expect(body.total).toBe(8);
    const lookout = homes.find((home) => home.address === '44 Lookout Street');
    expect(lookout).toMatchObject({ status: 'sold', listPrice: 1_150_000, soldPrice: 1_184_000, daysOnMarket: 42 });
    expect(body.mapPoints.find((point) => point.id === lookout?.id)?.price).toBe(1_184_000);
  });

  it('reports price cuts against the original asking price', async () => {
    const { homes } = await searchSales('&q=Pilot%20Avenue');
    expect(homes[0]).toMatchObject({ listPrice: 559_000, priceChange: -20_000, daysOnMarket: 48 });
  });
});

describe('GET /api/listings/:id for a home for sale', () => {
  it('includes the sale details', async () => {
    const { homes } = await searchSales('&q=Reservoir%20Lane');
    const response = await request(app).get(`/api/listings/${homes[0].id}`).expect(200);
    const home: SaleDetail = response.body;
    expect(home).toMatchObject({
      listingType: 'sale',
      address: '5 Reservoir Lane',
      listPrice: 1_749_000,
      hoaMonthly: 0,
      propertyTaxRate: 0.0109,
      yearBuilt: 1912,
      lotSqft: 6200,
      agent: { name: 'Priya Natarajan' },
    });
  });
});

describe('GET /api/listings/:id/price-history', () => {
  it('lists earlier sales and the current listing in date order', async () => {
    const id = await soldHomeId('Lighthouse Way');
    const response = await request(app).get(`/api/listings/${id}/price-history`).expect(200);
    const events: PriceEvent[] = response.body.events;
    const seed = SALES.find((sale) => sale.address === '1 Lighthouse Way');
    expect(events.map((e) => e.event)).toEqual(seed?.history.map(([, event]) => event));
    expect(events[0]).toEqual({ date: '2010-08-12', event: 'listed', price: 489_000 });
    expect(events.at(-1)).toEqual({ date: '2026-10-07', event: 'sold', price: 1_050_000 });
  });

  it('is empty for rentals and 404 for unknown listings', async () => {
    const rental = await request(app).get('/api/listings/1/price-history').expect(200);
    expect(rental.body.events).toEqual([]);
    await request(app).get('/api/listings/999/price-history').expect(404);
  });
});
