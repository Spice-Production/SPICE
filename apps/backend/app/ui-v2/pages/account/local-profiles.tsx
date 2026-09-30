'use client';

import type { UserProfile } from '../../../spice-app';
import { useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import { Avatar, Badge, IconButton, SectionHeader } from '../../primitives';
import s from '../account.module.css';
import { avatarKey, formatStat } from './shared';

/** Every profile stored on this device, with switch, delete, and create. */
export function LocalProfiles() {
  const m = useSpiceUi();
  const count = m.profiles.length;
  const max = m.MAX_LOCAL_PROFILES;
  const atLimit = count >= max;
  const canDelete = count > 1;

  return (
    <section className={s.section} aria-labelledby="sx-account-profiles">
      <SectionHeader
        id="sx-account-profiles"
        title="Profiles on this device"
        description={`${count} of ${max} profiles. Each keeps its own library, likes, history, and account.`}
      />
      <ul className={s.profileGrid}>
        {m.profiles.map((profile) => (
          <ProfileTile
            key={profile.id}
            profile={profile}
            active={profile.id === m.activeProfileId}
            canDelete={canDelete}
            // Re-selecting the current profile would reset playback and re-lock it, so it is a no-op.
            onSwitch={() => {
              if (profile.id !== m.activeProfileId) m.switchProfile(profile.id);
            }}
            onDelete={() => m.deleteProfile(profile.id)}
          />
        ))}
        <li className={s.profileItem}>
          <button
            type="button"
            className={s.addProfile}
            onClick={() => m.setShowCreateProfileDialog(true)}
            disabled={atLimit}
            title={atLimit ? `Maximum of ${max} profiles reached` : 'Create Profile'}
          >
            <span className={s.addProfileIcon}>
              <Icon name={atLimit ? 'ban' : 'plus'} size={18} />
            </span>
            <span className={s.profileTileText}>
              <span className={s.profileTileName}>{atLimit ? `${max} profile maximum` : 'New profile'}</span>
              <span className={s.profileTileMeta}>{atLimit ? 'Delete a profile to add another' : 'Start with an empty library'}</span>
            </span>
          </button>
        </li>
      </ul>
    </section>
  );
}

function ProfileTile({
  profile,
  active,
  canDelete,
  onSwitch,
  onDelete,
}: {
  profile: UserProfile;
  active: boolean;
  canDelete: boolean;
  onSwitch: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={s.profileItem} data-active={active ? 'true' : undefined} data-deletable={canDelete ? 'true' : undefined}>
      <button
        type="button"
        className={s.profileTile}
        onClick={onSwitch}
        aria-current={active ? 'true' : undefined}
        aria-label={`${active ? 'Current profile' : 'Switch to'} ${profile.displayName}${profile.passcode ? ', passcode protected' : ''}`}
      >
        <Avatar
          key={avatarKey(profile.avatarUrl)}
          src={profile.avatarUrl || null}
          name={profile.displayName}
          gradient={profile.gradient}
          size={44}
        />
        <span className={s.profileTileText}>
          <span className={s.profileTileNameRow}>
            <span className={s.profileTileName}>{profile.displayName}</span>
            {profile.passcode ? <Icon name="lock" size={12} className={s.profileTileLock} /> : null}
          </span>
          <span className={s.profileTileMetaRow}>
            {active ? <Badge variant="accent">Current</Badge> : null}
            <span className={s.profileTileMeta}>
              {formatStat(profile.songsPlayed)} {profile.songsPlayed === 1 ? 'stream' : 'streams'}
              {profile.cloudUsername ? ` · @${profile.cloudUsername}` : ''}
            </span>
          </span>
        </span>
      </button>
      {canDelete ? (
        <IconButton
          icon="trash"
          label={`Delete ${profile.displayName}`}
          title="Delete Profile"
          size="xs"
          className={s.profileTileDelete}
          onClick={onDelete}
        />
      ) : null}
    </li>
  );
}
