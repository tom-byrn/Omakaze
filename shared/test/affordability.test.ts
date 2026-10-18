import { describe, expect, it } from 'vitest';
import { DTI_LIMITS, calculateAffordability, type AffordabilityInput } from '../src/affordability';
import { firstMonthCosts } from '../src/mortgage';

const base: AffordabilityInput = {
  annualIncome: 120_000,
  monthlyDebts: 500,
  downPayment: 100_000,
  annualRate: 6,
  termYears: 30,
  propertyTaxRate: 0.01,
  insuranceRate: 0.0035,
};

const costAt = (price: number, input: AffordabilityInput) =>
  firstMonthCosts({ homePrice: price, ...input }).total;

describe('calculateAffordability', () => {
  it('solves the 28% front-end limit exactly when PMI does not apply', () => {
    const result = calculateAffordability(base);
    // (P - 100k) * 0.0059955 + P * (0.0135 / 12) = 2,800  =>  P ≈ 477,431
    expect(result.maxHomePrice).toBeGreaterThanOrEqual(477_425);
    expect(result.maxHomePrice).toBeLessThanOrEqual(477_432);
    expect(result.limitingRatio).toBe('front_end');
    expect(result.monthlyBudget).toBeCloseTo(2800, 6);
    expect(result.monthly.total).toBeCloseTo(2800, 0);
    expect(result.monthly.mortgageInsurance).toBe(0);
    expect(result.frontEndRatio).toBeCloseTo(0.28, 3);
    expect(result.loanAmount).toBe(result.maxHomePrice - 100_000);
  });

  it('is limited by the back-end ratio when other debts are high', () => {
    const result = calculateAffordability({ ...base, monthlyDebts: 1200 });
    expect(result.limitingRatio).toBe('back_end');
    expect(result.backEndLimit).toBeCloseTo(2400, 6);
    expect(result.monthly.total).toBeCloseTo(2400, 0);
    expect(result.backEndRatio).toBeCloseTo(0.36, 3);
    expect(result.maxHomePrice).toBeLessThan(calculateAffordability(base).maxHomePrice);
  });

  it('includes PMI when the down payment is under 20% and still lands on the budget', () => {
    const input = { ...base, annualIncome: 90_000, monthlyDebts: 400, downPayment: 20_000, annualRate: 6.5 };
    const result = calculateAffordability(input);
    expect(result.monthly.mortgageInsurance).toBeGreaterThan(0);
    expect(result.monthly.total).toBeLessThanOrEqual(2100);
    expect(costAt(result.maxHomePrice + 50, input)).toBeGreaterThan(2100);
  });

  it('lowers the price to make room for HOA dues', () => {
    const withHoa = calculateAffordability({ ...base, hoaMonthly: 400 });
    expect(withHoa.monthly.hoa).toBe(400);
    expect(withHoa.monthly.total).toBeCloseTo(2800, 0);
    expect(withHoa.maxHomePrice).toBeLessThan(calculateAffordability(base).maxHomePrice - 50_000);
  });

  it('orders the comfortable, standard and stretch limits', () => {
    const [comfortable, standard, stretch] = (['comfortable', 'standard', 'stretch'] as const).map(
      (profile) => calculateAffordability({ ...base, limits: DTI_LIMITS[profile] }).maxHomePrice,
    );
    expect(comfortable).toBeLessThan(standard);
    expect(standard).toBeLessThan(stretch);
  });

  it('returns zero when there is no room for a housing payment', () => {
    expect(calculateAffordability({ ...base, annualIncome: 0 }).maxHomePrice).toBe(0);
    expect(calculateAffordability({ ...base, monthlyDebts: 5000 }).maxHomePrice).toBe(0);
  });

  it('never prices a home below what the down payment covers when the budget allows it', () => {
    const result = calculateAffordability({ ...base, downPayment: 900_000, annualIncome: 200_000 });
    expect(result.maxHomePrice).toBeGreaterThan(900_000);
    expect(result.monthly.total).toBeLessThanOrEqual(result.monthlyBudget + 0.01);
  });
});
