import { useState, type PointerEvent } from 'react';
import { formatCompactPrice, formatCurrency, formatDate, parseIsoDate, type PriceEvent } from '@hearth/shared';
import { api } from '../../api';
import { useAsync } from '../../hooks/useAsync';

const EVENT_LABELS: Record<PriceEvent['event'], string> = {
  listed: 'Listed for sale',
  price_change: 'Price change',
  pending: 'Pending sale',
  sold: 'Sold',
};

const WIDTH = 680;
const HEIGHT = 240;
const MARGIN = { top: 16, right: 20, bottom: 30, left: 58 };

/** A "nice" axis step (1, 2, 2.5 or 5 times a power of ten) giving about four ticks. */
function niceStep(range: number): number {
  const raw = range / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((step) => step >= raw) ?? raw;
}

function PriceChart({ events }: { events: PriceEvent[] }) {
  const [active, setActive] = useState<number | null>(null);
  const times = events.map((event) => parseIsoDate(event.date).getTime());
  const prices = events.map((event) => event.price);

  const step = niceStep(Math.max(...prices) - Math.min(...prices) || Math.max(...prices));
  const yMin = Math.max(0, Math.floor((Math.min(...prices) * 0.95) / step) * step);
  const yMax = Math.ceil((Math.max(...prices) * 1.03) / step) * step;
  const yTicks = Array.from({ length: Math.round((yMax - yMin) / step) + 1 }, (_, i) => yMin + i * step);

  const [tMin, tMax] = [Math.min(...times), Math.max(...times)];
  const span = tMax - tMin || 86_400_000 * 30;
  const x = (t: number) => MARGIN.left + ((t - tMin) / span) * (WIDTH - MARGIN.left - MARGIN.right);
  const y = (p: number) => MARGIN.top + (1 - (p - yMin) / (yMax - yMin)) * (HEIGHT - MARGIN.top - MARGIN.bottom);

  const firstYear = new Date(tMin).getUTCFullYear();
  const lastYear = new Date(tMax).getUTCFullYear();
  const yearStep = Math.max(1, Math.ceil((lastYear - firstYear) / 6));
  const xTicks = Array.from({ length: Math.floor((lastYear - firstYear) / yearStep) + 1 }, (_, i) => firstYear + i * yearStep)
    .map((year) => ({ year, t: Date.UTC(year, 0, 1) }))
    .filter(({ t }) => t >= tMin && t <= tMax);

  const points = events.map((event, i) => ({ event, cx: x(times[i]), cy: y(event.price) }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ');
  const baseline = y(yMin);
  const area = `${line} L${points[points.length - 1].cx},${baseline} L${points[0].cx},${baseline} Z`;

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * WIDTH;
    const nearest = points.reduce((best, p, i) => (Math.abs(p.cx - px) < Math.abs(points[best].cx - px) ? i : best), 0);
    setActive(nearest);
  };

  const current = active === null ? null : points[active];
  // Keep the tooltip inside the chart: anchor it away from the nearest edge.
  const tooltipClass = current
    ? [
        'chart-tooltip',
        current.cx > WIDTH * 0.7 ? 'chart-tooltip--end' : current.cx < WIDTH * 0.3 ? 'chart-tooltip--start' : '',
        current.cy < HEIGHT * 0.35 ? 'chart-tooltip--below' : '',
      ]
        .filter(Boolean)
        .join(' ')
    : '';
  return (
    <div className="price-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Price history chart"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setActive(null)}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(tick)} y2={y(tick)} className="chart-grid" />
            <text x={MARGIN.left - 10} y={y(tick) + 4} className="chart-label chart-label--y">
              {formatCompactPrice(tick)}
            </text>
          </g>
        ))}
        {xTicks.map(({ year, t }) => (
          <text key={year} x={x(t)} y={HEIGHT - 8} className="chart-label chart-label--x">
            {year}
          </text>
        ))}
        <path d={area} className="chart-area" />
        <path d={line} className="chart-line" />
        {current && <line x1={current.cx} x2={current.cx} y1={MARGIN.top} y2={baseline} className="chart-crosshair" />}
        {points.map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r={i === active ? 6 : 4.5} className="chart-point" />
        ))}
      </svg>
      {current && (
        <div
          className={tooltipClass}
          style={{ left: `${(current.cx / WIDTH) * 100}%`, top: `${(current.cy / HEIGHT) * 100}%` }}
        >
          <strong>{formatCurrency(current.event.price)}</strong>
          <span>
            {EVENT_LABELS[current.event.event]} · {formatDate(current.event.date)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatChange(change: number, from: number): string {
  const sign = change > 0 ? '+' : '−';
  return `${sign}${formatCurrency(Math.abs(change))} (${sign}${Math.abs((change / from) * 100).toFixed(1)}%)`;
}

/** Price history chart plus the same events as a table. */
export function PriceHistory({ listingId }: { listingId: number }) {
  const { data, error } = useAsync((signal) => api.priceHistory(listingId, signal), [listingId]);
  if (error) return <p className="notice notice--error">Price history isn’t available right now.</p>;
  if (!data) return <div className="price-chart price-chart--loading" />;
  const events = data.events;
  if (events.length === 0) return <p className="muted">No price history for this home yet.</p>;

  return (
    <>
      <PriceChart events={events} />
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Event</th>
            <th className="numeric">Price</th>
            <th className="numeric">Change</th>
          </tr>
        </thead>
        <tbody>
          {[...events].reverse().map((event, index, list) => {
            const previous = list[index + 1];
            const change = previous ? event.price - previous.price : null;
            return (
              <tr key={`${event.date}-${event.event}`}>
                <td>{formatDate(event.date)}</td>
                <td>{EVENT_LABELS[event.event]}</td>
                <td className="numeric">{formatCurrency(event.price)}</td>
                <td className={`numeric${change && change < 0 ? ' is-down' : change ? ' is-up' : ''}`}>
                  {change ? formatChange(change, previous.price) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
