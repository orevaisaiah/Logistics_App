import { useColorScheme } from 'react-native'

const light = {
  bg: '#f4f7f6',
  surface: '#ffffff',
  text: '#14211f',
  muted: '#5b6b68',
  border: '#dbe3e1',
  primary: '#0f766e',
  primaryText: '#ffffff',
  danger: '#b42318',
  dangerBg: '#fdecea',
  warning: '#92580b',
  warningBg: '#fff4de',
  success: '#166534',
  successBg: '#e3f6e8',
  info: '#1d4f91',
  infoBg: '#e5effc',
  neutralBg: '#eceff0',
}

const dark: typeof light = {
  bg: '#0e1514',
  surface: '#162120',
  text: '#e8efee',
  muted: '#9db0ac',
  border: '#28403c',
  primary: '#2dd4bf',
  primaryText: '#06201d',
  danger: '#ff8a7a',
  dangerBg: '#3a1d1a',
  warning: '#f5c26b',
  warningBg: '#3a2c12',
  success: '#7ee2a0',
  successBg: '#14301e',
  info: '#8fb8f0',
  infoBg: '#14263d',
  neutralBg: '#223230',
}

export type Theme = typeof light
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light
}

export function toneColors(theme: Theme, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'info':
      return { fg: theme.info, bg: theme.infoBg }
    case 'success':
      return { fg: theme.success, bg: theme.successBg }
    case 'warning':
      return { fg: theme.warning, bg: theme.warningBg }
    case 'danger':
      return { fg: theme.danger, bg: theme.dangerBg }
    default:
      return { fg: theme.muted, bg: theme.neutralBg }
  }
}
