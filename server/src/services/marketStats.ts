import { addDays, daysBetween, type MarketMetrics, type MarketStats, type NeighborhoodRef, type SaleStatus } from '@hearth/shared';
import type { Database } from '../../db/connection';
import { mean, median } from '../lib/stats';

export interface MarketRow {
  neighborhood: string;
  sale_status: SaleStatus;
  list_price: number;
  sqft: number;
  listed_at: string;
  sold_price: number | null;
  sold_on: string | null;
}

const round = (value: number | null, digits = 0) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Market metrics for a set of homes for sale:
 * - prices and $/sqft use homes currently for sale (active or pending)
 * - days on market counts current listings up to today and sold homes up to their sale
 * - sale-to-list compares each sale in the last 12 months with its final asking price
 */
export function computeMarketMetrics(rows: readonly MarketRow[], today: string): MarketMetrics {
  const yearAgo = addDays(today, -365);
  const forSale = rows.filter((row) => row.sale_status !== 'sold');
  const sold = rows.filter(
    (row): row is MarketRow & { sold_price: number; sold_on: string } =>
      row.sale_status === 'sold' && row.sold_price !== null && row.sold_on !== null && row.sold_on >= yearAgo,
  );

  return {
    activeCount: forSale.filter((row) => row.sale_status === 'active').length,
    pendingCount: forSale.filter((row) => row.sale_status === 'pending').length,
    soldCount: sold.length,
    medianListPrice: round(median(forSale.map((row) => row.list_price))),
    medianPricePerSqft: round(median(forSale.map((row) => row.list_price / row.sqft))),
    averageDaysOnMarket: round(
      mean([...forSale, ...sold].map((row) => daysBetween(row.listed_at, row.sold_on ?? today))),
    ),
    saleToListRatio: round(mean(sold.map((row) => row.sold_price / row.list_price)), 4),
  };
}

export function getMarketStats(db: Database, slug: string, today: string): MarketStats | null {
  const neighborhood = db.prepare('SELECT slug, name FROM neighborhoods WHERE slug = ?').get(slug) as
    | NeighborhoodRef
    | undefined;
  if (!neighborhood) return null;

  const rows = db
    .prepare(
      `SELECT n.slug AS neighborhood, l.sale_status, l.list_price, l.sqft, l.listed_at, l.sold_price, l.sold_on
       FROM listings l JOIN neighborhoods n ON n.id = l.neighborhood_id
       WHERE l.listing_type = 'sale'`,
    )
    .all() as unknown as MarketRow[];

  return {
    neighborhood: { slug: neighborhood.slug, name: neighborhood.name },
    metrics: computeMarketMetrics(
      rows.filter((row) => row.neighborhood === slug),
      today,
    ),
    city: computeMarketMetrics(rows, today),
    asOf: today,
  };
}
