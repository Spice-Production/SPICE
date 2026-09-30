import type { SpiceUiModel } from '../../model';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Same normalization the classic username inputs apply on every keystroke. */
export function sanitizeUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

export function digitsOnly(value: string, maxLength?: number) {
  const digits = value.replace(/\D/g, '');
  return maxLength === undefined ? digits : digits.slice(0, maxLength);
}

/**
 * Seeds the shared profile draft from the active profile, exactly like the
 * classic "Edit Profile Details" button. `saveProfile` persists every draft
 * field, so any flow that ends in it must start here.
 */
export function seedProfileDraft(m: SpiceUiModel, openEditor: boolean) {
  const profile = m.activeProfile;
  m.setEditName(profile.displayName);
  m.setEditBio(profile.bio);
  m.setEditGradient(profile.gradient);
  m.setEditPasscode(profile.passcode || '');
  m.setEditAvatarUrl(profile.avatarUrl || '');
  m.setEditUsername(m.cloudUsername || '');
  m.setUsernameError(null);
  if (openEditor) m.setIsEditingProfile(true);
}

export function formatStat(value: number) {
  return Number.isFinite(value) ? value.toLocaleString() : '0';
}

/**
 * Remount key for avatar previews so a failed image resets when the source
 * changes. Uploaded avatars are large data URLs, so only a cheap fingerprint
 * is used.
 */
export function avatarKey(url: string | null | undefined) {
  if (!url) return 'initial';
  return `${url.length}:${url.slice(0, 48)}:${url.slice(-24)}`;
}
