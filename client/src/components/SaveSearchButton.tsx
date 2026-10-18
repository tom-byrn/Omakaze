import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  ALERT_FREQUENCIES,
  DEFAULT_ALERT_FREQUENCY,
  criteriaFrom,
  describeSearch,
  filtersToSearchParams,
  type AlertFrequency,
  type ListingFilters,
} from '@hearth/shared';
import { ApiError, api } from '../api';
import { CheckCircleIcon } from './Icons';
import { Popover } from './Popover';

interface SaveSearchButtonProps {
  filters: ListingFilters;
  neighborhoodName: string | null;
}

/** Saves the current search with an email alert frequency. */
export function SaveSearchButton({ filters, neighborhoodName }: SaveSearchButtonProps) {
  const [frequency, setFrequency] = useState<AlertFrequency>(DEFAULT_ALERT_FREQUENCY);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const criteria = criteriaFrom(filters);
  const key = filtersToSearchParams({ ...filters, page: 1 }).toString();

  useEffect(() => {
    setState('idle');
    setError(null);
  }, [key]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setState('saving');
    setError(null);
    try {
      await api.saveSearch(criteria, frequency);
      setState('saved');
    } catch (failure) {
      setState('idle');
      setError(failure instanceof ApiError ? failure.message : 'We couldn’t save this search. Please try again.');
    }
  };

  return (
    <Popover
      label={state === 'saved' ? 'Search saved' : 'Save search'}
      active={state === 'saved'}
      align="right"
      className="save-search"
    >
      {state === 'saved' ? (
        <div className="save-search__done">
          <CheckCircleIcon size={22} />
          <div>
            <strong>Saved</strong>
            <p>
              {frequency === 'off' ? 'Email alerts are off.' : `Alerts: ${ALERT_FREQUENCIES[frequency]}.`}{' '}
              <Link to="/saved">Manage saved searches</Link>
            </p>
          </div>
        </div>
      ) : (
        <form className="save-search__form" onSubmit={save}>
          <div className="popover__title">Save this search</div>
          <p className="save-search__name">{describeSearch(criteria, neighborhoodName)}</p>
          <label className="field">
            <span className="field__label">Email me new listings</span>
            <select value={frequency} onChange={(event) => setFrequency(event.target.value as AlertFrequency)}>
              {Object.entries(ALERT_FREQUENCIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="field__error">{error}</p>}
          <button type="submit" className="button button--primary button--block" disabled={state === 'saving'}>
            {state === 'saving' ? 'Saving…' : 'Save search'}
          </button>
        </form>
      )}
    </Popover>
  );
}
