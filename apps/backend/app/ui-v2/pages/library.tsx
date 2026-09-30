'use client';

import { useMemo } from 'react';

import { useSpiceUi } from '../context';
import { Button, EmptyState, IconButton, PageHeader, Tabs, type TabItem } from '../primitives';
import { DownloadsView } from './library/downloads';
import { PlaylistCollection } from './library/playlist-collection';
import { HistoryView, LikedView } from './library/track-views';
import s from './library.module.css';

type LibraryFilter = 'shared' | 'playlists' | 'liked' | 'history' | 'downloads';

const FILTER_LABELS: Record<LibraryFilter, string> = {
  playlists: 'Playlists',
  liked: 'Liked Songs',
  history: 'History',
  shared: 'Shared',
  downloads: 'Downloads',
};

export function LibraryPage() {
  const m = useSpiceUi();
  const filter = m.libraryFilter;
  const signedIn = Boolean(m.cloudToken);
  // Classic shows the Shared chip only when signed in; keep it while it is the open view.
  const showSharedTab = signedIn || filter === 'shared';

  const playlistCount = m.editablePlaylists.length;
  const likedCount = m.likedTracksList.length;
  const historyCount = m.history.length;
  const sharedCount = m.sharedPlaylists.length;
  const downloadCount = m.offlineLibraryEntries.length;

  const tabs = useMemo(() => {
    const items: TabItem<LibraryFilter>[] = [
      { value: 'playlists', label: FILTER_LABELS.playlists, count: playlistCount },
      { value: 'liked', label: FILTER_LABELS.liked, count: likedCount },
      { value: 'history', label: FILTER_LABELS.history, count: historyCount },
    ];
    if (showSharedTab) items.push({ value: 'shared', label: FILTER_LABELS.shared, count: sharedCount });
    items.push({ value: 'downloads', label: FILTER_LABELS.downloads, count: downloadCount });
    return items;
  }, [downloadCount, historyCount, likedCount, playlistCount, sharedCount, showSharedTab]);

  const selectFilter = (next: LibraryFilter) => {
    m.setLibraryFilter(next);
    // Like the classic Downloads chip: every press rescans the offline folder.
    if (next === 'downloads') m.refreshOfflineLibrary().catch(() => false);
  };

  const openCreateShared = () => {
    if (!m.cloudToken) {
      const message = 'Sign in to your SPICE account to create shared playlists.';
      m.setSelectedPlaylist(null);
      m.setSelectedUser(null);
      m.setCurrentPage('account');
      m.setShareStatus(message);
      // The share status only renders on playlist pages, so also surface it here.
      m.showSpiceNotice(message, 'info');
    } else {
      m.setShowCreateSharedDialog(true);
    }
  };

  const showsPlaylists = filter === 'playlists' || filter === 'shared';

  return (
    <div className={s.page}>
      <PageHeader
        title="Library"
        description="Your playlists, liked songs, listening history, and offline downloads."
        actions={
          <>
            <Button variant="outline" icon="users" onClick={openCreateShared}>
              New shared playlist
            </Button>
            <Button variant="default" icon="plus" onClick={() => m.setShowCreateDialog(true)}>
              New playlist
            </Button>
          </>
        }
      />

      <div className={s.toolbar}>
        <Tabs label="Library sections" value={filter} onValueChange={selectFilter} items={tabs} className={s.tabs} />
        {showsPlaylists ? (
          <div className={s.viewToggle} role="group" aria-label="Playlist layout">
            <IconButton
              icon="list"
              label="List view"
              size="xs"
              active={m.libraryView === 'list'}
              aria-pressed={m.libraryView === 'list'}
              onClick={() => m.setLibraryView('list')}
            />
            <IconButton
              icon="grid"
              label="Grid view"
              size="xs"
              active={m.libraryView === 'grid'}
              aria-pressed={m.libraryView === 'grid'}
              onClick={() => m.setLibraryView('grid')}
            />
          </div>
        ) : null}
      </div>

      <div role="tabpanel" aria-label={FILTER_LABELS[filter] ?? 'Library'} className={s.panel}>
        {filter === 'playlists' ? (
          <PlaylistCollection
            playlists={m.editablePlaylists}
            view={m.libraryView}
            ariaLabel="Your playlists"
            empty={
              <EmptyState
                icon="listMusic"
                title="Create your first playlist"
                description="Build custom compilations from YouTube Music streams."
                action={
                  <Button icon="plus" onClick={() => m.setShowCreateDialog(true)}>
                    Create playlist
                  </Button>
                }
              />
            }
          />
        ) : null}

        {filter === 'shared' ? (
          <PlaylistCollection
            playlists={m.sharedPlaylists}
            view={m.libraryView}
            shared
            ariaLabel="Shared playlists"
            empty={
              <EmptyState
                icon="users"
                title="No shared playlists yet"
                description="Collaborate with other SPICE users on shared compilations."
                action={
                  <Button icon="plus" onClick={() => m.setShowCreateSharedDialog(true)}>
                    Create shared playlist
                  </Button>
                }
              />
            }
          />
        ) : null}

        {filter === 'liked' ? <LikedView /> : null}
        {filter === 'history' ? <HistoryView /> : null}
        {filter === 'downloads' ? <DownloadsView /> : null}
      </div>
    </div>
  );
}
