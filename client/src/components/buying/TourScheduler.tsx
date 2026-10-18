import { useState, type FormEvent } from 'react';
import {
  TOUR_TYPES,
  formatDate,
  formatTourTime,
  parseIsoDate,
  validateTourRequest,
  type FieldErrors,
  type ListingDetail,
  type TourRequest,
  type TourRequestInput,
  type TourType,
} from '@hearth/shared';
import { ApiError, api } from '../../api';
import { useToday } from '../../hooks/misc';
import { useAsync } from '../../hooks/useAsync';
import { Field } from '../Field';
import { CheckCircleIcon } from '../Icons';

const weekday = (date: string) => parseIsoDate(date).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

/** Pick a day and time slot, then send the request to the listing agent. */
export function TourScheduler({ listing }: { listing: ListingDetail }) {
  const today = useToday();
  const { data, reload } = useAsync((signal) => api.tourAvailability(listing.id, signal), [listing.id]);
  const [tourType, setTourType] = useState<TourType>('in_person');
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [errors, setErrors] = useState<FieldErrors<TourRequestInput>>({});
  const [booked, setBooked] = useState<TourRequest | null>(null);
  const [sending, setSending] = useState(false);

  const days = data?.days ?? [];
  const day = days.find((d) => d.date === date) ?? days[0];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = validateTourRequest({ tourType, date: day?.date, time, ...contact }, today);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSending(true);
    try {
      setBooked(await api.requestTour(listing.id, result.value));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setErrors({ time: error.message });
        setTime(null);
        reload();
      } else {
        setErrors(error instanceof ApiError ? error.fields : { time: 'Something went wrong. Please try again.' });
      }
    } finally {
      setSending(false);
    }
  };

  if (booked) {
    return (
      <div className="card tour-card form-success" role="status">
        <CheckCircleIcon size={36} />
        <h3>Tour requested</h3>
        <p>
          {TOUR_TYPES[booked.tourType]} tour on {formatDate(booked.date, { weekday: 'long', year: undefined })} at{' '}
          {formatTourTime(booked.time)}. {listing.agent.name.split(' ')[0]} will confirm by email.
        </p>
      </div>
    );
  }

  return (
    <form className="card tour-card" id="tour" onSubmit={submit} noValidate>
      <h3>Request a tour</h3>
      <div className="segmented segmented--full" role="group" aria-label="Tour type">
        {(Object.keys(TOUR_TYPES) as TourType[]).map((type) => (
          <button key={type} type="button" className={type === tourType ? 'is-selected' : ''} onClick={() => setTourType(type)}>
            {TOUR_TYPES[type]}
          </button>
        ))}
      </div>

      <div className="date-chips" role="group" aria-label="Day">
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            className={`date-chip${d.date === day?.date ? ' is-selected' : ''}`}
            onClick={() => {
              setDate(d.date);
              setTime(null);
            }}
          >
            <span>{weekday(d.date)}</span>
            <strong>{parseIsoDate(d.date).getUTCDate()}</strong>
            <span>{formatDate(d.date, { day: undefined, year: undefined })}</span>
          </button>
        ))}
      </div>

      <div className="slot-grid" role="group" aria-label="Time">
        {day?.slots.map((slot) => (
          <button
            key={slot.time}
            type="button"
            disabled={!slot.available}
            className={slot.time === time ? 'is-selected' : ''}
            onClick={() => setTime(slot.time)}
          >
            {formatTourTime(slot.time)}
          </button>
        ))}
      </div>
      {errors.time && <p className="field__error">{errors.time}</p>}

      <Field label="Full name" error={errors.name}>
        <input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} autoComplete="name" />
      </Field>
      <div className="field-row">
        <Field label="Email" error={errors.email}>
          <input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
        </Field>
        <Field label="Phone (optional)" error={errors.phone}>
          <input type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
        </Field>
      </div>
      <button type="submit" className="button button--primary button--block" disabled={sending || !time}>
        {time && day ? `Request ${weekday(day.date)} at ${formatTourTime(time)}` : 'Pick a time'}
      </button>
    </form>
  );
}
