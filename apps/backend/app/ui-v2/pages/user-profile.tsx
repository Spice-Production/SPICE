'use client';

import { useId, useMemo } from 'react';

import { useNavigation } from '../actions';
import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { CardGrid, formatCount, MediaCard, PlaylistArtwork } from '../media';
import { Avatar, Badge, Button, Card, EmptyState, SectionHeader, Skeleton, Stat, useIsMobile, VisuallyHidden } from '../primitives';
import { toListenerProfileData, toListenerSummary, type ListenerProfileData } from './search/listeners';
import s from './user-profile.module.css';

/**
 * Another listener's public profile (classic: selectedUser / selectedUserProfileData).
 * Reached from Search → Users and from anywhere else that calls handleSelectUser;
 * routing always shows this ahead of the current page while selectedUser is set.
 */
export function UserProfilePage() {
  const m = useSpiceUi();
  const summary = useMemo(() => toListenerSummary(m.selectedUser), [m.selectedUser]);
  const data = useMemo(() => toListenerProfileData(m.selectedUserProfileData), [m.selectedUserProfileData]);
  if (!summary) return null;

  const isSelf = summary.id !== '' && summary.id === m.cloudUser?.id;

  return (
    <div className={s.page}>
      <Button variant="ghost" icon="arrowLeft" className={s.back} onClick={() => m.setSelectedUser(null)}>
        Back to Search
      </Button>

      {m.isLoadingUserProfile || !data ? (
        <ProfileSkeleton />
      ) : (
        <>
          <ProfileHeader data={data} isSelf={isSelf} />
          {data.profile.isPrivate ? (
            <EmptyState
              icon="lock"
              title="This profile is private"
              description="Stats and custom playlists are hidden by this listener."
            />
          ) : (
            <>
              <div className={s.stats}>
                <Stat label="Songs streamed" value={(data.stats?.songsPlayed ?? 0).toLocaleString()} />
                <Stat label="Liked songs" value={(data.stats?.likedCount ?? 0).toLocaleString()} />
                <Stat label="Playlists" value={(data.stats?.playlistsCount ?? 0).toLocaleString()} />
              </div>
              <PlaylistsSection playlists={data.playlists} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function ProfileHeader({ data, isSelf }: { data: ListenerProfileData; isSelf: boolean }) {
  const m = useSpiceUi();
  const isMobile = useIsMobile();
  const { profile, likesCount, isLikedByMe } = data;

  return (
    <Card className={s.hero}>
      <Avatar
        src={profile.avatarUrl}
        name={profile.displayName}
        gradient={profile.gradient ?? 'var(--sx-accent-gradient)'}
        size={isMobile ? 72 : 96}
        className={s.heroAvatar}
      />
      <div className={s.heroIdentity}>
        <h1 className={s.heroName}>{profile.displayName}</h1>
        <p className={s.heroHandle}>@{profile.username}</p>
        {!profile.isPrivate && profile.bio ? <p className={s.heroBio}>{profile.bio}</p> : null}
        {profile.joinedAt ? (
          <Badge variant="outline" icon="calendar" className={s.heroJoined}>
            Listener since {profile.joinedAt}
          </Badge>
        ) : null}
      </div>
      <div className={s.heroActions}>
        {!isSelf ? (
          <Button
            variant="outline"
            icon="radio"
            disabled={!m.cloudToken}
            loading={m.isCreatingListenTogetherSession}
            title={m.cloudToken ? 'Invite user to Listen Together' : 'Sign in to invite listeners to Listen Together'}
            onClick={() => void m.handleInviteUserProfileToListenTogether(profile.username)}
          >
            Invite to Listen
          </Button>
        ) : null}
        <Button
          variant="outline"
          active={isLikedByMe}
          disabled={isSelf}
          title={isSelf ? 'You cannot like your own profile' : isLikedByMe ? 'Unlike this profile' : 'Like this profile'}
          onClick={() => void m.handleToggleProfileLike(m.selectedUser?.id)}
        >
          <Icon name="heart" size={16} filled={isLikedByMe} />
          {formatCount(likesCount, 'Like', 'Likes')}
        </Button>
      </div>
    </Card>
  );
}

function PlaylistsSection({ playlists }: { playlists: ListenerProfileData['playlists'] }) {
  const { openPlaylist } = useNavigation();
  const m = useSpiceUi();
  const headingId = useId();
  return (
    <section className={s.section} aria-labelledby={headingId}>
      <SectionHeader id={headingId} title="Playlists" />
      {playlists.length === 0 ? (
        <EmptyState
          icon="listMusic"
          title="No public playlists"
          description="No public playlists created by this listener yet."
        />
      ) : (
        <CardGrid>
          {playlists.map(({ source, view, trackCount }) => (
            <MediaCard
              key={source.id}
              title={view.title}
              subtitle={formatCount(trackCount, 'track')}
              artwork={<PlaylistArtwork playlist={view} fallbackGradient={m.PRESET_GRADIENTS[0]} />}
              onOpen={() => openPlaylist(source)}
            />
          ))}
        </CardGrid>
      )}
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className={s.skeletonWrap} role="status" aria-live="polite">
      <VisuallyHidden>Loading profile…</VisuallyHidden>
      <div className={s.skeletonHero} aria-hidden="true">
        <Skeleton width={96} height={96} radius="999px" />
        <div className={s.skeletonText}>
          <Skeleton width="44%" height={22} />
          <Skeleton width="26%" height={13} />
          <Skeleton width="62%" height={13} />
        </div>
      </div>
      <div className={s.skeletonStats} aria-hidden="true">
        <Skeleton height={72} />
        <Skeleton height={72} />
        <Skeleton height={72} />
      </div>
    </div>
  );
}
