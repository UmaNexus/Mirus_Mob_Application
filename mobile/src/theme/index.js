/**
 * Design tokens — deliberately mirror the EXISTING live HRMS web app's brand
 * (client/src/config/brand.js, tailwind.config.js), not the mobile demo's
 * navy/orange scheme. Per client decision: visual consistency with the
 * already-shipped product wins over matching the demo file.
 */
export const colors = {
  primary: '#E89000', // brand orange
  primaryDark: '#B36D00',
  primarySoft: '#FFF3E0',

  ink: '#2D2D2D', // primary text
  muted: '#707070', // secondary text / logo grey
  sidebar: '#3F3F3F',
  sidebarActive: '#E89000',

  surface: '#F5F5F5', // app background
  card: '#FFFFFF',
  line: '#E0E0E0', // borders

  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#0EA5E9',
  infoSoft: '#E0F2FE',

  white: '#FFFFFF'
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radii = { sm: 6, md: 10, lg: 14, pill: 999 };

export const typography = {
  // Inter is the web app's font; RN falls back to the platform system font
  // unless the app bundles the Inter font family (left as a follow-up —
  // do not add a heavy font-loading dependency to the foundation commit).
  title: { fontSize: 18, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 13, fontWeight: '500', color: colors.muted },
  body: { fontSize: 14, fontWeight: '400', color: colors.ink },
  label: { fontSize: 11, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  button: { fontSize: 15, fontWeight: '700' }
};

/**
 * One consistent icon-sizing scale (lucide-react-native) so the app never
 * mixes a 14px icon on one screen with a 28px icon on another. Pick the key
 * matching the icon's role, not an arbitrary number.
 */
export const iconSizes = {
  tabBar: 22, // bottom navigation
  header: 20, // header/standalone action icons
  button: 18, // icon inside a primary/outline button
  card: 16, // card metadata (doctor phone, area, etc.)
  action: 16, // small icon-only row actions (edit/remove/reassign)
  badge: 12 // inside a small status pill
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2
  }
};
