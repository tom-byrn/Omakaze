import { addDays, toIsoDate } from '@hearth/shared';
import { transaction, type Database } from '../connection';
import { AGENTS } from './agents';
import { NEIGHBORHOODS } from './neighborhoods';
import { RENTALS } from './rentals';

export interface SeedOptions {
  /** Dates in the seed data are relative to this moment so listings always look fresh. */
  now?: Date;
}

export interface SeedSummary {
  neighborhoods: number;
  listings: number;
}

/** Replaces all listing data with the Port Ellis sample data set. */
export function seed(db: Database, { now = new Date() }: SeedOptions = {}): SeedSummary {
  const today = toIsoDate(now);

  return transaction(db, () => {
    db.exec(`
      DELETE FROM inquiries;
      DELETE FROM favorites;
      DELETE FROM listings;
      DELETE FROM neighborhoods;
    `);

    const insertNeighborhood = db.prepare(`
      INSERT INTO neighborhoods (slug, name, tagline, description, center_lat, center_lng)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const neighborhoodIds = new Map<string, number>();
    for (const hood of NEIGHBORHOODS) {
      const { lastInsertRowid } = insertNeighborhood.run(
        hood.slug,
        hood.name,
        hood.tagline,
        hood.description,
        hood.center.lat,
        hood.center.lng,
      );
      neighborhoodIds.set(hood.slug, Number(lastInsertRowid));
    }

    const insertListing = db.prepare(`
      INSERT INTO listings (
        neighborhood_id, property_type, address, unit, rent, deposit, beds, baths, sqft,
        lat, lng, available_on, lease_term_months, pets, laundry, parking, description,
        amenities, agent_name, agent_company, agent_phone, listed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rental of RENTALS) {
      const neighborhoodId = neighborhoodIds.get(rental.neighborhood);
      if (neighborhoodId === undefined) {
        throw new Error(`Unknown neighborhood "${rental.neighborhood}" for ${rental.address}`);
      }
      const agent = AGENTS[rental.agent];
      insertListing.run(
        neighborhoodId,
        rental.propertyType,
        rental.address,
        rental.unit ?? null,
        rental.rent,
        rental.deposit ?? rental.rent,
        rental.beds,
        rental.baths,
        rental.sqft,
        rental.lat,
        rental.lng,
        addDays(today, rental.availableInDays),
        rental.leaseTermMonths ?? 12,
        rental.pets,
        rental.laundry,
        rental.parking,
        rental.description,
        JSON.stringify(rental.amenities),
        agent.name,
        agent.company,
        agent.phone,
        addDays(today, -rental.listedDaysAgo),
      );
    }

    return { neighborhoods: NEIGHBORHOODS.length, listings: RENTALS.length };
  });
}
