import type { MortgageRates } from '@hearth/shared';

/**
 * Average fixed rates by loan program and term. A production deployment would
 * refresh these from a rate feed every day; Hearth keeps them fixed so payment
 * estimates are reproducible.
 */
export const CURRENT_RATES: MortgageRates = {
  conventional: { 30: 6.375, 20: 6.25, 15: 5.75 },
  fha: { 30: 6.125, 20: 6.0, 15: 5.625 },
  va: { 30: 5.875, 20: 5.75, 15: 5.5 },
};
