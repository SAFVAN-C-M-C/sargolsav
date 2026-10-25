import { useEffect, useState } from 'react';

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
  return { state, retry: () => setAttempt((value) => value + 1) };
}
