import { ButtonSecondaryButton, CompetitionPickerNav, PickerErrorDiv } from '../../../styles/components';
import { styled } from '@mui/material/styles';
import { Link, useOutletContext } from 'react-router-dom';
import { usePublicResource } from '../../../hooks/publicResource';
import type { PublicApi } from '../../../types/publicApi';
import { resultsPath } from '../../../utils/publicPaths';

const CompetitionSwitcher = styled(CompetitionPickerNav)(({ theme }) => ({
  flexWrap: 'nowrap', overflowX: 'auto', overscrollBehaviorX: 'contain', gap: 8,
  padding: '4px 1px 12px', scrollbarWidth: 'thin', scrollbarColor: `${theme.palette.divider} transparent`,
  '& a': { flexShrink: 0, borderRadius: 24, fontSize: '.8rem', fontWeight: 600, padding: '10px 16px', background: theme.palette.background.paper },
  '& a[aria-current]': { background: theme.palette.primary.main, borderColor: theme.palette.primary.main, boxShadow: '0 4px 10px #176b591a' },
}));

export function CompetitionPicker({ id, leaderboards }: { id: string; leaderboards: boolean }) {
  const api = useOutletContext<PublicApi>();
  const state = usePublicResource(api.competitions);
  if (state.status === 'loading') return <p role="status">Loading competitions…</p>;
  if (state.status === 'error') return <PickerErrorDiv role="alert">Competition list unavailable. <ButtonSecondaryButton onClick={api.competitions.retry}>Retry competitions</ButtonSecondaryButton></PickerErrorDiv>;
  if (state.data.length < 2) return null;
  return <CompetitionSwitcher aria-label="Choose competition">{state.data.map((competition) =>
    <Link key={competition.id} aria-current={competition.id === id ? 'true' : undefined}
      to={leaderboards ? `/competitions/${competition.id}/leaderboards` : resultsPath(competition.id)}>{competition.name}</Link>)}</CompetitionSwitcher>;
}
