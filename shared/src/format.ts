import type { LaundryType, ListingSummary, ParkingType, PetPolicy, PropertyType, SaleStatus } from './types';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatCurrency(amount: number): string {
  return currency.format(amount);
}

export function formatRent(amount: number): string {
  return `${currency.format(amount)}/mo`;
}

/** The headline price: monthly rent, the asking price, or what a sold home went for. */
export function listingPrice(listing: ListingSummary): number {
  if (listing.listingType === 'rent') return listing.rent;
  return listing.soldPrice ?? listing.listPrice;
}

export function formatListingPrice(listing: ListingSummary): string {
  return listing.listingType === 'rent' ? formatRent(listing.rent) : formatCurrency(listingPrice(listing));
}

export function formatPricePerSqft(price: number, sqft: number): string {
  return `${formatCurrency(price / sqft)}/sqft`;
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits).replace(/\.0+$/, '')}%`;
}

const SQFT_PER_ACRE = 43_560;

/** Small lots in square feet, larger ones (a quarter acre and up) in acres. */
export function formatLotSize(sqft: number): string {
  if (sqft >= SQFT_PER_ACRE / 4) {
    const acres = trimDecimals(sqft / SQFT_PER_ACRE, 2);
    return `${acres} ${acres === '1' ? 'acre' : 'acres'}`;
  }
  return `${integer.format(sqft)} sqft`;
}

/** Short price used on map markers: $950, $2.4K, $13K, $1.25M. */
export function formatCompactPrice(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${trimDecimals(amount / 1_000_000, 2)}M`;
  }
  if (amount >= 1_000) {
    const thousands = amount / 1_000;
    return `$${trimDecimals(thousands, thousands >= 10 ? 0 : 1)}K`;
  }
  return `$${Math.round(amount)}`;
}

/** Fixed decimals without trailing zeros: 2.50 -> "2.5", 600 -> "600". */
function trimDecimals(value: number, digits: number): string {
  const fixed = value.toFixed(digits);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** "1180 Shore Drive #6C", "200 Millrace Road, Loft 4", or just the street address. */
export function formatAddress(address: string, unit: string | null): string {
  if (!unit) return address;
  return /\s/.test(unit) ? `${address}, ${unit}` : `${address} #${unit}`;
}

export function formatBeds(beds: number): string {
  return beds === 0 ? 'Studio' : `${beds} bd`;
}

export function formatBaths(baths: number): string {
  return `${baths} ba`;
}

export function formatSqft(sqft: number): string {
  return `${integer.format(sqft)} sqft`;
}

export function formatNumber(value: number): string {
  return integer.format(value);
}

/** Parses a YYYY-MM-DD string as a calendar date (no timezone shifting). */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / 86_400_000);
}

export function formatDate(iso: string, options: Intl.DateTimeFormatOptions = {}): string {
  return parseIsoDate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
    ...options,
  });
}

export function formatAvailability(availableOn: string, today: string): string {
  if (availableOn <= today) return 'Available now';
  return `Available ${formatDate(availableOn, { year: undefined })}`;
}

export function formatListedAgo(listedAt: string, today: string): string {
  const days = daysBetween(listedAt, today);
  if (days <= 0) return 'Listed today';
  if (days === 1) return 'Listed yesterday';
  if (days < 7) return `Listed ${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Listed ${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  return `Listed ${formatDate(listedAt)}`;
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: 'Apartment',
  condo: 'Condo',
  townhouse: 'Townhouse',
  house: 'House',
  loft: 'Loft',
};

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  active: 'For sale',
  pending: 'Pending',
  sold: 'Sold',
};

export const PET_POLICY_LABELS: Record<PetPolicy, string> = {
  none: 'No pets',
  cats: 'Cats allowed',
  dogs: 'Dogs allowed',
  cats_dogs: 'Cats & dogs allowed',
};

export const LAUNDRY_LABELS: Record<LaundryType, string> = {
  in_unit: 'In-unit washer & dryer',
  shared: 'Shared laundry room',
  none: 'No laundry on site',
};

export const PARKING_LABELS: Record<ParkingType, string> = {
  garage: 'Garage',
  off_street: 'Off-street spot',
  street: 'Street parking',
  none: 'No parking',
};
