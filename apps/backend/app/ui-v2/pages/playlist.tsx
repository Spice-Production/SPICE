'use client';

import { useMemo } from 'react';

import type { Playlist } from '../../spice-app';
import { usePlayback, useTrackMenu } from '../actions';
import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { formatCount, PlaylistArtwork, TrackList } from '../media';
import { Alert, Badge, Button, DropdownMenu, EmptyState, IconButton, Progress, type MenuEntry } from '../primitives';
import {
  formatPlaylistDate,
  formatTotalDuration,
  isQueueFromTracks,
  playlistBackLabel,
  playlistDescription,
  totalDurationMs,
  useActiveTrackId,
  useFindSongs,
  useOpenPlaylistEditor,
  usePlaylistPlayback,
} from './library/helpers';
import { MembersSheet } from './library/members-sheet';
import s from './playlist.module.css';

export function PlaylistPage() {
  const m = useSpiceUi();
  if (!m.selectedPlaylist) return null;
  return <PlaylistView playlist={m.selectedPlaylist} />;
}

function PlaylistView({ playlist }: { playlist: Playlist }) {
  const m = useSpiceUi();
  const { trackState } = usePlayback();
  const trackMenu = useTrackMenu();
  const playPlaylist = usePlaylistPlayback();
  const openEditor = useOpenPlaylistEditor();
  const findSongs = useFindSongs();
  const activeId = useActiveTrackId();

  const tracks = playlist.tracks;
  const queue = m.playerQueue;
  const title = playlist.title || 'Untitled Playlist';
  const isOwner = Boolean(m.isPlaylistOwner);
  const shared = Boolean(playlist.shared);
  const hasTracks = tracks.length > 0;
  const description = playlistDescription(playlist);

  const isCurrent = useMemo(() => isQueueFromTracks(tracks, activeId, queue), [activeId, queue, tracks]);
  const playing = isCurrent && m.playerIsPlaying;
  const durationLabel = useMemo(() => formatTotalDuration(totalDurationMs(tracks)), [tracks]);
  const metaColumn = useMemo(
    () =>
      shared
        ? { show: tracks.some((track) => Boolean(track.addedBy)), label: 'Added by' }
        : { show: tracks.some((track) => Boolean(track.album?.title)), label: 'Album' },
    [shared, tracks],
  );

  const download = m.playlistDownloadProgress;
  const downloadingThis = download?.playlistId === playlist.id ? download : null;
  const downloadingOther = Boolean(download && download.playlistId !== playlist.id);
  const sharing = m.sharingPlaylistId === playlist.id;
  const canShare = !shared || isOwner;
  const canViewMembers = shared && m.isPlaylistUuid(playlist.id);

  const eyebrow = shared ? (isOwner ? 'Collaborative playlist' : 'Shared with you') : 'Playlist';
  const byline = shared
    ? playlist.ownerDisplayName
      ? `by ${playlist.ownerDisplayName}`
      : 'Shared'
    : playlist.createdAt
      ? `Created ${formatPlaylistDate(playlist.createdAt)}`
      : '';
  const metaParts = [byline, formatCount(tracks.length, 'track'), durationLabel].filter(Boolean);

  const toggleMembers = () => {
    m.setShowMembersPanel(!m.showMembersPanel);
    if (!m.showMembersPanel) {
      // The member list is app-wide state: drop the previous playlist's list so a
      // failed fetch can never show someone else's spicers.
      m.setMembersList(null);
      void m.fetchPlaylistMembers(playlist.id);
    }
  };

  const confirmLeave = () => {
    m.requestSpiceConfirm({
      title: 'Leave Shared Playlist?',
      message: 'It will be removed from your library.',
      confirmLabel: 'Leave Playlist',
      kind: 'danger',
      onConfirm: () => {
        void m.deletePlaylist(playlist.id);
      },
    });
  };

  // Leaving only applies to playlists in the user's library (another listener's
  // public playlist has nothing to leave; the classic button did nothing there).
  const inLibrary = m.customPlaylists.some((entry) => entry.id === playlist.id);
  const menuItems: MenuEntry[] = isOwner
    ? [
        { key: 'edit', label: 'Edit details', icon: 'pencil', onSelect: () => openEditor(playlist) },
        { type: 'separator', key: 'danger-sep' },
        { key: 'delete', label: 'Delete playlist', icon: 'trash', destructive: true, onSelect: () => m.setShowDeleteConfirm(true) },
      ]
    : inLibrary
      ? [{ key: 'leave', label: 'Leave playlist', icon: 'logOut', destructive: true, onSelect: confirmLeave }]
      : [];

  const artwork = <PlaylistArtwork playlist={playlist} className={s.heroArtImage} />;

  return (
    <div className={s.page}>
      <div className={s.topRow}>
        <Button variant="ghost" icon="arrowLeft" className={s.back} onClick={() => m.setSelectedPlaylist(null)}>
          {playlistBackLabel(m.currentPage, Boolean(m.selectedUser))}
        </Button>
      </div>

      <header className={s.hero}>
        {isOwner ? (
          <button type="button" className={s.heroArt} onClick={() => openEditor(playlist)} aria-label={`Edit details for ${title}`}>
            {artwork}
            <span className={s.heroArtEdit} aria-hidden="true">
              <Icon name="pencil" size={20} />
              Edit details
            </span>
          </button>
        ) : (
          <div className={s.heroArt}>{artwork}</div>
        )}
        <div className={s.heroText}>
          <div className={s.eyebrow}>
            <span>{eyebrow}</span>
            {typeof playlist.isPublic === 'boolean' ? (
              <Badge variant="outline" icon={playlist.isPublic ? 'globe' : 'lock'}>
                {playlist.isPublic ? 'Public' : 'Private'}
              </Badge>
            ) : null}
          </div>
          <h1 className={s.title} title={title}>
            {title}
          </h1>
          {description ? <p className={s.description}>{description}</p> : null}
          <p className={s.meta}>
            {metaParts.map((part, index) => (
              <span key={part} className={s.metaPart}>
                {index > 0 ? (
                  <span className={s.metaDot} aria-hidden="true">
                    ·
                  </span>
                ) : null}
                {part}
              </span>
            ))}
          </p>
        </div>
      </header>

      <div className={s.actions}>
        {hasTracks ? (
          <button
            type="button"
            className={s.playButton}
            onClick={() => playPlaylist(playlist, isCurrent)}
            aria-label={playing ? `Pause ${title}` : `Play ${title}`}
            title={playing ? 'Pause' : 'Play'}
          >
            <Icon name={playing ? 'pause' : 'play'} size={22} filled />
          </button>
        ) : null}
        {hasTracks ? <IconButton icon="shuffle" label="Shuffle play" size="lg" onClick={() => m.shufflePlaylistPlay(playlist)} /> : null}
        {hasTracks ? (
          downloadingThis ? (
            <Button
              variant="outline"
              icon="x"
              onClick={m.cancelPlaylistDownload}
              aria-label={`Stop downloading (${downloadingThis.completed} of ${downloadingThis.total})`}
            >
              Stop {downloadingThis.completed}/{downloadingThis.total}
            </Button>
          ) : (
            <Button
              variant="outline"
              icon="download"
              className={s.actionButton}
              disabled={downloadingOther}
              title={downloadingOther ? 'Another playlist download is in progress' : 'Download for offline listening'}
              aria-label="Download playlist"
              onClick={() => {
                void m.downloadPlaylistToOfflineLibrary(playlist);
              }}
            >
              <span className={s.actionLabel}>Download</span>
            </Button>
          )
        ) : null}
        {canShare ? (
          <Button
            variant="outline"
            icon={shared ? 'link' : 'share'}
            className={s.actionButton}
            loading={sharing}
            aria-label={sharing ? 'Preparing share link' : shared ? 'Create a new invite link' : 'Share playlist'}
            onClick={() => {
              void m.sharePlaylist(playlist);
            }}
          >
            <span className={s.actionLabel}>{sharing ? 'Preparing…' : shared ? 'New invite link' : 'Share'}</span>
          </Button>
        ) : null}
        {canViewMembers ? (
          <Button
            variant="outline"
            icon="users"
            className={s.actionButton}
            aria-label="Members"
            aria-haspopup="dialog"
            aria-expanded={m.showMembersPanel}
            active={m.showMembersPanel}
            onClick={toggleMembers}
          >
            <span className={s.actionLabel}>Members</span>
          </Button>
        ) : null}
        {menuItems.length > 0 ? (
          <DropdownMenu
            items={menuItems}
            label={`${title} options`}
            trigger={(props) => <IconButton {...props} icon="more" label={`More options for ${title}`} size="lg" />}
          />
        ) : null}
      </div>

      {hasTracks && downloadingOther ? (
        // Disabled buttons swallow pointer events, so the reason is spelled out.
        <p className={s.actionHint}>Another playlist is being saved for offline listening. Downloads run one at a time.</p>
      ) : null}

      {downloadingThis ? (
        <div className={s.downloadStatus} role="status">
          <div className={s.downloadStatusText}>
            <span>Saving for offline listening</span>
            <span className={s.downloadCount}>
              {downloadingThis.completed} of {downloadingThis.total}
            </span>
          </div>
          <Progress value={downloadingThis.completed} max={downloadingThis.total} label={`Downloading ${title}`} />
        </div>
      ) : null}

      {m.shareStatus ? (
        <Alert
          variant="neutral"
          icon={shared || sharing ? 'link' : 'info'}
          className={s.statusAlert}
          action={<IconButton icon="x" label="Dismiss" size="xs" onClick={() => m.setShareStatus(null)} />}
        >
          {m.shareStatus}
        </Alert>
      ) : null}

      <section className={s.tracks} aria-label={`${title} tracks`}>
        {hasTracks ? (
          <TrackList
            tracks={tracks}
            ariaLabel={`${title} tracks`}
            resetKey={playlist.id}
            showHeader
            showMeta={metaColumn.show}
            metaLabel={metaColumn.label}
            getRowOptions={(song, index) => {
              const playback = trackState(song, tracks, playlist.id);
              const addedBy = shared && song.addedBy ? song.addedBy.displayName : '';
              const canRemove = isOwner || (shared && song.addedBy?.userId === m.cloudUser?.id);
              return {
                active: playback.active,
                playing: playback.playing,
                onPlay: playback.onPlay,
                onTogglePlayback: playback.onTogglePlayback,
                liked: m.likedTracks.has(song.id),
                onToggleLike: () => m.toggleLike(song),
                meta: shared ? addedBy : song.album?.title,
                subtitleExtra: addedBy ? <span className={s.addedByInline}>· Added by {addedBy}</span> : undefined,
                menu: trackMenu(song, {
                  onRemove: canRemove
                    ? () => {
                        void m.removeTrackFromPlaylist(song.id, playlist.id, index);
                      }
                    : undefined,
                }),
              };
            }}
          />
        ) : (
          <EmptyState
            icon="listMusic"
            title="This playlist is empty"
            description="Search and add your favorite tracks."
            action={
              <Button icon="search" onClick={findSongs}>
                Find songs
              </Button>
            }
          />
        )}
      </section>

      <MembersSheet playlist={playlist} />
    </div>
  );
}
