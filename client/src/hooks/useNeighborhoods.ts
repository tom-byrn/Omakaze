import { useEffect, useState } from 'react';
import type { Neighborhood } from '@hearth/shared';
import { api } from '../api';

let cache: Promise<Neighborhood[]> | null = null;

/** Neighborhoods rarely change, so they are fetched once per page load and shared. */
export function useNeighborhoods(): Neighborhood[] {
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);

  useEffect(() => {
    let active = true;
    cache ??= api.neighborhoods().catch((error: unknown) => {
      cache = null;
      throw error;
    });
    cache.then(
      (list) => active && setNeighborhoods(list),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, []);

  return neighborhoods;
}
