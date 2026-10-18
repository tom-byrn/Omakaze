import {
  DEFAULT_ASSUMPTIONS,
  daysBetween,
  firstMonthCosts,
  rateFor,
  type LaundryType,
  type ListingDetail,
  type ListingSummary,
  type ListingType,
  type MapPoint,
  type ParkingType,
  type PetPolicy,
  type PropertyType,
  type RentalSummary,
  type SaleStatus,
  type SaleSummary,
} from '@hearth/shared';
import { CURRENT_RATES } from '../rates';

/** Who is looking and when: favorites depend on the client, days on market on the date. */
export interface ViewContext {
  clientId: string;
  today: string;
}

/** Columns selected by the listing queries in `repositories/listings.ts`. */
export interface ListingRow {
  id: number;
  listing_type: ListingType;
  property_type: PropertyType;
  address: string;
  unit: string | null;
  beds: number;
  baths: number;
  sqft: number;
  lat: number;
  lng: number;
  pets: PetPolicy;
  laundry: LaundryType;
  parking: ParkingType;
  description: string;
  amenities: string;
  agent_name: string;
  agent_company: string;
  agent_phone: string;
  listed_at: string;
  neighborhood_slug: string;
  neighborhood_name: string;
  is_favorite: number;
  // Rentals
  rent: number | null;
  deposit: number | null;
  available_on: string | null;
  lease_term_months: number | null;
  // Homes for sale
  list_price: number | null;
  sale_status: SaleStatus | null;
  hoa_monthly: number | null;
  property_tax_rate: number | null;
  year_built: number | null;
  lot_sqft: number | null;
  sold_price: number | null;
  sold_on: string | null;
  /** Asking price when the current listing started (from price history). */
  original_list_price: number | null;
}

export interface MapPointRow {
  id: number;
  lat: number;
  lng: number;
  price: number;
  sale_status: SaleStatus | null;
}

/** Monthly cost of a home with the default assumptions, rounded to whole dollars. */
export function estimatedPayment(price: number, propertyTaxRate: number, hoaMonthly: number): number {
  const { downPaymentPercent, termYears, program } = DEFAULT_ASSUMPTIONS;
  const costs = firstMonthCosts({
    homePrice: price,
    downPayment: (price * downPaymentPercent) / 100,
    annualRate: rateFor(CURRENT_RATES, program, termYears),
    termYears,
    program,
    propertyTaxRate,
    hoaMonthly,
  });
  return Math.round(costs.total);
}

export function toListingSummary(row: ListingRow, view: ViewContext): ListingSummary {
  const base = {
    id: row.id,
    address: row.address,
    unit: row.unit,
    neighborhood: { slug: row.neighborhood_slug, name: row.neighborhood_name },
    propertyType: row.property_type,
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    location: { lat: row.lat, lng: row.lng },
    listedAt: row.listed_at,
    isFavorite: Boolean(row.is_favorite),
  };

  if (row.listing_type === 'sale') {
    const listPrice = row.list_price as number;
    const priceChange =
      row.original_list_price !== null && row.original_list_price !== listPrice
        ? listPrice - row.original_list_price
        : null;
    return {
      ...base,
      listingType: 'sale',
      listPrice,
      status: row.sale_status as SaleStatus,
      estimatedPayment: estimatedPayment(listPrice, row.property_tax_rate ?? 0, row.hoa_monthly ?? 0),
      daysOnMarket: daysBetween(row.listed_at, row.sold_on ?? view.today),
      priceChange,
      soldPrice: row.sold_price,
      soldOn: row.sold_on,
    } satisfies SaleSummary;
  }

  return {
    ...base,
    listingType: 'rent',
    rent: row.rent as number,
    availableOn: row.available_on as string,
    pets: row.pets,
  } satisfies RentalSummary;
}

export function toListingDetail(row: ListingRow, view: ViewContext): ListingDetail {
  const summary = toListingSummary(row, view);
  const details = {
    description: row.description,
    laundry: row.laundry,
    parking: row.parking,
    amenities: parseAmenities(row.amenities),
    agent: { name: row.agent_name, company: row.agent_company, phone: row.agent_phone },
  };

  if (summary.listingType === 'sale') {
    return {
      ...summary,
      ...details,
      hoaMonthly: row.hoa_monthly ?? 0,
      propertyTaxRate: row.property_tax_rate ?? 0,
      yearBuilt: row.year_built,
      lotSqft: row.lot_sqft,
    };
  }
  return {
    ...summary,
    ...details,
    deposit: row.deposit as number,
    leaseTermMonths: row.lease_term_months as number,
  };
}

export function toMapPoint(row: MapPointRow): MapPoint {
  return { id: row.id, location: { lat: row.lat, lng: row.lng }, price: row.price, status: row.sale_status };
}

function parseAmenities(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
