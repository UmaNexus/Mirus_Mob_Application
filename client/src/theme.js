import { createTheme } from '@mui/material/styles';

// MUI theme mirrors the Tailwind orange + grey tokens (logo: #E89000 / #707070).
const theme = createTheme({
  palette: {
    primary: { main: '#E89000', dark: '#C27800', light: '#FFC266', contrastText: '#ffffff' },
    secondary: { main: '#707070' },
    success: { main: '#16A34A' },
    warning: { main: '#D97706' },
    error: { main: '#DC2626' },
    text: { primary: '#2D2D2D', secondary: '#707070' },
    background: { default: '#F5F5F5', paper: '#FFFFFF' },
    divider: '#E0E0E0'
  },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 }
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: '#3F3F3F', fontSize: 12 } } }
  }
});

export default theme;
