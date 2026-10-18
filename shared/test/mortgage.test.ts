import { describe, expect, it } from 'vitest';
import {
  amortizationSchedule,
  estimateMortgage,
  firstMonthCosts,
  monthlyPrincipalAndInterest,
  pmiRate,
  rateFor,
  summarizeByYear,
  type MortgageRates,
} from '../src/mortgage';

describe('monthlyPrincipalAndInterest', () => {
  it.each([
    [200_000, 6, 30, 1199.1],
    [300_000, 7, 30, 1995.91],
    [100_000, 5, 15, 790.79],
    [250_000, 4.5, 30, 1266.71],
  ])('%d at %d%% over %d years costs %d a month', (principal, rate, years, expected) => {
    expect(monthlyPrincipalAndInterest(principal, rate, years)).toBeCloseTo(expected, 2);
  });

  it('divides evenly at a 0% rate and is zero without a loan', () => {
    expect(monthlyPrincipalAndInterest(120_000, 0, 10)).toBe(1000);
    expect(monthlyPrincipalAndInterest(0, 6, 30)).toBe(0);
  });
});

describe('amortizationSchedule', () => {
  const schedule = amortizationSchedule({ homePrice: 250_000, downPayment: 50_000, annualRate: 6, termYears: 30 });

  it('splits the first payment between interest and principal', () => {
    expect(schedule[0].interest).toBeCloseTo(1000, 6);
    expect(schedule[0].principal).toBeCloseTo(199.1, 2);
    expect(schedule[0].balance).toBeCloseTo(199_800.9, 2);
  });

  it('pays the loan off exactly over the term', () => {
    expect(schedule).toHaveLength(360);
    expect(schedule.at(-1)?.balance).toBeCloseTo(0, 6);
    expect(schedule.reduce((sum, row) => sum + row.principal, 0)).toBeCloseTo(200_000, 4);
    expect(schedule.reduce((sum, row) => sum + row.interest, 0)).toBeCloseTo(231_676.38, 1);
  });

  it('is empty when the home is paid for in full', () => {
    expect(amortizationSchedule({ homePrice: 500_000, downPayment: 600_000, annualRate: 6, termYears: 30 })).toEqual([]);
  });

  it('summarizes by loan year', () => {
    const years = summarizeByYear(schedule);
    expect(years).toHaveLength(30);
    expect(years[0].interest).toBeCloseTo(11_933.15, 1);
    expect(years[0].principal + years[0].interest).toBeCloseTo(1199.1 * 12, 0);
    expect(years[29].balance).toBeCloseTo(0, 6);
  });
});

describe('mortgage insurance', () => {
  it('prices conventional PMI by loan-to-value', () => {
    expect(pmiRate(0.8)).toBe(0);
    expect(pmiRate(0.82)).toBe(0.003);
    expect(pmiRate(0.9)).toBe(0.005);
    expect(pmiRate(0.93)).toBe(0.007);
    expect(pmiRate(0.97)).toBe(0.009);
  });

  it('charges PMI below 20% down until the balance reaches 78% of the price', () => {
    const loan = { homePrice: 400_000, downPayment: 40_000, annualRate: 6, termYears: 30 };
    const estimate = estimateMortgage(loan);
    expect(estimate.monthly.mortgageInsurance).toBeCloseTo(150, 6);
    expect(estimate.mortgageInsuranceMonths).toBe(103);

    const schedule = amortizationSchedule(loan);
    expect(schedule[102].mortgageInsurance).toBeCloseTo(150, 6);
    expect(schedule[101].balance).toBeGreaterThan(312_000);
    expect(schedule[102].balance).toBeLessThanOrEqual(312_000);
    expect(schedule[103].mortgageInsurance).toBe(0);
  });

  it('skips PMI with 20% down', () => {
    const estimate = estimateMortgage({ homePrice: 400_000, downPayment: 80_000, annualRate: 6, termYears: 30 });
    expect(estimate.monthly.mortgageInsurance).toBe(0);
    expect(estimate.mortgageInsuranceMonths).toBe(0);
  });

  it('charges FHA MIP for the life of the loan below 10% down, and 11 years otherwise', () => {
    const lowDown = estimateMortgage({ homePrice: 400_000, downPayment: 14_000, annualRate: 6, termYears: 30, program: 'fha' });
    expect(lowDown.monthly.mortgageInsurance).toBeCloseTo((386_000 * 0.0055) / 12, 6);
    expect(lowDown.mortgageInsuranceMonths).toBe(360);

    const tenDown = estimateMortgage({ homePrice: 400_000, downPayment: 40_000, annualRate: 6, termYears: 30, program: 'fha' });
    expect(tenDown.mortgageInsuranceMonths).toBe(132);
  });

  it('has no monthly mortgage insurance on VA loans, even with nothing down', () => {
    const estimate = estimateMortgage({ homePrice: 400_000, downPayment: 0, annualRate: 6, termYears: 30, program: 'va' });
    expect(estimate.monthly.mortgageInsurance).toBe(0);
    expect(estimate.loanAmount).toBe(400_000);
  });
});

describe('estimateMortgage', () => {
  it('adds taxes, insurance and HOA dues to the loan payment', () => {
    const estimate = estimateMortgage({
      homePrice: 500_000,
      downPayment: 100_000,
      annualRate: 6.5,
      termYears: 30,
      propertyTaxRate: 0.012,
      insuranceRate: 0.0035,
      hoaMonthly: 250,
    });
    expect(estimate.loanAmount).toBe(400_000);
    expect(estimate.downPaymentPercent).toBe(20);
    expect(estimate.monthly.principalAndInterest).toBeCloseTo(2528.27, 2);
    expect(estimate.monthly.propertyTax).toBeCloseTo(500, 6);
    expect(estimate.monthly.homeInsurance).toBeCloseTo(145.83, 2);
    expect(estimate.monthly.hoa).toBe(250);
    expect(estimate.monthly.total).toBeCloseTo(3424.1, 1);
    expect(estimate.paymentCount).toBe(360);
    expect(estimate.totalInterest).toBeCloseTo(2528.27 * 360 - 400_000, -1);
  });

  it('matches firstMonthCosts for the first payment', () => {
    const input = { homePrice: 720_000, downPayment: 36_000, annualRate: 6.25, termYears: 15, propertyTaxRate: 0.01 };
    expect(estimateMortgage(input).monthly).toEqual(firstMonthCosts(input));
  });

  it('clamps a down payment larger than the price', () => {
    const estimate = estimateMortgage({ homePrice: 300_000, downPayment: 350_000, annualRate: 6, termYears: 30 });
    expect(estimate.loanAmount).toBe(0);
    expect(estimate.downPaymentPercent).toBe(100);
    expect(estimate.monthly.principalAndInterest).toBe(0);
  });
});

describe('rateFor', () => {
  const rates: MortgageRates = {
    conventional: { 30: 6.375, 20: 6.25, 15: 5.625 },
    fha: { 30: 6.0, 20: 5.875, 15: 5.5 },
    va: { 30: 5.875, 20: 5.75, 15: 5.375 },
  };

  it('looks up the rate for the program and term', () => {
    expect(rateFor(rates, 'fha', 15)).toBe(5.5);
    expect(rateFor(rates, 'conventional', 25)).toBe(6.375);
  });
});
