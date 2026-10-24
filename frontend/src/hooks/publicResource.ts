import { useEffect, useSyncExternalStore } from 'react';
import type { PublicResource } from '../types/resource';

function useResource<T>(entry: PublicResource<T>, poll: boolean) {
  const snapshot = useSyncExternalStore(entry.subscribe, entry.getSnapshot);
  useEffect(() => entry.acquire(poll), [entry, poll]);
  return snapshot;
}
export function usePublicResource<T>(entry: PublicResource<T>) { return useResource(entry, false); }
export function usePollingResource<T>(entry: PublicResource<T>, enabled = true) { return useResource(entry, enabled); }
