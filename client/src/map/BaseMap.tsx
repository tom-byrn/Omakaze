import { memo, useId } from 'react';
import {
  CANAL,
  LAND,
  MARSH,
  NEIGHBORHOOD_SHAPES,
  PARKS,
  RAIL,
  RESERVOIR,
  RIVER,
  ROADS,
  STATIONS,
  polygonPath,
  smoothPath,
  type NeighborhoodShape,
} from './geometry';

const NEIGHBORHOOD_NAMES: Record<string, string> = {
  harborview: 'Harborview',
  northgate: 'Northgate',
  'old-mill': 'Old Mill',
  'larch-hill': 'Larch Hill',
  'ferry-point': 'Ferry Point',
  'canal-district': 'Canal District',
  'kestrel-park': 'Kestrel Park',
  saltmarsh: 'Saltmarsh',
};

const landPath = smoothPath(LAND, true, 0.35);
const riverPath = smoothPath(RIVER);
const canalPath = smoothPath(CANAL, false, 0.2);
const marshPath = smoothPath(MARSH, true, 0.3);
const reservoirPath = smoothPath(RESERVOIR, true);
const railPath = smoothPath(RAIL);
const parkPaths = PARKS.map((park) => ({ ...park, d: smoothPath(park.points, true, 0.45) }));
const roadPaths = ROADS.map((road) => ({ major: road.major, d: smoothPath(road.points, false, 0.4) }));
const neighborhoods = Object.entries(NEIGHBORHOOD_SHAPES);

function gridLines(shape: NeighborhoodShape): string {
  const xs = shape.points.map((p) => p[0]);
  const ys = shape.points.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const reach = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const { spacing } = shape.grid;
  let d = '';
  for (let offset = -reach; offset <= reach; offset += spacing) {
    d += `M${cx - reach},${cy + offset} H${cx + reach} `;
    d += `M${cx + offset},${cy - reach} V${cy + reach} `;
  }
  return d;
}

const gridPaths = Object.fromEntries(neighborhoods.map(([slug, shape]) => [slug, gridLines(shape)]));

interface BaseMapProps {
  /** Current zoom level; labels and strokes are scaled so they stay readable. */
  zoom: number;
  /** Neighborhood slug to emphasise, e.g. the one the search is filtered to. */
  highlight?: string | null;
}

/** The static layers of the Port Ellis map: water, land, parks, streets and labels. */
export const BaseMap = memo(function BaseMap({ zoom, highlight = null }: BaseMapProps) {
  const id = useId().replace(/:/g, '');
  const k = 1 / Math.sqrt(zoom);
  const labelSize = 15 / zoom ** 0.75;

  return (
    <g className="base-map">
      <defs>
        <clipPath id={`${id}-land`}>
          <path d={landPath} />
        </clipPath>
        {neighborhoods.map(([slug, shape]) => (
          <clipPath id={`${id}-${slug}`} key={slug}>
            <path d={polygonPath(shape.points)} />
          </clipPath>
        ))}
        <pattern id={`${id}-reeds`} width="16" height="12" patternUnits="userSpaceOnUse">
          <path d="M3 10 l1.5 -5 M7 10 l0.5 -6 M11 10 l1.5 -4" className="map-reeds" />
        </pattern>
      </defs>

      <rect x={-200} y={-200} width={1400} height={1400} className="map-water" />
      <path d={landPath} className="map-shore" strokeWidth={10 * k} />

      <g clipPath={`url(#${id}-land)`}>
        <rect x={-20} y={-20} width={1040} height={1040} className="map-land" />
        {neighborhoods.map(([slug, shape], index) => (
          <g key={slug} clipPath={`url(#${id}-${slug})`}>
            <path
              d={polygonPath(shape.points)}
              className={`map-hood map-hood--${index % 3}${highlight === slug ? ' is-highlighted' : ''}`}
            />
            <path
              d={gridPaths[slug]}
              transform={`rotate(${shape.grid.angle} ${shape.label[0]} ${shape.label[1]})`}
              className="map-street"
              strokeWidth={2.2 * k}
            />
          </g>
        ))}
        <path d={marshPath} className="map-marsh" />
        <path d={marshPath} fill={`url(#${id}-reeds)`} />
        {parkPaths.map((park, index) => (
          <path key={index} d={park.d} className="map-park" />
        ))}
        <path d={reservoirPath} className="map-water" />
        {roadPaths.map((road, index) => (
          <path
            key={`casing-${index}`}
            d={road.d}
            className="map-road-casing"
            strokeWidth={(road.major ? 9 : 6) * k}
          />
        ))}
        {roadPaths.map((road, index) => (
          <path
            key={`road-${index}`}
            d={road.d}
            className="map-road"
            strokeWidth={(road.major ? 6 : 3.5) * k}
          />
        ))}
        <path d={railPath} className="map-rail" strokeWidth={2.5 * k} strokeDasharray={`${8 * k} ${5 * k}`} />
        {neighborhoods.map(([slug, shape]) => (
          <path
            key={`edge-${slug}`}
            d={polygonPath(shape.points)}
            className={`map-hood-edge${highlight === slug ? ' is-highlighted' : ''}`}
            strokeWidth={(highlight === slug ? 2.5 : 1.5) * k}
            strokeDasharray={highlight === slug ? undefined : `${6 * k} ${5 * k}`}
          />
        ))}
      </g>

      <path d={riverPath} className="map-river" strokeWidth={20 * k + 6} />
      <path d={canalPath} className="map-river" strokeWidth={9 * k + 2} />

      {STATIONS.map((station) => (
        <g key={station.name} transform={`translate(${station.at[0]} ${station.at[1]})`}>
          <circle r={6 * k} className="map-station" strokeWidth={2.5 * k} />
        </g>
      ))}

      {parkPaths
        .filter((park) => park.name)
        .map((park) => {
          const xs = park.points.map((p) => p[0]);
          const ys = park.points.map((p) => p[1]);
          return (
            <text
              key={park.name}
              x={(Math.min(...xs) + Math.max(...xs)) / 2}
              y={(Math.min(...ys) + Math.max(...ys)) / 2 + 30}
              className="map-park-label"
              fontSize={labelSize * 0.8}
            >
              {park.name}
            </text>
          );
        })}

      {neighborhoods.map(([slug, shape]) => (
        <text
          key={`label-${slug}`}
          x={shape.label[0]}
          y={shape.label[1]}
          className={`map-label${highlight === slug ? ' is-highlighted' : ''}`}
          fontSize={labelSize}
          strokeWidth={4 * k}
        >
          {NEIGHBORHOOD_NAMES[slug] ?? slug}
        </text>
      ))}

      <text x={118} y={300} className="map-water-label" fontSize={labelSize * 1.05} transform="rotate(-90 118 300)">
        Ellis Sound
      </text>
    </g>
  );
});
