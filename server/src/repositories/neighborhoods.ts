import type { Neighborhood } from '@hearth/shared';
import type { Database } from '../../db/connection';
import { median } from '../lib/stats';

interface NeighborhoodRow {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  center_lat: number;
  center_lng: number;
}

export function listNeighborhoods(db: Database): Neighborhood[] {
  const rows = db
    .prepare('SELECT id, slug, name, tagline, description, center_lat, center_lng FROM neighborhoods ORDER BY name')
    .all() as unknown as NeighborhoodRow[];

  const rents = db.prepare('SELECT neighborhood_id, rent FROM listings').all() as unknown as {
    neighborhood_id: number;
    rent: number;
  }[];

  const rentsByNeighborhood = new Map<number, number[]>();
  for (const { neighborhood_id: id, rent } of rents) {
    const list = rentsByNeighborhood.get(id) ?? [];
    list.push(rent);
    rentsByNeighborhood.set(id, list);
  }

  return rows.map((row) => {
    const neighborhoodRents = rentsByNeighborhood.get(row.id) ?? [];
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      tagline: row.tagline,
      description: row.description,
      center: { lat: row.center_lat, lng: row.center_lng },
      listingCount: neighborhoodRents.length,
      medianRent: median(neighborhoodRents),
    };
  });
}
