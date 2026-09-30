'use client';

/**
 * v2 rebuild of app/theme-editor.tsx (+ theme-color-picker.tsx). Same props
 * and behavior as the classic editor — palette validation, JSON import and
 * export, and the default-purple reset all go through the shared, pure
 * lib/theme-palette helpers so a palette saved here loads identically in the
 * classic interface.
 */

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  clearStoredThemePalette,
  DEFAULT_PURPLE_PALETTE,
  exportThemePaletteJson,
  importThemePaletteJson,
  saveStoredThemePalette,
  THEME_COLOR_KEYS,
  THEME_PALETTE_MAX_JSON_LENGTH,
  type ThemeColorKey,
  type ThemePalette,
} from '@/lib/theme-palette';
import { parseThemeColor, themeHsvaToCss, type ThemeHsvaColor } from '@/app/theme-color-picker-core';

import { Icon } from '../../icons';
import { Button, Field, Input, Popover, Switch, cn, type TriggerProps } from '../../primitives';
import s from './settings.module.css';

interface ThemeEditorProps {
  palette: ThemePalette;
  enabled: boolean;
  onApply: (palette: ThemePalette) => void;
  onEnabledChange: (enabled: boolean) => void;
}

const COLOR_LABELS: Record<ThemeColorKey, string> = {
  primary: 'Primary accent',
  secondary: 'Secondary accent',
  highlight: 'Highlight',
  textAccent: 'Accent text',
  background: 'App background',
  surface: 'Cards and surfaces',
  surfaceHover: 'Hover surface',
  glass: 'Glass surface',
  border: 'Borders',
};

const PICKER_WIDTH = 248;
const FALLBACK_COLOR: ThemeHsvaColor = { hue: 270, saturation: 0.65, value: 0.95, alpha: 1 };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const clonePalette = (palette: ThemePalette): ThemePalette => ({
  ...palette,
  colors: { ...palette.colors },
});

function ColorSpectrumPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const spectrumRef = useRef<HTMLDivElement>(null);
  const color = useMemo(() => parseThemeColor(value) ?? FALLBACK_COLOR, [value]);
  const commit = (next: ThemeHsvaColor) => onChange(themeHsvaToCss(next));
  // The popover renders in a portal, so move focus in for keyboard users (arrow keys adjust the
  // color). Deferred a frame: the panel stays hidden until it has been positioned.
  useEffect(() => {
    const frame = requestAnimationFrame(() => spectrumRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const updateSpectrum = (element: HTMLDivElement, clientX: number, clientY: number) => {
    const bounds = element.getBoundingClientRect();
    commit({
      ...color,
      saturation: clamp01((clientX - bounds.left) / bounds.width),
      value: clamp01(1 - (clientY - bounds.top) / bounds.height),
    });
  };
  return (
    <div className={s.picker}>
      <div
        ref={spectrumRef}
        className={s.pickerSpectrum}
        style={{ ['--hue' as string]: `hsl(${color.hue} 100% 50%)` } as CSSProperties}
        role="slider"
        tabIndex={0}
        aria-label={`${label} saturation and brightness`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(color.value * 100)}
        aria-valuetext={`${Math.round(color.saturation * 100)}% saturation, ${Math.round(color.value * 100)}% brightness`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateSpectrum(event.currentTarget, event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updateSpectrum(event.currentTarget, event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.1 : 0.02;
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          commit({
            ...color,
            saturation: clamp01(color.saturation + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0)),
            value: clamp01(color.value + (event.key === 'ArrowDown' ? -step : event.key === 'ArrowUp' ? step : 0)),
          });
        }}
      >
        <span className={s.pickerCursor} style={{ left: `${color.saturation * 100}%`, top: `${(1 - color.value) * 100}%`, ['--swatch' as string]: value } as CSSProperties} />
      </div>

      <div className={s.pickerControl}>
        <div className={s.pickerLabel}>
          <span>Hue</span>
        </div>
        <input
          type="range"
          className={cn(s.pickerRange, s.pickerHue)}
          min={0}
          max={359}
          value={Math.round(color.hue)}
          aria-label={`${label} hue`}
          onChange={(event) => commit({ ...color, hue: Number(event.target.value) })}
        />
      </div>

      <div className={s.pickerControl}>
        <div className={s.pickerLabel}>
          <span>Opacity</span>
          <span>{Math.round(color.alpha * 100)}%</span>
        </div>
        <input
          type="range"
          className={cn(s.pickerRange, s.pickerAlpha)}
          min={0}
          max={100}
          value={Math.round(color.alpha * 100)}
          aria-label={`${label} opacity`}
          style={{ ['--picker-color' as string]: themeHsvaToCss({ ...color, alpha: 1 }) } as CSSProperties}
          onChange={(event) => commit({ ...color, alpha: Number(event.target.value) / 100 })}
        />
      </div>

      <div className={s.pickerFooter}>
        <span className={s.pickerValue}>{value}</span>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  open,
  onOpenChange,
  onChange,
}: {
  label: string;
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className={s.colorField}>
      <Popover
        open={open}
        onOpenChange={onOpenChange}
        label={`${label} picker`}
        width={PICKER_WIDTH}
        trigger={(triggerProps: TriggerProps) => (
          <button
            {...triggerProps}
            type="button"
            aria-label={`Edit ${label}`}
            className={s.colorSwatchButton}
            style={{ ['--swatch' as string]: value } as CSSProperties}
          >
            <span className={s.colorSwatch} />
          </button>
        )}
      >
        {() => <ColorSpectrumPicker label={label} value={value} onChange={onChange} />}
      </Popover>
      <div className={s.colorFieldText}>
        <label htmlFor={fieldId} className={s.colorFieldLabel}>
          {label}
        </label>
        <Input
          id={fieldId}
          className={s.colorInput}
          value={value}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}

/** v2 rebuild of ThemeEditor — same props/behavior as app/theme-editor.tsx. */
export function ThemeEditor({ palette, enabled, onApply, onEnabledChange }: ThemeEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ThemePalette>(() => clonePalette(palette));
  const [activeColor, setActiveColor] = useState<ThemeColorKey | null>(null);
  const [status, setStatus] = useState('Edit colors, then apply the palette.');
  const nameId = useId();
  const idId = useId();
  const enabledId = useId();

  const applyPalette = (candidate: ThemePalette) => {
    const result = saveStoredThemePalette(candidate);
    if (!result.ok) {
      setStatus(result.issues?.map((issue) => `${issue.path}: ${issue.message}`).join(' ') || result.error || 'Theme is invalid.');
      return;
    }
    setDraft(clonePalette(result.palette));
    onApply(result.palette);
    onEnabledChange(true);
    setStatus(`Applied "${result.palette.name}".`);
  };

  const exportPalette = () => {
    try {
      const blobUrl = URL.createObjectURL(new Blob([exportThemePaletteJson(draft)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${draft.id || 'spice-theme'}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
      setStatus('Theme palette exported.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Theme export failed.');
    }
  };

  const importPalette = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > THEME_PALETTE_MAX_JSON_LENGTH) {
      setStatus(`Theme files must be ${THEME_PALETTE_MAX_JSON_LENGTH / 1024} KiB or smaller.`);
      return;
    }
    try {
      const imported = importThemePaletteJson(await file.text());
      if (!imported.ok) {
        setStatus(imported.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' '));
        return;
      }
      applyPalette(imported.palette);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Theme import failed.');
    }
  };

  const resetPalette = () => {
    clearStoredThemePalette();
    const reset = clonePalette(DEFAULT_PURPLE_PALETTE as ThemePalette);
    setDraft(reset);
    setActiveColor(null);
    onApply(reset);
    onEnabledChange(true);
    setStatus('Reset to the default Spice Purple palette.');
  };

  const previewVars = {
    ['--pp-bg' as string]: draft.colors.background,
    ['--pp-surface' as string]: draft.colors.surface,
    ['--pp-surface-hover' as string]: draft.colors.surfaceHover,
    ['--pp-border' as string]: draft.colors.border,
    ['--pp-primary' as string]: draft.colors.primary,
    ['--pp-secondary' as string]: draft.colors.secondary,
    ['--pp-highlight' as string]: draft.colors.highlight,
    ['--pp-text-accent' as string]: draft.colors.textAccent,
    ['--pp-glass' as string]: draft.colors.glass,
  } as CSSProperties;

  return (
    <div className={s.editor}>
      <div className={s.editorHeader}>
        <div>
          <p className={s.editorTitle}>Custom palette editor</p>
          <p className={s.editorDescription}>Safe local palettes with JSON import and export.</p>
        </div>
        <div className={s.editorToggle}>
          <label htmlFor={enabledId} className={s.editorToggleLabel}>
            Use custom palette
          </label>
          <Switch id={enabledId} checked={enabled} onCheckedChange={onEnabledChange} />
        </div>
      </div>

      <div className={s.identity}>
        <Field label="Palette name" htmlFor={nameId}>
          <Input id={nameId} value={draft.name} maxLength={64} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        </Field>
        <Field label="Palette ID" htmlFor={idId}>
          <Input
            id={idId}
            className={s.colorInput}
            value={draft.id}
            maxLength={48}
            onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value.toLocaleLowerCase().replace(/[^a-z0-9_-]/g, '-') }))}
          />
        </Field>
      </div>

      <div className={s.colorGrid}>
        {THEME_COLOR_KEYS.map((key) => (
          <ColorField
            key={key}
            label={COLOR_LABELS[key]}
            value={draft.colors[key]}
            open={activeColor === key}
            onOpenChange={(open) => setActiveColor(open ? key : null)}
            onChange={(value) => setDraft((current) => ({ ...current, colors: { ...current.colors, [key]: value } }))}
          />
        ))}
      </div>

      <div className={s.palettePreview} style={previewVars}>
        <div className={s.ppCard}>
          <div className={s.ppArt} />
          <div className={s.ppText}>
            <span className={s.ppName}>{draft.name || 'Untitled palette'}</span>
            <span className={s.ppAccent}>Now playing preview</span>
          </div>
          <div className={s.ppPlay}>
            <Icon name="play" size={14} />
          </div>
        </div>
        <div className={s.ppSide}>
          <div className={s.ppRow}>
            <span className={s.ppDot} />
            Accent dot
          </div>
          <div className={s.ppProgress} />
          <div className={s.ppGlass}>Glass chip</div>
        </div>
      </div>

      <div className={s.editorActions}>
        <Button variant="default" onClick={() => applyPalette(draft)}>
          Apply palette
        </Button>
        <Button variant="outline" onClick={exportPalette}>
          Export JSON
        </Button>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          Import JSON
        </Button>
        <span className={s.editorActionsSpacer} />
        <Button variant="ghost" onClick={resetPalette}>
          Reset purple
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            void importPalette(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      <p className={s.status} aria-live="polite">
        {status}
      </p>
    </div>
  );
}
