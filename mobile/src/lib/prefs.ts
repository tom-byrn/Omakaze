import { useCallback, useEffect, useState } from 'react';

import { getItem, setItem } from './storage';

const cache = new Map<string, boolean>();

/** A boolean preference kept on the device (e.g. wrapping long diff lines). */
export function useStoredBoolean(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(cache.get(key) ?? initial);
  useEffect(() => {
    if (cache.has(key)) return;
    getItem(`omakaze.pref.${key}`).then((v) => {
      if (v === null) return;
      cache.set(key, v === '1');
      setValue(v === '1');
    });
  }, [key]);
  const set = useCallback(
    (v: boolean) => {
      cache.set(key, v);
      setValue(v);
      void setItem(`omakaze.pref.${key}`, v ? '1' : '0');
    },
    [key],
  );
  return [value, set];
}
