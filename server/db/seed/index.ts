import { addDays, toIsoDate, type PriceEvent, type SaleStatus } from '@hearth/shared';
import { transaction, type Database } from '../connection';
import { AGENTS } from './agents';
import { NEIGHBORHOODS } from './neighborhoods';
import { RENTALS } from './rentals';
import { SALES, type PriceEventSeed } from './sales';

export interface SeedOptions {
  /** Dates in the seed data are relative to this moment so listings always look fresh. */
  now?: Date;
}

export interface SeedSummary {
  neighborhoods: number;
  rentals: number;
  sales: number;
}

interface SaleState {
  events: PriceEvent[];
  listedAt: string;
  listPrice: number;
  status: SaleStatus;
  soldPrice: number | null;
  soldOn: string | null;
}

/** Works out a home's current listing from its price history (see `PriceEventSeed`). */
export function resolveSaleHistory(history: readonly PriceEventSeed[], today: string): SaleState {
  const events = history.map(([date, event, price]) => ({
    date: typeof date === 'number' ? addDays(today, date) : date,
    event,
    price,
  }));
  const start = events.map((e) => e.event).lastIndexOf('listed');
  if (start === -1) throw new Error('A home for sale needs a "listed" event');

  const current = events.slice(start);
  const asking = current.filter((e) => e.event === 'listed' || e.event === 'price_change');
  const last = current[current.length - 1];
  const status: SaleStatus =
    last.event === 'sold' ? 'sold' : current.some((e) => e.event === 'pending') ? 'pending' : 'active';

  return {
    events,
    listedAt: current[0].date,
    listPrice: asking[asking.length - 1].price,
    status,
    soldPrice: status === 'sold' ? last.price : null,
    soldOn: status === 'sold' ? last.date : null,
  };
}

/** Replaces all listing data with the Port Ellis sample data set: rentals and homes for sale. */
export function seed(db: Database, { now = new Date() }: SeedOptions = {}): SeedSummary {
  const today = toIsoDate(now);

  return transaction(db, () => {
    db.exec(`
      DELETE FROM offers;
      DELETE FROM price_history;
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

    const neighborhoodId = (slug: string, address: string) => {
      const id = neighborhoodIds.get(slug);
      if (id === undefined) throw new Error(`Unknown neighborhood "${slug}" for ${address}`);
      return id;
    };

    for (const rental of RENTALS) {
      const agent = AGENTS[rental.agent];
      insertListing.run(
        neighborhoodId(rental.neighborhood, rental.address),
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

    const insertSale = db.prepare(`
      INSERT INTO listings (
        listing_type, neighborhood_id, property_type, address, unit, beds, baths, sqft, lat, lng,
        pets, laundry, parking, description, amenities, agent_name, agent_company, agent_phone,
        listed_at, list_price, sale_status, hoa_monthly, property_tax_rate, year_built, lot_sqft,
        sold_price, sold_on
      ) VALUES ('sale', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertPriceEvent = db.prepare(
      'INSERT INTO price_history (listing_id, event_date, event, price) VALUES (?, ?, ?, ?)',
    );

    for (const sale of SALES) {
      const agent = AGENTS[sale.agent];
      const state = resolveSaleHistory(sale.history, today);
      const { lastInsertRowid } = insertSale.run(
        neighborhoodId(sale.neighborhood, sale.address),
        sale.propertyType,
        sale.address,
        sale.unit ?? null,
        sale.beds,
        sale.baths,
        sale.sqft,
        sale.lat,
        sale.lng,
        sale.pets,
        sale.laundry,
        sale.parking,
        sale.description,
        JSON.stringify(sale.amenities),
        agent.name,
        agent.company,
        agent.phone,
        state.listedAt,
        state.listPrice,
        state.status,
        sale.hoaMonthly,
        sale.propertyTaxRate,
        sale.yearBuilt,
        sale.lotSqft ?? null,
        state.soldPrice,
        state.soldOn,
      );
      for (const event of state.events) {
        insertPriceEvent.run(lastInsertRowid, event.date, event.event, event.price);
      }
    }

    return { neighborhoods: NEIGHBORHOODS.length, rentals: RENTALS.length, sales: SALES.length };
  });
}
