import { useState, type FormEvent } from 'react';
import { addDays, validateInquiry, type InquiryErrors, type InquiryKind, type ListingDetail } from '@hearth/shared';
import { ApiError, api } from '../api';
import { useToday } from '../hooks/misc';
import { Field } from './Field';
import { CheckCircleIcon, PhoneIcon } from './Icons';

interface ContactFormProps {
  listing: ListingDetail;
}

interface FormState {
  kind: InquiryKind;
  name: string;
  email: string;
  phone: string;
  message: string;
  moveInDate: string;
  tourDate: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ContactForm({ listing }: ContactFormProps) {
  const today = useToday();
  const [form, setForm] = useState<FormState>({
    kind: 'question',
    name: '',
    email: '',
    phone: '',
    message: `Hi ${listing.agent.name.split(' ')[0]}, I'm interested in ${listing.address}. Is it still available?`,
    moveInDate: '',
    tourDate: '',
  });
  const [errors, setErrors] = useState<InquiryErrors>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field as keyof InquiryErrors]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    const result = validateInquiry(form, today);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setStatus('sending');
    try {
      await api.sendInquiry(listing.id, result.value);
      setStatus('sent');
    } catch (error) {
      setStatus('idle');
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        setErrors(error.fields as InquiryErrors);
      } else {
        setSubmitError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      }
    }
  };

  const agentFirstName = listing.agent.name.split(' ')[0];

  return (
    <div className="card contact-card">
      <div className="agent">
        <div className="agent__avatar" aria-hidden="true">
          {initials(listing.agent.name)}
        </div>
        <div>
          <div className="agent__name">{listing.agent.name}</div>
          <div className="agent__company">{listing.agent.company}</div>
        </div>
        <a className="agent__phone" href={`tel:${listing.agent.phone.replace(/[^\d+]/g, '')}`}>
          <PhoneIcon size={16} />
          {listing.agent.phone}
        </a>
      </div>

      {status === 'sent' ? (
        <div className="form-success" role="status">
          <CheckCircleIcon size={36} />
          <h3>{form.kind === 'tour' ? 'Tour requested' : 'Message sent'}</h3>
          <p>
            {agentFirstName} usually replies within a day. We sent a copy to <strong>{form.email}</strong>.
          </p>
          <button type="button" className="button button--secondary" onClick={() => setStatus('idle')}>
            Send another message
          </button>
        </div>
      ) : (
        <form className="contact-form" onSubmit={submit} noValidate>
          <div className="segmented segmented--full" role="radiogroup" aria-label="What would you like to do?">
            {(['question', 'tour'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={form.kind === kind}
                className={form.kind === kind ? 'is-selected' : ''}
                onClick={() => update('kind', kind)}
              >
                {kind === 'question' ? 'Ask a question' : 'Request a tour'}
              </button>
            ))}
          </div>

          <Field label="Full name" error={errors.name}>
            <input value={form.name} onChange={(e) => update('name', e.target.value)} autoComplete="name" />
          </Field>
          <div className="field-row">
            <Field label="Email" error={errors.email}>
              <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} autoComplete="email" />
            </Field>
            <Field label="Phone (optional)" error={errors.phone}>
              <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} autoComplete="tel" />
            </Field>
          </div>
          {form.kind === 'tour' ? (
            <Field label="Preferred tour date" error={errors.tourDate}>
              <input
                type="date"
                value={form.tourDate}
                min={addDays(today, 1)}
                max={addDays(today, 60)}
                onChange={(e) => update('tourDate', e.target.value)}
              />
            </Field>
          ) : (
            <Field label="Move-in date (optional)" error={errors.moveInDate}>
              <input type="date" value={form.moveInDate} min={today} onChange={(e) => update('moveInDate', e.target.value)} />
            </Field>
          )}
          <Field label="Message" error={errors.message}>
            <textarea rows={4} value={form.message} onChange={(e) => update('message', e.target.value)} />
          </Field>

          {submitError && <p className="form-error">{submitError}</p>}

          <button type="submit" className="button button--primary button--block" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : form.kind === 'tour' ? 'Request a tour' : 'Contact agent'}
          </button>
          <p className="form-note">By sending, you agree that {agentFirstName} may contact you about this home.</p>
        </form>
      )}
    </div>
  );
}
