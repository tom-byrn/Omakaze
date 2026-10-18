import type { ReactNode } from 'react';
import { BRICKS, DOORS, ROOFS, TRIM, WALLS } from './palettes';
import { W, backdrop, shade, sky, tree, windowAt } from './parts';
import type { Rng } from './random';

const STREET_BASE = 232;

type Kind = 'house' | 'shop' | 'block' | 'narrow';

function streetBuilding(rng: Rng, kind: Kind, x: number, w: number): ReactNode {
  const color = kind === 'block' && rng.chance(0.5) ? rng.pick(BRICKS) : rng.pick(WALLS);
  if (kind === 'house') {
    const top = STREET_BASE - rng.range(64, 84);
    const roof = rng.pick(ROOFS);
    return (
      <g>
        <rect x={x} y={top} width={w} height={STREET_BASE - top} fill={color} />
        <path d={`M${x - 8} ${top + 3} L${x + w / 2} ${top - 34} L${x + w + 8} ${top + 3} Z`} fill={roof} />
        {windowAt(x + 10, top + 14, 20, 24, {})}
        {windowAt(x + w - 30, top + 14, 20, 24, {})}
        <rect x={x + w / 2 - 9} y={STREET_BASE - 30} width={18} height={30} fill={rng.pick(DOORS)} />
      </g>
    );
  }
  if (kind === 'shop') {
    const top = STREET_BASE - rng.range(90, 110);
    const awning = rng.pick(['#b7765e', '#4d6f8b', '#5f806c', '#c38b30']);
    return (
      <g>
        <rect x={x} y={top} width={w} height={STREET_BASE - top} fill={color} />
        <rect x={x - 2} y={top - 6} width={w + 4} height={7} fill={shade(color, -0.3)} />
        {windowAt(x + 10, top + 14, 22, 26, { muntins: 'vertical' })}
        {windowAt(x + w - 32, top + 14, 22, 26, { muntins: 'vertical' })}
        <rect x={x + 6} y={STREET_BASE - 34} width={w - 12} height={34} fill="#a9c8dd" stroke={TRIM} strokeWidth={2} />
        <path d={`M${x + 2} ${STREET_BASE - 44} H${x + w - 2} L${x + w + 4} ${STREET_BASE - 32} H${x - 4} Z`} fill={awning} />
      </g>
    );
  }
  if (kind === 'narrow') {
    const top = STREET_BASE - rng.range(110, 130);
    return (
      <g>
        <rect x={x} y={top} width={w} height={STREET_BASE - top} fill={color} />
        <rect x={x - 2} y={top - 6} width={w + 4} height={7} fill={shade(color, -0.35)} />
        {[0, 1, 2].map((floor) => (
          <g key={floor}>{windowAt(x + w / 2 - 10, top + 14 + floor * 34, 20, 24, { muntins: 'vertical' })}</g>
        ))}
        <rect x={x + w / 2 - 9} y={STREET_BASE - 26} width={18} height={26} fill={rng.pick(DOORS)} />
      </g>
    );
  }
  const floors = rng.int(4, 5);
  const top = STREET_BASE - 24 - floors * 28;
  const cols = Math.max(2, Math.floor(w / 30));
  return (
    <g>
      <rect x={x} y={top} width={w} height={STREET_BASE - top} fill={color} />
      <rect x={x - 3} y={top - 6} width={w + 6} height={8} fill={shade(color, -0.3)} />
      {Array.from({ length: floors }, (_, floor) =>
        Array.from({ length: cols }, (_, col) => (
          <g key={`${floor}-${col}`}>
            {windowAt(x + ((col + 0.5) * w) / cols - 9, top + 12 + floor * 28, 18, 18, { muntins: 'none' })}
          </g>
        )),
      )}
      <rect x={x + w / 2 - 12} y={STREET_BASE - 24} width={24} height={24} fill="#5d7f98" stroke={TRIM} strokeWidth={2} />
    </g>
  );
}

export function streetScene(rng: Rng, uid: string): ReactNode {
  const kinds: Kind[] = ['house', 'shop', 'block', 'narrow'];
  const buildings: { kind: Kind; x: number; w: number }[] = [];
  let x = -20;
  while (x < W + 10) {
    const kind = rng.pick(kinds);
    const w = kind === 'block' ? rng.range(100, 130) : kind === 'narrow' ? rng.range(52, 62) : rng.range(74, 90);
    buildings.push({ kind, x, w });
    x += w + rng.range(4, 14);
  }
  const carColor = rng.pick(['#b7765e', '#4d6f8b', '#e8e2d6', '#5f806c', '#2f3b46']);
  const carX = rng.range(40, 250);

  return (
    <>
      {sky(rng, uid)}
      {backdrop(rng)}
      {buildings.map((building, i) => (
        <g key={i}>{streetBuilding(rng, building.kind, building.x, building.w)}</g>
      ))}
      <rect y={STREET_BASE} width={W} height={20} fill="#e7e2d8" />
      <rect y={STREET_BASE + 20} width={W} height={3} fill="#cfc8bb" />
      <rect y={STREET_BASE + 23} width={W} height={45} fill="#c4c7c9" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={i * 56 + 6} y={STREET_BASE + 44} width={28} height={3} rx={1} fill="#f4f2ec" />
      ))}
      {[48, 196, 344].map((treeX) => (
        <g key={treeX}>{tree(rng, treeX, STREET_BASE + 12, 70)}</g>
      ))}
      <g>
        <rect x={122} y={STREET_BASE - 72} width={3} height={86} fill="#3d4650" />
        <path d="M123 160 q14 -6 24 4" stroke="#3d4650" strokeWidth={3} fill="none" />
        <rect x={141} y={163} width={14} height={5} rx={2} fill="#3d4650" />
        <ellipse cx={148} cy={170} rx={6} ry={2} fill="#fff6dc" />
      </g>
      <g transform={`translate(${carX} ${STREET_BASE + 26})`}>
        <path d="M6 22 Q6 10 20 10 L34 0 H74 L90 10 Q104 11 104 22 V28 H6 Z" fill={carColor} />
        <path d="M38 4 H56 V12 H30 Z M60 4 H72 L84 12 H60 Z" fill="#cfe1ee" />
        <circle cx={28} cy={28} r={8} fill="#2f3337" />
        <circle cx={28} cy={28} r={3} fill="#c9ccd0" />
        <circle cx={84} cy={28} r={8} fill="#2f3337" />
        <circle cx={84} cy={28} r={3} fill="#c9ccd0" />
      </g>
    </>
  );
}
