import { useEffect, useState } from 'react';
import type { MortgageRates } from '@hearth/shared';
import { api } from '../api';

let cache: Promise<MortgageRates> | null = null;

/** Today's rates from the API, fetched once per page load. Undefined until they arrive. */
export function useMortgageRates(): MortgageRates | undefined {
  const [rates, setRates] = useState<MortgageRates>();

  useEffect(() => {
    let active = true;
    cache ??= api.mortgageRates().then(
      (response) => response.rates,
      (error: unknown) => {
        cache = null;
        throw error;
      },
    );
    cache.then(
      (value) => active && setRates(value),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, []);

  return rates;
}
