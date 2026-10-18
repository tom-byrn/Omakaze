import type { ListingDetail, ListingFilters, ListingSearchResult, PriceEvent } from '@hearth/shared';
import type { Database } from '../../db/connection';
import { PRICE_COLUMN, buildListingQuery } from '../lib/listingQuery';
import {
  toListingDetail,
  toListingSummary,
  toMapPoint,
  type ListingRow,
  type MapPointRow,
  type ViewContext,
} from '../lib/serializers';

export const LISTING_FROM = 'FROM listings l JOIN neighborhoods n ON n.id = l.neighborhood_id';

/**
 * Columns for `ListingRow`. Takes one parameter: the client id used to work
 * out whether the listing is in that client's favorites.
 */
export const LISTING_COLUMNS = `
  l.*,
  n.slug AS neighborhood_slug,
  n.name AS neighborhood_name,
  EXISTS (SELECT 1 FROM favorites f WHERE f.listing_id = l.id AND f.client_id = ?) AS is_favorite,
  (SELECT ph.price FROM price_history ph
    WHERE ph.listing_id = l.id AND ph.event = 'listed'
    ORDER BY ph.event_date DESC, ph.id DESC LIMIT 1) AS original_list_price
`;

export function searchListings(
  db: Database,
  filters: ListingFilters,
  view: ViewContext,
): ListingSearchResult {
  const query = buildListingQuery(filters);

  const { total } = db
    .prepare(`SELECT COUNT(*) AS total ${LISTING_FROM} ${query.where}`)
    .get(...query.params) as { total: number };

  const rows = db
    .prepare(
      `SELECT ${LISTING_COLUMNS} ${LISTING_FROM} ${query.where}
       ORDER BY ${query.orderBy}
       LIMIT ? OFFSET ?`,
    )
    .all(view.clientId, ...query.params, query.limit, query.offset) as unknown as ListingRow[];

  // Sold homes are marked with what they sold for.
  const price = filters.type === 'sale' ? `COALESCE(l.sold_price, ${PRICE_COLUMN.sale})` : PRICE_COLUMN.rent;
  const points = db
    .prepare(`SELECT l.id, l.lat, l.lng, ${price} AS price, l.sale_status ${LISTING_FROM} ${query.where}`)
    .all(...query.params) as unknown as MapPointRow[];

  return {
    results: rows.map((row) => toListingSummary(row, view)),
    mapPoints: points.map(toMapPoint),
    total,
    page: filters.page,
    pageSize: query.limit,
    pageCount: Math.max(1, Math.ceil(total / query.limit)),
  };
}

/** How many listings match, optionally only those listed on or after a date. */
export function countListings(db: Database, filters: ListingFilters, listedSince?: string): number {
  const query = buildListingQuery(filters);
  const since = listedSince ? ' AND l.listed_at >= ?' : '';
  const params = listedSince ? [...query.params, listedSince] : query.params;
  const { total } = db
    .prepare(`SELECT COUNT(*) AS total ${LISTING_FROM} ${query.where}${since}`)
    .get(...params) as { total: number };
  return total;
}

export function getListing(db: Database, id: number, view: ViewContext): ListingDetail | null {
  const row = db
    .prepare(`SELECT ${LISTING_COLUMNS} ${LISTING_FROM} WHERE l.id = ?`)
    .get(view.clientId, id) as unknown as ListingRow | undefined;
  return row ? toListingDetail(row, view) : null;
}

export function listingExists(db: Database, id: number): boolean {
  return db.prepare('SELECT 1 FROM listings WHERE id = ?').get(id) !== undefined;
}

export function getPriceHistory(db: Database, listingId: number): PriceEvent[] {
  return db
    .prepare(
      `SELECT event_date AS date, event, price FROM price_history
       WHERE listing_id = ? ORDER BY event_date, id`,
    )
    .all(listingId) as unknown as PriceEvent[];
}
