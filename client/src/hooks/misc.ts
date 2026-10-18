import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { toIsoDate } from '@hearth/shared';

/** Today's date as YYYY-MM-DD, matching how the server stores dates. */
export function useToday(): string {
  return useMemo(() => toIsoDate(new Date()), []);
}

export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · Hearth` : 'Hearth · Homes in Port Ellis';
  }, [title]);
}

/** Returns a stable function that calls `callback` once `delay` ms have passed without another call. */
export function useDebouncedCallback<Args extends unknown[]>(callback: (...args: Args) => void, delay: number) {
  const callbackRef = useRef(callback);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => () => clearTimeout(timer.current), []);

  return useMemo(
    () => ({
      call: (...args: Args) => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => callbackRef.current(...args), delay);
      },
      cancel: () => clearTimeout(timer.current),
    }),
    [delay],
  );
}
