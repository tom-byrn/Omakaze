export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'size_desc', label: 'Largest first' },
  { value: 'available', label: 'Available soonest' },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]['value'];

export type PetFilter = 'cats' | 'dogs';

export interface ListingFilters {
  /** Free-text search over address, description and neighborhood name. */
  q: string;
  /** Neighborhood slug. */
  neighborhood: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  /** Minimum number of bedrooms. */
  beds: number | null;
  /** Minimum number of bathrooms (halves allowed). */
  baths: number | null;
  pets: PetFilter | null;
  sort: SortOption;
  page: number;
}

export const PAGE_SIZE = 12;
export const MAX_QUERY_LENGTH = 80;
export const MAX_PAGE = 500;

export const DEFAULT_FILTERS: Readonly<ListingFilters> = Object.freeze({
  q: '',
  neighborhood: null,
  minPrice: null,
  maxPrice: null,
  beds: null,
  baths: null,
  pets: null,
  sort: 'newest',
  page: 1,
});

type ParamValue = string | string[] | undefined | null;

/** Anything that looks like a query string: URLSearchParams on the client, `req.query` on the server. */
export type FilterSource = URLSearchParams | Record<string, ParamValue>;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readParam(source: FilterSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) {
    return source.get(key) ?? undefined;
  }
  const value = source[key];
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

/** Parses a number and snaps it to `step`; anything outside [min, max] is treated as "no filter". */
function parseNumberInRange(
  raw: string | undefined,
  min: number,
  max: number,
  step = 1,
): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const snapped = Math.round(value / step) * step;
  if (snapped < min || snapped > max) return null;
  return snapped;
}

export function isSortOption(value: unknown): value is SortOption {
  return SORT_OPTIONS.some((option) => option.value === value);
}

/**
 * Normalizes untrusted query parameters into a complete, valid filter object.
 * Invalid values are dropped rather than rejected so that a hand-edited URL
 * still produces a sensible search.
 */
export function parseListingFilters(source: FilterSource): ListingFilters {
  const q = (readParam(source, 'q') ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH);

  const neighborhoodRaw = readParam(source, 'neighborhood')?.trim().toLowerCase();
  const neighborhood =
    neighborhoodRaw && SLUG_PATTERN.test(neighborhoodRaw) ? neighborhoodRaw : null;

  let minPrice = parseNumberInRange(readParam(source, 'minPrice'), 0, 100_000_000);
  let maxPrice = parseNumberInRange(readParam(source, 'maxPrice'), 0, 100_000_000);
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  const petsRaw = readParam(source, 'pets');
  const sortRaw = readParam(source, 'sort');

  return {
    q,
    neighborhood,
    minPrice,
    maxPrice,
    beds: parseNumberInRange(readParam(source, 'beds'), 0, 10),
    baths: parseNumberInRange(readParam(source, 'baths'), 0.5, 10, 0.5),
    pets: petsRaw === 'cats' || petsRaw === 'dogs' ? petsRaw : null,
    sort: isSortOption(sortRaw) ? sortRaw : DEFAULT_FILTERS.sort,
    page: parseNumberInRange(readParam(source, 'page'), 1, MAX_PAGE) ?? 1,
  };
}

/** Serializes filters back into a query string, leaving out anything that matches the defaults. */
export function filtersToSearchParams(filters: Partial<ListingFilters>): URLSearchParams {
  const merged: ListingFilters = { ...DEFAULT_FILTERS, ...filters };
  const params = new URLSearchParams();

  if (merged.q) params.set('q', merged.q);
  if (merged.neighborhood) params.set('neighborhood', merged.neighborhood);
  if (merged.minPrice !== null) params.set('minPrice', String(merged.minPrice));
  if (merged.maxPrice !== null) params.set('maxPrice', String(merged.maxPrice));
  if (merged.beds !== null) params.set('beds', String(merged.beds));
  if (merged.baths !== null) params.set('baths', String(merged.baths));
  if (merged.pets !== null) params.set('pets', merged.pets);
  if (merged.sort !== DEFAULT_FILTERS.sort) params.set('sort', merged.sort);
  if (merged.page > 1) params.set('page', String(merged.page));

  return params;
}

/** Number of narrowing filters in effect (search text, sort and paging don't count). */
export function countActiveFilters(filters: ListingFilters): number {
  let count = 0;
  if (filters.neighborhood) count += 1;
  if (filters.minPrice !== null || filters.maxPrice !== null) count += 1;
  if (filters.beds !== null) count += 1;
  if (filters.baths !== null) count += 1;
  if (filters.pets !== null) count += 1;
  return count;
}
