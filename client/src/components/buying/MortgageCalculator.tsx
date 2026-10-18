import { useMemo, useState } from 'react';
import {
  LOAN_PROGRAMS,
  LOAN_TERMS,
  estimateMortgage,
  formatCurrency,
  rateFor,
  type LoanProgram,
  type LoanTerm,
  type MortgageRates,
  type SaleDetail,
} from '@hearth/shared';
import { DonutChart, type DonutSegment } from './DonutChart';

interface MortgageCalculatorProps {
  listing: SaleDetail;
  rates: MortgageRates | undefined;
}

/** Interactive payment breakdown for a home for sale, using the shared mortgage math. */
export function MortgageCalculator({ listing, rates }: MortgageCalculatorProps) {
  const [price, setPrice] = useState(listing.listPrice);
  const [downPercent, setDownPercent] = useState(20);
  const [termYears, setTermYears] = useState<LoanTerm>(30);
  const [program, setProgram] = useState<LoanProgram>('conventional');
  const [customRate, setCustomRate] = useState<number | null>(null);

  const todaysRate = rates ? rateFor(rates, program, termYears) : null;
  const rate = customRate ?? todaysRate ?? 6.5;
  const minDown = LOAN_PROGRAMS[program].minDownPaymentPercent;

  const estimate = useMemo(
    () =>
      estimateMortgage({
        homePrice: price,
        downPayment: (price * downPercent) / 100,
        annualRate: rate,
        termYears,
        program,
        propertyTaxRate: listing.propertyTaxRate,
        hoaMonthly: listing.hoaMonthly,
      }),
    [price, downPercent, rate, termYears, program, listing.propertyTaxRate, listing.hoaMonthly],
  );

  const { monthly } = estimate;
  const segments: DonutSegment[] = [
    { key: 'pi', label: 'Principal & interest', value: monthly.principalAndInterest, color: 'var(--chart-1)' },
    { key: 'tax', label: 'Property tax', value: monthly.propertyTax, color: 'var(--chart-2)' },
    { key: 'insurance', label: 'Homeowners insurance', value: monthly.homeInsurance, color: 'var(--chart-3)' },
    { key: 'hoa', label: 'HOA dues', value: monthly.hoa, color: 'var(--chart-4)' },
    {
      key: 'mi',
      label: program === 'fha' ? 'Mortgage insurance' : 'PMI',
      value: monthly.mortgageInsurance,
      color: 'var(--chart-5)',
    },
  ].filter((segment) => segment.value > 0);

  const changeProgram = (next: LoanProgram) => {
    setProgram(next);
    setCustomRate(null);
    setDownPercent((current) => Math.max(current, LOAN_PROGRAMS[next].minDownPaymentPercent));
  };

  return (
    <div className="calculator card">
      <div className="calculator__inputs">
        <label className="field">
          <span className="field__label">Home price</span>
          <span className="input-affix">
            <span>$</span>
            <input
              inputMode="numeric"
              value={price ? price.toLocaleString('en-US') : ''}
              onChange={(event) => setPrice(Number(event.target.value.replace(/\D/g, '').slice(0, 9)))}
            />
          </span>
        </label>

        <label className="field">
          <span className="field__label">
            Down payment <strong>{formatCurrency((price * downPercent) / 100)}</strong>
          </span>
          <span className="range-row">
            <input
              type="range"
              min={minDown}
              max={50}
              step={0.5}
              value={downPercent}
              onChange={(event) => setDownPercent(Number(event.target.value))}
            />
            <span className="input-affix input-affix--suffix">
              <input
                type="number"
                min={minDown}
                max={100}
                step={0.5}
                value={downPercent}
                aria-label="Down payment percent"
                onChange={(event) => setDownPercent(Math.min(100, Math.max(minDown, Number(event.target.value))))}
              />
              <span>%</span>
            </span>
          </span>
        </label>

        <div className="field">
          <span className="field__label">Loan term</span>
          <div className="segmented segmented--full" role="group" aria-label="Loan term">
            {LOAN_TERMS.map((term) => (
              <button
                key={term}
                type="button"
                className={term === termYears ? 'is-selected' : ''}
                aria-pressed={term === termYears}
                onClick={() => {
                  setTermYears(term);
                  setCustomRate(null);
                }}
              >
                {term}-year fixed
              </button>
            ))}
          </div>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="field__label">Loan type</span>
            <select value={program} onChange={(event) => changeProgram(event.target.value as LoanProgram)}>
              {Object.entries(LOAN_PROGRAMS).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Interest rate</span>
            <span className="input-affix input-affix--suffix">
              <input
                type="number"
                min={0}
                max={20}
                step={0.125}
                value={rate}
                onChange={(event) => setCustomRate(Number(event.target.value))}
              />
              <span>%</span>
            </span>
          </label>
        </div>
        {todaysRate !== null && customRate === null && (
          <p className="field__hint">Today’s average {termYears}-year {LOAN_PROGRAMS[program].label} rate in Port Ellis.</p>
        )}
      </div>

      <div className="calculator__result">
        <DonutChart segments={segments} total={formatCurrency(monthly.total)} caption="per month" />
        <ul className="legend">
          {segments.map((segment) => (
            <li key={segment.key}>
              <span className="legend__swatch" style={{ background: segment.color }} />
              <span>{segment.label}</span>
              <strong>{formatCurrency(segment.value)}</strong>
            </li>
          ))}
        </ul>
        <p className="calculator__note">
          {formatCurrency(estimate.loanAmount)} loan · {formatCurrency(estimate.totalInterest)} interest over{' '}
          {termYears} years
          {estimate.mortgageInsuranceMonths > 0 &&
            estimate.mortgageInsuranceMonths < estimate.paymentCount &&
            ` · ${program === 'fha' ? 'Mortgage insurance' : 'PMI'} ends after ${Math.ceil(estimate.mortgageInsuranceMonths / 12)} years`}
        </p>
      </div>
    </div>
  );
}
