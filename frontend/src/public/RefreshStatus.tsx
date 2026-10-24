import type { ResourceSnapshot } from './publicResource';

export function RefreshStatus({ state, retry }: { state: ResourceSnapshot<unknown>; retry: () => void }) {
  if (state.status !== 'ready') return null;
  return <div className="refresh-status">
    <p role="status">{state.refreshError === undefined ? 'Updates every 15 seconds.' : state.stopped ?
      'Updates stopped. Showing saved data.' : 'Showing saved data. Retrying updates.'}</p>
    <button className="button-secondary" onClick={retry} aria-label="Refresh live data">Refresh</button>
  </div>;
}
