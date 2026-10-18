import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { computeMarketMetrics, type MarketRow } from '../src/services/marketStats';
import { createTestApp } from './helpers';

const TODAY = '2026-10-18';

const row = (patch: Partial<MarketRow>): MarketRow => ({
  neighborhood: 'harborview',
  sale_status: 'active',
  list_price: 800_000,
  sqft: 1000,
  listed_at: '2026-10-08',
  sold_price: null,
  sold_on: null,
  ...patch,
});

describe('computeMarketMetrics', () => {
  it('combines current listings and sales from the last 12 months', () => {
    const metrics = computeMarketMetrics(
      [
        row({ list_price: 600_000, sqft: 1200 }),
        row({ list_price: 900_000, sqft: 1500, sale_status: 'pending', listed_at: '2026-09-18' }),
        row({ list_price: 1_000_000, sale_status: 'sold', sold_price: 1_050_000, listed_at: '2026-08-01', sold_on: '2026-09-10' }),
        row({ list_price: 500_000, sale_status: 'sold', sold_price: 490_000, listed_at: '2026-06-01', sold_on: '2026-06-21' }),
        // Sold more than a year ago: ignored.
        row({ list_price: 400_000, sale_status: 'sold', sold_price: 300_000, listed_at: '2025-01-01', sold_on: '2025-02-01' }),
      ],
      TODAY,
    );

    expect(metrics).toEqual({
      activeCount: 1,
      pendingCount: 1,
      soldCount: 2,
      medianListPrice: 750_000,
      medianPricePerSqft: 550,
      // (10 + 30 + 40 + 20) / 4
      averageDaysOnMarket: 25,
      // (1.05 + 0.98) / 2
      saleToListRatio: 1.015,
    });
  });

  it('returns nulls when there is nothing to measure', () => {
    expect(computeMarketMetrics([], TODAY)).toEqual({
      activeCount: 0,
      pendingCount: 0,
      soldCount: 0,
      medianListPrice: null,
      medianPricePerSqft: null,
      averageDaysOnMarket: null,
      saleToListRatio: null,
    });
  });
});

describe('GET /api/market/:neighborhood', () => {
  it('returns neighborhood metrics alongside the whole city', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/api/market/harborview').expect(200);
    expect(response.body).toMatchObject({
      neighborhood: { slug: 'harborview', name: 'Harborview' },
      asOf: '2026-10-18',
      metrics: { activeCount: 2, pendingCount: 1, soldCount: 1, medianListPrice: 949_000, saleToListRatio: 1.0296 },
      city: { activeCount: 18, pendingCount: 4, soldCount: 8 },
    });
  });

  it('responds 404 for unknown neighborhoods', async () => {
    const { app } = createTestApp();
    await request(app).get('/api/market/atlantis').expect(404);
  });
});
