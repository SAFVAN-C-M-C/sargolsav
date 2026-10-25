import SvgIcon from '@mui/material/SvgIcon';
import type { SvgIconProps } from '@mui/material/SvgIcon';

const paths = {
  results: 'M8 4H6a2 2 0 0 0-2 2v14h16V6a2 2 0 0 0-2-2h-2M9 3h6v4H9zM8 11h8M8 15h5',
  standings: 'M4 20h16M6 16v-5h4v9M10 11V5h4v15M14 14h4v6',
  chevron: 'm8 10 4 4 4-4',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  refresh: 'M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17',
  categories: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
};

export function PublicIcon({ name, ...props }: { name: keyof typeof paths } & SvgIconProps) {
  return <SvgIcon {...props}><path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></SvgIcon>;
}
