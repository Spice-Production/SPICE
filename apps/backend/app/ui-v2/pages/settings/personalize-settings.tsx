'use client';

/**
 * Group `personalize` (nav label "Appearance"): sections `interface-preview`,
 * `theme-accent`, `visual-customization`, `profile-privacy`, and
 * `sidebar-controls`. Mirrors app/spice-app.tsx lines ~17629-17945.
 */

import { useId } from 'react';

import type { AccentTheme, ArtworkShape, VisualSurface } from '../../../spice-app';
import { useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import { Badge, Select, SettingsBlock, SettingsRow, SettingsSection, Switch } from '../../primitives';
import { ChoiceGroup, labelOptions } from './a-controls';
import { persistLocal } from './b-storage';
import { ThemeEditor } from './theme-editor';
import s from './settings.module.css';

const ACCENT_PRESETS: ReadonlyArray<{ id: AccentTheme; name: string; color: string; gradient: string }> = [
  { id: 'pink', name: 'Neon Spice (Pink)', color: '#ec4899', gradient: 'linear-gradient(135deg, #a855f7, #ec4899)' },
  { id: 'blue', name: 'Ocean Breeze (Blue)', color: '#3b82f6', gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)' },
  { id: 'orange', name: 'Solar Fire (Orange)', color: '#f97316', gradient: 'linear-gradient(135deg, #f97316, #ef4444)' },
  { id: 'green', name: 'Jade Emerald (Green)', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #059669)' },
  { id: 'gold', name: 'Imperial Gold (Gold)', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
  { id: 'crimson', name: 'Crimson Moon (Red)', color: '#ff003c', gradient: 'linear-gradient(135deg, #ff003c, #990011)' },
  { id: 'deeppurple', name: 'Midnight Velvet (Dark Purple)', color: '#7c3aed', gradient: 'linear-gradient(135deg, #4c1d95, #120024)' },
];

/** Corner radius used by each artwork-shape choice glyph, matching --sx-art-radius extremes. */
const ARTWORK_SHAPE_RADIUS: Record<ArtworkShape, number> = { rounded: 4, soft: 7, circle: 999 };

export function PersonalizeSettings() {
  const m = useSpiceUi();
  const interfaceToggleId = useId();
  const headerLayoutLabel = 'Header layout';
  const surfaceId = useId();
  const artworkLabel = 'Artwork shape';
  const motionLabel = 'Motion';
  const scaleLabel = 'Interface density';
  const privacyId = useId();
  const sidebarExpandedId = useId();
  const sidebarSearchId = useId();
  const sidebarProfileId = useId();
  const sidebarSettingsId = useId();

  const selectedPreset = !m.customThemeEnabled ? ACCENT_PRESETS.find((preset) => preset.id === m.accentTheme) : undefined;

  const artworkOptions = (Object.entries(m.ARTWORK_SHAPE_LABELS) as [ArtworkShape, string][]).map(([value, label]) => ({
    value,
    label,
    glyph: <span className={s.shapeGlyph} style={{ borderRadius: ARTWORK_SHAPE_RADIUS[value] }} />,
  }));

  return (
    <div className={s.group}>
      <SettingsSection
        id="interface-preview"
        title="Interface"
        icon="sparkles"
        description="You're using the SPICE UI v2 preview."
        action={<Badge variant="accent">Preview</Badge>}
      >
        <SettingsRow
          label="New interface (preview)"
          htmlFor={interfaceToggleId}
          description="Your library, playback, and theme carry over. Turn this off to switch back to the classic interface — you can return to this preview from Settings at any time."
        >
          <Switch
            id={interfaceToggleId}
            checked={m.uiV2Enabled}
            onCheckedChange={(checked) => {
              if (!checked) m.setUiV2Enabled(false);
            }}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="theme-accent"
        title="Theme"
        icon="palette"
        description="Pick a dynamic accent color, or build a fully custom palette. Colors apply instantly to highlights, buttons, and dividers."
      >
        <SettingsRow label="Accent color" description="Selecting a preset turns off the custom palette below." stacked>
          <div className={s.swatchRow}>
            <div className={s.swatches}>
              {ACCENT_PRESETS.map((preset) => {
                const isCurrent = !m.customThemeEnabled && m.accentTheme === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={isCurrent}
                    title={preset.name}
                    aria-label={preset.name}
                    className={s.swatch}
                    style={{ background: preset.gradient }}
                    onClick={() => {
                      m.setAccentTheme(preset.id);
                      persistLocal('spice_accent_theme', preset.id);
                      m.setCustomThemeEnabled(false);
                      persistLocal('spice_custom_theme_enabled', 'false');
                    }}
                  >
                    {isCurrent ? <Icon name="check" size={14} /> : null}
                  </button>
                );
              })}
            </div>
            {selectedPreset ? <span className={s.swatchName}>{selectedPreset.name}</span> : null}
          </div>
        </SettingsRow>
        <SettingsBlock>
          <ThemeEditor
            key={JSON.stringify(m.customThemePalette)}
            palette={m.customThemePalette}
            enabled={m.customThemeEnabled}
            onApply={m.setCustomThemePalette}
            onEnabledChange={(enabled) => {
              m.setCustomThemeEnabled(enabled);
              persistLocal('spice_custom_theme_enabled', String(enabled));
            }}
          />
        </SettingsBlock>
      </SettingsSection>

      <SettingsSection
        id="visual-customization"
        title="Layout"
        icon="monitor"
        description="Tune the header, app surface, cover shape, motion level, and layout density. These save locally and apply instantly."
      >
        <SettingsRow label={headerLayoutLabel} stacked>
          <ChoiceGroup
            label={headerLayoutLabel}
            value={m.topbarLayout}
            options={labelOptions(m.TOPBAR_LAYOUT_LABELS)}
            onValueChange={(value) => {
              m.setTopbarLayout(value);
              persistLocal('spice_topbar_layout', value);
            }}
          />
        </SettingsRow>
        <SettingsRow label="Surface style" htmlFor={surfaceId}>
          <Select
            id={surfaceId}
            wrapperClassName={s.selectControl}
            value={m.visualSurface}
            options={(Object.entries(m.VISUAL_SURFACE_LABELS) as [VisualSurface, string][]).map(([value, label]) => ({ value, label }))}
            onChange={(value) => {
              m.setVisualSurface(value);
              persistLocal('spice_visual_surface', value);
            }}
          />
        </SettingsRow>
        <SettingsRow label={artworkLabel} stacked>
          <ChoiceGroup
            label={artworkLabel}
            value={m.artworkShape}
            options={artworkOptions}
            onValueChange={(value) => {
              m.setArtworkShape(value);
              persistLocal('spice_artwork_shape', value);
            }}
          />
        </SettingsRow>
        <SettingsRow label={motionLabel} stacked>
          <ChoiceGroup
            label={motionLabel}
            value={m.motionLevel}
            options={labelOptions(m.MOTION_LEVEL_LABELS)}
            onValueChange={(value) => {
              m.setMotionLevel(value);
              persistLocal('spice_motion_level', value);
            }}
          />
        </SettingsRow>
        <SettingsRow label={scaleLabel} stacked>
          <ChoiceGroup
            label={scaleLabel}
            value={m.interfaceScale}
            options={labelOptions(m.INTERFACE_SCALE_LABELS)}
            onValueChange={(value) => {
              m.setInterfaceScale(value);
              persistLocal('spice_interface_scale', value);
            }}
          />
        </SettingsRow>
        <SettingsBlock>
          <div className={s.preview}>
            <div className={s.previewFrame} data-topbar={m.topbarLayout} data-scale={m.interfaceScale}>
              <div className={s.previewHeader}>
                <span className={s.previewDot} />
                <span className={s.previewDot} />
                <span className={s.previewSearch} />
              </div>
              <div className={s.previewTiles}>
                {[0.35, 0.6, 0.9].map((alpha, index) => (
                  <div key={index} className={s.previewTile} style={{ ['--tile-alpha' as string]: alpha }} />
                ))}
              </div>
              <div className={s.previewPlayer}>
                <span className={s.previewPlayerArt} />
                <span className={s.previewPlayerBar} />
              </div>
            </div>
            <div className={s.previewText}>
              <p className={s.previewTitle}>Live preview</p>
              <div className={s.previewMeta}>
                <Badge>{m.TOPBAR_LAYOUT_LABELS[m.topbarLayout]}</Badge>
                <Badge>{m.VISUAL_SURFACE_LABELS[m.visualSurface]}</Badge>
                <Badge>{m.ARTWORK_SHAPE_LABELS[m.artworkShape]}</Badge>
                <Badge>{m.MOTION_LEVEL_LABELS[m.motionLevel]}</Badge>
              </div>
            </div>
          </div>
        </SettingsBlock>
      </SettingsSection>

      <SettingsSection
        id="profile-privacy"
        title="Profile privacy"
        icon="shield"
        description="Control how other listeners see your SPICE profile. Private profiles hide your bio, streaming counts, liked tracks, and custom playlists from search results and profiles."
      >
        <SettingsRow
          label="Private profile"
          htmlFor={privacyId}
          description="When enabled, other users can only see your avatar, username, and join date. Your bio, stats, and playlists stay hidden."
        >
          <Switch id={privacyId} checked={m.activeProfile.isPrivate === true} onCheckedChange={(checked) => m.updateActiveProfileData({ isPrivate: checked })} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="sidebar-controls"
        title="Sidebar"
        icon="panelLeft"
        description="Collapse the SPICE Music sidebar into an icon rail or trim optional sidebar tabs. Topbar search and the profile button stay available."
      >
        <SettingsRow
          label="Expanded sidebar"
          htmlFor={sidebarExpandedId}
          description="Turn this off to keep navigation icons visible in a compact rail while widening the player and content area."
        >
          <Switch id={sidebarExpandedId} checked={!m.sidebarHidden} onCheckedChange={(checked) => m.updateSidebarHiddenPreference(!checked)} />
        </SettingsRow>
        <SettingsRow label="Search tab" htmlFor={sidebarSearchId} description="Show Search in the sidebar. Global topbar search remains enabled.">
          <Switch id={sidebarSearchId} checked={m.sidebarSearchEnabled} onCheckedChange={m.updateSidebarSearchPreference} />
        </SettingsRow>
        <SettingsRow label="Profile tab" htmlFor={sidebarProfileId} description="Show Profile in the sidebar. The topbar avatar still opens your account page.">
          <Switch id={sidebarProfileId} checked={m.sidebarProfileEnabled} onCheckedChange={m.updateSidebarProfilePreference} />
        </SettingsRow>
        <SettingsRow label="Settings tab" htmlFor={sidebarSettingsId} description="Show Settings in the sidebar. The topbar settings button always remains available.">
          <Switch id={sidebarSettingsId} checked={m.sidebarSettingsEnabled} onCheckedChange={m.updateSidebarSettingsPreference} />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
