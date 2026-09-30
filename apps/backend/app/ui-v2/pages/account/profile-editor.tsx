'use client';

/* eslint-disable @next/next/no-img-element -- preset avatars are remote URLs. */

import { useId, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from 'react';

import { useSpiceUi } from '../../context';
import { Avatar, Button, Dialog, Field, Input, Textarea, cn } from '../../primitives';
import s from '../account.module.css';
import { MAX_AVATAR_BYTES, avatarKey, digitsOnly, sanitizeUsername } from './shared';

const FORM_ID = 'sx-edit-profile-form';

/**
 * Edit profile dialog. Driven by the shared `isEditingProfile` draft state so
 * it behaves like the classic inline editor: Save runs `saveProfile`, Cancel
 * closes without touching the profile.
 */
export function ProfileEditorDialog() {
  const m = useSpiceUi();
  const nameRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const close = () => m.setIsEditingProfile(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    setSaving(true);
    try {
      await m.saveProfile(event);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={m.isEditingProfile}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      size="lg"
      title="Edit profile"
      description={`Changes apply to ${m.activeProfile.displayName} on this device.`}
      initialFocusRef={nameRef}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={saving}>
            Save changes
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className={s.editorForm} onSubmit={onSubmit}>
        <AvatarEditor />
        <IdentityFields nameRef={nameRef} />
        <GradientPicker />
        <PasscodeField />
      </form>
    </Dialog>
  );
}

function AvatarEditor() {
  const m = useSpiceUi();
  const fileRef = useRef<HTMLInputElement>(null);
  const urlId = useId();
  const isUploaded = m.editAvatarUrl.startsWith('data:');

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      m.showSpiceNotice('Image must be under 2MB.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        m.setEditAvatarUrl(reader.result);
        m.logDebug('system', `PFP uploaded from device: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={s.editorGroup}>
      <div className={s.avatarEditorTop}>
        <Avatar
          key={avatarKey(m.editAvatarUrl)}
          src={m.editAvatarUrl || null}
          name={m.editName || m.activeProfile.displayName}
          gradient={m.editGradient}
          size={64}
        />
        <div className={s.avatarEditorText}>
          <span className={s.editorLabel}>Profile picture</span>
          <span className={s.editorHint}>Upload an image under 2MB, paste a link, or pick a preset.</span>
          <div className={s.avatarEditorActions}>
            <Button variant="outline" size="sm" icon="upload" onClick={() => fileRef.current?.click()} title="Upload image from device">
              Upload
            </Button>
            {m.editAvatarUrl ? (
              <Button variant="ghost" size="sm" icon="x" onClick={() => m.setEditAvatarUrl('')} title="Remove avatar">
                Remove
              </Button>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className={s.hiddenInput}
            tabIndex={-1}
            aria-hidden="true"
            onChange={onFile}
          />
        </div>
      </div>

      <div className={s.presetGrid} role="group" aria-label="Preset avatars">
        {m.PRESET_AVATARS.map((avatar) => {
          const selected = m.editAvatarUrl === avatar.url;
          return (
            <button
              key={avatar.url}
              type="button"
              className={s.presetAvatar}
              aria-pressed={selected}
              aria-label={`${avatar.name} avatar`}
              title={avatar.name}
              onClick={() => m.setEditAvatarUrl(selected ? '' : avatar.url)}
            >
              <img src={avatar.url} alt="" loading="lazy" decoding="async" draggable={false} />
            </button>
          );
        })}
      </div>

      <Field label="Image link" htmlFor={urlId}>
        {/* An uploaded picture is a multi-megabyte data URL: keep it out of the text field. */}
        <Input
          id={urlId}
          type="text"
          inputMode="url"
          value={isUploaded ? '' : m.editAvatarUrl}
          onChange={(event) => m.setEditAvatarUrl(event.target.value)}
          placeholder={isUploaded ? 'Uploaded image. Type a link to replace it.' : 'Paste an image URL or pick a preset above'}
          autoComplete="off"
        />
      </Field>
    </div>
  );
}

function IdentityFields({ nameRef }: { nameRef: RefObject<HTMLInputElement | null> }) {
  const m = useSpiceUi();
  const nameId = useId();
  const usernameId = useId();
  const bioId = useId();
  return (
    <div className={s.editorGroup}>
      <Field label="Display name" htmlFor={nameId}>
        <Input
          ref={nameRef}
          id={nameId}
          type="text"
          value={m.editName}
          onChange={(event) => m.setEditName(event.target.value)}
          placeholder="Your name"
          autoComplete="nickname"
          required
        />
      </Field>

      {m.cloudToken ? (
        <Field
          label="Spicer username"
          htmlFor={usernameId}
          description="Lowercase letters, numbers, and underscores."
          error={m.usernameError}
        >
          <Input
            id={usernameId}
            type="text"
            icon="atSign"
            value={m.editUsername}
            invalid={Boolean(m.usernameError)}
            onChange={(event) => {
              m.setEditUsername(sanitizeUsername(event.target.value));
              m.setUsernameError(null);
            }}
            placeholder="sound_lover"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </Field>
      ) : null}

      <Field label="Bio" htmlFor={bioId}>
        <Textarea
          id={bioId}
          value={m.editBio}
          onChange={(event) => m.setEditBio(event.target.value)}
          placeholder="A line or two about you"
          rows={3}
        />
      </Field>
    </div>
  );
}

function GradientPicker() {
  const m = useSpiceUi();
  const labelId = useId();
  return (
    <div className={s.editorGroup}>
      <div className={s.editorLabelRow}>
        <span className={s.editorLabel} id={labelId}>
          Profile color
        </span>
        <span className={s.editorHint}>Shown behind your initial when there is no picture.</span>
      </div>
      <div className={s.swatches} role="radiogroup" aria-labelledby={labelId}>
        {m.PRESET_GRADIENTS.map((gradient, index) => {
          const selected = m.editGradient === gradient;
          return (
            <button
              key={gradient}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Color ${index + 1}`}
              className={cn(s.swatch, selected && s.swatchSelected)}
              style={{ background: gradient }}
              onClick={() => m.setEditGradient(gradient)}
            />
          );
        })}
      </div>
    </div>
  );
}

function PasscodeField() {
  const m = useSpiceUi();
  const passcodeId = useId();
  const hasPasscode = Boolean(m.activeProfile.passcode);
  return (
    <div className={s.editorGroup}>
      <Field
        label="Passcode"
        htmlFor={passcodeId}
        description={
          hasPasscode
            ? 'This profile is locked. Change the 4 digits, or remove the passcode.'
            : 'Optional. Set 4 digits to lock this profile when switching to it.'
        }
      >
        <div className={s.passcodeRow}>
          <Input
            id={passcodeId}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={m.editPasscode}
            onChange={(event) => m.setEditPasscode(digitsOnly(event.target.value))}
            placeholder="4 digits"
            className={s.passcodeInput}
            wrapperClassName={s.passcodeWrap}
          />
          {hasPasscode ? (
            <Button variant="ghost" size="sm" icon="unlock" className={s.dangerText} onClick={m.removePasscodeFromActive}>
              Remove passcode
            </Button>
          ) : null}
        </div>
      </Field>
    </div>
  );
}
