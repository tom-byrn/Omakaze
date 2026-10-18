/**
 * Mortgage math behind every payment estimate on Hearth.
 *
 * Money is in dollars, interest rates are annual percentages (6.5 means 6.5%)
 * and tax / insurance rates are annual fractions of the home price (0.01 is
 * 1%). Results are unrounded; round for display.
 */

export type LoanProgram = 'conventional' | 'fha' | 'va';

export const LOAN_TERMS = [30, 20, 15] as const;

export type LoanTerm = (typeof LOAN_TERMS)[number];

/** Average rates by loan program and term, as served by `GET /api/mortgage/rates`. */
export type MortgageRates = Record<LoanProgram, Record<LoanTerm, number>>;

export const LOAN_PROGRAMS: Record<LoanProgram, { label: string; minDownPaymentPercent: number }> = {
  conventional: { label: 'Conventional', minDownPaymentPercent: 3 },
  fha: { label: 'FHA', minDownPaymentPercent: 3.5 },
  va: { label: 'VA', minDownPaymentPercent: 0 },
};

/** Assumptions behind the "est. payment" shown on listings. */
export const DEFAULT_ASSUMPTIONS = {
  downPaymentPercent: 20,
  termYears: 30 as LoanTerm,
  program: 'conventional' as LoanProgram,
  /** Homeowners insurance per year as a share of the price. */
  insuranceRate: 0.0035,
};

/** Conventional PMI ends once the balance is scheduled to reach 78% of the original value. */
export const PMI_CANCELLATION_LTV = 0.78;

/** FHA annual mortgage insurance premium, charged on the original loan amount. */
export const FHA_ANNUAL_MIP = 0.0055;

/** With at least 10% down, FHA mortgage insurance lasts 11 years instead of the whole loan. */
const FHA_SHORT_MIP_MONTHS = 11 * 12;

export interface MortgageInput {
  homePrice: number;
  downPayment: number;
  annualRate: number;
  termYears: number;
  program?: LoanProgram;
  propertyTaxRate?: number;
  insuranceRate?: number;
  hoaMonthly?: number;
}

export interface MonthlyCosts {
  principalAndInterest: number;
  propertyTax: number;
  homeInsurance: number;
  hoa: number;
  /** PMI on conventional loans, MIP on FHA loans. */
  mortgageInsurance: number;
  total: number;
}

export interface AmortizationRow {
  month: number;
  principal: number;
  interest: number;
  mortgageInsurance: number;
  /** Balance after this payment. */
  balance: number;
}

export interface YearSummary {
  year: number;
  principal: number;
  interest: number;
  mortgageInsurance: number;
  balance: number;
}

export interface MortgageEstimate {
  loanAmount: number;
  downPaymentPercent: number;
  /** What the first payment looks like. */
  monthly: MonthlyCosts;
  /** How many payments include mortgage insurance (0 when there is none). */
  mortgageInsuranceMonths: number;
  totalInterest: number;
  totalMortgageInsurance: number;
  /** Number of monthly payments until the loan is paid off. */
  paymentCount: number;
}

type NormalizedInput = Required<MortgageInput>;

function normalize(input: MortgageInput): NormalizedInput {
  const homePrice = Math.max(0, input.homePrice);
  return {
    program: DEFAULT_ASSUMPTIONS.program,
    propertyTaxRate: 0,
    insuranceRate: DEFAULT_ASSUMPTIONS.insuranceRate,
    hoaMonthly: 0,
    ...input,
    homePrice,
    downPayment: Math.min(Math.max(0, input.downPayment), homePrice),
  };
}

/** Fixed monthly principal and interest payment that pays the loan off over the term. */
export function monthlyPrincipalAndInterest(principal: number, annualRate: number, termYears: number): number {
  const payments = Math.round(termYears * 12);
  if (principal <= 0 || payments <= 0) return 0;
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return principal / payments;
  return (principal * monthlyRate) / (1 - (1 + monthlyRate) ** -payments);
}

/** Annual conventional PMI premium (share of the loan) by loan-to-value ratio. */
export function pmiRate(loanToValue: number): number {
  if (loanToValue <= 0.8) return 0;
  if (loanToValue <= 0.85) return 0.003;
  if (loanToValue <= 0.9) return 0.005;
  if (loanToValue <= 0.95) return 0.007;
  return 0.009;
}

interface InsurancePlan {
  monthly: number;
  /** Charged only while the balance at the start of the month is above this. */
  whileBalanceAbove: number;
  /** Charged for at most this many payments. */
  maxMonths: number;
}

function mortgageInsurancePlan(loan: NormalizedInput, loanAmount: number): InsurancePlan {
  const loanToValue = loan.homePrice > 0 ? loanAmount / loan.homePrice : 0;
  switch (loan.program) {
    case 'conventional':
      return {
        monthly: (loanAmount * pmiRate(loanToValue)) / 12,
        whileBalanceAbove: PMI_CANCELLATION_LTV * loan.homePrice,
        maxMonths: Number.POSITIVE_INFINITY,
      };
    case 'fha':
      return {
        monthly: (loanAmount * FHA_ANNUAL_MIP) / 12,
        whileBalanceAbove: 0,
        maxMonths: loanToValue <= 0.9 ? FHA_SHORT_MIP_MONTHS : Number.POSITIVE_INFINITY,
      };
    case 'va':
      return { monthly: 0, whileBalanceAbove: 0, maxMonths: 0 };
  }
}

/** Costs of the first monthly payment. Cheaper than a full estimate, for use in searches. */
export function firstMonthCosts(input: MortgageInput): MonthlyCosts {
  const loan = normalize(input);
  const loanAmount = loan.homePrice - loan.downPayment;
  const insurance = mortgageInsurancePlan(loan, loanAmount);
  const costs = {
    principalAndInterest: monthlyPrincipalAndInterest(loanAmount, loan.annualRate, loan.termYears),
    propertyTax: (loan.homePrice * loan.propertyTaxRate) / 12,
    homeInsurance: (loan.homePrice * loan.insuranceRate) / 12,
    hoa: loan.hoaMonthly,
    mortgageInsurance:
      insurance.maxMonths >= 1 && loanAmount > insurance.whileBalanceAbove ? insurance.monthly : 0,
  };
  return { ...costs, total: Object.values(costs).reduce((sum, value) => sum + value, 0) };
}

/** Month-by-month split of each payment between principal, interest and mortgage insurance. */
export function amortizationSchedule(input: MortgageInput): AmortizationRow[] {
  const loan = normalize(input);
  const loanAmount = loan.homePrice - loan.downPayment;
  const payment = monthlyPrincipalAndInterest(loanAmount, loan.annualRate, loan.termYears);
  const monthlyRate = loan.annualRate / 100 / 12;
  const insurance = mortgageInsurancePlan(loan, loanAmount);
  const payments = Math.round(loan.termYears * 12);

  const rows: AmortizationRow[] = [];
  let balance = loanAmount;
  for (let month = 1; month <= payments && balance > 0.005; month += 1) {
    const interest = balance * monthlyRate;
    const principal = Math.min(payment - interest, balance);
    const mortgageInsurance =
      month <= insurance.maxMonths && balance > insurance.whileBalanceAbove ? insurance.monthly : 0;
    balance = Math.max(0, balance - principal);
    rows.push({ month, principal, interest, mortgageInsurance, balance });
  }
  return rows;
}

/** Totals per loan year, for the schedule table. */
export function summarizeByYear(schedule: readonly AmortizationRow[]): YearSummary[] {
  const years: YearSummary[] = [];
  for (const row of schedule) {
    const year = Math.ceil(row.month / 12);
    let summary = years[year - 1];
    if (!summary) {
      summary = { year, principal: 0, interest: 0, mortgageInsurance: 0, balance: 0 };
      years.push(summary);
    }
    summary.principal += row.principal;
    summary.interest += row.interest;
    summary.mortgageInsurance += row.mortgageInsurance;
    summary.balance = row.balance;
  }
  return years;
}

export function estimateMortgage(input: MortgageInput): MortgageEstimate {
  const loan = normalize(input);
  const schedule = amortizationSchedule(loan);
  return {
    loanAmount: loan.homePrice - loan.downPayment,
    downPaymentPercent: loan.homePrice > 0 ? (loan.downPayment / loan.homePrice) * 100 : 0,
    monthly: firstMonthCosts(loan),
    mortgageInsuranceMonths: schedule.filter((row) => row.mortgageInsurance > 0).length,
    totalInterest: schedule.reduce((sum, row) => sum + row.interest, 0),
    totalMortgageInsurance: schedule.reduce((sum, row) => sum + row.mortgageInsurance, 0),
    paymentCount: schedule.length,
  };
}

/** The rate for a program and term, falling back to the 30-year rate for unusual terms. */
export function rateFor(rates: MortgageRates, program: LoanProgram, termYears: number): number {
  const byTerm = rates[program];
  return byTerm[termYears as LoanTerm] ?? byTerm[30];
}

export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
