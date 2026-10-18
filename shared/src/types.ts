export type PropertyType = 'apartment' | 'condo' | 'townhouse' | 'house' | 'loft';

export type PetPolicy = 'none' | 'cats' | 'dogs' | 'cats_dogs';

export type LaundryType = 'in_unit' | 'shared' | 'none';

export type ParkingType = 'garage' | 'off_street' | 'street' | 'none';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface NeighborhoodRef {
  slug: string;
  name: string;
}

export interface Neighborhood extends NeighborhoodRef {
  id: number;
  tagline: string;
  description: string;
  center: LatLng;
  listingCount: number;
  medianRent: number | null;
}

export interface ListingSummary {
  id: number;
  address: string;
  unit: string | null;
  neighborhood: NeighborhoodRef;
  propertyType: PropertyType;
  rent: number;
  beds: number;
  baths: number;
  sqft: number;
  location: LatLng;
  availableOn: string;
  listedAt: string;
  pets: PetPolicy;
  isFavorite: boolean;
}

export interface Agent {
  name: string;
  company: string;
  phone: string;
}

export interface ListingDetail extends ListingSummary {
  description: string;
  deposit: number;
  leaseTermMonths: number;
  laundry: LaundryType;
  parking: ParkingType;
  amenities: string[];
  agent: Agent;
}

/** Lightweight marker data for every listing that matches a search. */
export interface MapPoint {
  id: number;
  location: LatLng;
  price: number;
}

export interface ListingSearchResult {
  results: ListingSummary[];
  mapPoints: MapPoint[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export type InquiryKind = 'question' | 'tour';

export interface Inquiry {
  id: number;
  listingId: number;
  kind: InquiryKind;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  moveInDate: string | null;
  tourDate: string | null;
  createdAt: string;
}

export interface ApiErrorBody {
  error: {
    message: string;
    fields?: Record<string, string>;
  };
}
