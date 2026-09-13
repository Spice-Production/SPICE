'use client';

import { useState } from 'react';

import {
  DEFAULT_PLAYBACK_PROFILE,
  MAX_PLAYBACK_PROFILES,
  loadPlaybackProfileState,
  normalizePlaybackProfile,
  savePlaybackProfileState,
  type PlaybackProfile,
  type PlaybackProfileState,
} from '../../playback-profiles';
import type { CrossfadeCurve } from '../../crossfade';
import { Button, EmptyState, Picker, Switch, TextField } from '@/components/ui';

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function persist(state: PlaybackProfileState): void {
  const storage = browserStorage();
  if (storage) savePlaybackProfileState(storage, state);
}

/**
 * Playback profiles: named crossfade presets persisted under the same
 * storage key as the original. Smart-queue values ride along untouched
 * (consumed by a later slice); the engine consumes crossfade now.
 */
export function usePlaybackProfiles() {
  const [state, setState] = useState<PlaybackProfileState>(() => {
    const storage = browserStorage();
    return storage ? loadPlaybackProfileState(storage) : loadPlaybackProfileState({ getItem: () => null, setItem: () => {} });
  });

  const active = state.profiles.find((p) => p.id === state.activeProfileId) ?? DEFAULT_PLAYBACK_PROFILE;

  const commit = (next: PlaybackProfileState) => {
    setState(next);
    persist(next);
  };

  const select = (id: string) => {
    if (state.profiles.some((p) => p.id === id)) commit({ ...state, activeProfileId: id });
  };

  const updateActive = (patch: Partial<PlaybackProfile['crossfade']> & { curve?: CrossfadeCurve }) => {
    const next = state.profiles.map((p) =>
      p.id === active.id ? normalizePlaybackProfile({ ...p, crossfade: { ...p.crossfade, ...patch } }) : p,
    );
    commit({ ...state, profiles: next });
  };

  const create = (name: string) => {
    const title = name.trim().slice(0, 48);
    if (!title || state.profiles.length >= MAX_PLAYBACK_PROFILES) return;
    const base = state.profiles.find((p) => p.id === state.activeProfileId) ?? DEFAULT_PLAYBACK_PROFILE;
    const fresh = normalizePlaybackProfile({ ...base, id: `custom_${Date.now().toString(36)}`, name: title });
    commit({ ...state, profiles: [...state.profiles, fresh], activeProfileId: fresh.id });
  };

  const remove = (id: string) => {
    if (state.profiles.length <= 1) return;
    const next = state.profiles.filter((p) => p.id !== id);
    commit({
      ...state,
      profiles: next,
      activeProfileId: state.activeProfileId === id ? next[0].id : state.activeProfileId,
    });
  };

  return { state, active, select, updateActive, create, remove };
}

const DURATIONS = [
  { value: '3000', label: '3s' },
  { value: '5000', label: '5s' },
  { value: '8000', label: '8s' },
  { value: '12000', label: '12s' },
];

const CURVES = [
  { value: 'equal-power', label: 'Equal power' },
  { value: 'linear', label: 'Linear' },
];

export function PlaybackView({ hook }: { hook: ReturnType<typeof usePlaybackProfiles> }) {
  const { state, active, select, updateActive, create, remove } = hook;
  const [name, setName] = useState('');

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Picker
        label="Playback profile"
        options={state.profiles.map((p) => ({ value: p.id, label: p.name }))}
        value={active.id}
        onChange={select}
      />
      <Switch
        label="Crossfade"
        checked={active.crossfade.enabled}
        onChange={(next) => updateActive({ enabled: next })}
      />
      {active.crossfade.enabled && (
        <>
          <Picker
            label="Crossfade length"
            options={DURATIONS}
            value={String(active.crossfade.durationMs)}
            onChange={(value) => updateActive({ durationMs: Number(value) })}
          />
          <Picker
            label="Crossfade curve"
            options={CURVES}
            value={active.crossfade.curve}
            onChange={(value) => updateActive({ curve: value as CrossfadeCurve })}
          />
        </>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <TextField label="New profile" placeholder="Name it…" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button
          onClick={() => { create(name); setName(''); }}
          disabled={!name.trim() || state.profiles.length >= MAX_PLAYBACK_PROFILES}
        >
          Save current as…
        </Button>
        {state.profiles.length > 1 && (
          <Button variant="ghost" onClick={() => remove(active.id)}>
            Delete {active.name}
          </Button>
        )}
      </div>
      <EmptyState message="Smart-queue tuning rides along in each profile and takes effect in a later slice." />
    </div>
  );
}
