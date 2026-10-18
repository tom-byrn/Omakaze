import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  DEFAULT_FILTERS,
  DTI_LIMITS,
  LOAN_PROGRAMS,
  LOAN_TERMS,
  calculateAffordability,
  formatCompactPrice,
  formatCurrency,
  formatPercent,
  rateFor,
  type LoanProgram,
  type LoanTerm,
} from '@hearth/shared';
import { api } from '../api';
import { Footer } from '../components/Footer';
import { useDocumentTitle } from '../hooks/misc';
import { useAsync } from '../hooks/useAsync';
import { useMortgageRates } from '../hooks/useMortgageRates';

const TIERS = [
  { key: 'comfortable', label: 'Comfortable' },
  { key: 'standard', label: 'Recommended' },
  { key: 'stretch', label: 'Stretch' },
] as const;

interface MoneyInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}

function MoneyInput({ label, value, onChange, hint }: MoneyInputProps) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="input-affix">
        <span>$</span>
        <input
          inputMode="numeric"
          value={value ? value.toLocaleString('en-US') : ''}
          onChange={(event) => onChange(Number(event.target.value.replace(/\D/g, '')))}
        />
      </span>
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function AffordabilityPage() {
  useDocumentTitle('How much home can you afford?');
  const rates = useMortgageRates();
  const [income, setIncome] = useState(180_000);
  const [debts, setDebts] = useState(600);
  const [downPayment, setDownPayment] = useState(150_000);
  const [program, setProgram] = useState<LoanProgram>('conventional');
  const [termYears, setTermYears] = useState<LoanTerm>(30);
  const [customRate, setCustomRate] = useState<number | null>(null);
  const [taxPercent, setTaxPercent] = useState(1.05);
  const [hoa, setHoa] = useState(0);

  const rate = customRate ?? (rates ? rateFor(rates, program, termYears) : 6.5);
  const results = useMemo(() => {
    const input = {
      annualIncome: income,
      monthlyDebts: debts,
      downPayment,
      annualRate: rate,
      termYears,
      program,
      propertyTaxRate: taxPercent / 100,
      hoaMonthly: hoa,
    };
    return Object.fromEntries(
      TIERS.map(({ key }) => [key, calculateAffordability({ ...input, limits: DTI_LIMITS[key] })]),
    ) as Record<(typeof TIERS)[number]['key'], ReturnType<typeof calculateAffordability>>;
  }, [income, debts, downPayment, rate, termYears, program, taxPercent, hoa]);

  const result = results.standard;
  const budget = Math.floor(result.maxHomePrice / 1000) * 1000;
  const { data: matches } = useAsync(
    (signal) => api.searchListings({ ...DEFAULT_FILTERS, type: 'sale', maxPrice: budget }, signal),
    [budget],
  );

  const parts = [
    { key: 'pi', label: 'Principal & interest', value: result.monthly.principalAndInterest, color: 'var(--chart-1)' },
    { key: 'tax', label: 'Property tax', value: result.monthly.propertyTax, color: 'var(--chart-2)' },
    { key: 'insurance', label: 'Homeowners insurance', value: result.monthly.homeInsurance, color: 'var(--chart-3)' },
    { key: 'hoa', label: 'HOA dues', value: result.monthly.hoa, color: 'var(--chart-4)' },
    { key: 'mi', label: 'Mortgage insurance', value: result.monthly.mortgageInsurance, color: 'var(--chart-5)' },
  ].filter((part) => part.value > 0);

  const meters = [
    {
      label: 'Housing costs',
      ratio: result.frontEndRatio,
      limit: DTI_LIMITS.standard.frontEnd,
      binding: result.limitingRatio === 'front_end',
    },
    {
      label: 'All debts',
      ratio: result.backEndRatio,
      limit: DTI_LIMITS.standard.backEnd,
      binding: result.limitingRatio === 'back_end',
    },
  ];

  return (
    <>
      <div className="container page">
        <header className="page-header">
          <h1>How much home can you afford?</h1>
          <p>Lenders look at how much of your income goes to housing and to debts. Here’s what that means for you.</p>
        </header>

        <div className="afford-layout">
          <form className="card afford-inputs" onSubmit={(event) => event.preventDefault()}>
            <MoneyInput label="Annual household income" value={income} onChange={setIncome} hint="Before taxes." />
            <MoneyInput
              label="Monthly debt payments"
              value={debts}
              onChange={setDebts}
              hint="Car and student loans, minimum card payments."
            />
            <MoneyInput label="Down payment" value={downPayment} onChange={setDownPayment} />
            <div className="field-row">
              <label className="field">
                <span className="field__label">Loan type</span>
                <select
                  value={program}
                  onChange={(event) => {
                    setProgram(event.target.value as LoanProgram);
                    setCustomRate(null);
                  }}
                >
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
                    step={0.125}
                    min={0}
                    value={rate}
                    onChange={(event) => setCustomRate(Number(event.target.value))}
                  />
                  <span>%</span>
                </span>
              </label>
            </div>
            <div className="field">
              <span className="field__label">Loan term</span>
              <div className="segmented segmented--full" role="group" aria-label="Loan term">
                {LOAN_TERMS.map((term) => (
                  <button
                    key={term}
                    type="button"
                    className={term === termYears ? 'is-selected' : ''}
                    onClick={() => {
                      setTermYears(term);
                      setCustomRate(null);
                    }}
                  >
                    {term} years
                  </button>
                ))}
              </div>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field__label">Property tax</span>
                <span className="input-affix input-affix--suffix">
                  <input
                    type="number"
                    step={0.05}
                    min={0}
                    value={taxPercent}
                    onChange={(event) => setTaxPercent(Number(event.target.value))}
                  />
                  <span>%/yr</span>
                </span>
              </label>
              <MoneyInput label="HOA dues per month" value={hoa} onChange={setHoa} />
            </div>
          </form>

          <section className="card afford-result" aria-live="polite">
            <p className="afford-result__eyebrow">You can afford a home up to</p>
            <p className="afford-result__price">{formatCurrency(budget)}</p>
            <p className="muted">
              About {formatCurrency(result.monthly.total)} a month with {formatCurrency(downPayment)} down, at {rate}% for{' '}
              {termYears} years.
            </p>

            <div className="afford-tiers">
              {TIERS.map(({ key, label }) => (
                <div key={key} className={`afford-tier${key === 'standard' ? ' is-recommended' : ''}`}>
                  <span>{label}</span>
                  <strong>{formatCompactPrice(Math.floor(results[key].maxHomePrice / 1000) * 1000)}</strong>
                  <small>
                    {formatPercent(DTI_LIMITS[key].frontEnd, 0)} / {formatPercent(DTI_LIMITS[key].backEnd, 0)} of income
                  </small>
                </div>
              ))}
            </div>

            <h2 className="afford-result__heading">Monthly payment</h2>
            <div className="stacked-bar" role="img" aria-label="Monthly payment breakdown">
              {parts.map((part) => (
                <span
                  key={part.key}
                  style={{ flexGrow: part.value, background: part.color }}
                  title={`${part.label}: ${formatCurrency(part.value)}`}
                />
              ))}
            </div>
            <ul className="legend legend--columns">
              {parts.map((part) => (
                <li key={part.key}>
                  <span className="legend__swatch" style={{ background: part.color }} />
                  <span>{part.label}</span>
                  <strong>{formatCurrency(part.value)}</strong>
                </li>
              ))}
            </ul>

            <h2 className="afford-result__heading">Debt-to-income</h2>
            {meters.map((meter) => (
              <div key={meter.label} className="meter">
                <div className="meter__label">
                  <span>
                    {meter.label} {meter.binding && <em>· sets your limit</em>}
                  </span>
                  <span>
                    {formatPercent(meter.ratio)} of {formatPercent(meter.limit, 0)} max
                  </span>
                </div>
                <div className="meter__track">
                  <span className="meter__fill" style={{ width: `${Math.min(100, (meter.ratio / meter.limit) * 100)}%` }} />
                </div>
              </div>
            ))}

            <Link to={`/?type=sale&maxPrice=${budget}`} className="button button--primary button--large button--block">
              {matches ? `See ${matches.total} homes for sale up to ${formatCompactPrice(budget)}` : 'See homes in your budget'}
            </Link>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
}

