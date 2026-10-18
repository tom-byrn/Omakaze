import type { LatLng } from '@hearth/shared';

/**
 * Hand-drawn geometry for the (fictional) city of Port Ellis.
 *
 * Everything is expressed in a 1000 x 1000 map space. Listing coordinates are
 * stored as lat/lng and projected linearly into that space, which is plenty
 * for a city a few kilometres across.
 */

export type Point = readonly [number, number];

export const MAP_SIZE = 1000;

export const MAP_BOUNDS = {
  north: 47.66,
  south: 47.58,
  west: -122.42,
  east: -122.3,
} as const;

export function project({ lat, lng }: LatLng): { x: number; y: number } {
  return {
    x: ((lng - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * MAP_SIZE,
    y: ((MAP_BOUNDS.north - lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * MAP_SIZE,
  };
}

export function unproject(x: number, y: number): LatLng {
  return {
    lat: MAP_BOUNDS.north - (y / MAP_SIZE) * (MAP_BOUNDS.north - MAP_BOUNDS.south),
    lng: MAP_BOUNDS.west + (x / MAP_SIZE) * (MAP_BOUNDS.east - MAP_BOUNDS.west),
  };
}

/** Outline of the land; everything outside it is Ellis Sound. */
export const LAND: Point[] = [
  [236, -20], [1020, -20], [1020, 958], [940, 950], [880, 962], [820, 948], [760, 958],
  [700, 944], [640, 956], [590, 940], [540, 948], [490, 932], [450, 912], [420, 900],
  [380, 905], [330, 918], [270, 930], [210, 922], [160, 900], [128, 866], [122, 826],
  [140, 790], [176, 764], [214, 748], [240, 722], [246, 690], [236, 650], [222, 610],
  [214, 572], [206, 520], [190, 480], [186, 430], [198, 380], [192, 330], [178, 280],
  [182, 230], [200, 180], [214, 130], [222, 80], [230, 30],
];

/** The Ellis River runs east to west and empties into the Sound below Harborview. */
export const RIVER: Point[] = [
  [1020, 468], [930, 478], [860, 500], [800, 492], [740, 470], [680, 476], [620, 500],
  [560, 512], [500, 506], [440, 520], [380, 540], [320, 548], [260, 546], [190, 548],
];

/** The old mill canal that gives the Canal District its name. */
export const CANAL: Point[] = [
  [560, 512], [566, 600], [572, 700], [580, 800], [590, 900], [596, 960],
];

export interface NeighborhoodShape {
  points: Point[];
  label: Point;
  /** Street grid rotation (degrees) and spacing used to texture the neighborhood. */
  grid: { angle: number; spacing: number };
}

export const NEIGHBORHOOD_SHAPES: Record<string, NeighborhoodShape> = {
  harborview: {
    points: [[0, 0], [400, 0], [404, 300], [410, 530], [380, 540], [320, 548], [260, 546], [214, 548], [0, 548]],
    label: [300, 236],
    grid: { angle: -4, spacing: 30 },
  },
  northgate: {
    points: [[400, 0], [700, 0], [704, 290], [404, 300]],
    label: [560, 170],
    grid: { angle: 0, spacing: 34 },
  },
  'old-mill': {
    points: [[404, 300], [704, 290], [712, 473], [680, 476], [620, 500], [560, 512], [500, 506], [440, 520], [410, 530]],
    label: [520, 392],
    grid: { angle: 8, spacing: 28 },
  },
  'larch-hill': {
    points: [[700, 0], [1020, 0], [1020, 468], [930, 478], [860, 500], [800, 492], [740, 470], [712, 473], [704, 290]],
    label: [836, 330],
    grid: { angle: 24, spacing: 38 },
  },
  'ferry-point': {
    points: [[0, 548], [214, 548], [260, 546], [320, 548], [380, 540], [430, 523], [436, 760], [452, 1000], [0, 1000]],
    label: [320, 700],
    grid: { angle: -14, spacing: 32 },
  },
  'canal-district': {
    points: [[430, 523], [440, 520], [500, 506], [560, 512], [620, 500], [680, 476], [700, 474], [706, 770], [436, 760]],
    label: [640, 610],
    grid: { angle: 2, spacing: 26 },
  },
  'kestrel-park': {
    points: [[700, 474], [740, 470], [800, 492], [860, 500], [930, 478], [1020, 468], [1020, 780], [706, 770]],
    label: [836, 538],
    grid: { angle: -8, spacing: 34 },
  },
  saltmarsh: {
    points: [[436, 760], [706, 770], [1020, 780], [1020, 1000], [452, 1000]],
    label: [760, 836],
    grid: { angle: 4, spacing: 36 },
  },
};

export interface Park {
  name: string | null;
  points: Point[];
}

export const PARKS: Park[] = [
  { name: 'Kestrel Woods', points: [[756, 596], [820, 574], [890, 584], [928, 628], [912, 700], [838, 724], [770, 700], [744, 646]] },
  { name: null, points: [[188, 318], [238, 306], [250, 372], [244, 430], [196, 436]] },
  { name: null, points: [[610, 360], [672, 356], [676, 410], [612, 414]] },
  { name: null, points: [[452, 70], [520, 64], [524, 118], [456, 122]] },
  { name: null, points: [[124, 812], [168, 800], [186, 846], [150, 878], [124, 860]] },
  { name: null, points: [[800, 150], [880, 120], [930, 168], [904, 236], [826, 244], [786, 196]] },
];

/** Reservoir on top of Larch Hill. */
export const RESERVOIR: Point[] = [[826, 176], [870, 152], [906, 178], [890, 214], [842, 218]];

/** Wetlands along the south shore. */
export const MARSH: Point[] = [
  [470, 902], [560, 884], [640, 898], [720, 884], [820, 890], [930, 904], [1020, 920],
  [1020, 1000], [452, 1000],
];

export interface Road {
  points: Point[];
  major: boolean;
}

export const ROADS: Road[] = [
  // Shore Drive hugs the waterfront from Harborview down to Ferry Point.
  { major: true, points: [[252, -10], [240, 90], [226, 180], [214, 280], [224, 380], [218, 470], [236, 540], [252, 600], [266, 680], [252, 744], [206, 790], [168, 830]] },
  // Ellis Avenue, the north-south spine.
  { major: true, points: [[520, -10], [522, 160], [522, 300], [516, 506], [512, 640], [516, 780], [522, 930]] },
  // Market Street.
  { major: true, points: [[220, 300], [404, 300], [704, 290], [1020, 302]] },
  // Ferry Road.
  { major: true, points: [[250, 640], [436, 646], [706, 660], [744, 662]] },
  // Kestrel Parkway curves around the park.
  { major: true, points: [[706, 560], [790, 556], [940, 566], [1020, 560]] },
  { major: true, points: [[928, 640], [1020, 650]] },
  // Northgate Boulevard climbs towards Larch Hill.
  { major: true, points: [[640, -10], [700, 90], [780, 120], [900, 100], [1020, 110]] },
  // Saltmarsh Way.
  { major: true, points: [[436, 812], [706, 818], [1020, 826]] },
  { major: false, points: [[700, 290], [760, 340], [860, 380], [960, 380], [1020, 400]] },
  { major: false, points: [[330, 548], [340, 640], [360, 760], [380, 860]] },
  { major: false, points: [[600, 300], [610, 420], [620, 500]] },
];

/** The light rail line through Northgate. */
export const RAIL: Point[] = [[590, -10], [586, 120], [574, 220], [560, 300], [548, 420], [540, 510]];

export const STATIONS: { name: string; at: Point }[] = [
  { name: 'Northgate Station', at: [584, 150] },
];

/** Turns a list of points into a smooth SVG path using Catmull-Rom splines. */
export function smoothPath(points: readonly Point[], closed = false, tension = 0.5): string {
  if (points.length < 2) return '';
  const pts = closed ? [...points, points[0], points[1]] : points;
  const at = (i: number): Point => {
    if (closed) return pts[(i + pts.length) % pts.length];
    return pts[Math.max(0, Math.min(pts.length - 1, i))];
  };

  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const segments = closed ? points.length : pts.length - 1;
  for (let i = 0; i < segments; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return closed ? `${d} Z` : d;
}

export function polygonPath(points: readonly Point[]): string {
  return `M${points.map(([x, y]) => `${x},${y}`).join(' L')} Z`;
}

export function pointInPolygon([x, y]: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
