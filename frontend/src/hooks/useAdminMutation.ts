import { useEffect, useRef, useState } from 'react';
import { AdminApiError, adminErrorMessage } from '../api/adminErrors';

export function useAdminMutation() {
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<number>();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current?.abort(); };
  }, []);
  async function run<T>(work: (signal: AbortSignal) => Promise<T>): Promise<{ data: T } | undefined> {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(undefined);
    setStatus(undefined);
    try {
      const data = await work(controller.signal);
      if (mounted.current && !controller.signal.aborted) return { data };
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) {
        setError(adminErrorMessage(error)); setStatus(error instanceof AdminApiError ? error.status : undefined);
      }
    } finally {
      if (active.current === controller) active.current = null;
      if (mounted.current) setPending(false);
    }
  }
  return { run, pending, error, status };
}
