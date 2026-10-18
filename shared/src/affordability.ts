import { DEFAULT_ASSUMPTIONS, firstMonthCosts, type LoanProgram, type MonthlyCosts } from './mortgage';

/**
 * Debt-to-income limits. "Front-end" caps the housing payment, "back-end"
 * caps housing plus every other debt, both as a share of gross monthly income.
 * Standard is the classic 28/36 rule; stretch is roughly where FHA tops out.
 */
export const DTI_LIMITS = {
  comfortable: { frontEnd: 0.25, backEnd: 0.33 },
  standard: { frontEnd: 0.28, backEnd: 0.36 },
  stretch: { frontEnd: 0.31, backEnd: 0.43 },
} as const;

export type DtiLimits = { frontEnd: number; backEnd: number };

export interface AffordabilityInput {
  annualIncome: number;
  /** Car loans, student loans, minimum card payments and so on. */
  monthlyDebts: number;
  downPayment: number;
  annualRate: number;
  termYears: number;
  program?: LoanProgram;
  propertyTaxRate: number;
  insuranceRate?: number;
  hoaMonthly?: number;
  limits?: DtiLimits;
}

export interface AffordabilityResult {
  /** The most expensive home whose monthly costs fit the budget (whole dollars). */
  maxHomePrice: number;
  /** Monthly housing budget: the tighter of the two limits. */
  monthlyBudget: number;
  limitingRatio: 'front_end' | 'back_end';
  /** Housing payment allowed by the front-end ratio. */
  frontEndLimit: number;
  /** Housing payment allowed by the back-end ratio once other debts are paid. */
  backEndLimit: number;
  /** Monthly costs at `maxHomePrice`. */
  monthly: MonthlyCosts;
  loanAmount: number;
  frontEndRatio: number;
  backEndRatio: number;
}

function costsAt(price: number, input: AffordabilityInput): MonthlyCosts {
  return firstMonthCosts({
    homePrice: price,
    downPayment: input.downPayment,
    annualRate: input.annualRate,
    termYears: input.termYears,
    program: input.program ?? DEFAULT_ASSUMPTIONS.program,
    propertyTaxRate: input.propertyTaxRate,
    insuranceRate: input.insuranceRate ?? DEFAULT_ASSUMPTIONS.insuranceRate,
    hoaMonthly: input.hoaMonthly ?? 0,
  });
}

/**
 * How much home the buyer can afford under debt-to-income limits.
 *
 * Monthly cost only ever rises with price (more loan, more tax, a higher PMI
 * tier), so the maximum is found with a binary search rather than by solving
 * each PMI tier separately.
 */
export function calculateAffordability(input: AffordabilityInput): AffordabilityResult {
  const limits = input.limits ?? DTI_LIMITS.standard;
  const monthlyIncome = Math.max(0, input.annualIncome) / 12;
  const monthlyDebts = Math.max(0, input.monthlyDebts);
  const downPayment = Math.max(0, input.downPayment);

  const frontEndLimit = monthlyIncome * limits.frontEnd;
  const backEndLimit = Math.max(0, monthlyIncome * limits.backEnd - monthlyDebts);
  const monthlyBudget = Math.min(frontEndLimit, backEndLimit);

  // Every payment covers at least loan / payments, so this price can't be affordable.
  let low = 0;
  let high = downPayment + monthlyBudget * Math.max(1, Math.round(input.termYears * 12)) + 1;
  while (high - low > 0.5) {
    const mid = (low + high) / 2;
    if (costsAt(mid, input).total <= monthlyBudget) low = mid;
    else high = mid;
  }

  const maxHomePrice = Math.floor(low);
  const monthly = costsAt(maxHomePrice, input);
  return {
    maxHomePrice,
    monthlyBudget,
    limitingRatio: backEndLimit < frontEndLimit ? 'back_end' : 'front_end',
    frontEndLimit,
    backEndLimit,
    monthly,
    loanAmount: Math.max(0, maxHomePrice - downPayment),
    frontEndRatio: monthlyIncome > 0 ? monthly.total / monthlyIncome : 0,
    backEndRatio: monthlyIncome > 0 ? (monthly.total + monthlyDebts) / monthlyIncome : 0,
  };
}
