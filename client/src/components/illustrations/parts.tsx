import type { ReactNode } from 'react';
import { FOLIAGE, GLASS, GLASS_LIGHT, LAWNS, SKIES, TRIM } from './palettes';
import type { Rng } from './random';

/**
 * Drawing helpers for the listing illustrations. They are plain functions
 * (not components) so the seeded random generator is consumed in one fixed
 * order while the parent renders, which keeps every image deterministic.
 */

export const W = 400;
export const H = 300;
/** Where buildings meet the ground in exterior scenes. */
export const BASE = 246;

/** Mixes a hex color towards black (negative amount) or white (positive amount). */
export function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const t = Math.min(1, Math.abs(amount));
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    return Math.round(c + (target - c) * t);
  };
  return `#${((1 << 24) | (channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).slice(1)}`;
}

export function sky(rng: Rng, uid: string): ReactNode {
  const colors = rng.pick(SKIES);
  const hasSun = rng.chance(0.45);
  const sun = { x: rng.range(290, 360), y: rng.range(36, 64) };
  const clouds = Array.from({ length: rng.int(1, 3) }, (_, i) => ({
    x: rng.range(30 + i * 120, 110 + i * 120),
    y: rng.range(28, 78),
    s: rng.range(0.7, 1.15),
  }));
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.top} />
          <stop offset="1" stopColor={colors.bottom} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${uid}-sky)`} />
      {hasSun && <circle cx={sun.x} cy={sun.y} r={17} fill="#fff7e0" opacity={0.95} />}
      {clouds.map((cloud, i) => (
        <g key={i} transform={`translate(${cloud.x} ${cloud.y}) scale(${cloud.s})`} fill="#ffffff" opacity={0.85}>
          <ellipse cx={0} cy={6} rx={30} ry={9} />
          <circle cx={-10} cy={0} r={11} />
          <circle cx={8} cy={-3} r={14} />
        </g>
      ))}
    </g>
  );
}

/** Low hills and tree lines behind the building for a little depth. */
export function backdrop(rng: Rng): ReactNode {
  const hill = shade(rng.pick(LAWNS), 0.35);
  const trees = shade(rng.pick(FOLIAGE), 0.45);
  const offset = rng.range(-40, 40);
  return (
    <g>
      <path
        d={`M0 ${200 + offset * 0.2} C 90 ${170 + offset * 0.3}, 170 ${205 - offset * 0.2}, 260 ${186} S 380 ${172 + offset * 0.2}, 400 ${180} V 250 H 0 Z`}
        fill={hill}
      />
      {Array.from({ length: 9 }, (_, i) => {
        const x = i * 50 + rng.range(-10, 10);
        const r = rng.range(12, 20);
        return <circle key={i} cx={x} cy={222 - r * 0.4} r={r} fill={trees} />;
      })}
    </g>
  );
}

export function ground(rng: Rng): ReactNode {
  const lawn = rng.pick(LAWNS);
  return (
    <g>
      <rect y={234} width={W} height={34} fill={lawn} />
      <rect y={266} width={W} height={10} fill="#e7e2d8" />
      <rect y={275} width={W} height={2} fill="#cfc8bb" />
      <rect y={277} width={W} height={23} fill="#c4c7c9" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={i * 56 + 10} y={289} width={26} height={2.5} rx={1} fill="#f4f2ec" />
      ))}
    </g>
  );
}

export function tree(rng: Rng, x: number, baseY: number, size: number): ReactNode {
  const green = rng.pick(FOLIAGE);
  const conifer = rng.chance(0.3);
  const trunk = '#8a6b54';
  if (conifer) {
    return (
      <g>
        <rect x={x - size * 0.05} y={baseY - size * 0.3} width={size * 0.1} height={size * 0.3} fill={trunk} />
        {[0, 1, 2].map((tier) => {
          const w = size * (0.62 - tier * 0.14);
          const top = baseY - size * (0.55 + tier * 0.28);
          return (
            <path
              key={tier}
              d={`M${x - w / 2} ${top + size * 0.36} L${x} ${top} L${x + w / 2} ${top + size * 0.36} Z`}
              fill={tier === 1 ? shade(green, -0.08) : green}
            />
          );
        })}
      </g>
    );
  }
  return (
    <g>
      <rect x={x - size * 0.05} y={baseY - size * 0.45} width={size * 0.1} height={size * 0.45} fill={trunk} />
      <circle cx={x - size * 0.2} cy={baseY - size * 0.55} r={size * 0.28} fill={shade(green, -0.1)} />
      <circle cx={x + size * 0.2} cy={baseY - size * 0.58} r={size * 0.27} fill={green} />
      <circle cx={x} cy={baseY - size * 0.8} r={size * 0.3} fill={green} />
      <circle cx={x + size * 0.08} cy={baseY - size * 0.88} r={size * 0.13} fill={shade(green, 0.18)} opacity={0.8} />
    </g>
  );
}

export function shrubs(rng: Rng, x0: number, x1: number, baseY: number): ReactNode {
  const green = shade(rng.pick(FOLIAGE), 0.05);
  const count = Math.max(2, Math.round((x1 - x0) / 26));
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const cx = x0 + ((i + 0.5) * (x1 - x0)) / count;
        const r = rng.range(8, 12);
        return <ellipse key={i} cx={cx} cy={baseY - r * 0.55} rx={r * 1.2} ry={r} fill={i % 2 ? green : shade(green, -0.1)} />;
      })}
    </g>
  );
}

interface WindowOptions {
  muntins?: 'cross' | 'grid' | 'vertical' | 'none';
  frame?: string;
  shutters?: string | null;
  arch?: boolean;
  sill?: boolean;
  glass?: string;
}

export function windowAt(
  x: number,
  y: number,
  w: number,
  h: number,
  { muntins = 'cross', frame = TRIM, shutters = null, arch = false, sill = true, glass = GLASS }: WindowOptions = {},
): ReactNode {
  const r = w / 2;
  const outline = arch
    ? `M${x} ${y + h} V${y + r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h} Z`
    : `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
  return (
    <g>
      {shutters && (
        <>
          <rect x={x - w * 0.42} y={y} width={w * 0.36} height={h} fill={shutters} rx={1} />
          <rect x={x + w * 1.06} y={y} width={w * 0.36} height={h} fill={shutters} rx={1} />
        </>
      )}
      <path d={outline} fill={glass} stroke={frame} strokeWidth={2.6} strokeLinejoin="round" />
      <path
        d={`M${x + w * 0.15} ${y + h} L${x + w * 0.75} ${y + (arch ? r * 0.6 : 0)} L${x + w} ${y + (arch ? r : 0)} V${y + h * 0.3} L${x + w * 0.45} ${y + h} Z`}
        fill={GLASS_LIGHT}
        opacity={0.45}
      />
      {muntins === 'cross' && (
        <path d={`M${x + w / 2} ${y + (arch ? 2 : 0)} V${y + h} M${x} ${y + h / 2 + (arch ? r / 3 : 0)} H${x + w}`} stroke={frame} strokeWidth={1.4} />
      )}
      {muntins === 'vertical' && <path d={`M${x + w / 2} ${y} V${y + h}`} stroke={frame} strokeWidth={1.4} />}
      {muntins === 'grid' && (
        <path
          d={`M${x + w / 3} ${y + (arch ? r * 0.3 : 0)} V${y + h} M${x + (2 * w) / 3} ${y + (arch ? r * 0.3 : 0)} V${y + h} M${x} ${y + h * 0.4 + (arch ? r * 0.3 : 0)} H${x + w} M${x} ${y + h * 0.72} H${x + w}`}
          stroke={frame}
          strokeWidth={1.2}
        />
      )}
      {sill && <rect x={x - 3} y={y + h} width={w + 6} height={3} fill={frame} rx={1} />}
    </g>
  );
}

export function doorAt(x: number, y: number, w: number, h: number, color: string): ReactNode {
  return (
    <g>
      <rect x={x - 3} y={y - 3} width={w + 6} height={h + 3} fill={TRIM} rx={1} />
      <rect x={x} y={y} width={w} height={h} fill={color} />
      <rect x={x + w * 0.18} y={y + h * 0.1} width={w * 0.64} height={h * 0.26} fill={GLASS} opacity={0.9} />
      <rect x={x + w * 0.18} y={y + h * 0.48} width={w * 0.64} height={h * 0.4} fill={shade(color, -0.15)} />
      <circle cx={x + w * 0.82} cy={y + h * 0.58} r={1.6} fill="#e8c46a" />
    </g>
  );
}
