import { useEffect, useState } from 'react';
import {
  countActiveFilters,
  formatCompactPrice,
  formatCurrency,
  type ListingFilters,
  type ListingType,
  type Neighborhood,
} from '@hearth/shared';
import { useDebouncedCallback } from '../hooks/misc';
import { SearchIcon } from './Icons';
import { Popover } from './Popover';

const PRICE_STEPS: Record<ListingType, number[]> = {
  rent: [1000, 1250, 1500, 1750, 2000, 2250, 2500, 2750, 3000, 3500, 4000, 4500, 5000],
  sale: [300_000, 400_000, 500_000, 600_000, 700_000, 800_000, 900_000, 1_000_000, 1_250_000, 1_500_000, 2_000_000],
};

const STATUS_CHOICES = [
  { value: '', label: 'For sale & pending' },
  { value: 'active', label: 'For sale only' },
  { value: 'pending', label: 'Pending' },
  { value: 'sold', label: 'Recently sold' },
];
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

  const activeCount = countActiveFilters(filters) + (filters.q ? 1 : 0);
  const priceSteps = PRICE_STEPS[filters.type];

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
            type="search"
            value={query}
            placeholder="Address, neighborhood or keyword"
            aria-label="Search listings"
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
            <div className="popover__title">{filters.type === 'sale' ? 'Price' : 'Monthly rent'}</div>
            <div className="price-range">
              <label>
                <span>Minimum</span>
                <select
                  value={filters.minPrice ?? ''}
                  onChange={(event) => onChange({ minPrice: event.target.value ? Number(event.target.value) : null })}
                >
                  <option value="">No min</option>
                  {priceSteps.map((step) => (
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
                  {priceSteps.map((step) => (
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

        {filters.type === 'rent' ? (
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
        ) : (
          <select
            className="filter-select"
            aria-label="Listing status"
            value={filters.status ?? ''}
            onChange={(event) => onChange({ status: (event.target.value || null) as ListingFilters['status'] })}
          >
            {STATUS_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        )}

        {activeCount > 0 && (
          <button type="button" className="link-button filter-bar__reset" onClick={onReset}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
