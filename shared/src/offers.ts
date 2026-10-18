import { addDays, formatCurrency } from './format';
import { LOAN_PROGRAMS } from './mortgage';
import type { Contingency, FinancingType, OfferStatus } from './types';
import {
  asNumber,
  asRecord,
  asTrimmedString,
  emailError,
  isValidIsoDate,
  nameError,
  validationResult,
  type FieldErrors,
  type ValidationResult,
} from './validation';

export const FINANCING_OPTIONS: Record<
  FinancingType,
  { label: string; description: string; minDownPaymentPercent: number }
> = {
  cash: {
    label: 'Cash',
    description: 'No loan or appraisal to wait on, which most sellers prefer.',
    minDownPaymentPercent: 100,
  },
  conventional: {
    label: 'Conventional loan',
    description: 'From 3% down. Private mortgage insurance applies below 20% down.',
    minDownPaymentPercent: LOAN_PROGRAMS.conventional.minDownPaymentPercent,
  },
  fha: {
    label: 'FHA loan',
    description: 'Government-backed, from 3.5% down, with mortgage insurance.',
    minDownPaymentPercent: LOAN_PROGRAMS.fha.minDownPaymentPercent,
  },
  va: {
    label: 'VA loan',
    description: 'For eligible veterans and service members, with as little as 0% down.',
    minDownPaymentPercent: LOAN_PROGRAMS.va.minDownPaymentPercent,
  },
};

export const CONTINGENCY_OPTIONS: Record<Contingency, { label: string; description: string }> = {
  inspection: { label: 'Inspection', description: 'Renegotiate or walk away if the inspection finds problems.' },
  appraisal: { label: 'Appraisal', description: 'Protects you if the home appraises below your offer.' },
  financing: { label: 'Financing', description: 'Lets you back out if your loan isn’t approved.' },
  home_sale: { label: 'Sale of your home', description: 'Makes the purchase depend on selling your current home.' },
};

export const OFFER_RULES = {
  minPercentOfList: 70,
  maxPercentOfList: 130,
  /** Loans need time for underwriting and an appraisal, so they can't close as fast as cash. */
  minClosingDays: { cash: 14, financed: 21 },
  maxClosingDays: 120,
  messageMax: 1000,
} as const;

/** Offers the buyer can still withdraw and the seller can still act on. */
export const OPEN_OFFER_STATUSES: readonly OfferStatus[] = ['submitted', 'countered'];

export interface OfferInput {
  buyerName: string;
  buyerEmail: string;
  amount: number;
  financing: FinancingType;
  downPaymentPercent: number;
  contingencies: Contingency[];
  closingDate: string;
  message: string | null;
}

export type OfferErrors = FieldErrors<OfferInput>;

export function offerAmountRange(listPrice: number): { min: number; max: number } {
  return {
    min: Math.ceil((listPrice * OFFER_RULES.minPercentOfList) / 100),
    max: Math.floor((listPrice * OFFER_RULES.maxPercentOfList) / 100),
  };
}

export function closingDateRange(financing: FinancingType, today: string): { min: string; max: string } {
  const minDays = financing === 'cash' ? OFFER_RULES.minClosingDays.cash : OFFER_RULES.minClosingDays.financed;
  return { min: addDays(today, minDays), max: addDays(today, OFFER_RULES.maxClosingDays) };
}

const isFinancingType = (value: unknown): value is FinancingType =>
  typeof value === 'string' && Object.hasOwn(FINANCING_OPTIONS, value);

const isContingency = (value: unknown): value is Contingency =>
  typeof value === 'string' && Object.hasOwn(CONTINGENCY_OPTIONS, value);

/**
 * Validates an offer against the home's asking price and the financing rules:
 * cash pays in full, FHA needs 3.5% down, VA allows 0% down, and a financing
 * contingency only makes sense with a loan.
 */
export function validateOffer(
  input: unknown,
  { listPrice, today }: { listPrice: number; today: string },
): ValidationResult<OfferInput> {
  const body = asRecord(input);
  const errors: OfferErrors = {};

  const buyerName = asTrimmedString(body.buyerName);
  errors.buyerName = nameError(buyerName);
  const buyerEmail = asTrimmedString(body.buyerEmail).toLowerCase();
  errors.buyerEmail = emailError(buyerEmail);

  const amount = asNumber(body.amount);
  const range = offerAmountRange(listPrice);
  if (amount === null || !Number.isInteger(amount) || amount <= 0) {
    errors.amount = 'Enter your offer in whole dollars';
  } else if (amount < range.min) {
    errors.amount = `Offers start at ${formatCurrency(range.min)} (${OFFER_RULES.minPercentOfList}% of the asking price)`;
  } else if (amount > range.max) {
    errors.amount = `Offers can’t be more than ${formatCurrency(range.max)} (${OFFER_RULES.maxPercentOfList}% of the asking price)`;
  }

  const financing = isFinancingType(body.financing) ? body.financing : null;
  const downPaymentPercent = asNumber(body.downPaymentPercent) ?? (financing === 'cash' ? 100 : null);
  if (!financing) {
    errors.financing = 'Choose how you’ll pay for the home';
  } else if (financing === 'cash') {
    if (downPaymentPercent !== 100) errors.downPaymentPercent = 'Cash offers pay the full price at closing';
  } else {
    const { label, minDownPaymentPercent } = FINANCING_OPTIONS[financing];
    if (downPaymentPercent === null || downPaymentPercent < minDownPaymentPercent || downPaymentPercent >= 100) {
      errors.downPaymentPercent =
        minDownPaymentPercent > 0
          ? `${label}s need at least ${minDownPaymentPercent}% down`
          : 'Enter a down payment below 100%';
    }
  }

  const rawContingencies = body.contingencies ?? [];
  const contingencies = Array.isArray(rawContingencies) ? [...new Set(rawContingencies)] : [];
  if (!Array.isArray(rawContingencies) || !contingencies.every(isContingency)) {
    errors.contingencies = 'Choose contingencies from the list';
  } else if (financing === 'cash' && contingencies.includes('financing')) {
    errors.contingencies = 'Cash offers can’t include a financing contingency';
  }

  const closingDate = asTrimmedString(body.closingDate);
  if (!isValidIsoDate(closingDate)) {
    errors.closingDate = 'Pick a closing date';
  } else if (financing) {
    const { min, max } = closingDateRange(financing, today);
    if (closingDate < min) {
      errors.closingDate =
        financing === 'cash'
          ? `Cash offers can close ${OFFER_RULES.minClosingDays.cash} days from today at the earliest`
          : `Financed offers need at least ${OFFER_RULES.minClosingDays.financed} days to close`;
    } else if (closingDate > max) {
      errors.closingDate = `Closing must be within ${OFFER_RULES.maxClosingDays} days`;
    }
  }

  const message = asTrimmedString(body.message);
  if (message.length > OFFER_RULES.messageMax) {
    errors.message = `Keep your note to ${OFFER_RULES.messageMax.toLocaleString('en-US')} characters`;
  }

  return validationResult(
    {
      buyerName,
      buyerEmail,
      amount: amount ?? 0,
      financing: financing ?? 'conventional',
      downPaymentPercent: downPaymentPercent ?? 0,
      contingencies: contingencies.filter(isContingency),
      closingDate,
      message: message || null,
    },
    errors,
  );
}

export type OfferTone = 'low' | 'below' | 'at' | 'above';

/** How an offer compares with the asking price, for the hint next to the amount. */
export function describeOfferAmount(amount: number, listPrice: number) {
  const difference = amount - listPrice;
  const percentOfList = amount / listPrice;
  let tone: OfferTone = 'at';
  let message = 'Full asking price.';
  if (percentOfList < 0.9) {
    tone = 'low';
    message = 'More than 10% under asking. Sellers often turn down offers this low.';
  } else if (difference < 0) {
    tone = 'below';
    message = `${formatCurrency(-difference)} under asking.`;
  } else if (difference > 0) {
    tone = 'above';
    message = `${formatCurrency(difference)} over asking.`;
  }
  return { difference, percentOfList, tone, message };
}
