'use client';

/**
 * v2 rebuild of app/playback-profile-panel.tsx. Same behavior as the classic
 * panel: edits always go through normalizePlaybackProfileState so stored
 * profiles stay valid for both interfaces.
 */

import { useId } from 'react';

import { MAX_CROSSFADE_DURATION_MS } from '../../../crossfade';
import {
  DEFAULT_PLAYBACK_PROFILE,
  MAX_PLAYBACK_PROFILES,
  normalizePlaybackProfileState,
  type PlaybackProfile,
} from '../../../playback-profiles';
import { useSpiceUi } from '../../context';
import { Button, Field, Input, Select, Slider, Switch, cn } from '../../primitives';
import { ChoiceGroup } from './a-controls';
import s from './settings.module.css';

const CURVE_OPTIONS = [
  { value: 'equal-power' as const, label: 'Equal power' },
  { value: 'linear' as const, label: 'Linear' },
];

/** v2 rebuild of PlaybackProfilePanel — same props/behavior as app/playback-profile-panel.tsx. */
export function PlaybackProfiles() {
  const m = useSpiceUi();
  const state = m.playbackProfileState;
  const active = state.profiles.find((profile) => profile.id === state.activeProfileId) ?? state.profiles[0];
  const nameId = useId();
  const activeId = useId();

  const updateActive = (updater: (profile: PlaybackProfile) => PlaybackProfile) => {
    m.updatePlaybackProfiles(
      normalizePlaybackProfileState({
        ...state,
        profiles: state.profiles.map((profile) => (profile.id === active.id ? updater(profile) : profile)),
      }),
    );
  };

  const duplicateProfile = () => {
    const suffix = Date.now().toString(36);
    const created: PlaybackProfile = {
      ...DEFAULT_PLAYBACK_PROFILE,
      id: `profile-${suffix}`,
      name: `Profile ${state.profiles.length + 1}`,
      crossfade: { ...active.crossfade },
      smartQueue: { ...active.smartQueue },
    };
    m.updatePlaybackProfiles(normalizePlaybackProfileState({ ...state, activeProfileId: created.id, profiles: [...state.profiles, created] }));
  };

  const deleteProfile = () => {
    m.updatePlaybackProfiles(
      normalizePlaybackProfileState({
        ...state,
        activeProfileId: state.profiles.find((profile) => profile.id !== active.id)?.id,
        profiles: state.profiles.filter((profile) => profile.id !== active.id),
      }),
    );
  };

  return (
    <div className={s.featureStack}>
      <div className={s.profileControls}>
        <Field label="Active playback profile" htmlFor={activeId} className={s.profileField}>
          <Select
            id={activeId}
            size="sm"
            wrapperClassName={s.profileSelect}
            value={active.id}
            onChange={(id) => m.updatePlaybackProfiles({ ...state, activeProfileId: id })}
            options={state.profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
          />
        </Field>
        <Button variant="outline" size="sm" icon="copy" disabled={state.profiles.length >= MAX_PLAYBACK_PROFILES} onClick={duplicateProfile}>
          Duplicate
        </Button>
        <Button variant="outline" size="sm" icon="trash" disabled={state.profiles.length <= 1} onClick={deleteProfile}>
          Delete
        </Button>
      </div>

      <Field label="Profile name" htmlFor={nameId}>
        <Input id={nameId} value={active.name} maxLength={48} onChange={(event) => updateActive((profile) => ({ ...profile, name: event.target.value }))} />
      </Field>

      <div className={s.featureCard} data-disabled={active.crossfade.enabled ? undefined : 'true'}>
        <div className={s.featureHeader}>
          <div>
            <p className={s.blockTitle}>Crossfade transitions</p>
            <p className={s.blockDescription}>Fade between direct-audio tracks without changing queue order.</p>
          </div>
          <Switch
            label="Crossfade transitions"
            checked={active.crossfade.enabled}
            onCheckedChange={(checked) =>
              updateActive((profile) => ({
                ...profile,
                crossfade: {
                  ...profile.crossfade,
                  enabled: checked,
                  durationMs: checked ? Math.max(500, profile.crossfade.durationMs) : profile.crossfade.durationMs,
                },
              }))
            }
          />
        </div>
        <div className={s.featureBody}>
          <div className={s.rangeField}>
            <div className={s.rangeLabel}>
              <span>Duration</span>
              <span className={s.rangeValue}>{(active.crossfade.durationMs / 1000).toFixed(1)}s</span>
            </div>
            <Slider
              label="Crossfade duration"
              min={500}
              max={MAX_CROSSFADE_DURATION_MS}
              step={500}
              value={active.crossfade.durationMs}
              disabled={!active.crossfade.enabled}
              accent
              onValueChange={(value) => updateActive((profile) => ({ ...profile, crossfade: { ...profile.crossfade, durationMs: value } }))}
            />
          </div>
          <div className={s.curveField}>
            <span className={s.rangeLabel}>Fade curve</span>
            <ChoiceGroup
              label="Fade curve"
              value={active.crossfade.curve}
              disabled={!active.crossfade.enabled}
              options={CURVE_OPTIONS}
              onValueChange={(curve) => updateActive((profile) => ({ ...profile, crossfade: { ...profile.crossfade, curve } }))}
            />
          </div>
        </div>
      </div>

      <div className={s.featureCard} data-disabled={active.smartQueue.enabled ? undefined : 'true'}>
        <div className={s.featureHeader}>
          <div>
            <p className={s.blockTitle}>Smart queue rules</p>
            <p className={s.blockDescription}>Avoid recent repeats and rotate artists and sources while favoring likes.</p>
          </div>
          <Switch
            label="Smart queue rules"
            checked={active.smartQueue.enabled}
            onCheckedChange={(checked) => updateActive((profile) => ({ ...profile, smartQueue: { ...profile.smartQueue, enabled: checked } }))}
          />
        </div>
        <div className={cn(s.featureBody, s.rangeGrid)}>
          <div className={s.rangeField}>
            <div className={s.rangeLabel}>
              <span>Recent tracks to avoid</span>
              <span className={s.rangeValue}>{active.smartQueue.recentTrackWindow}</span>
            </div>
            <Slider
              label="Recent tracks to avoid"
              min={0}
              max={100}
              value={active.smartQueue.recentTrackWindow}
              disabled={!active.smartQueue.enabled}
              onValueChange={(value) => updateActive((profile) => ({ ...profile, smartQueue: { ...profile.smartQueue, recentTrackWindow: value } }))}
            />
          </div>
          <div className={s.rangeField}>
            <div className={s.rangeLabel}>
              <span>Recent artists to reduce</span>
              <span className={s.rangeValue}>{active.smartQueue.recentArtistWindow}</span>
            </div>
            <Slider
              label="Recent artists to reduce"
              min={0}
              max={50}
              value={active.smartQueue.recentArtistWindow}
              disabled={!active.smartQueue.enabled}
              onValueChange={(value) => updateActive((profile) => ({ ...profile, smartQueue: { ...profile.smartQueue, recentArtistWindow: value } }))}
            />
          </div>
          <div className={s.rangeField}>
            <div className={s.rangeLabel}>
              <span>Liked-track boost</span>
              <span className={s.rangeValue}>{active.smartQueue.likedBoost}</span>
            </div>
            <Slider
              label="Liked-track boost"
              min={0}
              max={100}
              value={active.smartQueue.likedBoost}
              disabled={!active.smartQueue.enabled}
              onValueChange={(value) => updateActive((profile) => ({ ...profile, smartQueue: { ...profile.smartQueue, likedBoost: value } }))}
            />
          </div>
          <div className={s.rangeField}>
            <div className={s.rangeLabel}>
              <span>Recent-artist penalty</span>
              <span className={s.rangeValue}>{active.smartQueue.recentArtistPenalty}</span>
            </div>
            <Slider
              label="Recent-artist penalty"
              min={0}
              max={100}
              value={active.smartQueue.recentArtistPenalty}
              disabled={!active.smartQueue.enabled}
              onValueChange={(value) => updateActive((profile) => ({ ...profile, smartQueue: { ...profile.smartQueue, recentArtistPenalty: value } }))}
            />
          </div>
          <div className={s.rangeField}>
            <div className={s.rangeLabel}>
              <span>Source repetition penalty</span>
              <span className={s.rangeValue}>{active.smartQueue.sourceDiversityPenalty}</span>
            </div>
            <Slider
              label="Source repetition penalty"
              min={0}
              max={100}
              value={active.smartQueue.sourceDiversityPenalty}
              disabled={!active.smartQueue.enabled}
              onValueChange={(value) => updateActive((profile) => ({ ...profile, smartQueue: { ...profile.smartQueue, sourceDiversityPenalty: value } }))}
            />
          </div>
          <div className={s.rangeField}>
            <div className={s.rangeLabel}>
              <span>Artist repetition penalty</span>
              <span className={s.rangeValue}>{active.smartQueue.artistDiversityPenalty}</span>
            </div>
            <Slider
              label="Artist repetition penalty"
              min={0}
              max={100}
              value={active.smartQueue.artistDiversityPenalty}
              disabled={!active.smartQueue.enabled}
              onValueChange={(value) => updateActive((profile) => ({ ...profile, smartQueue: { ...profile.smartQueue, artistDiversityPenalty: value } }))}
            />
          </div>
        </div>
        <div className={s.featureFooter}>
          <Button variant="default" disabled={!active.smartQueue.enabled || m.isControllingRemoteReceiver} onClick={m.rebuildSmartQueue}>
            Rebuild current queue
          </Button>
        </div>
      </div>
    </div>
  );
}
