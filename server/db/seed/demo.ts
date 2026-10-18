import type { Contingency, FinancingType, OfferStatus } from '@hearth/shared';

/**
 * The anonymous client id that owns the sample offers, so the offers
 * dashboard has something to show. Send it as the `hearth_cid` cookie or the
 * `X-Hearth-Client` header to see them.
 */
export const DEMO_CLIENT_ID = 'demo-buyer';

export interface DemoOfferSeed {
  address: string;
  amount: number;
  financing: FinancingType;
  downPaymentPercent: number;
  contingencies: Contingency[];
  /** Relative to the seed date. */
  closingInDays: number;
  createdDaysAgo: number;
  status: OfferStatus;
  counterAmount?: number;
  sellerNote?: string;
  message?: string;
}

export const DEMO_OFFERS: DemoOfferSeed[] = [
  {
    address: '2210 Shore Drive',
    amount: 915000,
    financing: 'conventional',
    downPaymentPercent: 20,
    contingencies: ['inspection', 'appraisal', 'financing'],
    closingInDays: 40,
    createdDaysAgo: 3,
    status: 'countered',
    counterAmount: 935000,
    sellerNote: 'The sellers can meet you at $935,000 if you can close before the end of November.',
    message: 'We love the light in this unit and are pre-approved with Harbor Credit Union.',
  },
  {
    address: '37 Meadowlark Drive',
    amount: 1215000,
    financing: 'conventional',
    downPaymentPercent: 25,
    contingencies: ['inspection', 'financing'],
    closingInDays: 26,
    createdDaysAgo: 12,
    status: 'accepted',
    sellerNote: 'Accepted! Grace will send the purchase agreement for signatures today.',
  },
  {
    address: '2 Bridge Street',
    amount: 640000,
    financing: 'fha',
    downPaymentPercent: 3.5,
    contingencies: ['inspection', 'appraisal', 'financing'],
    closingInDays: 30,
    createdDaysAgo: 16,
    status: 'withdrawn',
  },
  {
    address: '22 Summit Avenue',
    amount: 1460000,
    financing: 'conventional',
    downPaymentPercent: 15,
    contingencies: ['inspection', 'appraisal', 'financing', 'home_sale'],
    closingInDays: -12,
    createdDaysAgo: 55,
    status: 'rejected',
    sellerNote: 'The sellers went with an offer that had no home-sale contingency.',
  },
];

/** Saved searches for the demo client, as search URL query strings. */
export const DEMO_SAVED_SEARCHES = [
  { query: 'type=sale&neighborhood=kestrel-park&maxPrice=1300000&beds=3', alertFrequency: 'daily', createdDaysAgo: 20 },
  { query: 'neighborhood=canal-district&beds=1&pets=dogs', alertFrequency: 'weekly', createdDaysAgo: 9 },
] as const;
