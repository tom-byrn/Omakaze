import type { ListingSummary } from '@hearth/shared';
import type { Database } from '../../db/connection';
import { toListingSummary, type ListingRow, type ViewContext } from '../lib/serializers';
import { LISTING_COLUMNS, LISTING_FROM } from './listings';

export function listFavorites(db: Database, view: ViewContext): ListingSummary[] {
  const rows = db
    .prepare(
      `SELECT ${LISTING_COLUMNS} ${LISTING_FROM}
       JOIN favorites fav ON fav.listing_id = l.id AND fav.client_id = ?
       ORDER BY fav.created_at DESC, l.id DESC`,
    )
    .all(view.clientId, view.clientId) as unknown as ListingRow[];
  return rows.map((row) => toListingSummary(row, view));
}

/** @returns true if the listing was newly saved, false if it was already a favorite. */
export function addFavorite(db: Database, clientId: string, listingId: number): boolean {
  const { changes } = db
    .prepare('INSERT OR IGNORE INTO favorites (client_id, listing_id) VALUES (?, ?)')
    .run(clientId, listingId);
  return Number(changes) > 0;
}

/** @returns true if a favorite was removed. */
export function removeFavorite(db: Database, clientId: string, listingId: number): boolean {
  const { changes } = db
    .prepare('DELETE FROM favorites WHERE client_id = ? AND listing_id = ?')
    .run(clientId, listingId);
  return Number(changes) > 0;
}
