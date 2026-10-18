export type PropertyType = 'apartment' | 'condo' | 'townhouse' | 'house' | 'loft';

export type PetPolicy = 'none' | 'cats' | 'dogs' | 'cats_dogs';

export type LaundryType = 'in_unit' | 'shared' | 'none';

export type ParkingType = 'garage' | 'off_street' | 'street' | 'none';

export type ListingType = 'rent' | 'sale';

export type SaleStatus = 'active' | 'pending' | 'sold';

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
  rentalCount: number;
  forSaleCount: number;
  medianRent: number | null;
}

interface ListingBase {
  id: number;
  listingType: ListingType;
  address: string;
  unit: string | null;
  neighborhood: NeighborhoodRef;
  propertyType: PropertyType;
  beds: number;
  baths: number;
  sqft: number;
  location: LatLng;
  listedAt: string;
  isFavorite: boolean;
}

export interface RentalSummary extends ListingBase {
  listingType: 'rent';
  rent: number;
  availableOn: string;
  pets: PetPolicy;
}

export interface SaleSummary extends ListingBase {
  listingType: 'sale';
  listPrice: number;
  status: SaleStatus;
  /** Monthly cost with the default assumptions: 20% down, 30-year fixed at today's rate. */
  estimatedPayment: number;
  /** Days since listing, or until the sale for sold homes. */
  daysOnMarket: number;
  /** Most recent price change on the current listing; negative for a price cut. */
  priceChange: number | null;
  soldPrice: number | null;
  soldOn: string | null;
}

export type ListingSummary = RentalSummary | SaleSummary;

export interface Agent {
  name: string;
  company: string;
  phone: string;
}

interface ListingDetails {
  description: string;
  laundry: LaundryType;
  parking: ParkingType;
  amenities: string[];
  agent: Agent;
}

export interface RentalDetail extends RentalSummary, ListingDetails {
  deposit: number;
  leaseTermMonths: number;
}

export interface SaleDetail extends SaleSummary, ListingDetails {
  hoaMonthly: number;
  /** Annual property tax as a share of the price. */
  propertyTaxRate: number;
  yearBuilt: number | null;
  lotSqft: number | null;
}

export type ListingDetail = RentalDetail | SaleDetail;

/** Lightweight marker data for every listing that matches a search. */
export interface MapPoint {
  id: number;
  location: LatLng;
  price: number;
  /** Sale status, so pending and sold homes can be drawn muted. */
  status: SaleStatus | null;
}

export interface ListingSearchResult {
  results: ListingSummary[];
  mapPoints: MapPoint[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export type PriceEventType = 'listed' | 'price_change' | 'pending' | 'sold';

export interface PriceEvent {
  date: string;
  event: PriceEventType;
  price: number;
}

export interface MarketMetrics {
  activeCount: number;
  pendingCount: number;
  /** Homes sold in the last 12 months. */
  soldCount: number;
  medianListPrice: number | null;
  medianPricePerSqft: number | null;
  averageDaysOnMarket: number | null;
  /** Average sale price as a share of the final list price, e.g. 1.012. */
  saleToListRatio: number | null;
}

export interface MarketStats {
  neighborhood: NeighborhoodRef;
  metrics: MarketMetrics;
  city: MarketMetrics;
  asOf: string;
}

export type FinancingType = 'cash' | 'conventional' | 'fha' | 'va';

export type Contingency = 'inspection' | 'appraisal' | 'financing' | 'home_sale';

export type OfferStatus = 'submitted' | 'countered' | 'accepted' | 'rejected' | 'withdrawn';

export interface Offer {
  id: number;
  listingId: number;
  buyerName: string;
  buyerEmail: string;
  amount: number;
  financing: FinancingType;
  downPaymentPercent: number;
  contingencies: Contingency[];
  closingDate: string;
  message: string | null;
  status: OfferStatus;
  /** Set when the seller counters. */
  counterAmount: number | null;
  sellerNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfferWithListing extends Offer {
  listing: SaleSummary;
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
