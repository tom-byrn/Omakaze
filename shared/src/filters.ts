import type { ListingType, SaleStatus } from './types';

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest', types: ['rent', 'sale'] },
  { value: 'price_asc', label: 'Price: low to high', types: ['rent', 'sale'] },
  { value: 'price_desc', label: 'Price: high to low', types: ['rent', 'sale'] },
  { value: 'size_desc', label: 'Largest first', types: ['rent', 'sale'] },
  { value: 'available', label: 'Available soonest', types: ['rent'] },
  { value: 'price_per_sqft', label: 'Price per sqft', types: ['sale'] },
] as const satisfies readonly { value: string; label: string; types: readonly ListingType[] }[];

export type SortOption = (typeof SORT_OPTIONS)[number]['value'];

export type PetFilter = 'cats' | 'dogs';

export const SALE_STATUS_FILTERS: readonly SaleStatus[] = ['active', 'pending', 'sold'];

export interface ListingFilters {
  /** Rentals or homes for sale. */
  type: ListingType;
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
  /** Rentals only. */
  pets: PetFilter | null;
  /** Homes for sale only; `null` means active and pending listings. */
  status: SaleStatus | null;
  sort: SortOption;
  page: number;
}

export const PAGE_SIZE = 12;
export const MAX_QUERY_LENGTH = 80;
export const MAX_PAGE = 500;

export const DEFAULT_FILTERS: Readonly<ListingFilters> = Object.freeze({
  type: 'rent',
  q: '',
  neighborhood: null,
  minPrice: null,
  maxPrice: null,
  beds: null,
  baths: null,
  pets: null,
  status: null,
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

function supportsType(option: (typeof SORT_OPTIONS)[number], type: ListingType): boolean {
  return (option.types as readonly ListingType[]).includes(type);
}

/** Whether `value` is a sort option, optionally one that applies to the given listing type. */
export function isSortOption(value: unknown, type?: ListingType): value is SortOption {
  return SORT_OPTIONS.some((option) => option.value === value && (!type || supportsType(option, type)));
}

export function sortOptionsFor(type: ListingType) {
  return SORT_OPTIONS.filter((option) => supportsType(option, type));
}

/**
 * Normalizes untrusted query parameters into a complete, valid filter object.
 * Invalid values are dropped rather than rejected so that a hand-edited URL
 * still produces a sensible search.
 */
export function parseListingFilters(source: FilterSource): ListingFilters {
  const type: ListingType = readParam(source, 'type') === 'sale' ? 'sale' : 'rent';
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
  const statusRaw = readParam(source, 'status') as SaleStatus | undefined;
  const sortRaw = readParam(source, 'sort');

  return {
    type,
    q,
    neighborhood,
    minPrice,
    maxPrice,
    beds: parseNumberInRange(readParam(source, 'beds'), 0, 10),
    baths: parseNumberInRange(readParam(source, 'baths'), 0.5, 10, 0.5),
    pets: type === 'rent' && (petsRaw === 'cats' || petsRaw === 'dogs') ? petsRaw : null,
    status: type === 'sale' && statusRaw && SALE_STATUS_FILTERS.includes(statusRaw) ? statusRaw : null,
    sort: isSortOption(sortRaw, type) ? sortRaw : DEFAULT_FILTERS.sort,
    page: parseNumberInRange(readParam(source, 'page'), 1, MAX_PAGE) ?? 1,
  };
}

/** Serializes filters back into a query string, leaving out anything that matches the defaults. */
export function filtersToSearchParams(filters: Partial<ListingFilters>): URLSearchParams {
  const merged: ListingFilters = { ...DEFAULT_FILTERS, ...filters };
  const params = new URLSearchParams();

  if (merged.type !== DEFAULT_FILTERS.type) params.set('type', merged.type);
  if (merged.q) params.set('q', merged.q);
  if (merged.neighborhood) params.set('neighborhood', merged.neighborhood);
  if (merged.minPrice !== null) params.set('minPrice', String(merged.minPrice));
  if (merged.maxPrice !== null) params.set('maxPrice', String(merged.maxPrice));
  if (merged.beds !== null) params.set('beds', String(merged.beds));
  if (merged.baths !== null) params.set('baths', String(merged.baths));
  if (merged.pets !== null) params.set('pets', merged.pets);
  if (merged.status !== null) params.set('status', merged.status);
  if (merged.sort !== DEFAULT_FILTERS.sort) params.set('sort', merged.sort);
  if (merged.page > 1) params.set('page', String(merged.page));

  return params;
}

/** Number of narrowing filters in effect (listing type, search text, sort and paging don't count). */
export function countActiveFilters(filters: ListingFilters): number {
  let count = 0;
  if (filters.neighborhood) count += 1;
  if (filters.minPrice !== null || filters.maxPrice !== null) count += 1;
  if (filters.beds !== null) count += 1;
  if (filters.baths !== null) count += 1;
  if (filters.pets !== null) count += 1;
  if (filters.status !== null) count += 1;
  return count;
}
