import React, {
  createContext,
  useContext,
  ReactNode,
} from 'react';
import {
  Dimensions,
  Platform,
} from 'react-native';

/* =========================================================
   COLORS
   ========================================================= */

export const COLORS = {
  primary: '#DC2626',
  secondary: '#2563EB',
  success: '#16A34A',
  warning: '#D97706',
  info: '#0284C7',
  pink: '#DB2777',

  ink: '#111827',
  body: '#374151',
  muted: '#6B7280',
  faint: '#9CA3AF',

  background: '#F8FAFC',
  surface: '#FFFFFF',

  border: '#D1D5DB',
  borderSoft: '#E5E7EB',
  borderFaint: '#F1F5F9',

  primarySoft: '#FEF2F2',
  primarySoftBorder: '#FECACA',

  secondarySoft: '#EFF6FF',
  secondarySoftBorder: '#BFDBFE',

  successSoft: '#F0FDF4',
  successSoftBorder: '#BBF7D0',

  warningSoft: '#FFFBEB',
  warningSoftBorder: '#FDE68A',

  infoSoft: '#F0F9FF',
  infoSoftBorder: '#BAE6FD',

  pinkSoft: '#FDF2F8',
  pinkSoftBorder: '#FBCFE8',

  overlay: 'rgba(15, 23, 42, 0.55)',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;


/* =========================================================
   SPACING
   ========================================================= */

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;


/* =========================================================
   BORDER RADIUS
   ========================================================= */

export const RADIUS = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;


/* =========================================================
   FONT SIZES
   ========================================================= */

export const FONT = {
  micro: 9,
  tiny: 11,
  small: 13,
  body: 14,
  h3: 16,
  h2: 18,
  h1: 22,
} as const;


/* =========================================================
   TOUCH TARGET
   ========================================================= */

export const TOUCH_TARGET = 44;


/* =========================================================
   DEVICE SIZE
   ========================================================= */

const {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
} = Dimensions.get('window');

export const isSmallDevice = SCREEN_WIDTH < 380;

export { SCREEN_WIDTH, SCREEN_HEIGHT };


/* =========================================================
   SHADOWS
   ========================================================= */

export const SHADOW = {
  card: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.06,
      shadowRadius: 6,
    },

    android: {
      elevation: 2,
    },

    default: {},
  }),

  button: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity: 0.12,
      shadowRadius: 5,
    },

    android: {
      elevation: 3,
    },

    default: {},
  }),

  raised: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: {
        width: 0,
        height: 8,
      },
      shadowOpacity: 0.18,
      shadowRadius: 16,
    },

    android: {
      elevation: 8,
    },

    default: {},
  }),
} as const;


/* =========================================================
   THEME OBJECT
   ========================================================= */

export const THEME = {
  colors: COLORS,
  spacing: SPACING,
  radius: RADIUS,
  font: FONT,
  shadow: SHADOW,
  touchTarget: TOUCH_TARGET,
} as const;


/* =========================================================
   THEME CONTEXT
   ========================================================= */

type ThemeContextType = {
  theme: typeof THEME;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: THEME,
});


/* =========================================================
   THEME PROVIDER
   ========================================================= */

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({
  children,
}: ThemeProviderProps) => {
  return (
    <ThemeContext.Provider value={{ theme: THEME }}>
      {children}
    </ThemeContext.Provider>
  );
};


/* =========================================================
   USE THEME HOOK
   ========================================================= */

export const useTheme = () => {
  return useContext(ThemeContext);
};


/* =========================================================
   DEFAULT EXPORT
   ========================================================= */

export default THEME;