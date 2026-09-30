'use client';

import { useId } from 'react';

import { useSpiceUi } from '../../context';
import { Badge, Button, SettingsRow, SettingsSection, Switch } from '../../primitives';
import { seedProfileDraft } from './shared';

/** Profile customization entry points: details, passcode lock, and visibility. */
export function ProfileSettings() {
  const m = useSpiceUi();
  const privacyId = useId();
  const profile = m.activeProfile;
  const locked = Boolean(profile.passcode);
  const openEditor = () => seedProfileDraft(m, true);

  return (
    <SettingsSection
      id="sx-account-profile"
      icon="user"
      title="Profile settings"
      description={`Customize ${profile.displayName}: how it looks, who can see it, and whether it is locked.`}
    >
      <SettingsRow label="Profile details" description="Display name, bio, picture, and profile color.">
        <Button variant="outline" size="sm" icon="pencil" onClick={openEditor}>
          Edit profile
        </Button>
      </SettingsRow>

      <SettingsRow
        label={
          <>
            Passcode lock{' '}
            {locked ? (
              <Badge variant="accent" icon="lock">
                On
              </Badge>
            ) : (
              <Badge variant="outline">Off</Badge>
            )}
          </>
        }
        description={
          locked
            ? 'SPICE asks for this profile’s 4-digit passcode when you switch to it.'
            : 'Require a 4-digit passcode when switching to this profile.'
        }
      >
        {locked ? (
          <Button variant="ghost" size="sm" icon="unlock" onClick={m.removePasscodeFromActive}>
            Remove
          </Button>
        ) : null}
        <Button variant="outline" size="sm" icon="key" onClick={openEditor}>
          {locked ? 'Change passcode' : 'Set passcode'}
        </Button>
      </SettingsRow>

      <SettingsRow
        label="Private profile"
        htmlFor={privacyId}
        description="Other listeners only see your avatar, username, and join date. Your bio, stats, and playlists are hidden."
      >
        <Switch
          id={privacyId}
          checked={profile.isPrivate === true}
          onCheckedChange={(checked) => m.updateActiveProfileData({ isPrivate: checked })}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
