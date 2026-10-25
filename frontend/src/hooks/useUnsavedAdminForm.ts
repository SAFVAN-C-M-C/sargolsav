import { useEffect, useId } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { AdminWorkspace } from '../types/adminWorkspace';

export function useUnsavedAdminForm(dirty: boolean) {
  const { setDirty } = useOutletContext<AdminWorkspace>();
  const key = useId();
  useEffect(() => {
    setDirty(key, dirty);
    return () => setDirty(key, false);
  }, [setDirty, key, dirty]);
  return () => setDirty(key, false);
}
