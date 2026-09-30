/**
 * Shared SPICE theme presets: accent colors, visual surfaces, and artwork
 * shapes. The music player writes these as :root variables; Spice Movies
 * applies the same values to its own tree so both follow one theme.
 */

export type AccentThemeId = 'pink' | 'blue' | 'orange' | 'green' | 'gold' | 'crimson' | 'deeppurple';
export type VisualSurfaceId = 'midnight' | 'glass' | 'solid' | 'aurora' | 'daylight';
export type ArtworkShapeId = 'rounded' | 'soft' | 'circle';

export const ACCENT_THEME_VARS: Record<AccentThemeId, Record<string, string>> = {
  pink: {
    '--accent-pink': '#ec4899',
    '--accent-pink-rgb': '236, 72, 153',
    '--accent-purple': '#a855f7',
    '--accent-violet': '#a855f7',
    '--accent-cyan': '#ec4899',
    '--accent-gradient': 'linear-gradient(135deg, #a855f7, #ec4899)',
    '--text-accent': '#f9a8d4',
  },
  blue: {
    '--accent-pink': '#3b82f6',
    '--accent-pink-rgb': '59, 130, 246',
    '--accent-purple': '#06b6d4',
    '--accent-violet': '#3b82f6',
    '--accent-cyan': '#06b6d4',
    '--accent-gradient': 'linear-gradient(135deg, #06b6d4, #3b82f6)',
    '--text-accent': '#93c5fd',
  },
  orange: {
    '--accent-pink': '#f97316',
    '--accent-pink-rgb': '249, 115, 22',
    '--accent-purple': '#ef4444',
    '--accent-violet': '#f97316',
    '--accent-cyan': '#ef4444',
    '--accent-gradient': 'linear-gradient(135deg, #f97316, #ef4444)',
    '--text-accent': '#fdba74',
  },
  green: {
    '--accent-pink': '#10b981',
    '--accent-pink-rgb': '16, 185, 129',
    '--accent-purple': '#059669',
    '--accent-violet': '#10b981',
    '--accent-cyan': '#059669',
    '--accent-gradient': 'linear-gradient(135deg, #10b981, #059669)',
    '--text-accent': '#6ee7b7',
  },
  gold: {
    '--accent-pink': '#f59e0b',
    '--accent-pink-rgb': '245, 158, 11',
    '--accent-purple': '#d97706',
    '--accent-violet': '#f59e0b',
    '--accent-cyan': '#d97706',
    '--accent-gradient': 'linear-gradient(135deg, #f59e0b, #d97706)',
    '--text-accent': '#fcd34d',
  },
  crimson: {
    '--accent-pink': '#ff003c',
    '--accent-pink-rgb': '255, 0, 60',
    '--accent-purple': '#990011',
    '--accent-violet': '#ff003c',
    '--accent-cyan': '#ff3366',
    '--accent-gradient': 'linear-gradient(135deg, #ff003c, #990011)',
    '--text-accent': '#ffa3b1',
  },
  deeppurple: {
    '--accent-pink': '#7c3aed',
    '--accent-pink-rgb': '124, 58, 237',
    '--accent-purple': '#4c1d95',
    '--accent-violet': '#7c3aed',
    '--accent-cyan': '#3b0764',
    '--accent-gradient': 'linear-gradient(135deg, #4c1d95, #120024)',
    '--text-accent': '#c084fc',
  },
};

export const SURFACE_THEME_VARS: Record<VisualSurfaceId, Record<string, string>> = {
  midnight: {
    '--body-bg': '#000000',
    '--card-bg': 'rgba(10, 10, 10, 0.92)',
    '--border-color': 'rgba(255, 255, 255, 0.08)',
    '--bg-primary': '#000000',
    '--bg-surface': '#0a0a0a',
    '--bg-surface-hover': '#151515',
    '--bg-glass': 'rgba(8, 8, 10, 0.9)',
    '--spice-app-background': '#000000',
    '--spice-panel-filter': 'blur(20px)',
  },
  glass: {
    '--body-bg': '#050507',
    '--card-bg': 'rgba(17, 17, 24, 0.68)',
    '--border-color': 'rgba(255, 255, 255, 0.12)',
    '--bg-primary': '#050507',
    '--bg-surface': 'rgba(14, 14, 18, 0.78)',
    '--bg-surface-hover': 'rgba(34, 34, 42, 0.82)',
    '--bg-glass': 'rgba(12, 12, 18, 0.72)',
    '--spice-app-background': 'radial-gradient(circle at 12% 8%, rgba(var(--accent-pink-rgb), 0.16), transparent 32%), #050507',
    '--spice-panel-filter': 'blur(24px)',
  },
  solid: {
    '--body-bg': '#050505',
    '--card-bg': '#111113',
    '--border-color': 'rgba(255, 255, 255, 0.1)',
    '--bg-primary': '#050505',
    '--bg-surface': '#111113',
    '--bg-surface-hover': '#1b1b1f',
    '--bg-glass': '#0d0d10',
    '--spice-app-background': '#050505',
    '--spice-panel-filter': 'none',
  },
  aurora: {
    '--body-bg': '#030305',
    '--card-bg': 'rgba(14, 12, 22, 0.78)',
    '--border-color': 'rgba(var(--accent-pink-rgb), 0.16)',
    '--bg-primary': '#030305',
    '--bg-surface': 'rgba(12, 10, 18, 0.9)',
    '--bg-surface-hover': 'rgba(35, 26, 48, 0.9)',
    '--bg-glass': 'rgba(9, 8, 16, 0.78)',
    '--spice-app-background': 'radial-gradient(circle at 16% 10%, rgba(var(--accent-pink-rgb), 0.22), transparent 28%), radial-gradient(circle at 86% 20%, rgba(168, 85, 247, 0.16), transparent 34%), #030305',
    '--spice-panel-filter': 'blur(24px)',
  },
  daylight: {
    'color-scheme': 'light',
    '--body-bg': '#f5f3f8',
    '--card-bg': 'rgba(255, 255, 255, 0.94)',
    '--border-color': 'rgba(32, 24, 45, 0.14)',
    '--bg-primary': '#f7f5fa',
    '--bg-surface': '#ffffff',
    '--bg-surface-hover': '#ece8f1',
    '--bg-surface-active': '#e4deea',
    '--bg-glass': 'rgba(255, 255, 255, 0.86)',
    '--bg-glass-hover': 'rgba(255, 255, 255, 0.96)',
    '--text-primary': '#19151f',
    '--text-secondary': '#625b6b',
    '--text-muted': '#8b8394',
    '--border-subtle': 'rgba(32, 24, 45, 0.11)',
    '--border-glass': 'rgba(32, 24, 45, 0.12)',
    '--spice-app-background': 'radial-gradient(circle at 16% 8%, rgba(var(--accent-pink-rgb), 0.1), transparent 30%), #f7f5fa',
    '--spice-panel-filter': 'blur(22px)',
  },
};

export const ARTWORK_RADIUS: Record<ArtworkShapeId, string> = {
  rounded: '10px',
  soft: '18px',
  circle: '9999px',
};

export function isAccentThemeId(value: string | null | undefined): value is AccentThemeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ACCENT_THEME_VARS, value);
}

export function isVisualSurfaceId(value: string | null | undefined): value is VisualSurfaceId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SURFACE_THEME_VARS, value);
}

export function isArtworkShapeId(value: string | null | undefined): value is ArtworkShapeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ARTWORK_RADIUS, value);
}

/** `name: value;` lines, optionally `!important` (the player's accent block uses it). */
export function cssDeclarations(vars: Record<string, string>, important = false): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}: ${value}${important ? ' !important' : ''};`)
    .join('\n');
}
