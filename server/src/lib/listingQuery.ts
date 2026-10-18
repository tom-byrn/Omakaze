import type { SQLInputValue } from 'node:sqlite';
import { PAGE_SIZE, type ListingFilters, type SortOption } from '@hearth/shared';

/**
 * The pieces of a listing search, ready to be dropped into a statement that
 * selects `FROM listings l JOIN neighborhoods n ON n.id = l.neighborhood_id`.
 */
export interface ListingQuery {
  /** Either an empty string or a fragment starting with `WHERE`. */
  where: string;
  params: SQLInputValue[];
  orderBy: string;
  limit: number;
  offset: number;
}

const ORDER_BY: Record<SortOption, string> = {
  newest: 'l.listed_at DESC, l.id DESC',
  price_asc: 'l.rent ASC, l.id ASC',
  price_desc: 'l.rent DESC, l.id ASC',
  size_desc: 'l.sqft DESC, l.id ASC',
  available: 'l.available_on ASC, l.rent ASC, l.id ASC',
};

/** Search terms beyond this many are ignored to keep the statement small. */
const MAX_SEARCH_TERMS = 5;

/** Escapes LIKE wildcards so user input is matched literally (used with `ESCAPE '\'`). */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function buildListingQuery(filters: ListingFilters, pageSize: number = PAGE_SIZE): ListingQuery {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];

  if (filters.q) {
    // Every word has to match somewhere, so "brick loft" narrows rather than widens the results.
    for (const term of filters.q.split(' ').slice(0, MAX_SEARCH_TERMS)) {
      const pattern = `%${escapeLike(term)}%`;
      clauses.push(
        "(l.address LIKE ? ESCAPE '\\' OR l.description LIKE ? ESCAPE '\\' OR n.name LIKE ? ESCAPE '\\')",
      );
      params.push(pattern, pattern, pattern);
    }
  }

  if (filters.neighborhood) {
    clauses.push('n.slug = ?');
    params.push(filters.neighborhood);
  }

  if (filters.minPrice !== null) {
    clauses.push('l.rent >= ?');
    params.push(filters.minPrice);
  }

  if (filters.maxPrice !== null) {
    clauses.push('l.rent <= ?');
    params.push(filters.maxPrice);
  }

  if (filters.beds !== null) {
    clauses.push('l.beds >= ?');
    params.push(filters.beds);
  }

  if (filters.baths !== null) {
    clauses.push('l.baths >= ?');
    params.push(filters.baths);
  }

  if (filters.pets === 'cats') {
    clauses.push("l.pets IN ('cats', 'cats_dogs')");
  } else if (filters.pets === 'dogs') {
    clauses.push("l.pets IN ('dogs', 'cats_dogs')");
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
    orderBy: ORDER_BY[filters.sort],
    limit: pageSize,
    offset: (filters.page - 1) * pageSize,
  };
}
