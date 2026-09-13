'use client';

import { useEffect, useState } from 'react';

import {
  THEME_PALETTE_STORAGE_KEY,
  clearStoredThemePalette,
  createThemeCssVariables,
  loadStoredThemePalette,
  saveStoredThemePalette,
  type ThemePalette,
} from '@/lib/theme-palette';
import { Button, EmptyState, Picker } from '@/components/ui';

interface ThemePreset {
  id: string;
  label: string;
  primary: string;
  secondary: string;
  highlight: string;
  textAccent: string;
}

/** Quiet accents that suit the kit — one flat hue each, no gradients. */
const PRESETS: ThemePreset[] = [
  { id: 'indigo', label: 'Quiet Indigo', primary: '#8b93f8', secondary: '#6d6df2', highlight: '#a5b0ff', textAccent: '#a5b0ff' },
  { id: 'moss', label: 'Moss', primary: '#7fb08a', secondary: '#5d8f6a', highlight: '#9ccba6', textAccent: '#9ccba6' },
  { id: 'amber', label: 'Amber', primary: '#d9a45b', secondary: '#b98542', highlight: '#eec084', textAccent: '#eec084' },
  { id: 'rose', label: 'Rose', primary: '#d97f8f', secondary: '#b45f6f', highlight: '#eda3b1', textAccent: '#eda3b1' },
  { id: 'sky', label: 'Sky', primary: '#6fa8d9', secondary: '#5288b8', highlight: '#93c2e8', textAccent: '#93c2e8' },
];

function applyPalette(palette: ThemePalette): void {
  const vars = createThemeCssVariables(palette);
  if (!vars) return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
}

/**
 * Theme accents for the rebuilt UI. Same storage key and variable map
 * as the original, so a palette chosen here also repaints the old
 * player and vice versa. The kit reads the shared vars, so accents
 * apply live with no per-component theme props.
 */
export function useThemeAccent() {
  const [presetId, setPresetId] = useState<string>(() => {
    try {
      const loaded = loadStoredThemePalette();
      const match = PRESETS.find((p) => p.primary.toLowerCase() === loaded.palette.colors.primary.toLowerCase());
      return match?.id ?? 'custom';
    } catch {
      return 'indigo';
    }
  });

  useEffect(() => {
    try {
      applyPalette(loadStoredThemePalette().palette);
    } catch {
      /* private mode: default palette stands */
    }
  }, []);

  const applyPreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const loaded = loadStoredThemePalette();
    const next: ThemePalette = {
      ...loaded.palette,
      id: `v2-${preset.id}`,
      name: preset.label,
      colors: {
        ...loaded.palette.colors,
        primary: preset.primary,
        secondary: preset.secondary,
        highlight: preset.highlight,
        textAccent: preset.textAccent,
      },
    };
    saveStoredThemePalette(next);
    applyPalette(next);
    setPresetId(id);
  };

  const reset = () => {
    clearStoredThemePalette();
    const loaded = loadStoredThemePalette();
    applyPalette(loaded.palette);
    setPresetId('indigo');
  };

  return { presetId, applyPreset, reset, storageKey: THEME_PALETTE_STORAGE_KEY };
}

export function ThemeView({ hook }: { hook: ReturnType<typeof useThemeAccent> }) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Picker
        label="Accent"
        options={PRESETS.map((p) => ({ value: p.id, label: p.label }))}
        value={hook.presetId}
        onChange={hook.applyPreset}
      />
      <div>
        <Button variant="ghost" onClick={hook.reset}>
          Reset to default
        </Button>
      </div>
      <EmptyState message="The accent repaints every surface at once — the kit reads the same theme variables everywhere." />
    </div>
  );
}
