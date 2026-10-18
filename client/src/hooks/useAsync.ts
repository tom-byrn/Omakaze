import { useCallback, useEffect, useState, type DependencyList } from 'react';

interface AsyncState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
}

/**
 * Runs an async loader whenever `deps` change. Previous data is kept while a
 * new request is in flight so lists don't flash empty between searches.
 */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: null, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          data: current.data,
          error: error instanceof Error ? error : new Error(String(error)),
          loading: false,
        }));
      },
    );
    return () => controller.abort();
    // The caller decides what the loader depends on, like useEffect.
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback(
    (update: (current: T | undefined) => T | undefined) =>
      setState((current) => ({ ...current, data: update(current.data) })),
    [],
  );

  return { ...state, reload, setData };
}
