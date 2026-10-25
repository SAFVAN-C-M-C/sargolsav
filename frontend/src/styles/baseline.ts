// Document defaults; component styling belongs in MUI styled() or sx.
import type { CSSObject, Theme } from '@mui/material/styles';

export const baselineStyles = (theme: Theme): CSSObject => ({
  html: { fontSynthesis: 'none', textRendering: 'optimizeLegibility', WebkitFontSmoothing: 'antialiased' },
  main: { width: 'min(100%, 48rem)', margin: '0 auto', padding: '4rem 1.25rem' },
  h1: {
    margin: '0.5rem 0 1rem', fontSize: 'clamp(2.5rem, 10vw, 4.5rem)',
    lineHeight: 1.1, overflowWrap: 'anywhere',
  },
  p: { lineHeight: 1.6 },
  a: { color: theme.palette.primary.main },
  'a:focus-visible': { outline: `3px solid ${theme.palette.secondary.main}`, outlineOffset: 3 },
  '@media (max-width: 560px)': { main: { padding: '2rem 1rem' } },
});
