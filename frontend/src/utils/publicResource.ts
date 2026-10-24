import { PUBLIC_REFRESH_INTERVAL, MAX_RETRY_DELAY } from '../constants/polling';
import type { ResourceSnapshot } from '../types/resource';
import { PublicApiError, PublicPayloadError } from '../api/publicErrors';

function terminal(error: unknown) {
  return error instanceof PublicPayloadError || (error instanceof PublicApiError && error.status >= 400 && error.status < 500 &&
    ![408, 429].includes(error.status));
}

// One request/scheduler per resource. React consumers acquire and release ownership.
export function createPublicResource<T>(read: () => Promise<T>, interval = PUBLIC_REFRESH_INTERVAL) {
  let snapshot: ResourceSnapshot<T> = { status: 'loading' };
  let pending = false;
  let readers = 0;
  let pollers = 0;
  let failures = 0;
  let stopped = false;
  let resumeAfterRequest = false;
  let wasVisible = true;
  let fingerprint: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const visible = () => document.visibilityState !== 'hidden';
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };
  const schedule = () => {
    clearTimer();
    if (pollers > 0 && visible() && !stopped) {
      timer = setTimeout(request, Math.min(interval * 2 ** Math.min(Math.max(failures - 1, 0), 2), MAX_RETRY_DELAY));
    }
  };
  async function request() {
    clearTimer();
    if (!readers || pending || stopped || (pollers > 0 && !visible())) return;
    pending = true;
    try {
      const data = await read();
      if (!readers) return; // Ignore completions after navigation/unmount.
      const nextFingerprint = JSON.stringify(data);
      if (snapshot.status !== 'ready' || snapshot.refreshError !== undefined || fingerprint !== nextFingerprint) {
        snapshot = { status: 'ready', data };
        fingerprint = nextFingerprint;
        emit();
      }
      failures = 0;
    } catch (error) {
      if (!readers) return;
      failures += 1;
      stopped = terminal(error);
      snapshot = snapshot.status === 'ready' ? { ...snapshot, refreshError: error, stopped } : { status: 'error', error };
      emit();
    } finally {
      pending = false;
      if (resumeAfterRequest && readers && pollers && visible() && !stopped) {
        resumeAfterRequest = false;
        void request();
      } else {
        resumeAfterRequest = false;
        schedule();
      }
    }
  }
  function visibilityChanged() {
    const nowVisible = visible();
    if (nowVisible === wasVisible) return;
    wasVisible = nowVisible;
    clearTimer();
    if (!nowVisible || stopped) return;
    if (pending) resumeAfterRequest = true;
    else void request();
  }
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    acquire(poll = false) {
      readers += 1;
      if (poll) {
        pollers += 1;
        if (pollers === 1) {
          wasVisible = visible();
          document.addEventListener('visibilitychange', visibilityChanged);
          void request();
        }
      } else if (snapshot.status !== 'ready') void request();
      return () => {
        readers -= 1;
        if (poll) {
          pollers -= 1;
          if (!pollers) {
            clearTimer();
            resumeAfterRequest = false;
            document.removeEventListener('visibilitychange', visibilityChanged);
          }
        }
      };
    },
    retry() { stopped = false; failures = 0; void request(); },
  };
}
