import { ButtonSecondaryButton, RefreshStatusDiv } from '../../styles/components';
import type { ResourceSnapshot } from '../../types/resource';
import { PublicIcon } from '../public/navigation/PublicIcon';

export function RefreshStatus({ state, retry }: { state: ResourceSnapshot<unknown>; retry: () => void }) {
  if (state.status !== 'ready') return null;
  return <RefreshStatusDiv>
    <p role="status">{state.refreshError === undefined ? 'Updates every 15 seconds.' : state.stopped ?
      'Updates stopped. Showing saved data.' : 'Showing saved data. Retrying updates.'}</p>
    <ButtonSecondaryButton onClick={retry} aria-label="Refresh live data" startIcon={<PublicIcon name="refresh" sx={{ fontSize: '1rem' }} />}>Refresh</ButtonSecondaryButton>
  </RefreshStatusDiv>;
}
