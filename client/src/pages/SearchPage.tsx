import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  DEFAULT_FILTERS,
  SORT_OPTIONS,
  filtersToSearchParams,
  formatCompactPrice,
  isSortOption,
  parseListingFilters,
  type ListingFilters,
} from '@hearth/shared';
import { api } from '../api';
import { EmptyState } from '../components/EmptyState';
import { FilterBar } from '../components/FilterBar';
import { SearchIcon } from '../components/Icons';
import { ListingCard } from '../components/ListingCard';
import { MapPopupCard } from '../components/MapPopupCard';
import { Pagination } from '../components/Pagination';
import { useDocumentTitle, useToday } from '../hooks/misc';
import { useAsync } from '../hooks/useAsync';
import { useNeighborhoods } from '../hooks/useNeighborhoods';
import { MapView, type MapMarker } from '../map/MapView';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseListingFilters(searchParams), [searchParams]);
  const neighborhoods = useNeighborhoods();
  const today = useToday();
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, error, loading } = useAsync(
    (signal) => api.searchListings(filters, signal),
    [filtersToSearchParams(filters).toString()],
  );

  const neighborhood = neighborhoods.find((hood) => hood.slug === filters.neighborhood);
  const place = neighborhood?.name ?? 'Port Ellis';
  useDocumentTitle(`Rentals in ${place}`);

  const updateFilters = (patch: Partial<ListingFilters>) => {
    const next = { ...filters, ...patch };
    if (!('page' in patch)) next.page = 1;
    setSelectedId(null);
    setSearchParams(filtersToSearchParams(next));
    if ('page' in patch) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const markers: MapMarker[] = useMemo(
    () =>
      (data?.mapPoints ?? []).map((point) => ({
        id: point.id,
        location: point.location,
        label: formatCompactPrice(point.price),
      })),
    [data],
  );

  return (
    <div className="search-page">
      <FilterBar
        filters={filters}
        neighborhoods={neighborhoods}
        onChange={updateFilters}
        onReset={() => setSearchParams(filtersToSearchParams({ sort: filters.sort }))}
      />

      <div className="search-layout">
        <section className="search-results" aria-busy={loading}>
          <header className="results-header">
            <div>
              <h1 className="results-header__title">Rentals in {place}</h1>
              <p className="results-header__count">
                {data ? `${data.total} ${data.total === 1 ? 'home' : 'homes'} available` : 'Searching…'}
                {filters.q && <> matching “{filters.q}”</>}
              </p>
            </div>
            <label className="sort-select">
              <span>Sort by</span>
              <select
                value={filters.sort}
                onChange={(event) =>
                  isSortOption(event.target.value) && updateFilters({ sort: event.target.value })
                }
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </header>

          {error && (
            <div className="notice notice--error" role="alert">
              We couldn’t load listings right now. {error.message}
            </div>
          )}

          {!data && loading && (
            <div className="listing-grid">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="listing-card listing-card--skeleton" />
              ))}
            </div>
          )}

          {data && data.results.length === 0 && (
            <EmptyState
              icon={<SearchIcon size={28} />}
              title="No homes match your search"
              action={
                <button type="button" className="button button--secondary" onClick={() => setSearchParams(filtersToSearchParams(DEFAULT_FILTERS))}>
                  Clear all filters
                </button>
              }
            >
              Try widening the price range or searching a nearby neighborhood.
            </EmptyState>
          )}

          {data && data.results.length > 0 && (
            <>
              <div className="listing-grid">
                {data.results.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    today={today}
                    highlighted={listing.id === hoveredId || listing.id === selectedId}
                    onHover={setHoveredId}
                  />
                ))}
              </div>
              <Pagination
                page={data.page}
                pageCount={data.pageCount}
                onChange={(page) => updateFilters({ page })}
              />
            </>
          )}
        </section>

        <aside className="search-map" aria-label="Map of results">
          <MapView
            markers={markers}
            activeId={hoveredId}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onHover={setHoveredId}
            highlight={filters.neighborhood}
            focus={filters.neighborhood}
            renderPopup={(id) => (
              <MapPopupCard listingId={id} listing={data?.results.find((listing) => listing.id === id)} />
            )}
          />
        </aside>
      </div>
    </div>
  );
}
