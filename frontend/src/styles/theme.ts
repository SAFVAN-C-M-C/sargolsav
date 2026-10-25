import { createTheme } from '@mui/material/styles';
import { baselineStyles } from './baseline';

export const theme = createTheme({
  palette: {
    primary: { main: '#176b59', dark: '#105240' },
    secondary: { main: '#a5680b' },
    error: { main: '#a32929', dark: '#7b1d1d' },
    background: { default: '#f4f7f3', paper: '#ffffff' },
    text: { primary: '#193f37', secondary: '#576b63' },
    divider: '#d7e2db',
    action: { hover: '#eaf1eb' },
  },
  typography: {
    fontFamily: 'system-ui, sans-serif',
    body1: { lineHeight: 'normal', letterSpacing: 'normal' },
    button: { textTransform: 'none', fontWeight: 650 },
  },
  shape: { borderRadius: 20 },
  components: {
    MuiCssBaseline: { styleOverrides: baselineStyles },
    MuiButton: {
      defaultProps: { disableElevation: true, variant: 'contained' },
      styleOverrides: {
        root: { lineHeight: 'normal', letterSpacing: 'normal' },
      },
    },
  },
});
