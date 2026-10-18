import type { ListingDetail, ListingFilters, ListingSearchResult } from '@hearth/shared';
import type { Database } from '../../db/connection';
import { buildListingQuery } from '../lib/listingQuery';
import {
  toListingDetail,
  toListingSummary,
  toMapPoint,
  type ListingRow,
  type MapPointRow,
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
  EXISTS (SELECT 1 FROM favorites f WHERE f.listing_id = l.id AND f.client_id = ?) AS is_favorite
`;

export function searchListings(
  db: Database,
  filters: ListingFilters,
  clientId: string,
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
    .all(clientId, ...query.params, query.limit, query.offset) as unknown as ListingRow[];

  const points = db
    .prepare(`SELECT l.id, l.lat, l.lng, l.rent ${LISTING_FROM} ${query.where}`)
    .all(...query.params) as unknown as MapPointRow[];

  return {
    results: rows.map(toListingSummary),
    mapPoints: points.map(toMapPoint),
    total,
    page: filters.page,
    pageSize: query.limit,
    pageCount: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export function getListing(db: Database, id: number, clientId: string): ListingDetail | null {
  const row = db
    .prepare(`SELECT ${LISTING_COLUMNS} ${LISTING_FROM} WHERE l.id = ?`)
    .get(clientId, id) as unknown as ListingRow | undefined;
  return row ? toListingDetail(row) : null;
}

export function listingExists(db: Database, id: number): boolean {
  return db.prepare('SELECT 1 FROM listings WHERE id = ?').get(id) !== undefined;
}
