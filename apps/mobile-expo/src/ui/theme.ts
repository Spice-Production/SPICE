import { createContext, useContext } from 'react';

import { ACCENT_THEMES, type AccentTheme, type SurfaceTheme } from '../core/models';

// Mobile counterpart of the web UI v2 tokens (apps/backend/app/ui-v2/theme.module.css):
// neutral surfaces, the listener's accent used sparingly, Geist type, 8px radii.

export type Theme = {
  dark: boolean;
  accentId: AccentTheme;
  bg: string;
  surface: string;
  elevated: string;
  hover: string;
  active: string;
  border: string;
  borderStrong: string;
  input: string;
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  onAccent: string;
  inverse: string;
  onInverse: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  overlay: string;
  radius: { sm: number; md: number; lg: number; xl: number; full: number };
  font: { regular: string; medium: string; semibold: string; bold: string; mono: string };
  text: { xxs: number; xs: number; sm: number; base: number; lg: number; xl: number; xxl: number; xxxl: number };
};

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const parsed = Number.parseInt(full, 16);
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function accentColor(id: AccentTheme): string {
  return ACCENT_THEMES.find((theme) => theme.id === id)?.color ?? '#7c3aed';
}

const shared = {
  radius: { sm: 6, md: 8, lg: 12, xl: 16, full: 9999 },
  font: {
    regular: 'Geist_400Regular',
    medium: 'Geist_500Medium',
    semibold: 'Geist_600SemiBold',
    bold: 'Geist_700Bold',
    mono: 'monospace',
  },
  text: { xxs: 11, xs: 12, sm: 13, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 30 },
  danger: '#ef4444',
  dangerSoft: 'rgba(239, 68, 68, 0.12)',
  success: '#22c55e',
  successSoft: 'rgba(34, 197, 94, 0.12)',
  warning: '#f59e0b',
  warningSoft: 'rgba(245, 158, 11, 0.12)',
  onAccent: '#ffffff',
};

export function buildTheme(accentId: AccentTheme, surface: SurfaceTheme): Theme {
  const accent = accentColor(accentId);
  if (surface === 'Daylight') {
    return {
      ...shared,
      dark: false,
      accentId,
      bg: '#f7f5fa',
      surface: '#ffffff',
      elevated: '#ffffff',
      hover: '#ece8f1',
      active: '#e4deea',
      border: 'rgba(32, 24, 45, 0.14)',
      borderStrong: 'rgba(25, 21, 31, 0.22)',
      input: 'rgba(25, 21, 31, 0.16)',
      fg: '#19151f',
      fgMuted: '#625b6b',
      fgSubtle: 'rgba(98, 91, 107, 0.75)',
      accent,
      accentSoft: withAlpha(accent, 0.12),
      accentText: accent,
      inverse: '#19151f',
      onInverse: '#ffffff',
      overlay: 'rgba(15, 12, 20, 0.4)',
    };
  }
  return {
    ...shared,
    dark: true,
    accentId,
    bg: '#000000',
    surface: '#0a0a0a',
    elevated: '#111113',
    hover: '#151515',
    active: '#1c1c1f',
    border: 'rgba(255, 255, 255, 0.08)',
    borderStrong: 'rgba(250, 250, 250, 0.16)',
    input: 'rgba(250, 250, 250, 0.14)',
    fg: '#fafafa',
    fgMuted: '#a1a1aa',
    fgSubtle: 'rgba(161, 161, 170, 0.72)',
    accent,
    accentSoft: withAlpha(accent, 0.16),
    accentText: accent,
    inverse: '#fafafa',
    onInverse: '#09090b',
    overlay: 'rgba(0, 0, 0, 0.6)',
  };
}

export const ThemeContext = createContext<Theme>(buildTheme('MidnightVelvet', 'Midnight'));

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
