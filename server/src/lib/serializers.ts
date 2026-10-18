import type {
  LaundryType,
  ListingDetail,
  ListingSummary,
  MapPoint,
  ParkingType,
  PetPolicy,
  PropertyType,
} from '@hearth/shared';

/** Columns selected by the listing queries in `repositories/listings.ts`. */
export interface ListingRow {
  id: number;
  property_type: PropertyType;
  address: string;
  unit: string | null;
  rent: number;
  deposit: number;
  beds: number;
  baths: number;
  sqft: number;
  lat: number;
  lng: number;
  available_on: string;
  lease_term_months: number;
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
}

export interface MapPointRow {
  id: number;
  lat: number;
  lng: number;
  rent: number;
}

export function toListingSummary(row: ListingRow): ListingSummary {
  return {
    id: row.id,
    address: row.address,
    unit: row.unit,
    neighborhood: { slug: row.neighborhood_slug, name: row.neighborhood_name },
    propertyType: row.property_type,
    rent: row.rent,
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    location: { lat: row.lat, lng: row.lng },
    availableOn: row.available_on,
    listedAt: row.listed_at,
    pets: row.pets,
    isFavorite: Boolean(row.is_favorite),
  };
}

export function toListingDetail(row: ListingRow): ListingDetail {
  return {
    ...toListingSummary(row),
    description: row.description,
    deposit: row.deposit,
    leaseTermMonths: row.lease_term_months,
    laundry: row.laundry,
    parking: row.parking,
    amenities: parseAmenities(row.amenities),
    agent: { name: row.agent_name, company: row.agent_company, phone: row.agent_phone },
  };
}

export function toMapPoint(row: MapPointRow): MapPoint {
  return { id: row.id, location: { lat: row.lat, lng: row.lng }, price: row.rent };
}

function parseAmenities(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
