import { parseListingFilters, type FilterSource, type ListingFilters } from './filters';
import { formatCompactPrice } from './format';
import { asRecord, asTrimmedString, validationResult, type ValidationResult } from './validation';

export const ALERT_FREQUENCIES = {
  instant: 'Right away',
  daily: 'Daily digest',
  weekly: 'Weekly digest',
  off: 'No emails',
} as const;

export type AlertFrequency = keyof typeof ALERT_FREQUENCIES;

export const DEFAULT_ALERT_FREQUENCY: AlertFrequency = 'daily';

/** What a saved search remembers: the filters without the page. */
export type SearchCriteria = Omit<ListingFilters, 'page'>;

export interface SavedSearch {
  id: number;
  name: string;
  criteria: SearchCriteria;
  alertFrequency: AlertFrequency;
  createdAt: string;
  /** Homes matching the search right now. */
  matchCount: number;
  /** Matches listed since the search was saved. */
  newCount: number;
}

export function criteriaFrom(filters: ListingFilters): SearchCriteria {
  const { page: _page, ...criteria } = filters;
  return criteria;
}

/** A short human summary, e.g. "Homes for sale in Harborview · $600K–$900K · 3+ beds". */
export function describeSearch(criteria: SearchCriteria, neighborhoodName?: string | null): string {
  const subject = criteria.type === 'sale' ? 'Homes for sale' : 'Rentals';
  const parts = [`${subject} in ${neighborhoodName ?? 'Port Ellis'}`];
  const { minPrice, maxPrice } = criteria;
  if (minPrice !== null && maxPrice !== null) parts.push(`${formatCompactPrice(minPrice)}–${formatCompactPrice(maxPrice)}`);
  else if (maxPrice !== null) parts.push(`up to ${formatCompactPrice(maxPrice)}`);
  else if (minPrice !== null) parts.push(`${formatCompactPrice(minPrice)}+`);
  if (criteria.beds !== null) parts.push(`${criteria.beds}+ beds`);
  if (criteria.baths !== null) parts.push(`${criteria.baths}+ baths`);
  if (criteria.pets) parts.push(criteria.pets === 'cats' ? 'cats OK' : 'dogs OK');
  if (criteria.q) parts.push(`“${criteria.q}”`);
  return parts.join(' · ');
}

export interface SavedSearchInput {
  name: string;
  criteria: SearchCriteria;
  alertFrequency: AlertFrequency;
}

export function validateSavedSearch(
  input: unknown,
  neighborhoodName?: string | null,
): ValidationResult<SavedSearchInput> {
  const body = asRecord(input);
  const criteria = criteriaFrom(parseListingFilters(asRecord(body.criteria) as FilterSource));
  const name = asTrimmedString(body.name) || describeSearch(criteria, neighborhoodName);
  const alertFrequency = body.alertFrequency ?? DEFAULT_ALERT_FREQUENCY;

  return validationResult<SavedSearchInput>(
    { name, criteria, alertFrequency: alertFrequency as AlertFrequency },
    {
      name: name.length > 100 ? 'Keep the name under 100 characters' : undefined,
      alertFrequency: Object.hasOwn(ALERT_FREQUENCIES, String(alertFrequency))
        ? undefined
        : 'Choose how often to email you',
    },
  );
}
