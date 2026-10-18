import type { SQLInputValue } from 'node:sqlite';
import { PAGE_SIZE, type ListingFilters, type ListingType, type SortOption } from '@hearth/shared';

/**
 * The pieces of a listing search, ready to be dropped into a statement that
 * selects `FROM listings l JOIN neighborhoods n ON n.id = l.neighborhood_id`.
 */
export interface ListingQuery {
  /** A fragment starting with `WHERE`; the listing type is always constrained. */
  where: string;
  params: SQLInputValue[];
  orderBy: string;
  limit: number;
  offset: number;
}

/** The column holding a listing's headline price: monthly rent or the asking price. */
export const PRICE_COLUMN: Record<ListingType, string> = {
  rent: 'l.rent',
  sale: 'l.list_price',
};

function orderBy(sort: SortOption, price: string): string {
  switch (sort) {
    case 'newest':
      return 'l.listed_at DESC, l.id DESC';
    case 'price_asc':
      return `${price} ASC, l.id ASC`;
    case 'price_desc':
      return `${price} DESC, l.id ASC`;
    case 'size_desc':
      return 'l.sqft DESC, l.id ASC';
    case 'available':
      return `l.available_on ASC, ${price} ASC, l.id ASC`;
    case 'price_per_sqft':
      return `CAST(${price} AS REAL) / l.sqft ASC, l.id ASC`;
  }
}

/** Search terms beyond this many are ignored to keep the statement small. */
const MAX_SEARCH_TERMS = 5;

/** Escapes LIKE wildcards so user input is matched literally (used with `ESCAPE '\'`). */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function buildListingQuery(filters: ListingFilters, pageSize: number = PAGE_SIZE): ListingQuery {
  const price = PRICE_COLUMN[filters.type];
  const clauses: string[] = ['l.listing_type = ?'];
  const params: SQLInputValue[] = [filters.type];

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
    clauses.push(`${price} >= ?`);
    params.push(filters.minPrice);
  }

  if (filters.maxPrice !== null) {
    clauses.push(`${price} <= ?`);
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

  if (filters.type === 'sale') {
    // Without a status filter, show what can still be bought (or backed up on).
    if (filters.status) {
      clauses.push('l.sale_status = ?');
      params.push(filters.status);
    } else {
      clauses.push("l.sale_status IN ('active', 'pending')");
    }
  }

  return {
    where: `WHERE ${clauses.join(' AND ')}`,
    params,
    orderBy: orderBy(filters.sort, price),
    limit: pageSize,
    offset: (filters.page - 1) * pageSize,
  };
}
