import { useEffect, useRef, useState } from 'react';
import {
  countActiveFilters,
  formatCompactPrice,
  formatCurrency,
  type ListingFilters,
  type Neighborhood,
} from '@hearth/shared';
import { useDebouncedCallback } from '../hooks/misc';
import { SearchIcon } from './Icons';
import { Popover } from './Popover';

const PRICE_STEPS = [1000, 1250, 1500, 1750, 2000, 2250, 2500, 2750, 3000, 3500, 4000, 4500, 5000];
const BED_CHOICES = [null, 1, 2, 3, 4] as const;
const BATH_CHOICES = [null, 1, 1.5, 2, 3] as const;

interface FilterBarProps {
  filters: ListingFilters;
  neighborhoods: Neighborhood[];
  onChange: (patch: Partial<ListingFilters>) => void;
  onReset: () => void;
}

function priceLabel({ minPrice, maxPrice }: ListingFilters): string {
  if (minPrice !== null && maxPrice !== null) {
    return `${formatCompactPrice(minPrice)}–${formatCompactPrice(maxPrice)}`;
  }
  if (minPrice !== null) return `${formatCompactPrice(minPrice)}+`;
  if (maxPrice !== null) return `Up to ${formatCompactPrice(maxPrice)}`;
  return 'Price';
}

function bedsBathsLabel({ beds, baths }: ListingFilters): string {
  const parts = [beds !== null && `${beds}+ bd`, baths !== null && `${baths}+ ba`].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Beds & baths';
}

export function FilterBar({ filters, neighborhoods, onChange, onReset }: FilterBarProps) {
  const [query, setQuery] = useState(filters.q);
  const search = useDebouncedCallback((q: string) => onChange({ q }), 350);

  useEffect(() => setQuery(filters.q), [filters.q]);

  // "/" jumps to the search box, as on most search-heavy sites, unless the visitor is already typing.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeCount = countActiveFilters(filters) + (filters.q ? 1 : 0);

  return (
    <div className="filter-bar">
      <div className="filter-bar__inner">
        <form
          className="search-box"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            search.cancel();
            onChange({ q: query.trim() });
          }}
        >
          <SearchIcon size={18} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Address, neighborhood or keyword"
            aria-label="Search listings"
            aria-keyshortcuts="/"
            onChange={(event) => {
              setQuery(event.target.value);
              search.call(event.target.value.trim());
            }}
          />
        </form>

        <select
          className="filter-select"
          aria-label="Neighborhood"
          value={filters.neighborhood ?? ''}
          onChange={(event) => onChange({ neighborhood: event.target.value || null })}
        >
          <option value="">All neighborhoods</option>
          {neighborhoods.map((hood) => (
            <option key={hood.slug} value={hood.slug}>
              {hood.name}
            </option>
          ))}
        </select>

        <Popover label={priceLabel(filters)} active={filters.minPrice !== null || filters.maxPrice !== null}>
          <div className="popover__section">
            <div className="popover__title">Monthly rent</div>
            <div className="price-range">
              <label>
                <span>Minimum</span>
                <select
                  value={filters.minPrice ?? ''}
                  onChange={(event) => onChange({ minPrice: event.target.value ? Number(event.target.value) : null })}
                >
                  <option value="">No min</option>
                  {PRICE_STEPS.map((step) => (
                    <option key={step} value={step}>
                      {formatCurrency(step)}
                    </option>
                  ))}
                </select>
              </label>
              <span className="price-range__dash">–</span>
              <label>
                <span>Maximum</span>
                <select
                  value={filters.maxPrice ?? ''}
                  onChange={(event) => onChange({ maxPrice: event.target.value ? Number(event.target.value) : null })}
                >
                  <option value="">No max</option>
                  {PRICE_STEPS.map((step) => (
                    <option key={step} value={step}>
                      {formatCurrency(step)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </Popover>

        <Popover label={bedsBathsLabel(filters)} active={filters.beds !== null || filters.baths !== null}>
          <div className="popover__section">
            <div className="popover__title">Bedrooms</div>
            <div className="segmented" role="group" aria-label="Minimum bedrooms">
              {BED_CHOICES.map((value) => (
                <button
                  key={value ?? 'any'}
                  type="button"
                  className={filters.beds === value ? 'is-selected' : ''}
                  aria-pressed={filters.beds === value}
                  onClick={() => onChange({ beds: value })}
                >
                  {value === null ? 'Any' : `${value}+`}
                </button>
              ))}
            </div>
          </div>
          <div className="popover__section">
            <div className="popover__title">Bathrooms</div>
            <div className="segmented" role="group" aria-label="Minimum bathrooms">
              {BATH_CHOICES.map((value) => (
                <button
                  key={value ?? 'any'}
                  type="button"
                  className={filters.baths === value ? 'is-selected' : ''}
                  aria-pressed={filters.baths === value}
                  onClick={() => onChange({ baths: value })}
                >
                  {value === null ? 'Any' : `${value}+`}
                </button>
              ))}
            </div>
          </div>
        </Popover>

        <select
          className="filter-select"
          aria-label="Pets"
          value={filters.pets ?? ''}
          onChange={(event) => onChange({ pets: (event.target.value || null) as ListingFilters['pets'] })}
        >
          <option value="">Pets: any</option>
          <option value="cats">Cats allowed</option>
          <option value="dogs">Dogs allowed</option>
        </select>

        {activeCount > 0 && (
          <button type="button" className="link-button filter-bar__reset" onClick={onReset}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
