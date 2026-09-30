'use client';

import { useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import { Avatar, Badge, Button, Card, DropdownMenu, Stat, useIsMobile, type MenuEntry } from '../../primitives';
import s from '../account.module.css';
import { avatarKey, formatStat, seedProfileDraft } from './shared';

/** Header card: who is listening, their numbers, and profile actions. */
export function ProfileOverview() {
  const m = useSpiceUi();
  const isMobile = useIsMobile();
  const profile = m.activeProfile;
  const atLimit = m.profiles.length >= m.MAX_LOCAL_PROFILES;

  const handle = m.cloudUsername ? `@${m.cloudUsername}` : m.cloudUser ? 'SPICE account' : 'Local profile';

  const switchItems: MenuEntry[] = [
    { type: 'label', key: 'label', label: 'Profiles on this device' },
    ...m.profiles.map<MenuEntry>((entry) => ({
      key: entry.id,
      label: entry.passcode ? `${entry.displayName} (locked)` : entry.displayName,
      description: `${formatStat(entry.songsPlayed)} streams`,
      checked: entry.id === m.activeProfileId,
      // Re-selecting the current profile would reset playback and re-lock it.
      onSelect: () => {
        if (entry.id !== m.activeProfileId) m.switchProfile(entry.id);
      },
    })),
    { type: 'separator', key: 'sep' },
    {
      key: 'new',
      label: atLimit ? `${m.MAX_LOCAL_PROFILES} profile maximum` : 'New profile',
      disabled: atLimit,
      onSelect: () => m.setShowCreateProfileDialog(true),
    },
  ];

  return (
    <Card className={s.overview}>
      <div className={s.overviewTop}>
        <Avatar
          key={avatarKey(profile.avatarUrl)}
          src={profile.avatarUrl || null}
          name={profile.displayName}
          gradient={profile.gradient}
          size={isMobile ? 64 : 72}
          className={s.overviewAvatar}
        />
        <div className={s.overviewIdentity}>
          <div className={s.overviewNameRow}>
            <h2 className={s.overviewName}>{profile.displayName}</h2>
            {profile.passcode ? (
              <span className={s.lockMark}>
                <Icon name="lock" size={14} title="Profile locked" />
              </span>
            ) : null}
            {profile.isPrivate ? (
              <Badge variant="outline" icon="eyeOff">
                Private
              </Badge>
            ) : null}
          </div>
          <p className={s.overviewHandle}>{handle}</p>
          {profile.bio ? <p className={s.overviewBio}>{profile.bio}</p> : null}
        </div>
        <div className={s.overviewActions}>
          <Button variant="outline" size="sm" icon="pencil" onClick={() => seedProfileDraft(m, true)}>
            Edit profile
          </Button>
          <DropdownMenu
            items={switchItems}
            label="Switch profile"
            width={260}
            trigger={(props) => (
              <Button {...props} variant="outline" size="sm" icon="users" iconRight="chevronDown" title="Switch or create a profile">
                Switch
              </Button>
            )}
          />
        </div>
      </div>

      <div className={s.stats}>
        <Stat label="Songs streamed" value={formatStat(profile.songsPlayed)} />
        <Stat label="Liked songs" value={formatStat(m.likedTracks.size)} />
        <Stat label="Playlists" value={formatStat(m.customPlaylists.length)} />
        {m.cloudToken ? (
          <Stat label={m.myLikesCount === 1 ? 'Profile like' : 'Profile likes'} value={formatStat(m.myLikesCount)} />
        ) : null}
        <Stat label="Listener since" value={<span className={s.statText}>{profile.joinedAt}</span>} />
      </div>
    </Card>
  );
}
