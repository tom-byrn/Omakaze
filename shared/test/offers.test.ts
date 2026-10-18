import { describe, expect, it } from 'vitest';
import { closingDateRange, describeOfferAmount, offerAmountRange, validateOffer } from '../src/offers';

const TODAY = '2026-10-18';
const LIST_PRICE = 800_000;
const context = { listPrice: LIST_PRICE, today: TODAY };

const offer = {
  buyerName: 'Jordan Avery',
  buyerEmail: 'Jordan@Example.com',
  amount: 785_000,
  financing: 'conventional',
  downPaymentPercent: 20,
  contingencies: ['inspection', 'appraisal', 'inspection'],
  closingDate: '2026-11-20',
  message: '  We love the garden.  ',
};

const errorsFor = (patch: Record<string, unknown>) => {
  const result = validateOffer({ ...offer, ...patch }, context);
  return result.ok ? {} : result.errors;
};

describe('validateOffer', () => {
  it('accepts a complete offer and normalizes it', () => {
    expect(validateOffer(offer, context)).toEqual({
      ok: true,
      value: {
        buyerName: 'Jordan Avery',
        buyerEmail: 'jordan@example.com',
        amount: 785_000,
        financing: 'conventional',
        downPaymentPercent: 20,
        contingencies: ['inspection', 'appraisal'],
        closingDate: '2026-11-20',
        message: 'We love the garden.',
      },
    });
  });

  it('keeps offers between 70% and 130% of the asking price', () => {
    expect(offerAmountRange(LIST_PRICE)).toEqual({ min: 560_000, max: 1_040_000 });
    expect(errorsFor({ amount: 560_000 }).amount).toBeUndefined();
    expect(errorsFor({ amount: 559_999 }).amount).toBe('Offers start at $560,000 (70% of the asking price)');
    expect(errorsFor({ amount: 1_040_001 }).amount).toMatch(/can’t be more than \$1,040,000/);
    expect(errorsFor({ amount: 785_000.5 }).amount).toBe('Enter your offer in whole dollars');
    expect(errorsFor({ amount: 'lots' }).amount).toBe('Enter your offer in whole dollars');
  });

  it.each([
    ['conventional', 3, true],
    ['conventional', 2.5, false],
    ['fha', 3.5, true],
    ['fha', 3, false],
    ['va', 0, true],
    ['va', 100, false],
    ['conventional', 100, false],
  ])('%s with %d%% down is valid: %s', (financing, downPaymentPercent, valid) => {
    expect(errorsFor({ financing, downPaymentPercent }).downPaymentPercent === undefined).toBe(valid);
  });

  it('explains the minimum down payment for the loan type', () => {
    expect(errorsFor({ financing: 'fha', downPaymentPercent: 3 }).downPaymentPercent).toBe(
      'FHA loans need at least 3.5% down',
    );
  });

  it('treats cash as 100% down and rules out a financing contingency', () => {
    const cash = validateOffer({ ...offer, financing: 'cash', downPaymentPercent: undefined, contingencies: [] }, context);
    expect(cash.ok && cash.value.downPaymentPercent).toBe(100);
    expect(errorsFor({ financing: 'cash', downPaymentPercent: 50 }).downPaymentPercent).toBeDefined();
    expect(errorsFor({ financing: 'cash', downPaymentPercent: 100, contingencies: ['financing'] }).contingencies).toBe(
      'Cash offers can’t include a financing contingency',
    );
  });

  it('rejects unknown financing types and contingencies', () => {
    expect(errorsFor({ financing: 'crypto' }).financing).toBeDefined();
    expect(errorsFor({ contingencies: ['inspection', 'vibes'] }).contingencies).toBeDefined();
    expect(errorsFor({ contingencies: 'inspection' }).contingencies).toBeDefined();
  });

  it('gives loans more time to close than cash', () => {
    expect(closingDateRange('cash', TODAY)).toEqual({ min: '2026-11-01', max: '2027-02-15' });
    expect(closingDateRange('va', TODAY).min).toBe('2026-11-08');
    expect(errorsFor({ closingDate: '2026-11-05' }).closingDate).toBe('Financed offers need at least 21 days to close');
    expect(
      errorsFor({ financing: 'cash', downPaymentPercent: 100, contingencies: [], closingDate: '2026-11-05' }).closingDate,
    ).toBeUndefined();
    expect(errorsFor({ closingDate: '2027-03-01' }).closingDate).toBe('Closing must be within 120 days');
    expect(errorsFor({ closingDate: '2026-11-31' }).closingDate).toBe('Pick a closing date');
  });

  it('requires the buyer’s name and email and limits the note', () => {
    const errors = errorsFor({ buyerName: ' ', buyerEmail: 'jordan', message: 'x'.repeat(1001) });
    expect(Object.keys(errors).sort()).toEqual(['buyerEmail', 'buyerName', 'message']);
  });
});

describe('describeOfferAmount', () => {
  it.each([
    [700_000, 'low'],
    [780_000, 'below'],
    [800_000, 'at'],
    [815_000, 'above'],
  ] as const)('describes %d against an $800K asking price as %s', (amount, tone) => {
    expect(describeOfferAmount(amount, LIST_PRICE).tone).toBe(tone);
  });

  it('spells out the difference', () => {
    expect(describeOfferAmount(780_000, LIST_PRICE)).toMatchObject({
      difference: -20_000,
      percentOfList: 0.975,
      message: '$20,000 under asking.',
    });
  });
});
