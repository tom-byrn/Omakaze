import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS } from '../src/filters';
import { criteriaFrom, describeSearch, validateSavedSearch } from '../src/savedSearches';

const criteria = criteriaFrom(DEFAULT_FILTERS);

describe('describeSearch', () => {
  it('summarizes the search in a few words', () => {
    expect(describeSearch(criteria)).toBe('Rentals in Port Ellis');
    expect(
      describeSearch({ ...criteria, type: 'sale', minPrice: 600_000, maxPrice: 900_000, beds: 3 }, 'Harborview'),
    ).toBe('Homes for sale in Harborview · $600K–$900K · 3+ beds');
    expect(describeSearch({ ...criteria, maxPrice: 2500, pets: 'dogs', q: 'balcony' })).toBe(
      'Rentals in Port Ellis · up to $2.5K · dogs OK · “balcony”',
    );
  });
});

describe('validateSavedSearch', () => {
  it('normalizes the criteria and names the search after them', () => {
    const result = validateSavedSearch(
      { criteria: { type: 'sale', neighborhood: 'larch-hill', beds: '4', page: '3', pets: 'cats' } },
      'Larch Hill',
    );
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Homes for sale in Larch Hill · 4+ beds',
        criteria: { ...criteria, type: 'sale', neighborhood: 'larch-hill', beds: 4 },
        alertFrequency: 'daily',
      },
    });
  });

  it('rejects unknown alert frequencies and overly long names', () => {
    const result = validateSavedSearch({ criteria: {}, alertFrequency: 'hourly', name: 'x'.repeat(101) });
    expect(result.ok ? [] : Object.keys(result.errors).sort()).toEqual(['alertFrequency', 'name']);
  });
});
