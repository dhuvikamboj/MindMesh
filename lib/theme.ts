/**
 * MindMesh design tokens.
 *
 * All screens should import from here. Hardcoded colors/spacings outside this
 * file mean the system has drifted.
 */

export const palette = {
  // Surfaces
  bg: '#F3F0E8',
  surface: '#FFFDF8',
  surfaceMuted: '#F5F2E8',
  border: '#E4E7EC',
  borderStrong: '#DED7C8',

  // Text
  text: '#101828',
  textMuted: '#475467',
  textSubtle: '#667085',
  textHint: '#98A2B3',

  // Brand
  accent: '#123524',
  accentOn: '#E8F0EB',
  accentSoft: '#DDF7ED',

  // Feedback
  danger: '#B42318',
  dangerSoft: '#FEE4E2',
  warning: '#B54708',
  warningSoft: '#FFF1CC',
  success: '#166534',
  successSoft: '#DDF7ED',

  // On-dark
  inverse: '#FFFFFF',
  inverseMuted: 'rgba(255,255,255,0.7)',
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const fontSize = {
  xs: 11,
  sm: 12,
  md: 13,
  body: 15,
  lg: 18,
  xl: 22,
  display: 28,
};

export const fontWeight = {
  regular: '500',
  semi: '600',
  bold: '700',
  black: '800',
} as const;

export const shadow = {
  card: {
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
};
