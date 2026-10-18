import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  CONTINGENCY_OPTIONS,
  DEFAULT_ASSUMPTIONS,
  FINANCING_OPTIONS,
  addDays,
  closingDateRange,
  describeOfferAmount,
  estimateMortgage,
  formatAddress,
  formatCurrency,
  formatDate,
  formatPercent,
  rateFor,
  validateOffer,
  type Contingency,
  type FinancingType,
  type LoanProgram,
  type Offer,
  type OfferErrors,
  type OfferInput,
  type SaleDetail,
} from '@hearth/shared';
import { ApiError, api } from '../api';
import { Field } from '../components/Field';
import { CheckCircleIcon, ChevronLeftIcon } from '../components/Icons';
import { ListingPhoto } from '../components/illustrations/ListingPhoto';
import { useDocumentTitle, useToday } from '../hooks/misc';
import { useAsync } from '../hooks/useAsync';
import { useSyncListingType } from '../hooks/useListingType';
import { useMortgageRates } from '../hooks/useMortgageRates';
import { NotFoundPage } from './NotFoundPage';

const STEPS: { title: string; fields: (keyof OfferInput)[] }[] = [
  { title: 'Price', fields: ['amount'] },
  { title: 'Financing', fields: ['financing', 'downPaymentPercent'] },
  { title: 'Terms', fields: ['contingencies', 'closingDate'] },
  { title: 'Review', fields: ['buyerName', 'buyerEmail', 'message'] },
];

const QUICK_AMOUNTS = [-0.05, -0.02, 0, 0.02, 0.05];

type Draft = Omit<OfferInput, 'message'> & { message: string };

export function MakeOfferPage() {
  const listingId = Number(useParams().id);
  const { data: listing, error } = useAsync((signal) => api.listing(listingId, signal), [listingId]);
  useDocumentTitle(listing ? `Make an offer on ${listing.address}` : 'Make an offer');
  useSyncListingType(listing?.listingType);

  if (error) return <NotFoundPage title="We couldn’t find that home" />;
  if (!listing) return <div className="page-loading" aria-busy="true" />;
  if (listing.listingType !== 'sale' || listing.status !== 'active') {
    return <NotFoundPage title="This home isn’t taking offers" />;
  }
  return <OfferFlow listing={listing} />;
}

function OfferFlow({ listing }: { listing: SaleDetail }) {
  const today = useToday();
  const rates = useMortgageRates();
  const { data: market } = useAsync((signal) => api.market(listing.neighborhood.slug, signal), [listing.neighborhood.slug]);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<OfferErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Offer | null>(null);
  const [draft, setDraft] = useState<Draft>({
    amount: listing.listPrice,
    financing: 'conventional',
    downPaymentPercent: 20,
    contingencies: ['inspection', 'appraisal', 'financing'],
    closingDate: addDays(today, 30),
    buyerName: '',
    buyerEmail: '',
    message: '',
  });

  // Start each step, and the confirmation, at the top of the page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step, submitted]);

  const update = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key as keyof OfferInput];
      return next;
    });
  };

  /** Cash pays in full and needs no financing contingency; loans keep at least their minimum down. */
  const chooseFinancing = (financing: FinancingType) => {
    const previousDown = draft.financing === 'cash' ? 20 : draft.downPaymentPercent;
    update({
      financing,
      downPaymentPercent:
        financing === 'cash' ? 100 : Math.max(FINANCING_OPTIONS[financing].minDownPaymentPercent, previousDown),
      contingencies:
        financing === 'cash' ? draft.contingencies.filter((c) => c !== 'financing') : draft.contingencies,
    });
  };

  const toggleContingency = (contingency: Contingency) =>
    update({
      contingencies: draft.contingencies.includes(contingency)
        ? draft.contingencies.filter((c) => c !== contingency)
        : [...draft.contingencies, contingency],
    });

  /** Errors for the given steps, from the same rules the API applies. */
  const errorsFor = (steps: number[]): OfferErrors => {
    const result = validateOffer(draft, { listPrice: listing.listPrice, today });
    if (result.ok) return {};
    const fields = steps.flatMap((index) => STEPS[index].fields);
    return Object.fromEntries(Object.entries(result.errors).filter(([field]) => fields.includes(field as keyof OfferInput)));
  };

  const next = async () => {
    const stepErrors = errorsFor(step === STEPS.length - 1 ? STEPS.map((_, i) => i) : [step]);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      setStep(STEPS.findIndex((s) => s.fields.some((field) => stepErrors[field])));
      return;
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setSubmitting(true);
    try {
      setSubmitted(await api.makeOffer(listing.id, { ...draft, message: draft.message.trim() || null }));
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        setErrors(error.fields);
        setStep(Math.max(0, STEPS.findIndex((s) => s.fields.some((field) => error.fields[field]))));
      } else {
        setErrors({ message: error instanceof Error ? error.message : 'Something went wrong. Please try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const financed = draft.financing !== 'cash';
  const program: LoanProgram = draft.financing === 'cash' ? 'conventional' : draft.financing;
  const payment = estimateMortgage({
    homePrice: draft.amount,
    downPayment: (draft.amount * draft.downPaymentPercent) / 100,
    annualRate: rates ? rateFor(rates, program, DEFAULT_ASSUMPTIONS.termYears) : 6.5,
    termYears: DEFAULT_ASSUMPTIONS.termYears,
    program,
    propertyTaxRate: listing.propertyTaxRate,
    hoaMonthly: listing.hoaMonthly,
  }).monthly.total;
  const guidance = describeOfferAmount(draft.amount, listing.listPrice);
  const closing = closingDateRange(draft.financing, today);
  const address = formatAddress(listing.address, listing.unit);

  if (submitted) {
    return (
      <div className="container page offer-page">
        <div className="card offer-done">
          <CheckCircleIcon size={48} />
          <h1>Your offer is on its way</h1>
          <p>
            We sent your offer of <strong>{formatCurrency(submitted.amount)}</strong> on {address} to{' '}
            {listing.agent.name}. Sellers usually respond within 48 hours.
          </p>
          <ol className="offer-done__next">
            <li>{listing.agent.name.split(' ')[0]} presents your offer to the sellers.</li>
            <li>They accept, counter or decline. You’ll see their answer under My offers.</li>
            <li>Once accepted, you sign the purchase agreement and your contingency periods begin.</li>
          </ol>
          <div className="offer-done__actions">
            <Link to="/offers" className="button button--primary">
              View my offers
            </Link>
            <Link to={`/homes/${listing.id}`} className="button button--secondary">
              Back to the listing
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container page offer-page">
      <Link to={`/homes/${listing.id}`} className="back-link">
        <ChevronLeftIcon size={18} />
        {address}
      </Link>
      <h1 className="offer-page__title">Make an offer</h1>

      <div className="offer-layout">
        <div className="card offer-main">
          <ol className="stepper">
            {STEPS.map((s, index) => (
              <li key={s.title} className={index < step ? 'is-done' : index === step ? 'is-current' : ''}>
                <span>{index + 1}</span>
                {s.title}
              </li>
            ))}
          </ol>

          {step === 0 && (
            <section className="offer-step">
              <h2>How much would you like to offer?</h2>
              <p className="muted">The sellers are asking {formatCurrency(listing.listPrice)}.</p>
              <label className={`field${errors.amount ? ' has-error' : ''}`}>
                <span className="field__label">Offer price</span>
                <span className="input-affix input-affix--large">
                  <span>$</span>
                  <input
                    inputMode="numeric"
                    value={draft.amount ? draft.amount.toLocaleString('en-US') : ''}
                    onChange={(event) => update({ amount: Number(event.target.value.replace(/\D/g, '')) })}
                    aria-invalid={errors.amount ? true : undefined}
                  />
                </span>
                {errors.amount && <span className="field__error">{errors.amount}</span>}
              </label>
              <div className="chip-row">
                {QUICK_AMOUNTS.map((delta) => {
                  const amount = Math.round((listing.listPrice * (1 + delta)) / 1000) * 1000;
                  return (
                    <button
                      key={delta}
                      type="button"
                      className={`chip${draft.amount === amount ? ' is-selected' : ''}`}
                      onClick={() => update({ amount })}
                    >
                      {delta === 0 ? 'Asking price' : `${delta > 0 ? '+' : '−'}${Math.abs(delta * 100)}%`}
                    </button>
                  );
                })}
              </div>
              <p className={`guidance guidance--${guidance.tone}`}>
                {formatPercent(guidance.percentOfList)} of asking. {guidance.message}
              </p>
              {market?.metrics.saleToListRatio && (
                <p className="muted">
                  Homes in {listing.neighborhood.name} recently sold for {formatPercent(market.metrics.saleToListRatio)} of
                  their asking price, after about {market.metrics.averageDaysOnMarket} days on the market.
                </p>
              )}
            </section>
          )}

          {step === 1 && (
            <section className="offer-step">
              <h2>How will you pay?</h2>
              <div className="choice-grid" role="radiogroup" aria-label="Financing">
                {(Object.keys(FINANCING_OPTIONS) as FinancingType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={draft.financing === type}
                    className={`choice${draft.financing === type ? ' is-selected' : ''}`}
                    onClick={() => chooseFinancing(type)}
                  >
                    <strong>{FINANCING_OPTIONS[type].label}</strong>
                    <span>{FINANCING_OPTIONS[type].description}</span>
                  </button>
                ))}
              </div>
              {financed && (
                <Field
                  label={`Down payment: ${formatCurrency((draft.amount * draft.downPaymentPercent) / 100)}`}
                  error={errors.downPaymentPercent}
                  hint={`Loan of ${formatCurrency(draft.amount * (1 - draft.downPaymentPercent / 100))}. ${
                    draft.downPaymentPercent < 20 && draft.financing === 'conventional' ? 'PMI applies below 20% down.' : ''
                  }`}
                >
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={0.5}
                    value={draft.downPaymentPercent}
                    onChange={(event) => update({ downPaymentPercent: Number(event.target.value) })}
                  />
                </Field>
              )}
              <p className="offer-step__payment">
                {financed ? `${formatPercent(draft.downPaymentPercent / 100)} down · est. ` : 'Taxes, insurance and HOA: '}
                <strong>{formatCurrency(payment)}/mo</strong>
              </p>
            </section>
          )}

          {step === 2 && (
            <section className="offer-step">
              <h2>Contingencies and closing</h2>
              <p className="muted">Each contingency protects you, but fewer of them make an offer stronger.</p>
              <div className="choice-grid">
                {(Object.keys(CONTINGENCY_OPTIONS) as Contingency[]).map((contingency) => {
                  const disabled = contingency === 'financing' && !financed;
                  return (
                    <label key={contingency} className={`choice choice--check${disabled ? ' is-disabled' : ''}`}>
                      <input
                        type="checkbox"
                        checked={draft.contingencies.includes(contingency)}
                        disabled={disabled}
                        onChange={() => toggleContingency(contingency)}
                      />
                      <strong>{CONTINGENCY_OPTIONS[contingency].label}</strong>
                      <span>{disabled ? 'Not needed for a cash offer.' : CONTINGENCY_OPTIONS[contingency].description}</span>
                    </label>
                  );
                })}
              </div>
              {errors.contingencies && <p className="field__error">{errors.contingencies}</p>}
              <Field label="Closing date" error={errors.closingDate} hint={`Between ${formatDate(closing.min)} and ${formatDate(closing.max)}.`}>
                <input
                  type="date"
                  min={closing.min}
                  max={closing.max}
                  value={draft.closingDate}
                  onChange={(event) => update({ closingDate: event.target.value })}
                />
              </Field>
            </section>
          )}

          {step === 3 && (
            <section className="offer-step">
              <h2>Review and send</h2>
              <dl className="review-list">
                {[
                  { label: 'Offer price', value: `${formatCurrency(draft.amount)} (${formatPercent(guidance.percentOfList)} of asking)`, step: 0 },
                  {
                    label: 'Financing',
                    value: `${FINANCING_OPTIONS[draft.financing].label}${financed ? `, ${draft.downPaymentPercent}% down` : ''}`,
                    step: 1,
                  },
                  {
                    label: 'Contingencies',
                    value: draft.contingencies.map((c) => CONTINGENCY_OPTIONS[c].label).join(', ') || 'None',
                    step: 2,
                  },
                  { label: 'Closing', value: formatDate(draft.closingDate, { weekday: 'short' }), step: 2 },
                ].map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                    <button type="button" className="link-button" onClick={() => setStep(row.step)}>
                      Edit
                    </button>
                  </div>
                ))}
              </dl>
              <div className="field-row">
                <Field label="Your name" error={errors.buyerName}>
                  <input value={draft.buyerName} onChange={(event) => update({ buyerName: event.target.value })} autoComplete="name" />
                </Field>
                <Field label="Email" error={errors.buyerEmail}>
                  <input type="email" value={draft.buyerEmail} onChange={(event) => update({ buyerEmail: event.target.value })} autoComplete="email" />
                </Field>
              </div>
              <Field label="Note to the sellers (optional)" error={errors.message}>
                <textarea rows={3} value={draft.message} onChange={(event) => update({ message: event.target.value })} />
              </Field>
              <p className="form-note">Your offer isn’t binding until you and the sellers sign a purchase agreement.</p>
            </section>
          )}

          <div className="offer-actions">
            {step > 0 && (
              <button type="button" className="button button--secondary button--large" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button type="button" className="button button--primary button--large" onClick={next} disabled={submitting}>
              {step < STEPS.length - 1 ? 'Continue' : submitting ? 'Sending…' : 'Submit offer'}
            </button>
          </div>
        </div>

        <aside className="card offer-summary">
          <ListingPhoto listingId={listing.id} propertyType={listing.propertyType} className="offer-summary__photo" />
          <div className="offer-summary__body">
            <strong>{address}</strong>
            <span className="muted">
              {listing.neighborhood.name} · Asking {formatCurrency(listing.listPrice)}
            </span>
            <dl>
              <div>
                <dt>Your offer</dt>
                <dd>{formatCurrency(draft.amount)}</dd>
              </div>
              <div>
                <dt>Financing</dt>
                <dd>{FINANCING_OPTIONS[draft.financing].label}</dd>
              </div>
              <div>
                <dt>Closing</dt>
                <dd>{formatDate(draft.closingDate)}</dd>
              </div>
              <div>
                <dt>Est. monthly cost</dt>
                <dd>{formatCurrency(payment)}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
