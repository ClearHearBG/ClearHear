import type { Theme } from '@react-navigation/native';

import type { ThemeMode } from '@/src/types/app';

export interface AppTheme {
  mode: ThemeMode;
  background: string;
  backgroundAlt: string;
  card: string;
  elevated: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  secondary: string;
  border: string;
  success: string;
  danger: string;
  shadow: string;
  tabBar: string;
  tabIconMuted: string;
  userBubble: string;
  assistantBubble: string;
  input: string;
  ring: string;
  overlay: string;
  progressTrack: string;
  statusBar: 'dark' | 'light';
  fonts: {
    display: string;
    displayBold: string;
    body: string;
    bodyMedium: string;
    bodySemiBold: string;
    bodyBold: string;
  };
}

const fonts = {
  display: 'Manrope_600SemiBold',
  displayBold: 'Manrope_700Bold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
};

export const themes: Record<ThemeMode, AppTheme> = {
  light: {
    mode: 'light',
    background: '#F4F8FC',
    backgroundAlt: '#E6EFF7',
    card: 'rgba(255, 255, 255, 0.92)',
    elevated: '#EAF2FB',
    text: '#102336',
    textMuted: '#617287',
    accent: '#1787FF',
    accentSoft: 'rgba(23, 135, 255, 0.12)',
    secondary: '#0DB39E',
    border: 'rgba(16, 35, 54, 0.08)',
    success: '#168B6D',
    danger: '#C95656',
    shadow: 'rgba(8, 24, 39, 0.12)',
    tabBar: 'rgba(255, 255, 255, 0.94)',
    tabIconMuted: '#7F90A3',
    userBubble: '#1787FF',
    assistantBubble: '#EFF5FC',
    input: '#F7FAFD',
    ring: 'rgba(23, 135, 255, 0.16)',
    overlay: 'rgba(7, 19, 31, 0.38)',
    progressTrack: 'rgba(16, 35, 54, 0.08)',
    statusBar: 'dark',
    fonts,
  },
  dark: {
    mode: 'dark',
    background: '#07131D',
    backgroundAlt: '#112231',
    card: 'rgba(13, 26, 38, 0.92)',
    elevated: '#122433',
    text: '#F2F7FC',
    textMuted: '#9BB0C5',
    accent: '#5AB1FF',
    accentSoft: 'rgba(90, 177, 255, 0.15)',
    secondary: '#4DD4B7',
    border: 'rgba(242, 247, 252, 0.08)',
    success: '#4DD4B7',
    danger: '#FF8F8F',
    shadow: 'rgba(0, 0, 0, 0.34)',
    tabBar: 'rgba(11, 21, 31, 0.94)',
    tabIconMuted: '#75889A',
    userBubble: '#2A8FFF',
    assistantBubble: '#122433',
    input: '#10212E',
    ring: 'rgba(90, 177, 255, 0.2)',
    overlay: 'rgba(4, 10, 16, 0.54)',
    progressTrack: 'rgba(242, 247, 252, 0.1)',
    statusBar: 'light',
    fonts,
  },
};

export function createNavigationTheme(theme: AppTheme): Theme {
  return {
    dark: theme.mode === 'dark',
    colors: {
      primary: theme.accent,
      background: theme.background,
      card: theme.card,
      text: theme.text,
      border: theme.border,
      notification: theme.secondary,
    },
    fonts: {
      regular: {
        fontFamily: theme.fonts.body,
        fontWeight: '400',
      },
      medium: {
        fontFamily: theme.fonts.bodyMedium,
        fontWeight: '500',
      },
      bold: {
        fontFamily: theme.fonts.bodyBold,
        fontWeight: '700',
      },
      heavy: {
        fontFamily: theme.fonts.displayBold,
        fontWeight: '700',
      },
    },
  };
}
