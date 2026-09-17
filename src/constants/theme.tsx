import React, {
  createContext,
  useContext,
  ReactNode,
} from 'react';
import {
  Dimensions,
  Platform,
} from 'react-native';


export const COLORS = {
  
  background: '#F6F6F9',
  surface: '#FFFFFF',
  surfaceSoft: '#FBFBFD',
  surfaceSunken: '#F1F2F6',

  border: '#E8E9EF',
  borderSoft: '#E8E9EF',
  borderFaint: '#F0F1F5',
  borderStrong: '#DBDDE6',

  ink: '#0D0F16',
  body: '#181B24',
  muted: '#6B7280',
  faint: '#9AA0AC',

  // Main brand
  primary: '#B3122A',
  primaryBright: '#D2263F',
  primaryDeep: '#7A0C1D',
  primarySoft: '#FBEEEF',
  primaryTint: '#F3D6D9',

  // Secondary
  secondary: '#181B24',
  secondarySoft: '#F1F2F6',

  // Status colors — keep semantic colors
  success: '#059669',
  successSoft: '#ECFDF5',
  successSoftBorder: '#A7F3D0',

  warning: '#C7A466',
  warningSoft: '#FFF8E7',

  info: '#2563EB',
  infoSoft: '#EFF6FF',

  pink: '#DB2777',
  pinkSoft: '#FCE7F3',

  overlay: 'rgba(13,15,22,0.48)',

  primarySoftBorder: '#FECACA',

  secondarySoftBorder: '#BFDBFE',


  warningSoftBorder: '#FDE68A',

  infoSoftBorder: '#BAE6FD',

  pinkSoftBorder: '#FBCFE8',


  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;



export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;


export const RADIUS = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;



export const FONT = {
  micro: 9,
  tiny: 11,
  small: 13,
  body: 14,
  h3: 16,
  h2: 18,
  h1: 22,
} as const;



export const TOUCH_TARGET = 44;



const {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
} = Dimensions.get('window');

export const isSmallDevice = SCREEN_WIDTH < 380;

export { SCREEN_WIDTH, SCREEN_HEIGHT };



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


export const THEME = {
  colors: COLORS,
  spacing: SPACING,
  radius: RADIUS,
  font: FONT,
  shadow: SHADOW,
  touchTarget: TOUCH_TARGET,
} as const;


type ThemeContextType = {
  theme: typeof THEME;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: THEME,
});



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


export const useTheme = () => {
  return useContext(ThemeContext);
};



export default THEME;