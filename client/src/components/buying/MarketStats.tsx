import { formatCurrency, formatPercent, type MarketMetrics, type NeighborhoodRef } from '@hearth/shared';
import { api } from '../../api';
import { useAsync } from '../../hooks/useAsync';

const TILES: { label: string; value: (m: MarketMetrics) => string | null }[] = [
  { label: 'Median list price', value: (m) => (m.medianListPrice === null ? null : formatCurrency(m.medianListPrice)) },
  { label: 'Median price per sqft', value: (m) => (m.medianPricePerSqft === null ? null : formatCurrency(m.medianPricePerSqft)) },
  { label: 'Average days on market', value: (m) => (m.averageDaysOnMarket === null ? null : `${m.averageDaysOnMarket} ${m.averageDaysOnMarket === 1 ? 'day' : 'days'}`) },
  { label: 'Sale-to-list price', value: (m) => (m.saleToListRatio === null ? null : formatPercent(m.saleToListRatio)) },
];

/** Neighborhood market figures next to the citywide ones. */
export function MarketStats({ neighborhood }: { neighborhood: NeighborhoodRef }) {
  const { data } = useAsync((signal) => api.market(neighborhood.slug, signal), [neighborhood.slug]);
  if (!data) return <div className="stat-grid stat-grid--loading" />;

  const { metrics, city } = data;
  return (
    <>
      <div className="stat-grid">
        {TILES.map((tile) => (
          <div key={tile.label} className="stat-tile">
            <div className="stat-tile__label">{tile.label}</div>
            <div className="stat-tile__value">{tile.value(metrics) ?? '—'}</div>
            <div className="stat-tile__context">Port Ellis: {tile.value(city) ?? '—'}</div>
          </div>
        ))}
      </div>
      <p className="section-note">
        {metrics.activeCount} for sale, {metrics.pendingCount} pending and {metrics.soldCount} sold in{' '}
        {neighborhood.name} over the last 12 months.
      </p>
    </>
  );
}
