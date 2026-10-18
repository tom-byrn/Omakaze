import type { ReactNode } from 'react';
import { ACCENTS, CABINETS, COUNTERS, FABRICS, FLOORS, FOLIAGE, INTERIOR_WALLS, SKIES, TRIM } from './palettes';
import { H, W, shade } from './parts';
import type { Rng } from './random';

const FLOOR_Y = 214;

function room(rng: Rng, uid: string): { wall: string; floor: string; node: ReactNode } {
  const wall = rng.pick(INTERIOR_WALLS);
  const floor = rng.pick(FLOORS);
  const node = (
    <g>
      <defs>
        <linearGradient id={`${uid}-light`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.35} />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect width={W} height={FLOOR_Y} fill={wall} />
      <rect y={FLOOR_Y} width={W} height={H - FLOOR_Y} fill={floor} />
      {Array.from({ length: 9 }, (_, i) => (
        <path key={i} d={`M0 ${FLOOR_Y + 10 + i * 10} H${W}`} stroke={shade(floor, -0.08)} strokeWidth={1} />
      ))}
      {Array.from({ length: 30 }, (_, i) => {
        const row = i % 9;
        const x = ((i * 97) % W) + (row % 2) * 40;
        return <path key={`j${i}`} d={`M${x} ${FLOOR_Y + row * 10} v10`} stroke={shade(floor, -0.1)} strokeWidth={1} />;
      })}
      <rect y={FLOOR_Y - 6} width={W} height={7} fill={TRIM} />
    </g>
  );
  return { wall, floor, node };
}

function windowView(rng: Rng, x: number, y: number, w: number, h: number, curtains: string | null): ReactNode {
  const sky = rng.pick(SKIES);
  const green = rng.pick(FOLIAGE);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={sky.top} />
      <rect x={x} y={y + h * 0.55} width={w} height={h * 0.45} fill={sky.bottom} />
      <circle cx={x + w * 0.3} cy={y + h * 0.78} r={w * 0.22} fill={shade(green, 0.2)} />
      <circle cx={x + w * 0.75} cy={y + h * 0.85} r={w * 0.18} fill={shade(green, 0.3)} />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={TRIM} strokeWidth={6} />
      <path d={`M${x + w / 2} ${y} V${y + h} M${x} ${y + h / 2} H${x + w}`} stroke={TRIM} strokeWidth={3} />
      <rect x={x - 8} y={y + h} width={w + 16} height={6} fill={TRIM} />
      {curtains && (
        <g fill={curtains}>
          <path d={`M${x - 20} ${y - 12} H${x + 8} C ${x + 4} ${y + h * 0.5}, ${x + 12} ${y + h * 0.8}, ${x + 4} ${y + h + 18} H${x - 20} Z`} />
          <path d={`M${x + w + 20} ${y - 12} H${x + w - 8} C ${x + w - 4} ${y + h * 0.5}, ${x + w - 12} ${y + h * 0.8}, ${x + w - 4} ${y + h + 18} H${x + w + 20} Z`} />
          <rect x={x - 26} y={y - 16} width={w + 52} height={4} rx={2} fill="#7a6a5d" />
        </g>
      )}
    </g>
  );
}

function plant(rng: Rng, x: number, baseY: number, size: number): ReactNode {
  const green = rng.pick(FOLIAGE);
  const pot = rng.pick(['#d9796b', '#e8e2d6', '#3d4650', '#c9a27c']);
  const leaves = Array.from({ length: 7 }, (_, i) => {
    const angle = -150 + i * 20 + rng.range(-6, 6);
    return { angle, length: size * rng.range(0.55, 0.85) };
  });
  return (
    <g>
      {leaves.map((leaf, i) => (
        <ellipse
          key={i}
          cx={x}
          cy={baseY - size * 0.35 - leaf.length / 2}
          rx={size * 0.09}
          ry={leaf.length / 2}
          fill={i % 2 ? green : shade(green, -0.12)}
          transform={`rotate(${leaf.angle + 90} ${x} ${baseY - size * 0.35})`}
        />
      ))}
      <path d={`M${x - size * 0.2} ${baseY - size * 0.38} H${x + size * 0.2} L${x + size * 0.15} ${baseY} H${x - size * 0.15} Z`} fill={pot} />
    </g>
  );
}

function artwork(rng: Rng, x: number, y: number, w: number, h: number): ReactNode {
  const a = rng.pick(ACCENTS);
  const b = rng.pick(ACCENTS);
  const style = rng.int(0, 2);
  return (
    <g>
      <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} fill="#3d3a36" />
      <rect x={x} y={y} width={w} height={h} fill="#f7f3ec" />
      {style === 0 && (
        <>
          <circle cx={x + w * 0.38} cy={y + h * 0.5} r={h * 0.28} fill={a} />
          <rect x={x + w * 0.5} y={y + h * 0.3} width={w * 0.3} height={h * 0.45} fill={b} opacity={0.85} />
        </>
      )}
      {style === 1 && (
        <path d={`M${x} ${y + h * 0.75} L${x + w * 0.35} ${y + h * 0.35} L${x + w * 0.6} ${y + h * 0.6} L${x + w * 0.8} ${y + h * 0.45} L${x + w} ${y + h * 0.7} V${y + h} H${x} Z`} fill={a} />
      )}
      {style === 2 && (
        <>
          <rect x={x + w * 0.12} y={y + h * 0.2} width={w * 0.34} height={h * 0.6} fill={a} />
          <rect x={x + w * 0.54} y={y + h * 0.2} width={w * 0.34} height={h * 0.6} fill={b} />
        </>
      )}
    </g>
  );
}

export function livingRoom(rng: Rng, uid: string): ReactNode {
  const { node } = room(rng, uid);
  const sofa = rng.pick(FABRICS);
  const rug = rng.pick(ACCENTS);
  const windowLeft = rng.chance(0.5);
  const winX = windowLeft ? 34 : 262;
  const sofaX = windowLeft ? 176 : 34;
  return (
    <g>
      {node}
      {windowView(rng, winX, 46, 104, 120, rng.chance(0.6) ? rng.pick(['#e8dccb', '#d5dee6', '#e6d3c8']) : null)}
      {artwork(rng, sofaX + 46, 68, 96, 64)}
      <ellipse cx={sofaX + 95} cy={258} rx={150} ry={28} fill={shade(rug, 0.35)} />
      <ellipse cx={sofaX + 95} cy={258} rx={126} ry={20} fill="none" stroke={shade(rug, 0.1)} strokeWidth={3} />
      <rect x={sofaX + 4} y={148} width={182} height={40} rx={12} fill={shade(sofa, -0.08)} />
      <rect x={sofaX + 10} y={178} width={170} height={26} rx={8} fill={sofa} />
      <rect x={sofaX - 6} y={166} width={26} height={42} rx={10} fill={shade(sofa, -0.04)} />
      <rect x={sofaX + 170} y={166} width={26} height={42} rx={10} fill={shade(sofa, -0.04)} />
      <rect x={sofaX + 26} y={156} width={34} height={28} rx={7} fill={rng.pick(ACCENTS)} transform={`rotate(-8 ${sofaX + 43} 170)`} />
      <rect x={sofaX + 128} y={156} width={34} height={28} rx={7} fill={rng.pick(ACCENTS)} transform={`rotate(8 ${sofaX + 145} 170)`} />
      <rect x={sofaX + 4} y={206} width={5} height={10} fill="#4b3f36" />
      <rect x={sofaX + 181} y={206} width={5} height={10} fill="#4b3f36" />
      <rect x={sofaX + 46} y={232} width={100} height={7} rx={3} fill="#8b6a4f" />
      <rect x={sofaX + 54} y={239} width={5} height={20} fill="#6f5440" />
      <rect x={sofaX + 134} y={239} width={5} height={20} fill="#6f5440" />
      <rect x={sofaX + 62} y={222} width={26} height={5} fill={rng.pick(ACCENTS)} />
      <rect x={sofaX + 64} y={217} width={22} height={5} fill={rng.pick(FABRICS)} />
      <path d={`M${sofaX + 116} 231 h10 l-2 -12 h-6 Z`} fill="#f4efe6" />
      <g>
        <rect x={windowLeft ? 356 : 214} y={92} width={3} height={124} fill="#3d3a36" />
        <path d={`M${(windowLeft ? 356 : 214) - 16} 92 h34 l-7 -26 h-20 Z`} fill="#f4e7cf" />
        <ellipse cx={windowLeft ? 357 : 215} cy={216} rx={12} ry={3} fill="#3d3a36" />
      </g>
      {plant(rng, windowLeft ? 20 : 380, 222, 70)}
      <rect width={W} height={H} fill={`url(#${uid}-light)`} />
    </g>
  );
}

export function kitchen(rng: Rng, uid: string): ReactNode {
  const { node } = room(rng, uid);
  const cabinet = rng.pick(CABINETS);
  const counter = rng.pick(COUNTERS);
  const handle = cabinet === '#f4f1ea' || cabinet === '#d9cbb5' ? '#7a7f86' : '#d8c08a';
  const pendant = rng.pick(['#2f3b46', '#d1a24f', '#e8e2d6']);
  return (
    <g>
      {node}
      <rect x={20} y={120} width={360} height={52} fill="#f5f3ee" />
      {Array.from({ length: 24 }, (_, i) => (
        <path key={i} d={`M${20 + i * 15} 120 V172`} stroke="#e3dfd6" strokeWidth={1} />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <path key={`h${i}`} d={`M20 ${120 + i * 13} H380`} stroke="#e3dfd6" strokeWidth={1} />
      ))}
      {windowView(rng, 140, 34, 90, 74, null)}
      {[20, 72, 238].map((x) => (
        <g key={x}>
          <rect x={x} y={30} width={50} height={78} fill={cabinet} stroke={shade(cabinet, -0.12)} strokeWidth={1.5} />
          <rect x={x + 22} y={88} width={6} height={2.5} rx={1} fill={handle} />
        </g>
      ))}
      <path d="M312 26 h32 v12 l16 52 h-64 l16 -52 Z" fill="#c9ccd0" />
      <rect x={296} y={88} width={64} height={4} fill="#aeb3b8" />
      <rect x={20} y={172} width={360} height={9} fill={counter} />
      <rect x={20} y={181} width={360} height={60} fill={cabinet} />
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i}>
          <rect x={24 + i * 60} y={186} width={52} height={50} fill="none" stroke={shade(cabinet, -0.12)} strokeWidth={1.5} />
          <rect x={46 + i * 60} y={192} width={10} height={2.5} rx={1} fill={handle} />
        </g>
      ))}
      <rect x={300} y={183} width={56} height={56} fill="#3d4247" />
      <rect x={306} y={198} width={44} height={30} fill="#5b636b" />
      <rect x={304} y={188} width={48} height={4} fill="#c9ccd0" />
      <rect x={292} y={166} width={72} height={7} fill="#2f3337" />
      <rect x={159} y={166} width={52} height={6} rx={2} fill="#c9ccd0" />
      <path d="M181 166 v-18 h10 v4" stroke="#9aa0a6" strokeWidth={3} fill="none" />
      <circle cx={318} cy={158} r={9} fill={rng.pick(ACCENTS)} />
      <rect x={312} y={146} width={12} height={4} rx={1} fill="#3d4247" />
      <ellipse cx={90} cy={166} rx={20} ry={5} fill="#e8e2d6" />
      <circle cx={84} cy={160} r={6} fill="#e3a76f" />
      <circle cx={95} cy={159} r={6} fill="#d9796b" />
      <circle cx={90} cy={154} r={5.5} fill="#9fbf8f" />
      {plant(rng, 258, 172, 40)}
      {[110, 206].map((x) => (
        <g key={x}>
          <path d={`M${x} 0 V36`} stroke="#3d3a36" strokeWidth={1.5} />
          <path d={`M${x - 14} 50 Q${x} 30 ${x + 14} 50 Z`} fill={pendant} />
        </g>
      ))}
      <rect x={20} y={241} width={360} height={4} fill={shade(cabinet, -0.3)} />
      <rect width={W} height={H} fill={`url(#${uid}-light)`} />
    </g>
  );
}

export function bedroom(rng: Rng, uid: string): ReactNode {
  const { node } = room(rng, uid);
  const headboard = rng.pick(FABRICS);
  const duvet = rng.pick(['#f4f1ea', '#e3ebf2', '#efe4d6', '#e6efe4']);
  const throwColor = rng.pick(ACCENTS);
  const windowRight = rng.chance(0.5);
  return (
    <g>
      {node}
      {windowView(rng, windowRight ? 318 : 22, 54, 62, 106, rng.pick(['#e8dccb', '#d5dee6', '#e6d3c8']))}
      {artwork(rng, 152, 54, 44, 54)}
      {artwork(rng, 206, 54, 44, 54)}
      <ellipse cx={200} cy={262} rx={170} ry={26} fill={shade(rng.pick(ACCENTS), 0.45)} />
      <rect x={112} y={118} width={176} height={92} rx={14} fill={headboard} />
      <rect x={100} y={174} width={200} height={58} rx={8} fill={duvet} />
      <rect x={100} y={206} width={200} height={14} fill={throwColor} />
      <rect x={124} y={160} width={66} height={26} rx={10} fill="#ffffff" />
      <rect x={210} y={160} width={66} height={26} rx={10} fill="#ffffff" />
      <rect x={104} y={230} width={6} height={12} fill="#4b3f36" />
      <rect x={290} y={230} width={6} height={12} fill="#4b3f36" />
      {[62, 314].map((x) => (
        <g key={x}>
          <rect x={x} y={176} width={34} height={38} rx={3} fill="#c9a27c" />
          <path d={`M${x + 4} 195 h26`} stroke="#a77b55" strokeWidth={1.5} />
          <rect x={x + 15} y={160} width={4} height={16} fill="#3d3a36" />
          <path d={`M${x + 5} 160 h24 l-5 -14 h-14 Z`} fill="#f4e7cf" />
        </g>
      ))}
      {plant(rng, windowRight ? 40 : 362, 226, 60)}
      <rect width={W} height={H} fill={`url(#${uid}-light)`} />
    </g>
  );
}
