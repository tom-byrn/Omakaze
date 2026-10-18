import type { ReactNode } from 'react';
import type { PropertyType } from '@hearth/shared';
import { BRICKS, DOORS, FOLIAGE, GLASS, ROOFS, SHADOW, TRIM, WALLS } from './palettes';
import { BASE, backdrop, doorAt, ground, shade, shrubs, sky, tree, windowAt } from './parts';
import type { Rng } from './random';

export function exteriorScene(rng: Rng, uid: string, propertyType: PropertyType): ReactNode {
  const building = BUILDINGS[propertyType];
  return (
    <>
      {sky(rng, uid)}
      {backdrop(rng)}
      {ground(rng)}
      {building(rng, uid)}
    </>
  );
}

const BUILDINGS: Record<PropertyType, (rng: Rng, uid: string) => ReactNode> = {
  house,
  townhouse: townhouses,
  apartment,
  condo,
  loft,
};

function house(rng: Rng): ReactNode {
  const style = rng.pick(['colonial', 'colonial', 'bungalow', 'modern'] as const);
  if (style === 'modern') return modernHouse(rng);

  const wall = rng.pick(WALLS);
  const roof = rng.pick(ROOFS);
  const doorColor = rng.pick(DOORS);
  const twoStory = style === 'colonial';
  const hip = twoStory && rng.chance(0.4);
  const hasGarage = rng.chance(0.45);
  const shutters = rng.chance(0.35) ? shade(roof, 0.1) : null;
  const fence = !hasGarage && rng.chance(0.5);

  const bodyW = twoStory ? 168 : 190;
  const cx = hasGarage ? 172 : 200;
  const x0 = cx - bodyW / 2;
  const x1 = cx + bodyW / 2;
  const top = BASE - (twoStory ? 112 : 78);
  const peak = top - (twoStory ? 58 : 50);
  const eave = top + 4;
  const roofAt = (x: number) => peak + ((x - cx) / (x1 + 14 - cx)) * (eave - peak);
  const chimneyX = cx + bodyW * 0.22;
  const roofOutline = hip
    ? `M${x0 - 14} ${eave} L${x0 + 34} ${peak + 10} H${x1 - 34} L${x1 + 14} ${eave} Z`
    : `M${x0 - 14} ${eave} L${cx} ${peak} L${x1 + 14} ${eave} Z`;

  const lines: ReactNode[] = [];
  for (let y = top + 8; y < BASE - 8; y += 7) {
    lines.push(<path key={y} d={`M${x0} ${y} H${x1}`} stroke={shade(wall, -0.07)} strokeWidth={1} />);
  }

  return (
    <g>
      {tree(rng, x0 - 34, BASE + 6, 92)}
      {hasGarage && (
        <g>
          <path d={`M${x1 + 10} ${BASE + 20} L${x1 + 66} ${BASE + 20} L${x1 + 84} 277 L${x1 - 4} 277 Z`} fill="#dcd6cc" />
          <rect x={x1 - 2} y={BASE - 66} width={82} height={66} fill={shade(wall, -0.04)} />
          <path d={`M${x1 - 8} ${BASE - 62} L${x1 + 39} ${BASE - 96} L${x1 + 86} ${BASE - 62} Z`} fill={shade(roof, 0.08)} />
          <rect x={x1 + 10} y={BASE - 50} width={58} height={50} fill="#efebe4" />
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M${x1 + 10} ${BASE - 50 + i * 12.5} H${x1 + 68}`} stroke="#d4cec4" strokeWidth={1.2} />
          ))}
        </g>
      )}
      <rect x={chimneyX} y={peak + 8} width={16} height={(hip ? eave : roofAt(chimneyX)) - peak} fill={shade(roof, 0.25)} />
      <rect x={chimneyX - 2} y={peak + 4} width={20} height={5} fill={shade(roof, 0.05)} />
      <rect x={x0} y={top} width={bodyW} height={BASE - top} fill={wall} />
      {lines}
      <rect x={x0} y={top} width={bodyW} height={7} fill={SHADOW} />
      <path d={roofOutline} fill={roof} />
      <path d={roofOutline} fill="none" stroke={shade(roof, -0.25)} strokeWidth={3} strokeLinejoin="round" />
      {hip ? (
        <g>
          <path d={`M${cx - 16} ${eave} V${peak + 30} L${cx} ${peak + 16} L${cx + 16} ${peak + 30} V${eave} Z`} fill={wall} />
          {windowAt(cx - 9, peak + 32, 18, 16, { muntins: 'cross', sill: false })}
        </g>
      ) : twoStory ? (
        windowAt(cx - 12, peak + 26, 24, 22, { muntins: 'cross', sill: false })
      ) : (
        <circle cx={cx} cy={peak + 30} r={8} fill={GLASS} stroke={TRIM} strokeWidth={2.4} />
      )}

      {twoStory ? (
        <>
          {windowAt(x0 + 22, top + 14, 28, 34, { shutters })}
          {windowAt(cx - 14, top + 14, 28, 34, { shutters })}
          {windowAt(x1 - 50, top + 14, 28, 34, { shutters })}
          {windowAt(x0 + 20, top + 64, 34, 38, { shutters, muntins: 'grid' })}
          {windowAt(x1 - 54, top + 64, 34, 38, { shutters, muntins: 'grid' })}
          <path d={`M${cx - 24} ${top + 58} L${cx} ${top + 44} L${cx + 24} ${top + 58} Z`} fill={TRIM} />
          <rect x={cx - 21} y={top + 58} width={3.5} height={BASE - top - 58} fill={TRIM} />
          <rect x={cx + 17.5} y={top + 58} width={3.5} height={BASE - top - 58} fill={TRIM} />
          {doorAt(cx - 12, BASE - 44, 24, 44, doorColor)}
        </>
      ) : (
        <>
          <rect x={x0 - 6} y={top + 12} width={bodyW + 12} height={8} fill={shade(roof, 0.12)} />
          {[x0 + 4, cx - 40, cx + 36, x1 - 8].map((x) => (
            <rect key={x} x={x - 2} y={top + 20} width={5} height={BASE - top - 20} fill={TRIM} />
          ))}
          {windowAt(x0 + 22, top + 30, 40, 32, { shutters, muntins: 'grid' })}
          {windowAt(x1 - 62, top + 30, 40, 32, { shutters, muntins: 'grid' })}
          {doorAt(cx - 13, BASE - 46, 26, 46, doorColor)}
        </>
      )}
      <rect x={x0} y={BASE - 7} width={bodyW} height={7} fill="#b9b3a8" />
      <rect x={cx - 20} y={BASE} width={40} height={5} fill="#d8d2c7" />
      <path d={`M${cx - 15} ${BASE + 5} L${cx + 15} ${BASE + 5} L${cx + 24} 266 L${cx - 24} 266 Z`} fill="#e3ddd2" />
      {shrubs(rng, x0 + 4, cx - 26, BASE + 4)}
      {shrubs(rng, cx + 26, x1 - 4, BASE + 4)}
      {fence && (
        <g fill={TRIM}>
          <rect x={20} y={252} width={cx - 46} height={3} />
          <rect x={cx + 26} y={252} width={380 - cx - 26} height={3} />
          {Array.from({ length: 50 }, (_, i) => 18 + i * 8)
            .filter((x) => x < cx - 28 || (x > cx + 24 && x < 380))
            .map((x) => (
              <path key={x} d={`M${x} 264 V247 l2.5 -3 l2.5 3 V264 Z`} />
            ))}
        </g>
      )}
      {!hasGarage && tree(rng, x1 + 40, BASE + 8, 84)}
    </g>
  );
}

function modernHouse(rng: Rng): ReactNode {
  const dark = rng.chance(0.4);
  const main = dark ? '#434b56' : rng.pick(['#f2efe8', '#e9e6df', '#dfe3e2']);
  const wood = rng.pick(['#b98a5e', '#a77b55', '#c49a6c']);
  const frame = dark ? '#e9e6df' : '#2f3337';
  const glass = '#8fb2c9';
  return (
    <g>
      {tree(rng, 58, BASE + 6, 90)}
      <rect x={96} y={112} width={140} height={BASE - 112} fill={main} />
      <rect x={92} y={106} width={148} height={7} fill={shade(main, -0.35)} />
      <rect x={236} y={156} width={86} height={BASE - 156} fill={wood} />
      {Array.from({ length: 11 }, (_, i) => (
        <path key={i} d={`M${240 + i * 8} 156 V${BASE}`} stroke={shade(wood, -0.14)} strokeWidth={1.2} />
      ))}
      <rect x={232} y={150} width={94} height={7} fill={shade(main, -0.35)} />
      <rect x={110} y={128} width={112} height={44} fill={glass} stroke={frame} strokeWidth={3} />
      <path d="M147 128 V172 M185 128 V172" stroke={frame} strokeWidth={2} />
      <path d="M118 172 L150 128 H170 L138 172 Z" fill="#ffffff" opacity={0.2} />
      <rect x={110} y={188} width={70} height={BASE - 188} fill={glass} stroke={frame} strokeWidth={3} />
      <path d="M145 188 V246" stroke={frame} strokeWidth={2} />
      <rect x={192} y={196} width={28} height={BASE - 196} fill={shade(wood, -0.25)} />
      <circle cx={214} cy={222} r={1.6} fill="#e8c46a" />
      <rect x={248} y={172} width={20} height={36} fill={glass} stroke={frame} strokeWidth={2.5} />
      <rect x={290} y={172} width={20} height={36} fill={glass} stroke={frame} strokeWidth={2.5} />
      <rect x={246} y={214} width={66} height={BASE - 214} fill="#5d646c" />
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M246 ${222 + i * 8} H312`} stroke="#4b525a" strokeWidth={1.2} />
      ))}
      <path d={`M250 ${BASE} H308 L324 277 H234 Z`} fill="#dcd6cc" />
      <path d={`M196 ${BASE} H216 L224 266 H188 Z`} fill="#e3ddd2" />
      {shrubs(rng, 100, 186, BASE + 4)}
      <g stroke={shade(rng.pick(FOLIAGE), 0.1)} strokeWidth={1.4} strokeLinecap="round">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d={`M${330 + i * 4} ${BASE + 4} q${(i % 3) - 1} -10 ${(i % 2 ? 3 : -3)} -16`} fill="none" />
        ))}
      </g>
      {tree(rng, 366, BASE + 8, 78)}
    </g>
  );
}

function townhouses(rng: Rng): ReactNode {
  const painted = [rng.pick(WALLS), rng.pick(WALLS), rng.pick(WALLS)];
  const brickAt = rng.int(0, 3); // 3 = all painted
  const colors = painted.map((color, i) => (i === brickAt ? rng.pick(BRICKS) : color));
  const gabled = rng.chance(0.4);
  const roof = rng.pick(ROOFS);
  const doorColors = [rng.pick(DOORS), rng.pick(DOORS), rng.pick(DOORS)];
  const unitW = 84;
  const startX = 74;
  return (
    <g>
      {tree(rng, 40, BASE + 6, 86)}
      {colors.map((color, i) => {
        const x = startX + i * unitW;
        const top = BASE - (150 + ((i * 7 + 5) % 3) * 9);
        const bay = i !== 1 && rng.chance(0.7);
        const doorLeft = i % 2 === 0;
        const doorX = doorLeft ? x + 12 : x + unitW - 36;
        const winX = doorLeft ? x + unitW - 40 : x + 12;
        return (
          <g key={i}>
            {gabled && <path d={`M${x - 4} ${top + 2} L${x + unitW / 2} ${top - 34} L${x + unitW + 4} ${top + 2} Z`} fill={roof} />}
            <rect x={x} y={top} width={unitW} height={BASE - top} fill={color} />
            {!gabled && <rect x={x - 3} y={top - 9} width={unitW + 6} height={10} fill={shade(color, -0.35)} />}
            <rect x={x} y={top + 1} width={unitW} height={4} fill={SHADOW} />
            {windowAt(x + 14, top + 18, 22, 32, { muntins: 'vertical' })}
            {windowAt(x + unitW - 36, top + 18, 22, 32, { muntins: 'vertical' })}
            {bay ? (
              <g>
                <path
                  d={`M${x + 8} ${top + 66} H${x + unitW - 8} L${x + unitW - 14} ${top + 112} H${x + 14} Z`}
                  fill={shade(color, -0.12)}
                />
                <rect x={x + 8} y={top + 62} width={unitW - 16} height={5} fill={TRIM} />
                {windowAt(x + 16, top + 72, 16, 30, { muntins: 'none', sill: false })}
                {windowAt(x + unitW / 2 - 9, top + 72, 18, 30, { muntins: 'none', sill: false })}
                {windowAt(x + unitW - 32, top + 72, 16, 30, { muntins: 'none', sill: false })}
              </g>
            ) : (
              <>
                {windowAt(x + 14, top + 68, 22, 32, { muntins: 'vertical' })}
                {windowAt(x + unitW - 36, top + 68, 22, 32, { muntins: 'vertical' })}
              </>
            )}
            {windowAt(winX, BASE - 54, 28, 34, { muntins: 'grid' })}
            {doorAt(doorX, BASE - 50, 24, 42, doorColors[i])}
            <rect x={doorX - 6} y={BASE - 8} width={36} height={4} fill="#cfc9bf" />
            <rect x={doorX - 9} y={BASE - 4} width={42} height={4} fill="#c4beb3" />
            <rect x={doorX - 12} y={BASE} width={48} height={4} fill="#bab4a9" />
            <rect x={x} y={top} width={1.5} height={BASE - top} fill={shade(color, -0.3)} opacity={0.5} />
          </g>
        );
      })}
      {shrubs(rng, 80, 110, BASE + 8)}
      {tree(rng, 362, BASE + 8, 80)}
    </g>
  );
}

function apartment(rng: Rng, uid: string): ReactNode {
  const brick = rng.chance(0.45);
  const facade = brick ? rng.pick(BRICKS) : rng.pick(WALLS);
  const floors = rng.int(3, 4);
  const floorH = 34;
  const groundH = 42;
  const x0 = 64;
  const width = 272;
  const top = BASE - groundH - floors * floorH - 8;
  const cols = 6;
  const colW = width / cols;
  const shops = rng.chance(0.6);
  const awning = rng.pick(['#b7765e', '#4d6f8b', '#5f806c', '#c38b30']);
  const balconyCols = rng.chance(0.5) ? [1, 4] : [];

  return (
    <g>
      <defs>
        <pattern id={`${uid}-awning`} width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="8" height="16" fill={awning} />
          <rect x="8" width="8" height="16" fill={TRIM} />
        </pattern>
      </defs>
      <rect x={x0 + 26} y={top - 18} width={30} height={18} fill={shade(facade, -0.2)} />
      <rect x={x0 + width - 70} y={top - 12} width={22} height={12} fill={shade(facade, -0.15)} />
      <rect x={x0} y={top} width={width} height={BASE - top} fill={facade} />
      <rect x={x0 - 4} y={top - 4} width={width + 8} height={9} fill={shade(facade, -0.3)} />
      {Array.from({ length: floors }, (_, floor) => {
        const y = top + 14 + floor * floorH;
        return (
          <g key={floor}>
            {Array.from({ length: cols }, (_, col) => {
              const x = x0 + col * colW + colW / 2 - 13;
              const balcony = balconyCols.includes(col) && floor < floors;
              return (
                <g key={col}>
                  {windowAt(x, y, 26, 22, { muntins: 'vertical', sill: !balcony })}
                  {balcony && (
                    <g>
                      <rect x={x - 6} y={y + 21} width={38} height={3} fill={shade(facade, -0.35)} />
                      <path
                        d={Array.from({ length: 8 }, (_, i) => `M${x - 5 + i * 5.2} ${y + 13} V${y + 21}`).join(' ') + ` M${x - 6} ${y + 13} H${x + 32}`}
                        stroke="#3d4650"
                        strokeWidth={1.2}
                      />
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
      <rect x={x0} y={BASE - groundH} width={width} height={groundH} fill={brick ? '#d9d2c5' : shade(facade, -0.12)} />
      <rect x={x0} y={BASE - groundH - 4} width={width} height={4} fill={shade(facade, -0.3)} />
      {shops ? (
        <>
          {[x0 + 12, x0 + width - 92].map((x) => (
            <g key={x}>
              <rect x={x} y={BASE - 34} width={80} height={34} fill={GLASS} stroke={TRIM} strokeWidth={2.4} />
              <path d={`M${x + 40} ${BASE - 34} V${BASE}`} stroke={TRIM} strokeWidth={1.6} />
              <path d={`M${x - 4} ${BASE - 46} H${x + 84} L${x + 90} ${BASE - 34} H${x - 10} Z`} fill={`url(#${uid}-awning)`} />
            </g>
          ))}
        </>
      ) : (
        [x0 + 18, x0 + 62, x0 + width - 92, x0 + width - 48].map((x) => (
          <g key={x}>{windowAt(x, BASE - 34, 30, 24, { muntins: 'vertical' })}</g>
        ))
      )}
      <rect x={x0 + width / 2 - 26} y={BASE - 46} width={52} height={6} fill="#3d4650" />
      <rect x={x0 + width / 2 - 18} y={BASE - 38} width={36} height={38} fill={shade(GLASS, -0.15)} stroke={TRIM} strokeWidth={2} />
      <path d={`M${x0 + width / 2} ${BASE - 38} V${BASE}`} stroke={TRIM} strokeWidth={1.5} />
      {tree(rng, 40, BASE + 10, 80)}
      {tree(rng, 364, BASE + 12, 76)}
    </g>
  );
}

function condo(rng: Rng, uid: string): ReactNode {
  const cladding = rng.pick(['#b98a5e', '#a77b55', '#c49a6c']);
  const frame = rng.pick(['#e9edf0', '#3d4650', '#dfe3e6']);
  const towerX = 92;
  const towerW = 146;
  const floors = 6;
  const floorH = 30;
  const towerTop = BASE - floors * floorH - 10;
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9dfee" />
          <stop offset="0.55" stopColor="#8fb3cc" />
          <stop offset="1" stopColor="#6f97b4" />
        </linearGradient>
      </defs>
      {tree(rng, 50, BASE + 8, 88)}
      <rect x={towerX} y={towerTop} width={towerW} height={BASE - towerTop} fill={`url(#${uid}-glass)`} />
      {Array.from({ length: 7 }, (_, i) => (
        <path key={`m${i}`} d={`M${towerX + i * (towerW / 6)} ${towerTop} V${BASE}`} stroke={frame} strokeWidth={1.6} />
      ))}
      {Array.from({ length: floors + 1 }, (_, i) => (
        <rect key={`f${i}`} x={towerX - 4} y={towerTop + i * floorH} width={towerW + 8} height={4} fill={frame} />
      ))}
      {Array.from({ length: floors - 1 }, (_, i) => (
        <rect key={`b${i}`} x={towerX + towerW} y={towerTop + (i + 1) * floorH - 12} width={14} height={12} fill="#cfe3ef" opacity={0.75} stroke={frame} strokeWidth={1} />
      ))}
      <path d={`M${towerX + 20} ${BASE} L${towerX + 90} ${towerTop} H${towerX + 120} L${towerX + 50} ${BASE} Z`} fill="#ffffff" opacity={0.16} />
      <rect x={towerX - 6} y={towerTop - 8} width={towerW + 12} height={8} fill={shade(frame, -0.1)} />
      <rect x={252} y={128} width={82} height={BASE - 128} fill={cladding} />
      {Array.from({ length: 10 }, (_, i) => (
        <path key={`c${i}`} d={`M${256 + i * 8} 128 V${BASE}`} stroke={shade(cladding, -0.12)} strokeWidth={1.2} />
      ))}
      <rect x={248} y={122} width={90} height={7} fill={frame} />
      {[
        [262, 144],
        [298, 144],
        [262, 192],
        [298, 192],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={26} height={34} fill="#5d7f98" stroke={frame} strokeWidth={2} />
      ))}
      {[264, 286, 308, 326].map((x, i) => (
        <circle key={x} cx={x} cy={118} r={7 + (i % 2) * 2} fill={i % 2 ? '#7fb07c' : '#6f9f73'} />
      ))}
      <rect x={towerX + 40} y={BASE - 34} width={60} height={34} fill="#4c6f88" stroke={frame} strokeWidth={2} />
      <rect x={towerX + 30} y={BASE - 42} width={80} height={6} fill={frame} />
      {shrubs(rng, 252, 334, BASE + 6)}
      {tree(rng, 364, BASE + 10, 70)}
    </g>
  );
}

function loft(rng: Rng, uid: string): ReactNode {
  const brick = rng.pick(BRICKS);
  const frame = rng.pick(['#2f3b46', '#3f5b4a', '#4b3f3a']);
  const tall = rng.chance(0.5);
  const arched = rng.chance(0.6);
  const roofline = rng.pick(['tower', 'stack', 'both'] as const);
  const cols = rng.pick([5, 6]);
  const x0 = tall ? 70 : 56;
  const width = tall ? 260 : 288;
  const top = tall ? 64 : 92;
  const rows = tall ? 3 : 2;
  const rowH = tall ? 46 : 58;
  const colW = width / cols;
  const winW = Math.min(34, colW - 18);
  const towerX = roofline === 'tower' ? x0 + 24 : x0 + width - 84;

  return (
    <g>
      <defs>
        <pattern id={`${uid}-brick`} width="18" height="9" patternUnits="userSpaceOnUse">
          <rect width="18" height="9" fill={brick} />
          <path d="M0 8.5 H18 M9 0 V4.5 M0 4.5 H18 M0 4.5 V8.5 M18 4.5 V8.5" stroke={shade(brick, -0.14)} strokeWidth={0.8} />
        </pattern>
      </defs>
      {roofline !== 'tower' && (
        <g>
          <rect x={x0 + 22} y={top - 68} width={20} height={68} fill={shade(brick, -0.08)} />
          <rect x={x0 + 19} y={top - 68} width={26} height={6} fill={shade(brick, -0.3)} />
          <rect x={x0 + 22} y={top - 46} width={20} height={4} fill={shade(brick, -0.25)} />
        </g>
      )}
      {roofline !== 'stack' && (
        <g>
          <path d={`M${towerX + 6} ${top} L${towerX + 10} ${top - 26} M${towerX + 38} ${top} L${towerX + 34} ${top - 26}`} stroke="#5b4a3f" strokeWidth={3} />
          <rect x={towerX} y={top - 54} width={44} height={30} fill="#8b6a4f" rx={3} />
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M${towerX} ${top - 46 + i * 9} H${towerX + 44}`} stroke="#6f5440" strokeWidth={1.4} />
          ))}
          <path d={`M${towerX - 4} ${top - 54} L${towerX + 22} ${top - 70} L${towerX + 48} ${top - 54} Z`} fill="#5b4a3f" />
        </g>
      )}
      <rect x={x0} y={top} width={width} height={BASE - top} fill={`url(#${uid}-brick)`} />
      <rect x={x0 - 5} y={top - 6} width={width + 10} height={10} fill={shade(brick, -0.32)} />
      <rect x={x0 + 60} y={top + 10} width={width - 120} height={12} fill="#f4efe6" opacity={0.35} />
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => (
          <g key={`${row}-${col}`}>
            {windowAt(x0 + col * colW + colW / 2 - winW / 2, top + 32 + row * rowH, winW, rowH - 14, {
              arch: arched,
              muntins: 'grid',
              frame,
              glass: '#9dbfd6',
            })}
          </g>
        )),
      )}
      <rect x={x0} y={BASE - 36} width={width} height={36} fill={shade(brick, -0.1)} />
      <rect x={x0 + width / 2 - 30} y={BASE - 32} width={60} height={32} fill={frame} />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${x0 + width / 2 - 30} ${BASE - 32 + i * 8} H${x0 + width / 2 + 30}`} stroke={shade(frame, 0.15)} strokeWidth={1} />
      ))}
      {[x0 + 14, x0 + 64, x0 + width - 108, x0 + width - 58].map((x) => (
        <g key={x}>{windowAt(x, BASE - 30, 44, 24, { muntins: 'grid', frame, glass: '#9dbfd6' })}</g>
      ))}
      {tree(rng, x0 - 26, BASE + 10, 74)}
      {tree(rng, x0 + width + 28, BASE + 10, 70)}
    </g>
  );
}
