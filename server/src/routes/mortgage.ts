import { Router } from 'express';
import {
  DEFAULT_ASSUMPTIONS,
  LOAN_PROGRAMS,
  LOAN_TERMS,
  amortizationSchedule,
  asNumber,
  asRecord,
  estimateMortgage,
  rateFor,
  roundToCents,
  summarizeByYear,
  validationResult,
  type LoanProgram,
  type MortgageInput,
  type SaleDetail,
  type ValidationResult,
} from '@hearth/shared';
import { viewOf, type AppContext } from '../context';
import { notFound, validationError } from '../http';
import { getListing } from '../repositories/listings';
import { CURRENT_RATES } from '../rates';

/** Property tax assumed when neither the request nor a listing gives one (the Port Ellis average). */
const AVERAGE_TAX_RATE = 0.0105;

const isLoanProgram = (value: unknown): value is LoanProgram =>
  typeof value === 'string' && Object.hasOwn(LOAN_PROGRAMS, value);

const isLoanTerm = (value: number) => (LOAN_TERMS as readonly number[]).includes(value);

const roundNumbers = <T extends object>(values: T): T =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, typeof value === 'number' ? roundToCents(value) : value]),
  ) as T;

/** Calculator input from the request, with gaps filled from the listing and today's rates. */
function parseEstimateRequest(body: Record<string, unknown>, sale: SaleDetail | null): ValidationResult<MortgageInput> {
  const program = body.program ?? DEFAULT_ASSUMPTIONS.program;
  const termYears = asNumber(body.termYears) ?? DEFAULT_ASSUMPTIONS.termYears;
  const homePrice = asNumber(body.homePrice) ?? sale?.listPrice ?? 0;
  const downPaymentPercent = asNumber(body.downPaymentPercent) ?? DEFAULT_ASSUMPTIONS.downPaymentPercent;
  const defaultRate = isLoanProgram(program) && isLoanTerm(termYears) ? rateFor(CURRENT_RATES, program, termYears) : 0;
  const annualRate = asNumber(body.annualRate) ?? defaultRate;

  return validationResult<MortgageInput>(
    {
      homePrice,
      downPayment: (homePrice * downPaymentPercent) / 100,
      annualRate,
      termYears,
      program: isLoanProgram(program) ? program : DEFAULT_ASSUMPTIONS.program,
      propertyTaxRate: asNumber(body.propertyTaxRate) ?? sale?.propertyTaxRate ?? AVERAGE_TAX_RATE,
      hoaMonthly: asNumber(body.hoaMonthly) ?? sale?.hoaMonthly ?? 0,
    },
    {
      homePrice: homePrice >= 10_000 && homePrice <= 50_000_000 ? undefined : 'Enter a home price between $10,000 and $50M',
      downPayment: downPaymentPercent >= 0 && downPaymentPercent <= 100 ? undefined : 'Down payment must be 0–100%',
      termYears: isLoanTerm(termYears) ? undefined : 'Choose a 15, 20 or 30-year term',
      program: isLoanProgram(program) ? undefined : 'Choose conventional, FHA or VA',
      annualRate: annualRate > 0 && annualRate <= 20 ? undefined : 'Enter a rate between 0% and 20%',
    },
  );
}

export function mortgageRouter(context: AppContext): Router {
  const router = Router();

  router.get('/rates', (_req, res) => {
    res.json({ rates: CURRENT_RATES, assumptions: DEFAULT_ASSUMPTIONS });
  });

  /**
   * Payment estimate. With a `listingId`, the home's asking price, tax rate
   * and HOA dues fill in anything the request leaves out.
   */
  router.post('/estimate', (req, res) => {
    const body = asRecord(req.body);
    let sale: SaleDetail | null = null;
    if (body.listingId !== undefined) {
      const listing = getListing(context.db, Number(body.listingId), viewOf(context, req));
      if (listing?.listingType !== 'sale') throw notFound('Home for sale not found');
      sale = listing;
    }

    const result = parseEstimateRequest(body, sale);
    if (!result.ok) throw validationError(result.errors);

    const estimate = estimateMortgage(result.value);
    const schedule = body.includeSchedule === true ? summarizeByYear(amortizationSchedule(result.value)) : undefined;
    res.json({
      input: result.value,
      estimate: { ...roundNumbers(estimate), monthly: roundNumbers(estimate.monthly) },
      schedule: schedule?.map(roundNumbers),
    });
  });

  return router;
}
