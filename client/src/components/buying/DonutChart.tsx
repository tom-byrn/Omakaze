import { formatCurrency } from '@hearth/shared';

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

const SIZE = 168;
const RADIUS = 66;
const STROKE = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Surface-colored gap between segments, in px along the ring. */
const GAP = 2;

/** Part-to-whole ring with the total in the middle; each segment has a native tooltip. */
export function DonutChart({ segments, total, caption }: { segments: DonutSegment[]; total: string; caption: string }) {
  const sum = segments.reduce((acc, segment) => acc + segment.value, 0);
  const arcs = segments.map((segment, index) => {
    const start = segments.slice(0, index).reduce((acc, s) => acc + s.value, 0);
    const length = sum > 0 ? (segment.value / sum) * CIRCUMFERENCE : 0;
    return { ...segment, start: (start / sum) * CIRCUMFERENCE, length: Math.max(0, length - (segments.length > 1 ? GAP : 0)) };
  });

  return (
    <svg className="donut" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${caption}: ${total}`}>
      <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={arc.color}
            strokeWidth={STROKE}
            strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
            strokeDashoffset={-arc.start}
          >
            <title>{`${arc.label}: ${formatCurrency(arc.value)}`}</title>
          </circle>
        ))}
      </g>
      <text x={SIZE / 2} y={SIZE / 2 - 2} className="donut__total">
        {total}
      </text>
      <text x={SIZE / 2} y={SIZE / 2 + 20} className="donut__caption">
        {caption}
      </text>
    </svg>
  );
}
