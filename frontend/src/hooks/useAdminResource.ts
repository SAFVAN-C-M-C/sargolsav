import { useCallback, useEffect, useState } from 'react';

type Resource<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

export function useAdminResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ load: typeof load; attempt: number; value: Resource<T> }>();
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setResult({ load, attempt, value: { status: 'ready', data } }); },
      () => { if (!controller.signal.aborted) setResult({ load, attempt, value: { status: 'error' } }); },
    );
    return () => controller.abort();
  }, [load, attempt]);
  // Hide previous data immediately, including the render before effect cleanup.
  const state: Resource<T> = result?.load === load && result.attempt === attempt ? result.value : { status: 'loading' };
  const update = useCallback((transform: (value: T) => T) => {
    setResult((previous) => previous?.load === load && previous.attempt === attempt && previous.value.status === 'ready' ?
      { ...previous, value: { status: 'ready', data: transform(previous.value.data) } } : previous);
  }, [load, attempt]);
  return { state, retry: () => setAttempt((value) => value + 1), update };
}
