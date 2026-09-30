'use client';

import { useId } from 'react';

import { useSpiceUi } from '../context';
import { Avatar, Button, Dialog, Field, Input } from '../primitives';
import { GradientSwatches } from './playlist-dialogs';
import s from './overlays.module.css';

/** New local profile: name, bio, optional passcode, accent color, and avatar. */
export function CreateProfileDialog() {
  const m = useSpiceUi();
  const formId = useId();
  const nameId = useId();
  const bioId = useId();
  const passcodeId = useId();
  const avatarUrlId = useId();
  if (!m.showCreateProfileDialog) return null;
  const atLimit = m.profiles.length >= m.MAX_LOCAL_PROFILES;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) m.setShowCreateProfileDialog(false);
      }}
      title="Create SPICE profile"
      footer={
        <>
          <Button variant="outline" onClick={() => m.setShowCreateProfileDialog(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId}>
            Create
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={m.createProfile} className={s.stack}>
        <div className={s.profilePreview}>
          <Avatar key={m.newProfileAvatarUrl} src={m.newProfileAvatarUrl || null} name={m.newProfileName || '?'} gradient={m.newProfileGradient} size={48} />
          <span className={s.hint}>
            {m.profiles.length} of {m.MAX_LOCAL_PROFILES} local profiles used
          </span>
        </div>

        <Field label="Profile name" htmlFor={nameId}>
          <Input
            id={nameId}
            value={m.newProfileName}
            onChange={(event) => m.setNewProfileName(event.target.value)}
            placeholder="e.g. Study, Razvan"
            required
            autoFocus
          />
        </Field>

        <Field label="Short bio" htmlFor={bioId} description="Optional">
          <Input id={bioId} value={m.newProfileBio} onChange={(event) => m.setNewProfileBio(event.target.value)} placeholder="Study sessions…" />
        </Field>

        <Field label="Passcode protection" htmlFor={passcodeId} description="Optional 4-digit passcode">
          <Input
            id={passcodeId}
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={m.newProfilePasscode}
            onChange={(event) => m.setNewProfilePasscode(event.target.value.replace(/\D/g, ''))}
            placeholder="Leave blank for no passcode"
            className={s.passcodeInput}
          />
        </Field>

        <Field label="Accent color">
          <GradientSwatches value={m.newProfileGradient} onChange={m.setNewProfileGradient} />
        </Field>

        <Field label="Profile picture" htmlFor={avatarUrlId} description="Paste a URL, or choose a preset below">
          <div className={s.stackTight}>
            <Input
              id={avatarUrlId}
              value={m.newProfileAvatarUrl}
              onChange={(event) => m.setNewProfileAvatarUrl(event.target.value)}
              placeholder="Paste a custom image URL…"
            />
            <div className={s.presetGrid} role="group" aria-label="Preset avatars">
              {m.PRESET_AVATARS.map((avatar) => {
                const selected = m.newProfileAvatarUrl === avatar.url;
                return (
                  <button
                    key={avatar.url}
                    type="button"
                    aria-pressed={selected}
                    aria-label={avatar.name}
                    title={avatar.name}
                    className={s.presetButton}
                    onClick={() => m.setNewProfileAvatarUrl(selected ? '' : avatar.url)}
                  >
                    <Avatar src={avatar.url} name={avatar.name} size={36} square />
                  </button>
                );
              })}
            </div>
          </div>
        </Field>

        {atLimit ? (
          <p className={s.hint} role="status">
            You can keep up to {m.MAX_LOCAL_PROFILES} local profiles in SPICE Music.
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
