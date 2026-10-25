import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { styled } from '@mui/material/styles';
import { Link } from 'react-router-dom';

// Keep semantic HTML and router behavior while scoping custom styles with MUI.
const stylingProps = new Set<PropertyKey>([
  'as', 'theme', 'sx', 'ownerState', 'layout', 'variant', 'status',
  'rank', 'published', 'position', 'mobileOpen',
]);
const shouldForwardProp = (prop: PropertyKey) => !stylingProps.has(prop);

export const AdminAuthShellDiv = styled('div')`
  & { min-height: 100dvh; }
  & > section, & > div[role] { width: min(28rem, calc(100% - 2rem)); margin: 4rem auto; }
`;

export const DashboardPanelDiv = styled('div')(({ theme }) => `
  & { min-width: 0; padding: clamp(1rem, 2.5vw, 1.75rem); margin-bottom: 1.25rem; border: 1px solid ${theme.palette.divider}; border-radius: ${theme.shape.borderRadius}px; background: ${theme.palette.background.paper}; overflow-wrap: anywhere; }
  & h2 { margin: 0 0 .5rem; font-size: 1.3rem; line-height: 1.35; }
  & p { color: ${theme.palette.text.secondary}; margin-block: .5rem; }
`);

export const StatusCardDiv = styled('div')(({ theme }) => `
  & { width: 100%; padding: clamp(1.5rem, 5vw, 2.5rem); border: 1px solid #d5e1d8; border-radius: 1rem; background: ${theme.palette.background.paper}; box-shadow: 0 12px 40px rgb(24 60 54 / 8%); }
  & h2 { margin-top: 0; }
`);

export const ActionsDiv = styled('div', {
  shouldForwardProp,
})<{ layout?: 'form' | 'dialog' }>(({ layout }) => `
  & { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.5rem; }
  @media (max-width: 560px) { & button { width: 100%; } }
  ${layout === 'form' ? '& { margin-top: .75rem; } @media (max-width: 480px) { & button { width: 100%; } }' : ''}
  ${layout === 'dialog' ? '@media (max-width: 360px) { & button { width: 100%; } }' : ''}
`);

export const AppButton = styled(Button)(({ theme }) => `
  &:focus-visible { outline: 3px solid ${theme.palette.secondary.main}; outline-offset: 3px; }
  & { min-height: 2.8rem; padding: 0.65rem 1rem; border: 1px solid ${theme.palette.primary.main}; border-radius: 0.5rem; background: ${theme.palette.primary.main}; color: ${theme.palette.background.paper}; cursor: pointer; font: inherit; font-weight: 650; }
  &:hover:not(:disabled) { background: ${theme.palette.primary.dark}; }
  &:disabled { opacity: 0.65; cursor: wait; }
`);

export const ButtonSecondaryButton = styled(Button)(({ theme }) => `
  &:focus-visible { outline: 3px solid ${theme.palette.secondary.main}; outline-offset: 3px; }
  & { min-height: 2.8rem; padding: 0.65rem 1rem; border: 1px solid ${theme.palette.primary.main}; border-radius: 0.5rem; background: ${theme.palette.primary.main}; color: ${theme.palette.background.paper}; cursor: pointer; font: inherit; font-weight: 650; }
  &:hover:not(:disabled) { background: ${theme.palette.primary.dark}; }
  &:disabled { opacity: 0.65; cursor: wait; }
  & { background: transparent; color: ${theme.palette.primary.main}; }
  &:hover:not(:disabled) { color: ${theme.palette.background.paper}; }
`);

export const FormErrorP = styled('p')(({ theme }) => `
  & { color: ${theme.palette.error.main}; font-weight: 600; }
`);

export const ParticipantActionLinkLink = styled(Link)(({ theme }) => `
  & { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: .65rem 1rem; border: 1px solid ${theme.palette.primary.main}; border-radius: .5rem; font-weight: 650; overflow-wrap: anywhere; }
`);

export const ButtonDangerButton = styled(Button)(({ theme }) => `
  &:focus-visible { outline: 3px solid ${theme.palette.secondary.main}; outline-offset: 3px; }
  & { min-height: 2.8rem; padding: 0.65rem 1rem; border: 1px solid ${theme.palette.primary.main}; border-radius: 0.5rem; background: ${theme.palette.primary.main}; color: ${theme.palette.background.paper}; cursor: pointer; font: inherit; font-weight: 650; }
  &:hover:not(:disabled) { background: ${theme.palette.primary.dark}; }
  &:disabled { opacity: 0.65; cursor: wait; }
  & { background: ${theme.palette.error.main}; border-color: ${theme.palette.error.main}; }
  &:hover:not(:disabled) { background: ${theme.palette.error.dark}; }
`);

export const AdminFormDashboardPanelForm = styled('form')(({ theme }) => `
  & { display: grid; gap: 0.65rem; margin-top: 1.5rem; }
  & { min-width: 0; padding: clamp(1rem, 2.5vw, 1.75rem); margin-bottom: 1.25rem; border: 1px solid ${theme.palette.divider}; border-radius: ${theme.shape.borderRadius}px; background: ${theme.palette.background.paper}; overflow-wrap: anywhere; }
  & h2 { margin: 0 0 .5rem; font-size: 1.3rem; line-height: 1.35; }
  & p { color: ${theme.palette.text.secondary}; margin-block: .5rem; }
  & { margin-block: 1.25rem; }
  & fieldset { display: grid; gap: .65rem; min-width: 0; margin: 0; padding: 0; border: 0; }
  & input { min-width: 0; }
  & h3 { margin: 0 0 .5rem; }
  & button { width: fit-content; max-width: 100%; }
`);

export const SrOnlyLegend = styled('legend')`
  & { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

export const FieldLabel = styled('label')`
  & { font-weight: 650; }
`;

export const FormInput = styled('input')(({ theme }) => `
  &:focus-visible { outline: 3px solid ${theme.palette.secondary.main}; outline-offset: 3px; }
  & { width: 100%; min-height: 2.8rem; margin-bottom: 0.4rem; padding: 0.65rem 0.75rem; border: 1px solid #9caea5; border-radius: 0.5rem; color: inherit; font: inherit; }
`);

export const BackLinkLink = styled(Link)`
  & { display: inline-block; margin-top: 1.5rem; font-weight: 600; }
`;

export const ParticipantDetailSection = styled('section')`
  & { min-width: 0; }
  & h3, & h4 { overflow-wrap: anywhere; }
  & h4 { font-size: 1.1rem; margin-block: .5rem; }
`;

export const EyebrowP = styled('p', {
  shouldForwardProp,
})<{ variant?: 'public' | 'publicHeading' | 'topbar' | 'summary' }>(({ theme, variant }) => `
  & { font-size: 0.85rem; font-weight: 600; }
  ${variant === 'public' || variant === 'publicHeading' ? `& { color: ${theme.palette.text.secondary}; letter-spacing: .08em; font-size: .72rem; text-transform: uppercase; }` : ''}
  ${variant === 'publicHeading' ? '& { margin: 0; }' : ''}
  ${variant === 'topbar' ? `& { margin: 0; color: ${theme.palette.text.secondary}; font-size: .7rem; text-transform: uppercase; letter-spacing: .1em; }` : ''}
  ${variant === 'summary' ? '& { text-transform: uppercase; letter-spacing: .1em; font-size: .7rem; margin-bottom: .75rem; }' : ''}
`);

export const SectionHeadingParticipantSectionHeadingDiv = styled('div')`
  & { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .75rem; }
  & h2 { margin: .25rem 0; }
  & { margin-block: 1.25rem; }
  & h3 { min-width: 0; overflow-wrap: anywhere; }
`;

export const AdminSuccessP = styled('p')(({ theme }) => `
  & { padding: .8rem 1rem; background: ${theme.palette.action.hover}; border-left: 3px solid ${theme.palette.primary.main}; color: ${theme.palette.text.primary}; overflow-wrap: anywhere; }
`);

export const ParticipantListCatalogListUl = styled('ul')(({ theme }) => `
  & { display: grid; gap: .65rem; list-style: none; padding: 0; margin-block: 1rem 1.5rem; }
  & li { min-width: 0; }
  & a { display: flex; align-items: center; min-height: 48px; padding: .85rem 1rem; border: 1px solid ${theme.palette.divider}; border-radius: .75rem; background: ${theme.palette.background.paper}; overflow-wrap: anywhere; }
  & a[aria-current] { border-color: ${theme.palette.primary.main}; background: ${theme.palette.action.hover}; font-weight: 700; }
  & a { flex-wrap: wrap; justify-content: space-between; gap: .5rem 1rem; }
  & a > span:first-child { min-width: 0; overflow-wrap: anywhere; }
`);

export const CatalogListOrderSpan = styled('span')(({ theme }) => `
  & { color: ${theme.palette.text.secondary}; font-size: .8rem; }
`);

export const DashboardPanelCompetitionSummaryDiv = styled('div')(({ theme }) => `
  & { min-width: 0; padding: clamp(1rem, 2.5vw, 1.75rem); margin-bottom: 1.25rem; border: 1px solid ${theme.palette.divider}; border-radius: ${theme.shape.borderRadius}px; background: ${theme.palette.background.paper}; overflow-wrap: anywhere; }
  & h2 { margin: 0 0 .5rem; font-size: 1.3rem; line-height: 1.35; }
  & p { color: ${theme.palette.text.secondary}; margin-block: .5rem; }
  & h2 { font-size: clamp(1.5rem, 4vw, 2rem); }
`);

export const AdminStatusSpan = styled('span', {
  shouldForwardProp,
})<{ status: 'active' | 'draft' | 'archived' }>(({ theme, status }) => `
  & { display: inline-block; padding: .35rem .7rem; border-radius: 2rem; background: ${theme.palette.action.hover}; font-size: .75rem; text-transform: capitalize; font-weight: 650; }
  ${status === 'active' ? '& { background: #dcefe4; color: #14533e; }' : ''}
  ${status === 'draft' ? '& { background: #faf0d9; color: #70501c; }' : ''}
  ${status === 'archived' ? '& { background: #eaf0f4; color: #374f64; }' : ''}
`);

export const OverviewMetricsDl = styled('dl')(({ theme }) => `
  & { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; margin: 0; }
  & dt { font-size: .8rem; color: ${theme.palette.text.secondary}; }
  & dd { margin: .75rem 0 0; font-size: 2.25rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  @media (max-width: 1000px) { & { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 360px) { & { gap: .6rem; } }
  @media (max-width: 360px) { & dd { font-size: 1.8rem; } }
`);

export const DashboardPanelSection = styled('section')(({ theme }) => `
  & { min-width: 0; padding: clamp(1rem, 2.5vw, 1.75rem); margin-bottom: 1.25rem; border: 1px solid ${theme.palette.divider}; border-radius: ${theme.shape.borderRadius}px; background: ${theme.palette.background.paper}; overflow-wrap: anywhere; }
  & h2 { margin: 0 0 .5rem; font-size: 1.3rem; line-height: 1.35; }
  & p { color: ${theme.palette.text.secondary}; margin-block: .5rem; }
`);

export const SectionHeadingDiv = styled('div')`
  & { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .75rem; }
  & h2 { margin: .25rem 0; }
`;

export const AdminFormForm = styled('form')`
  & { display: grid; gap: 0.65rem; margin-top: 1.5rem; }
  & { margin-block: 1.25rem; }
  & fieldset { display: grid; gap: .65rem; min-width: 0; margin: 0; padding: 0; border: 0; }
  & input { min-width: 0; }
  & h3 { margin: 0 0 .5rem; }
  & button { width: fit-content; max-width: 100%; }
`;

export const AdminLifecycleDiv = styled('div')(({ theme }) => `
  & { padding-block: 1rem; margin-block: 1rem; border-block: 1px solid ${theme.palette.divider}; }
`);

export const PointsRowDiv = styled('div')(({ theme }) => `
  & { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: end; gap: .75rem; padding: .75rem 0; border-bottom: 1px solid ${theme.palette.divider}; }
  & > div { display: grid; gap: .5rem; min-width: 0; }
  & button { margin-bottom: .4rem; }
  @media (max-width: 480px) { & { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 480px) { & button { grid-column: 1 / -1; } }
`);

export const LoadingSkeleton = styled(Skeleton)(({ theme }) => ({
  height: 104,
  width: '100%',
  transform: 'none',
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.action.hover,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
}));

export const ParticipantListUl = styled('ul')(({ theme }) => `
  display: grid; gap: .65rem; list-style: none; padding: 0; margin-block: 1rem 1.5rem;
  & li { min-width: 0; }
  & a { display: flex; align-items: center; min-height: 48px; padding: .85rem 1rem; border: 1px solid ${theme.palette.divider}; border-radius: .75rem; background: ${theme.palette.background.paper}; overflow-wrap: anywhere; }
  & a[aria-current] { border-color: ${theme.palette.primary.main}; background: ${theme.palette.action.hover}; font-weight: 700; }
`);

export const ActionsNav = styled('nav')`
  display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.5rem;
  @media (max-width: 560px) { & button { width: 100%; } }
`;

export const CorrectionWorkspaceSection = styled('section')(({ theme }) => `
  min-width: 0; overflow-wrap: anywhere; margin-top: 1.5rem;
  padding: clamp(.75rem, 3vw, 1.5rem); border: 2px solid ${theme.palette.primary.main};
  border-radius: ${theme.shape.borderRadius}px;
`);

export const DraftFormDashboardPanelForm = styled('form')(({ theme }) => `
  & { display: grid; gap: 0.65rem; margin-top: 1.5rem; }
  & { min-width: 0; padding: clamp(1rem, 2.5vw, 1.75rem); margin-bottom: 1.25rem; border: 1px solid ${theme.palette.divider}; border-radius: ${theme.shape.borderRadius}px; background: ${theme.palette.background.paper}; overflow-wrap: anywhere; }
  & h2 { margin: 0 0 .5rem; font-size: 1.3rem; line-height: 1.35; }
  & p { color: ${theme.palette.text.secondary}; margin-block: .5rem; }
  & { min-width: 0; }
`);

export const NoticeP = styled('p')`
  & { margin-top: 2rem; padding: 1rem; border-left: 3px solid #277465; background: #e8efea; }
`;

export const SharedPositionControlsFieldset = styled('fieldset')(({ theme }) => `
  & { min-width: 0; margin: 1rem 0; padding: .75rem; border: 1px solid ${theme.palette.divider}; border-radius: .75rem; }
  & textarea { display: block; width: 100%; min-height: 6rem; margin-top: .5rem; padding: .75rem; border: 1px solid #9caea5; border-radius: .5rem; background: ${theme.palette.background.paper}; color: ${theme.palette.text.primary}; font: inherit; resize: vertical; }
  & textarea:focus-visible { outline: 3px solid ${theme.palette.secondary.main}; outline-offset: 3px; }
`);

export const SharedPositionNoticeP = styled('p')(({ theme }) => `
  & { border-left: 4px solid ${theme.palette.secondary.main}; padding: .65rem .85rem; background: ${theme.palette.action.hover}; overflow-wrap: anywhere; }
`);

export const SharedPositionToggleLabel = styled('label')`
  & { font-weight: 650; }
  & { display: flex; align-items: center; gap: .75rem; min-height: 44px; cursor: pointer; }
  & input { width: 1.4rem; min-height: 1.4rem; flex: 0 0 1.4rem; }
`;

export const DraftFieldsFieldset = styled('fieldset')`
  & { min-width: 0; display: grid; gap: 1rem; margin: 0; padding: 0; border: 0; }
  @media (min-width: 900px) { & { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

export const FormErrorDiv = styled('div')(({ theme }) => `
  & { color: ${theme.palette.error.main}; font-weight: 600; }
`);

export const DraftSaveBarDiv = styled('div')(({ theme }) => `
  & { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; position: sticky; bottom: 0; margin-top: 1rem; padding: .75rem; border: 1px solid ${theme.palette.divider}; border-radius: .75rem; background: ${theme.palette.background.paper}; }
  & > span { font-size: .85rem; color: ${theme.palette.text.secondary}; overflow-wrap: anywhere; }
  @media (max-width: 360px) { & button { width: 100%; } }
`);

export const NoticeDiv = styled('div')`
  & { margin-top: 2rem; padding: 1rem; border-left: 3px solid #277465; background: #e8efea; }
`;

export const PublicationOverlayDiv = styled('div')`
  & { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: .5rem; background: #102b25cc; }
`;

export const PublicationDialogDiv = styled('div')(({ theme }) => `
  & { width: min(100%, 42rem); min-width: 0; max-height: 95dvh; overflow-y: auto; padding: clamp(1rem, 3vw, 2rem); border-radius: 1rem; background: ${theme.palette.background.paper}; overflow-wrap: anywhere; }
  & h3 { font-size: 1.4rem; }
  & button { max-width: 100%; overflow-wrap: anywhere; }
`);

export const ResultLifecycleSection = styled('section')`
  & { min-width: 0; overflow-wrap: anywhere; }
`;

export const DashboardPanelPublishedSnapshotSection = styled('section')(({ theme }) => `
  & { min-width: 0; padding: clamp(1rem, 2.5vw, 1.75rem); margin-bottom: 1.25rem; border: 1px solid ${theme.palette.divider}; border-radius: ${theme.shape.borderRadius}px; background: ${theme.palette.background.paper}; overflow-wrap: anywhere; }
  & h2 { margin: 0 0 .5rem; font-size: 1.3rem; line-height: 1.35; }
  & p { color: ${theme.palette.text.secondary}; margin-block: .5rem; }
`);

export const CompetitionPickerNav = styled('nav')(({ theme }) => `
  & { display: flex; flex-wrap: wrap; gap: .5rem; }
  & a { display: inline-flex; align-items: center; min-height: 44px; padding: .6rem .9rem; border: 1px solid ${theme.palette.divider}; border-radius: .75rem; text-decoration: none; overflow-wrap: anywhere; max-width: 100%; }
  & a[aria-current] { background: ${theme.palette.text.primary}; color: white; border-color: ${theme.palette.text.primary}; }
`);

export const ResultCategorySection = styled('section')`
  & { min-width: 0; margin-block: 1.5rem; }
  & h3 { overflow-wrap: anywhere; }
  & ul a { justify-content: space-between; flex-wrap: wrap; gap: .6rem; }
`;

export const ResultEntryStatusSpan = styled('span')(({ theme }) => `
  & { font-size: .8rem; color: ${theme.palette.text.secondary}; }
`);

export const ResultEditorSection = styled('section')`
  & { min-width: 0; margin-block: 1.5rem; }
  & h3 { overflow-wrap: anywhere; }
`;

export const VerificationWinnersOl = styled('ol')(({ theme }) => `
  & { display: grid; gap: .75rem; list-style: none; padding: 0; }
  & li { min-width: 0; padding: 1rem; border: 1px solid ${theme.palette.divider}; border-radius: .75rem; overflow-wrap: anywhere; }
  & dl { display: grid; gap: .6rem; }
  & dt { color: ${theme.palette.text.secondary}; font-size: .8rem; }
  & dd { margin: .25rem 0 0; }
  @media (min-width: 600px) { & dl { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
`);

export const WinnerEntryFieldset = styled('fieldset')(({ theme }) => `
  & { min-width: 0; display: grid; gap: .6rem; margin: 0; padding: clamp(.75rem, 3vw, 1.25rem); border: 1px solid ${theme.palette.divider}; border-radius: .75rem; }
  & legend { font-weight: 700; padding-inline: .4rem; }
  & p { margin-block: .25rem; overflow-wrap: anywhere; }
  & input, & select { min-width: 0; width: 100%; }
  & select { min-height: 48px; padding: .65rem; border: 1px solid #9caea5; border-radius: .5rem; color: ${theme.palette.text.primary}; background: ${theme.palette.background.paper}; font: inherit; }
  & select:focus-visible { outline: 3px solid ${theme.palette.secondary.main}; outline-offset: 3px; }
  & button { max-width: 100%; overflow-wrap: anywhere; }
`);

export const CandidateLookupDiv = styled('div')`
  & { display: flex; flex-wrap: wrap; gap: .6rem; min-width: 0; }
  & input { flex: 1 1 12rem; }
  & button { flex: 1 1 auto; }
`;

export const LoadingCardsDiv = styled('div')`
  & { display: grid; gap: .85rem; }
  @media (min-width: 680px) { & { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

export const SrOnlySpan = styled('span')`
  & { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

export const PublicStateSection = styled('section')(({ theme }) => `
  & { padding: clamp(1.5rem, 5vw, 3rem); text-align: center; border: 1px solid ${theme.palette.divider}; border-radius: ${theme.shape.borderRadius}px; background: ${theme.palette.background.paper}; overflow-wrap: anywhere; }
  & p { color: ${theme.palette.text.secondary}; max-width: 45ch; margin-inline: auto; }
  & a { display: inline-block; padding-block: .6rem; }
`);

export const StateMarkSpan = styled('span')(({ theme }) => `
  & { display: inline-grid; place-items: center; width: 3rem; height: 3rem; border-radius: 50%; background: ${theme.palette.action.hover}; font-size: 2rem; }
`);

export const RefreshStatusDiv = styled('div')(({ theme }) => `
  & { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-block: 1rem; color: ${theme.palette.text.secondary}; font-size: .75rem; }
  & p { flex: 1; margin: 0; overflow-wrap: anywhere; }
  & button { flex-shrink: 0; min-height: 44px; border-radius: 24px; padding-inline: .8rem; font-size: .75rem; }
`);

export const LeaderboardNoteP = styled('p')(({ theme }) => `
  & { color: ${theme.palette.text.secondary}; font-size: .85rem; line-height: 1.6; margin-block: .25rem 1rem; }
`);

export const PublicIntroP = styled('p')(({ theme }) => `
  & { color: ${theme.palette.text.secondary}; margin-block: .6rem 1.5rem; }
`);

export const LeaderboardControlsDiv = styled('div')(({ theme }) => `
  & { margin-block: 1.5rem; display: grid; gap: .75rem; min-width: 0; }
  & { padding: 1rem; border: 1px solid ${theme.palette.divider}; border-radius: 24px; background: #edf3ed; }
`);

export const RankingTypesNav = styled('nav')(({ theme }) => `
  & { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .3rem; padding: .3rem; border-radius: 15px; background: #dfe9e0; }
  & a { display: grid; place-items: center; min-height: 44px; border-radius: 11px; color: ${theme.palette.text.secondary}; text-decoration: none; font-size: .85rem; font-weight: 650; }
  & a[aria-current="page"] { background: ${theme.palette.background.paper}; color: ${theme.palette.primary.main}; box-shadow: 0 2px 8px #193f370d; }
  & a:focus-visible { outline: 3px solid ${theme.palette.secondary.main}; outline-offset: 2px; }
`);

export const RankingListOl = styled('ol')`
  & { list-style: none; display: grid; gap: .85rem; padding: 0; margin: 0; }
`;

export const RankingRowLi = styled('li')(({ theme }) => `
  & { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr); gap: .75rem; padding: clamp(.85rem, 3vw, 1.5rem); border: 1px solid ${theme.palette.divider}; border-radius: ${theme.shape.borderRadius}px; background: ${theme.palette.background.paper}; min-width: 0; }
  @media (max-width: 360px) { & { grid-template-columns: 2rem minmax(0, 1fr); gap: .5rem; } }
`);

const podiumColors: Record<string, { background: string; color: string }> = {
  '1': { background: '#faf0d9', color: '#70501c' },
  '2': { background: '#eaf0f4', color: '#374f64' },
  '3': { background: '#f5e9df', color: '#794b2a' },
};

export const RankingRankSpan = styled('span', {
  shouldForwardProp,
})<{ rank: string }>(({ theme, rank }) => `
  & { display: grid; place-items: center; align-self: start; min-height: 2.5rem; border-radius: .75rem; background: ${theme.palette.action.hover}; font-weight: 750; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  ${podiumColors[rank] ? `& { background: ${podiumColors[rank].background}; color: ${podiumColors[rank].color}; }` : ''}
  @media (max-width: 360px) { & { min-height: 2rem; } }
`);

export const RankingBodyDiv = styled('div')`
  & { min-width: 0; overflow-wrap: anywhere; }
`;

export const RankingSummaryDiv = styled('div')`
  & { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: .5rem 1rem; }
  & h3 { flex: 1 1 10rem; min-width: 0; margin: .25rem 0; font-size: 1.1rem; line-height: 1.5; }
`;

export const RankingScoreDiv = styled('div')(({ theme }) => `
  & { max-width: 100%; flex: 0 1 auto; font-variant-numeric: tabular-nums; }
  & strong { display: block; font-size: clamp(1rem, 4.5vw, 1.35rem); line-height: 1.4; }
  & > span { color: ${theme.palette.text.secondary}; font-size: .75rem; }
`);

export const CandidateCodeP = styled('p')(({ theme }) => `
  & { color: ${theme.palette.text.secondary}; font-size: .85rem; margin-block: .5rem 1rem; }
  & bdi { color: ${theme.palette.text.primary}; font-weight: 650; }
`);

export const WinnerAffiliationRankingAffiliationDl = styled('dl')(({ theme }) => `
  & { display: grid; gap: .75rem; margin: 0; }
  & dt { font-size: .72rem; color: ${theme.palette.text.secondary}; margin-bottom: .2rem; }
  & dd { margin: 0; font-size: .95rem; line-height: 1.5; }
  & { margin-block: .75rem; }
  @media (min-width: 680px) { & { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`);

export const RankingWinsP = styled('p')(({ theme }) => `
  & { color: ${theme.palette.text.secondary}; font-size: .8rem; margin-block: .75rem 0; }
`);

export const RankingAchievementsDetails = styled('details')(({ theme }) => `
  & summary:focus-visible { outline: 3px solid ${theme.palette.secondary.main}; outline-offset: 3px; }
  & { margin-top: .5rem; font-size: .85rem; }
  & summary { display: list-item; min-height: 44px; padding-block: .8rem; cursor: pointer; font-weight: 600; }
  & dl { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; margin: 0; padding-block: .25rem .75rem; }
  & dt { color: ${theme.palette.text.secondary}; font-size: .75rem; }
  & dd { margin: .25rem 0 0; }
`);

export const PickerErrorDiv = styled('div')`
  & { font-size: .85rem; }
`;

export const PublicTabsNav = styled('nav')(({ theme }) => `
  & { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .35rem; padding: .35rem; margin-block: 1.75rem 2rem; border-radius: 1rem; background: #e2ebe4; }
  & a { display: flex; justify-content: center; align-items: center; gap: .5rem; min-height: 48px; border-radius: .75rem; color: ${theme.palette.text.secondary}; font-weight: 650; text-decoration: none; }
  & a[aria-current="page"] { color: ${theme.palette.text.primary}; background: ${theme.palette.background.paper}; box-shadow: 0 2px 6px #193f3710; }
  & a:hover { color: ${theme.palette.text.primary}; background: #ffffffa0; }
  & svg { width: 21px; height: 21px; }
  @media (max-width: 679px) {
    & { position: fixed; inset: auto 0 0; z-index: 20; margin: 0; padding: .45rem 1rem max(.45rem, env(safe-area-inset-bottom)); gap: 1rem; border-radius: 24px 24px 0 0; border: 1px solid ${theme.palette.divider}; border-bottom: 0; background: #ffffffed; backdrop-filter: blur(18px); box-shadow: 0 -8px 32px #193f370a; }
    & a { flex-direction: column; gap: .3rem; min-height: 58px; padding: .35rem; font-size: .72rem; }
    & a[aria-current="page"] { color: ${theme.palette.primary.main}; background: ${theme.palette.action.hover}; box-shadow: none; }
  }
`);

export const CountBadgeSpan = styled('span')(({ theme }) => `
  & { font-size: .75rem; color: ${theme.palette.text.secondary}; background: ${theme.palette.action.hover}; padding: .5rem .75rem; border: 1px solid ${theme.palette.divider}; border-radius: 2rem; }
`);

export const CategoryGridUl = styled('ul')`
  & { display: grid; gap: .85rem; list-style: none; padding: 0; margin: 0; }
  & li { min-width: 0; }
  @media (min-width: 680px) { & { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

export const CategoryCardLink = styled(Link)(({ theme }) => `
  & { display: flex; align-items: center; gap: 1rem; min-height: 104px; padding: 1.25rem; border: 1px solid ${theme.palette.divider}; border-radius: ${theme.shape.borderRadius}px; background: ${theme.palette.background.paper}; text-decoration: none; color: ${theme.palette.text.primary}; transition: border-color .15s, box-shadow .15s; }
  &:hover { border-color: ${theme.palette.primary.main}; box-shadow: 0 5px 20px #193f3710; }
  @media (prefers-reduced-motion: reduce) { & { transition: none; } }
  @media (max-width: 360px) { & { padding: 1rem; gap: .75rem; } }
`);

export const CategoryNumberSpan = styled('span')(({ theme }) => `
  & { display: grid; place-items: center; width: 2.8rem; height: 2.8rem; flex-shrink: 0; background: ${theme.palette.action.hover}; color: ${theme.palette.primary.main}; border-radius: .8rem; font-size: .85rem; font-weight: 700; }
`);

export const CategoryCopySpan = styled('span')(({ theme }) => `
  & { min-width: 0; flex: 1; overflow-wrap: anywhere; }
  & strong { display: block; font-size: 1.1rem; }
  & > span { display: block; margin-top: .35rem; font-size: .8rem; color: ${theme.palette.text.secondary}; }
`);

export const CardArrowSpan = styled('span')`
  & { font-size: 1.3rem; }
`;

export const CategoryGridEventGridUl = styled('ul')`
  & { display: grid; gap: .85rem; list-style: none; padding: 0; margin: 0; }
  & li { min-width: 0; }
  @media (min-width: 680px) { & { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

export const CategoryCardEventCardLink = styled(Link)(({ theme }) => `
  & { display: flex; align-items: center; gap: 1rem; min-height: 104px; padding: 1.25rem; border: 1px solid ${theme.palette.divider}; border-radius: ${theme.shape.borderRadius}px; background: ${theme.palette.background.paper}; text-decoration: none; color: ${theme.palette.text.primary}; transition: border-color .15s, box-shadow .15s; }
  &:hover { border-color: ${theme.palette.primary.main}; box-shadow: 0 5px 20px #193f3710; }
  & { min-height: 112px; }
  @media (prefers-reduced-motion: reduce) { & { transition: none; } }
  @media (max-width: 360px) { & { padding: 1rem; gap: .75rem; } }
`);

export const ResultStatusSpan = styled('span', {
  shouldForwardProp,
})<{ published: boolean }>(({ published }) => `
  && { display: inline-block; width: fit-content; max-width: 100%; padding: .35rem .65rem; border-radius: 2rem; font-size: .75rem; font-weight: 650; line-height: 1.5; color: ${published ? '#14533e' : '#79531b'}; background: ${published ? '#e0f0e4' : '#faf0d9'}; }
`);

export const WinnerPositionsDiv = styled('div')`
  & { display: grid; gap: 1.25rem; }
`;

export const WinnerPositionSection = styled('section')(({ theme }) => `
  & { border: 1px solid ${theme.palette.divider}; border-radius: ${theme.shape.borderRadius}px; background: ${theme.palette.background.paper}; overflow: hidden; min-width: 0; }
`);

export const PositionHeadingDiv = styled('div', {
  shouldForwardProp,
})<{ position: number }>(({ theme, position }) => `
  & { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .65rem; padding: 1rem; background: ${theme.palette.action.hover}; }
  & h4 { display: flex; align-items: center; gap: .65rem; margin: 0; font-size: 1rem; }
  ${podiumColors[position] ? `& { background: ${podiumColors[position].background}; color: ${podiumColors[position].color}; }` : ''}
`);

export const PositionNumberSpan = styled('span')`
  & { display: grid; place-items: center; flex-shrink: 0; width: 2.25rem; height: 2.25rem; border: 1px solid currentColor; border-radius: 50%; font-weight: 750; }
`;

export const SharedLabelSpan = styled('span')`
  & { font-size: .75rem; font-weight: 600; }
`;

export const WinnerListUl = styled('ul')`
  & { list-style: none; padding: 0; margin: 0; }
`;

export const WinnerCardLi = styled('li')(({ theme }) => `
  & { padding: 1.25rem; overflow-wrap: anywhere; }
  & + & { border-top: 1px solid ${theme.palette.divider}; }
  & h5 { margin: 0; font-size: 1.2rem; line-height: 1.4; }
`);

export const WinnerAffiliationDl = styled('dl')(({ theme }) => `
  & { display: grid; gap: .75rem; margin: 0; }
  & dt { font-size: .72rem; color: ${theme.palette.text.secondary}; margin-bottom: .2rem; }
  & dd { margin: 0; font-size: .95rem; line-height: 1.5; }
  @media (min-width: 680px) { & { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`);

export const EventHeadingDiv = styled('div')`
  & { margin-block: 1.5rem; overflow-wrap: anywhere; }
  & h2 { margin-block: .5rem; font-size: clamp(1.6rem, 5vw, 2.2rem); letter-spacing: -.025em; }
`;

export const ResultStatusIsPublishedPublicationLabelP = styled('p')`
  & { display: inline-block; width: fit-content; max-width: 100%; padding: .35rem .65rem; border-radius: 2rem; font-size: .75rem; font-weight: 650; line-height: 1.5; color: #14533e; background: #e0f0e4; }
  & { margin-block: 0 1rem; }
`;

export const AdminWorkspaceDiv = styled('div')`
  & { min-height: 100dvh; display: grid; grid-template-columns: 15rem minmax(0, 1fr); }
  @media (max-width: 720px) { & { grid-template-columns: minmax(0, 1fr); } }
`;

export const SkipLinkA = styled('a')(({ theme }) => `
  & { position: fixed; top: -8rem; left: 1rem; z-index: 30; padding: 1rem; background: ${theme.palette.background.paper}; }
  &:focus { top: max(1rem, env(safe-area-inset-top)); }
`);

export const AdminSidebarAside = styled('aside')(({ theme }) => `
  & { padding: 2rem 1.25rem; background: ${theme.palette.text.primary}; color: white; }
  @media (max-width: 720px) { & { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .75rem; align-items: center; padding: 1rem; } }
`);

export const AdminBrandLink = styled(Link)`
  & { display: block; padding: .5rem; color: white; font-size: 1.8rem; font-weight: 750; text-decoration: none; letter-spacing: -.04em; }
  & span { display: block; margin-top: .5rem; color: #c5dbcf; font-size: .65rem; letter-spacing: .14em; }
  @media (max-width: 720px) { & { font-size: 1.5rem; } }
`;

export const AdminMenuToggleButtonSecondaryButton = styled(Button)(({ theme }) => `
  &:focus-visible { outline: 3px solid ${theme.palette.secondary.main}; outline-offset: 3px; }
  & { min-height: 2.8rem; padding: 0.65rem 1rem; border: 1px solid ${theme.palette.primary.main}; border-radius: 0.5rem; background: ${theme.palette.primary.main}; color: ${theme.palette.background.paper}; cursor: pointer; font: inherit; font-weight: 650; }
  &:hover:not(:disabled) { background: ${theme.palette.primary.dark}; }
  &:disabled { opacity: 0.65; cursor: wait; }
  & { background: transparent; color: ${theme.palette.primary.main}; }
  &:hover:not(:disabled) { color: ${theme.palette.background.paper}; }
  & { display: none; }
  @media (max-width: 720px) { & { display: block; color: white; border-color: #9bbcaf; } }
`);

export const AdminNavigationNav = styled('nav', {
  shouldForwardProp,
})<{ mobileOpen: boolean }>(({ mobileOpen }) => `
  display: grid; gap: .4rem; margin-top: 2.5rem;
  & a { display: flex; align-items: center; min-height: 48px; padding: .75rem; color: #e2ece6; border-radius: .6rem; text-decoration: none; font-size: .9rem; }
  & a:hover, & a[aria-current="page"] { background: #315a4f; color: white; }
  & a[aria-current="page"] { box-shadow: inset 3px 0 #e9d390; font-weight: 700; }
  @media (max-width: 720px) {
    display: ${mobileOpen ? 'grid' : 'none'}; grid-column: 1 / -1; margin-top: .5rem;
  }
`);

export const AdminPublicLinkLink = styled(Link)`
  && { margin-top: 2rem; border-top: 1px solid #507266; border-radius: 0; }
`;

export const AdminSidebarNoteP = styled('p')`
  & { padding: .75rem; margin-top: 4rem; color: #c5dbcf; font-size: .75rem; }
  @media (max-width: 720px) { & { display: none; } }
`;

export const AdminWorkspaceBodyDiv = styled('div')`
  & { min-width: 0; }
`;

export const AdminTopbarHeader = styled('header')(({ theme }) => `
  & { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.5rem clamp(1rem, 3vw, 3rem); background: ${theme.palette.background.paper}; border-bottom: 1px solid ${theme.palette.divider}; }
  & h1 { margin: .25rem 0; font-size: clamp(1.4rem, 4vw, 1.8rem); }
  @media (max-width: 720px) { & { padding-block: 1.25rem; } }
`);

export const AdminAccountDiv = styled('div')(({ theme }) => `
  & { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; min-width: 0; max-width: 100%; }
  & span { font-size: .75rem; color: ${theme.palette.text.secondary}; overflow-wrap: anywhere; min-width: 0; }
  & strong { color: ${theme.palette.text.primary}; font-weight: 600; }
  @media (max-width: 720px) { & { width: 100%; justify-content: space-between; } }
`);

export const DashboardMainMain = styled('main')`
  & { width: 100%; max-width: 80rem; padding: clamp(1rem, 3vw, 3rem); }
  &:focus { outline: none; }
`;

export const DashboardPanelAdminSelectionSection = styled('section')(({ theme }) => `
  & { min-width: 0; padding: clamp(1rem, 2.5vw, 1.75rem); margin-bottom: 1.25rem; border: 1px solid ${theme.palette.divider}; border-radius: ${theme.shape.borderRadius}px; background: ${theme.palette.background.paper}; overflow-wrap: anywhere; }
  & h2 { margin: 0 0 .5rem; font-size: 1.3rem; line-height: 1.35; }
  & p { color: ${theme.palette.text.secondary}; margin-block: .5rem; }
  & { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.5rem; background: ${theme.palette.action.hover}; }
  & p { font-size: .85rem; max-width: 45ch; }
  @media (max-width: 1000px) { & { grid-template-columns: minmax(0, 1fr); } }
`);

export const AdminPickerDiv = styled('div')(({ theme }) => `
  & { display: grid; align-content: center; gap: .5rem; min-width: 0; }
  & label { font-size: .8rem; }
  & select { width: 100%; min-width: 0; min-height: 48px; padding: .75rem; border: 1px solid #9caea5; border-radius: .65rem; color: ${theme.palette.text.primary}; background: ${theme.palette.background.paper}; font: inherit; text-overflow: ellipsis; }
  & select:focus-visible { outline: 3px solid ${theme.palette.secondary.main}; outline-offset: 3px; }
`);

export const PublicAppDiv = styled('div')(({ theme }) => `
  & { min-height: 100dvh; display: flex; flex-direction: column; color: ${theme.palette.text.primary}; }
  & { padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
`);

export const PublicHeaderHeader = styled('header')(({ theme }) => `
  & { width: min(100%, 68rem); margin-inline: auto; padding-inline: clamp(1rem, 4vw, 3rem); }
  & { padding-left: max(clamp(1rem, 4vw, 3rem), env(safe-area-inset-left)); padding-right: max(clamp(1rem, 4vw, 3rem), env(safe-area-inset-right)); }
  & { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding-block: 1.5rem; border-bottom: 1px solid ${theme.palette.divider}; }
  & { position: sticky; top: env(safe-area-inset-top); z-index: 10; padding-block: .75rem; background: #f4f7f3ed; backdrop-filter: blur(16px); }
`);

export const BrandLink = styled(Link)`
  & { display: block; flex: 0 1 clamp(5rem, 22vw, 7rem); min-width: 0; }
`;

export const BrandLogoImg = styled('img')`
  & { display: block; width: 100%; height: auto; }
`;

export const HeaderLogoImg = styled('img')`
  & { display: block; width: clamp(5rem, 22vw, 7rem); min-width: 0; height: auto; object-fit: contain; }
`;

export const PublicMainMain = styled('main')`
  & { width: min(100%, 68rem); margin-inline: auto; padding-inline: clamp(1rem, 4vw, 3rem); }
  & { padding-left: max(clamp(1rem, 4vw, 3rem), env(safe-area-inset-left)); padding-right: max(clamp(1rem, 4vw, 3rem), env(safe-area-inset-right)); }
  & { flex: 1; padding-block: 2rem 3.5rem; min-width: 0; }
  &:focus { outline: none; }
  & h1 { font-size: clamp(1.8rem, 6vw, 3rem); letter-spacing: -.045em; max-width: 23ch; }
  & h2 { font-size: clamp(1.35rem, 4vw, 1.8rem); letter-spacing: -.025em; overflow-wrap: anywhere; }
  @media (min-width: 680px) { & { padding-block: 2rem 4rem; } }
  @media (max-width: 679px) { & { padding-top: 1rem; } }
`;

export const PublicFooterFooter = styled('footer')(({ theme }) => `
  & { width: min(100%, 68rem); margin-inline: auto; padding-inline: clamp(1rem, 4vw, 3rem); }
  & { padding-left: max(clamp(1rem, 4vw, 3rem), env(safe-area-inset-left)); padding-right: max(clamp(1rem, 4vw, 3rem), env(safe-area-inset-right)); }
  & { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .5rem; padding-block: 1rem; border-top: 1px solid ${theme.palette.divider}; color: ${theme.palette.text.secondary}; font-size: .75rem; }
  & span { overflow-wrap: anywhere; }
  @media (max-width: 679px) { & { padding-bottom: calc(6.5rem + env(safe-area-inset-bottom)); } }
`);

export const AdminCompetitionListUl = styled('ul')(({ theme }) => `
  & { display: grid; gap: .75rem; padding: 0; margin-block: 1.5rem; list-style: none; }
  & li { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin: 0; }
  & li > div { flex: 1 1 14rem; min-width: 0; }
  & h3 { margin: 0; }
  & button { flex: 0 1 auto; }
  & button[aria-pressed="true"] { background: ${theme.palette.text.primary}; color: white; }
`);

export const DashboardPanelLi = styled('li')(({ theme }) => `
  & { min-width: 0; padding: clamp(1rem, 2.5vw, 1.75rem); margin-bottom: 1.25rem; border: 1px solid ${theme.palette.divider}; border-radius: ${theme.shape.borderRadius}px; background: ${theme.palette.background.paper}; overflow-wrap: anywhere; }
  & h2 { margin: 0 0 .5rem; font-size: 1.3rem; line-height: 1.35; }
  & p { color: ${theme.palette.text.secondary}; margin-block: .5rem; }
`);

export const LoginCardSection = styled('section')(({ theme }) => `
  & { width: 100%; padding: clamp(1.5rem, 5vw, 2.5rem); border: 1px solid #d5e1d8; border-radius: 1rem; background: ${theme.palette.background.paper}; box-shadow: 0 12px 40px rgb(24 60 54 / 8%); }
  & { max-width: 28rem; margin: 0 auto; }
  & h1 { font-size: clamp(2rem, 7vw, 3rem); }
  @media (max-width: 560px) { & button { width: 100%; } }
`);

export const AppForm = styled('form')`
  & { display: grid; gap: 0.65rem; margin-top: 1.5rem; }
`;

export const PublicBackLink = styled(Link)`
  & { display: inline-flex; align-items: center; min-height: 44px; margin-bottom: .8rem; padding: .4rem .75rem; border-radius: 14px; background: #eaf1eb; text-decoration: none; font-size: .8rem; font-weight: 650; }
  &:hover { background: #dfeae1; }
`;
