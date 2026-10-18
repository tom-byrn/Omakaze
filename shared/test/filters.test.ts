import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  countActiveFilters,
  filtersToSearchParams,
  parseListingFilters,
} from '../src/filters';

describe('parseListingFilters', () => {
  it('returns the defaults for an empty query', () => {
    expect(parseListingFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS);
    expect(parseListingFilters({})).toEqual(DEFAULT_FILTERS);
  });

  it('parses every supported parameter', () => {
    const filters = parseListingFilters(
      new URLSearchParams(
        'q=brick%20loft&neighborhood=old-mill&minPrice=1500&maxPrice=3000&beds=2&baths=1.5&pets=dogs&sort=price_asc&page=3',
      ),
    );
    expect(filters).toEqual({
      q: 'brick loft',
      neighborhood: 'old-mill',
      minPrice: 1500,
      maxPrice: 3000,
      beds: 2,
      baths: 1.5,
      pets: 'dogs',
      sort: 'price_asc',
      page: 3,
    });
  });

  it('accepts Express-style query objects, using the first value of repeated keys', () => {
    const filters = parseListingFilters({ beds: ['3', '1'], neighborhood: 'harborview', q: undefined });
    expect(filters.beds).toBe(3);
    expect(filters.neighborhood).toBe('harborview');
    expect(filters.q).toBe('');
  });

  it('normalizes whitespace and truncates long search text', () => {
    expect(parseListingFilters({ q: '   sunny    corner   unit ' }).q).toBe('sunny corner unit');
    expect(parseListingFilters({ q: 'x'.repeat(200) }).q).toHaveLength(80);
  });

  it('swaps a minimum price that is above the maximum', () => {
    const filters = parseListingFilters({ minPrice: '4000', maxPrice: '2000' });
    expect(filters.minPrice).toBe(2000);
    expect(filters.maxPrice).toBe(4000);
  });

  it('drops values that are not usable instead of failing', () => {
    const filters = parseListingFilters({
      neighborhood: 'Old Mill; DROP TABLE',
      minPrice: '-5',
      maxPrice: 'lots',
      beds: '42',
      baths: '0',
      pets: 'llamas',
      sort: 'random',
      page: '0',
    });
    expect(filters).toEqual(DEFAULT_FILTERS);
  });

  it('lower-cases neighborhood slugs and snaps baths to halves', () => {
    const filters = parseListingFilters({ neighborhood: 'Canal-District', baths: '1.4' });
    expect(filters.neighborhood).toBe('canal-district');
    expect(filters.baths).toBe(1.5);
  });

  it('treats a studio minimum (beds=0) as a real filter', () => {
    expect(parseListingFilters({ beds: '0' }).beds).toBe(0);
  });
});

describe('filtersToSearchParams', () => {
  it('omits defaults so URLs stay short', () => {
    expect(filtersToSearchParams(DEFAULT_FILTERS).toString()).toBe('');
    expect(filtersToSearchParams({ page: 1, sort: 'newest' }).toString()).toBe('');
  });

  it('round-trips through parseListingFilters', () => {
    const filters = {
      ...DEFAULT_FILTERS,
      q: 'garden',
      neighborhood: 'kestrel-park',
      maxPrice: 3500,
      beds: 2,
      pets: 'cats' as const,
      sort: 'size_desc' as const,
      page: 2,
    };
    expect(parseListingFilters(filtersToSearchParams(filters))).toEqual(filters);
  });
});

describe('countActiveFilters', () => {
  it('counts a price range once and ignores search text, sort and page', () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
    expect(
      countActiveFilters({ ...DEFAULT_FILTERS, q: 'loft', minPrice: 1000, maxPrice: 2000, sort: 'price_asc', page: 4 }),
    ).toBe(1);
    expect(
      countActiveFilters({ ...DEFAULT_FILTERS, neighborhood: 'saltmarsh', beds: 1, baths: 1, pets: 'dogs' }),
    ).toBe(4);
  });
});
