import { useEffect, type RefObject } from 'react';
import { useBlocker } from 'react-router-dom';

export function AdminNavigationBlocker({ dirtyForms }: { dirtyForms: RefObject<Set<string>> }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirtyForms.current.size > 0 && currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search &&
    !window.confirm('Discard unsaved changes? A request already sent may still complete.'));
  useEffect(() => {
    // Cancelled navigation must reset so subsequent Back/Forward attempts still work.
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);
  return null;
}
