'use client';

import { useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';

import { createThemeCssVariables, loadStoredThemePalette } from '@/lib/theme-palette';

import {
  ACCENT_THEME_VARS,
  ARTWORK_RADIUS,
  isAccentThemeId,
  isArtworkShapeId,
  isVisualSurfaceId,
  SURFACE_THEME_VARS,
} from '../../theme-presets';
import { PortalContext } from '../primitives';
import theme from '../theme.module.css';
import s from './watch.module.css';

const THEME_KEYS = [
  'spice_accent_theme',
  'spice_visual_surface',
  'spice_artwork_shape',
  'spice_motion_level',
  'spice_custom_theme_enabled',
  'spice_custom_theme_palette',
];

function readThemeSnapshot(): string {
  try {
    return THEME_KEYS.map((key) => localStorage.getItem(key) ?? '').join('\u0000');
  } catch {
    return '';
  }
}

function subscribeTheme(onChange: () => void) {
  // Settings changes in the music player (another tab) arrive as storage events.
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

function themeFromSnapshot(snapshot: string) {
  const [accent, surface, artwork, motion, customEnabled] = snapshot.split('\u0000');
  const vars: Record<string, string> = {
    ...ACCENT_THEME_VARS[isAccentThemeId(accent) ? accent : 'pink'],
  };
  const surfaceId = isVisualSurfaceId(surface) ? surface : 'midnight';
  for (const [name, value] of Object.entries(SURFACE_THEME_VARS[surfaceId])) {
    if (name.startsWith('--')) vars[name] = value;
  }
  if (customEnabled === 'true') {
    const palette = createThemeCssVariables(loadStoredThemePalette().palette);
    if (palette) Object.assign(vars, palette);
  }
  vars['--spice-art-radius'] = ARTWORK_RADIUS[isArtworkShapeId(artwork) ? artwork : 'rounded'];
  return { vars, surface: surfaceId, motion: motion === 'off' || motion === 'calm' ? motion : 'full' };
}

/**
 * Themed root for Spice Movies in the new interface. Applies the same accent,
 * surface, custom palette, artwork shape, and motion the music player stores
 * (same origin), follows changes made in another tab, and hosts the portal
 * that popovers and dialogs render into.
 */
export function WatchHost({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribeTheme, readThemeSnapshot, () => '');
  const [portalNode, setPortalNode] = useState<HTMLDivElement | null>(null);
  const { vars, surface, motion } = themeFromSnapshot(snapshot);
  return (
    <PortalContext.Provider value={portalNode}>
      <div className={theme.host} style={vars as CSSProperties}>
        <div className={`${theme.root} ${s.root}`} data-surface={surface} data-motion={motion}>
          {children}
          <div ref={setPortalNode} className={theme.portal} />
        </div>
      </div>
    </PortalContext.Provider>
  );
}
