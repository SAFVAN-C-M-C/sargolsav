import { ButtonSecondaryButton, CompetitionPickerNav, PickerErrorDiv } from '../../../styles/components';
import { Link, useOutletContext } from 'react-router-dom';
import { usePublicResource } from '../../../hooks/publicResource';
import type { PublicApi } from '../../../types/publicApi';
import { resultsPath } from '../../../utils/publicPaths';


export function CompetitionPicker({ id, leaderboards }: { id: string; leaderboards: boolean }) {
  const api = useOutletContext<PublicApi>();
  const state = usePublicResource(api.competitions);
  if (state.status === 'loading') return <p role="status">Loading competitions…</p>;
  if (state.status === 'error') return <PickerErrorDiv role="alert">Competition list unavailable. <ButtonSecondaryButton onClick={api.competitions.retry}>Retry competitions</ButtonSecondaryButton></PickerErrorDiv>;
  if (state.data.length < 2) return null;
  return <CompetitionPickerNav aria-label="Choose competition">{state.data.map((competition) =>
    <Link key={competition.id} aria-current={competition.id === id ? 'true' : undefined}
      to={leaderboards ? `/competitions/${competition.id}/leaderboards` : resultsPath(competition.id)}>{competition.name}</Link>)}</CompetitionPickerNav>;
}
