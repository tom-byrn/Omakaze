import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, type ListingFilters } from '@hearth/shared';
import { buildListingQuery, escapeLike } from '../src/lib/listingQuery';

const filters = (patch: Partial<ListingFilters> = {}): ListingFilters => ({ ...DEFAULT_FILTERS, ...patch });

describe('buildListingQuery', () => {
  it('has no WHERE clause without filters and sorts newest first', () => {
    const query = buildListingQuery(filters());
    expect(query.where).toBe('');
    expect(query.params).toEqual([]);
    expect(query.orderBy).toBe('l.listed_at DESC, l.id DESC');
    expect(query).toMatchObject({ limit: 12, offset: 0 });
  });

  it('combines every filter with AND, in a stable order', () => {
    const query = buildListingQuery(
      filters({ neighborhood: 'harborview', minPrice: 2000, maxPrice: 3500, beds: 2, baths: 1.5 }),
    );
    expect(query.where).toBe(
      'WHERE n.slug = ? AND l.rent >= ? AND l.rent <= ? AND l.beds >= ? AND l.baths >= ?',
    );
    expect(query.params).toEqual(['harborview', 2000, 3500, 2, 1.5]);
  });

  it('requires every search word to match', () => {
    const query = buildListingQuery(filters({ q: 'brick loft' }));
    expect(query.where.match(/LIKE/g)).toHaveLength(6);
    expect(query.params).toEqual(['%brick%', '%brick%', '%brick%', '%loft%', '%loft%', '%loft%']);
  });

  it('escapes LIKE wildcards in search text', () => {
    expect(escapeLike('100%_off\\')).toBe('100\\%\\_off\\\\');
    const query = buildListingQuery(filters({ q: '50%' }));
    expect(query.params[0]).toBe('%50\\%%');
  });

  it('maps pet filters to the policies that allow them', () => {
    expect(buildListingQuery(filters({ pets: 'cats' })).where).toBe("WHERE l.pets IN ('cats', 'cats_dogs')");
    expect(buildListingQuery(filters({ pets: 'dogs' })).where).toBe("WHERE l.pets IN ('dogs', 'cats_dogs')");
  });

  it.each([
    ['price_asc', 'l.rent ASC, l.id ASC'],
    ['price_desc', 'l.rent DESC, l.id ASC'],
    ['size_desc', 'l.sqft DESC, l.id ASC'],
    ['available', 'l.available_on ASC, l.rent ASC, l.id ASC'],
  ] as const)('orders %s results by %s', (sort, orderBy) => {
    expect(buildListingQuery(filters({ sort })).orderBy).toBe(orderBy);
  });

  it('turns the page number into an offset', () => {
    expect(buildListingQuery(filters({ page: 3 }))).toMatchObject({ limit: 12, offset: 24 });
    expect(buildListingQuery(filters({ page: 2 }), 5)).toMatchObject({ limit: 5, offset: 5 });
  });
});
