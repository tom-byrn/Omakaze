import type { SavedSearch, SavedSearchInput, SearchCriteria } from '@hearth/shared';
import type { Database } from '../../db/connection';
import { countListings } from './listings';

interface SavedSearchRow {
  id: number;
  name: string;
  criteria: string;
  alert_frequency: SavedSearch['alertFrequency'];
  created_at: string;
}

function toSavedSearch(db: Database, row: SavedSearchRow): SavedSearch {
  const criteria = JSON.parse(row.criteria) as SearchCriteria;
  const filters = { ...criteria, page: 1 };
  return {
    id: row.id,
    name: row.name,
    criteria,
    alertFrequency: row.alert_frequency,
    createdAt: row.created_at,
    matchCount: countListings(db, filters),
    newCount: countListings(db, filters, row.created_at.slice(0, 10)),
  };
}

export function listSavedSearches(db: Database, clientId: string): SavedSearch[] {
  const rows = db
    .prepare('SELECT * FROM saved_searches WHERE client_id = ? ORDER BY created_at DESC, id DESC')
    .all(clientId) as unknown as SavedSearchRow[];
  return rows.map((row) => toSavedSearch(db, row));
}

/** An existing search with exactly these criteria, so the same search isn't saved twice. */
export function findSavedSearch(db: Database, clientId: string, criteria: SearchCriteria): SavedSearch | null {
  const row = db
    .prepare('SELECT * FROM saved_searches WHERE client_id = ? AND criteria = ?')
    .get(clientId, JSON.stringify(criteria)) as SavedSearchRow | undefined;
  return row ? toSavedSearch(db, row) : null;
}

export function createSavedSearch(db: Database, clientId: string, input: SavedSearchInput): SavedSearch {
  const row = db
    .prepare('INSERT INTO saved_searches (client_id, name, criteria, alert_frequency) VALUES (?, ?, ?, ?) RETURNING *')
    .get(clientId, input.name, JSON.stringify(input.criteria), input.alertFrequency) as unknown as SavedSearchRow;
  return toSavedSearch(db, row);
}

export function deleteSavedSearch(db: Database, clientId: string, id: number): boolean {
  const { changes } = db.prepare('DELETE FROM saved_searches WHERE id = ? AND client_id = ?').run(id, clientId);
  return Number(changes) > 0;
}
