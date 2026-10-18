import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { LatLng } from '@hearth/shared';
import { BaseMap } from './BaseMap';
import { MAP_SIZE, NEIGHBORHOOD_SHAPES, project } from './geometry';

export interface MapMarker {
  id: number;
  location: LatLng;
  /** Short text shown in the marker, usually a compact price. */
  label: string;
  tone?: 'default' | 'muted';
}

interface MapViewProps {
  markers: MapMarker[];
  /** Marker to emphasise, e.g. the card the pointer is over. */
  activeId?: number | null;
  /** Marker whose popup is open. */
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
  onHover?: (id: number | null) => void;
  highlight?: string | null;
  /** Neighborhood to frame; `null` shows the whole city and `undefined` leaves the view alone. */
  focus?: string | null;
  initialCenter?: LatLng;
  initialZoom?: number;
  /** Enables dragging and the zoom buttons. */
  interactive?: boolean;
  variant?: 'price' | 'pin';
  renderPopup?: (id: number) => ReactNode;
  className?: string;
}

interface Size {
  width: number;
  height: number;
}

interface View {
  center: { x: number; y: number };
  zoom: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function baseScale(size: Size): number {
  return Math.max(size.width, size.height) / MAP_SIZE;
}

function clampCenter(center: View['center'], zoom: number, size: Size): View['center'] {
  const scale = baseScale(size) * zoom || 1;
  const halfW = size.width / scale / 2;
  const halfH = size.height / scale / 2;
  const clamp = (value: number, half: number) =>
    half * 2 >= MAP_SIZE ? MAP_SIZE / 2 : Math.min(MAP_SIZE - half, Math.max(half, value));
  return { x: clamp(center.x, halfW), y: clamp(center.y, halfH) };
}

const CITY_VIEW: View = { center: { x: MAP_SIZE / 2, y: MAP_SIZE / 2 }, zoom: 1 };

/** A view that fits the neighborhood's outline (trimmed to the land) with some breathing room. */
function frameNeighborhood(slug: string, size: Size): View {
  const shape = NEIGHBORHOOD_SHAPES[slug];
  if (!shape) return CITY_VIEW;
  const xs = shape.points.map(([x]) => Math.min(940, Math.max(150, x)));
  const ys = shape.points.map(([, y]) => Math.min(950, Math.max(40, y)));
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = baseScale(size);
  const fit = Math.min(size.width / ((maxX - minX) * 1.4 * scale), size.height / ((maxY - minY) * 1.4 * scale));
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    zoom: Math.min(2.2, Math.max(MIN_ZOOM, fit)),
  };
}

/** Interactive SVG map of Port Ellis with HTML markers layered on top. */
export function MapView({
  markers,
  activeId = null,
  selectedId = null,
  onSelect,
  onHover,
  highlight = null,
  focus,
  initialCenter,
  initialZoom = 1,
  interactive = true,
  variant = 'price',
  renderPopup,
  className = '',
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; center: View['center']; moved: boolean } | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [view, setView] = useState<View>(() => ({
    center: initialCenter ? project(initialCenter) : { x: MAP_SIZE / 2, y: MAP_SIZE / 2 },
    zoom: initialZoom,
  }));

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const hasSize = size.width > 0;
  useEffect(() => {
    if (focus === undefined || !hasSize) return;
    setView(focus ? frameNeighborhood(focus, size) : CITY_VIEW);
    // Re-frame only when the focus changes, not on every resize.
  }, [focus, hasSize]);

  const frame = useMemo(() => {
    const scale = baseScale(size) * view.zoom || 1;
    const center = clampCenter(view.center, view.zoom, size);
    const width = size.width / scale;
    const height = size.height / scale;
    return { x: center.x - width / 2, y: center.y - height / 2, width, height, scale };
  }, [size, view]);

  const toScreen = (location: LatLng) => {
    const point = project(location);
    return { left: (point.x - frame.x) * frame.scale, top: (point.y - frame.y) * frame.scale };
  };

  const zoomBy = (factor: number) => {
    setView((current) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor));
      return { zoom, center: clampCenter(current.center, zoom, size) };
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('.map-marker, .map-popup, .map-controls')) return;
    dragRef.current = { x: event.clientX, y: event.clientY, center: centerOf(frame), moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    setView((current) => ({
      ...current,
      center: clampCenter(
        { x: drag.center.x - dx / frame.scale, y: drag.center.y - dy / frame.scale },
        current.zoom,
        size,
      ),
    }));
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) onSelect?.(null);
  };

  const selected = selectedId === null ? undefined : markers.find((marker) => marker.id === selectedId);

  return (
    <div
      ref={containerRef}
      className={`map-view${interactive ? ' is-interactive' : ''} ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => (dragRef.current = null)}
    >
      {size.width > 0 && (
        <svg
          className="map-canvas"
          viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
          role="img"
          aria-label="Map of Port Ellis"
        >
          <BaseMap zoom={view.zoom} highlight={highlight} />
        </svg>
      )}

      {size.width > 0 &&
        markers.map((marker) => {
          const { left, top } = toScreen(marker.location);
          if (left < -60 || top < -40 || left > size.width + 60 || top > size.height + 40) return null;
          const isActive = marker.id === activeId || marker.id === selectedId;
          return (
            <button
              key={marker.id}
              type="button"
              className={`map-marker map-marker--${variant}${isActive ? ' is-active' : ''}${
                marker.tone === 'muted' ? ' is-muted' : ''
              }`}
              style={{ left, top }}
              onClick={() => onSelect?.(marker.id === selectedId ? null : marker.id)}
              onPointerEnter={() => onHover?.(marker.id)}
              onPointerLeave={() => onHover?.(null)}
              aria-label={`Listing ${marker.label}`}
            >
              {variant === 'pin' ? <PinIcon /> : marker.label}
            </button>
          );
        })}

      {selected && renderPopup && size.width > 0 && (
        <MapPopup position={toScreen(selected.location)} size={size}>
          {renderPopup(selected.id)}
        </MapPopup>
      )}

      {interactive && (
        <div className="map-controls">
          <button type="button" onClick={() => zoomBy(1.5)} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.5)} disabled={view.zoom <= MIN_ZOOM} aria-label="Zoom out">
            −
          </button>
        </div>
      )}
    </div>
  );
}

const POPUP_HALF_WIDTH = 150;
const POPUP_HEIGHT = 140;

/** Keeps the popup inside the map: flips below markers near the top and nudges it off the edges. */
function MapPopup({
  position,
  size,
  children,
}: {
  position: { left: number; top: number };
  size: Size;
  children: ReactNode;
}) {
  const below = position.top < POPUP_HEIGHT;
  const left = Math.min(size.width - POPUP_HALF_WIDTH, Math.max(POPUP_HALF_WIDTH, position.left));
  return (
    <div className={`map-popup${below ? ' is-below' : ''}`} style={{ left, top: position.top }}>
      {children}
    </div>
  );
}

function centerOf(frame: { x: number; y: number; width: number; height: number }) {
  return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" fill="currentColor" />
    </svg>
  );
}
