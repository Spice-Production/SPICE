'use client';

import { memo, useId, type ReactNode } from 'react';

import type { AppPage, Playlist } from '../../spice-app';
import { useNavigation } from '../actions';
import { useSpiceUi } from '../context';
import { Icon, SpiceMark } from '../icons';
import { formatCount, PlaylistArtwork } from '../media';
import type { SpiceUiModel } from '../model';
import { Badge, IconButton } from '../primitives';
import { sidebarNavItems } from './nav-items';
import s from './sidebar.module.css';

/**
 * Primary navigation. `rail` sits left of the content panel (collapsible to a
 * 64px icon rail); `sheet` is the full-width list inside the phone nav sheet.
 */
export function Sidebar({
  collapsed = false,
  variant = 'rail',
  onNavigate,
}: {
  collapsed?: boolean;
  variant?: 'rail' | 'sheet';
  onNavigate?: () => void;
}) {
  const m = useSpiceUi();
  const { goTo } = useNavigation();
  const sheet = variant === 'sheet';
  const rail = collapsed && !sheet;
  const navItems = sidebarNavItems(m);

  const navigate = (page: AppPage) => {
    goTo(page);
    onNavigate?.();
  };

  const content: ReactNode = (
    <>
      {sheet ? null : (
        <div className={s.header}>
          <button
            type="button"
            className={s.brand}
            onClick={() => navigate('home')}
            aria-label="Go to SPICE Music"
            title={rail ? 'SPICE' : undefined}
          >
            <SpiceMark size={24} />
            {rail ? null : <span className={s.wordmark}>SPICE</span>}
          </button>
          <IconButton
            icon="panelLeft"
            size="sm"
            label={m.sidebarHidden ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!m.sidebarHidden}
            onClick={() => m.updateSidebarHiddenPreference(!m.sidebarHidden)}
          />
        </div>
      )}

      <nav className={s.nav} aria-label="Main">
        {navItems.map((item) => {
          const active = m.currentPage === item.page && !m.selectedPlaylist;
          return (
            <button
              key={item.page}
              type="button"
              className={s.navItem}
              aria-current={active ? 'page' : undefined}
              aria-label={rail ? item.label : undefined}
              title={rail ? item.label : undefined}
              onClick={() => navigate(item.page)}
            >
              <Icon name={item.icon} size={sheet ? 18 : 16} />
              {rail ? null : <span className={s.navLabel}>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <SidebarPlaylists
        playlists={m.customPlaylists}
        ready={m.isMounted}
        selectedId={m.selectedPlaylist?.id ?? null}
        rail={rail}
        sheet={sheet}
        setSelectedPlaylist={m.setSelectedPlaylist}
        setSelectedUser={m.setSelectedUser}
        setCurrentPage={m.setCurrentPage}
        setShowCreateDialog={m.setShowCreateDialog}
        onNavigate={onNavigate}
      />
    </>
  );

  if (sheet) {
    return (
      <div className={s.sidebar} data-variant="sheet">
        {content}
      </div>
    );
  }

  return (
    <aside
      className={s.sidebar}
      data-variant="rail"
      data-collapsed={rail ? 'true' : undefined}
      aria-label={m.sidebarHidden ? 'Collapsed sidebar' : 'Sidebar'}
    >
      {content}
    </aside>
  );
}

interface SidebarPlaylistsProps {
  playlists: Playlist[];
  /** Classic shows the empty state until the client has mounted. */
  ready: boolean;
  selectedId: string | null;
  rail: boolean;
  /** Phone sheet: larger touch targets. */
  sheet: boolean;
  setSelectedPlaylist: SpiceUiModel['setSelectedPlaylist'];
  setSelectedUser: SpiceUiModel['setSelectedUser'];
  setCurrentPage: SpiceUiModel['setCurrentPage'];
  setShowCreateDialog: SpiceUiModel['setShowCreateDialog'];
  onNavigate?: () => void;
}

/**
 * The user's playlists. Memoized on stable setters so playback progress
 * re-renders of the shell skip it (and its artwork resolution) entirely.
 */
const SidebarPlaylists = memo(function SidebarPlaylists({
  playlists,
  ready,
  selectedId,
  rail,
  sheet,
  setSelectedPlaylist,
  setSelectedUser,
  setCurrentPage,
  setShowCreateDialog,
  onNavigate,
}: SidebarPlaylistsProps) {
  const headingId = useId();
  const empty = !ready || playlists.length === 0;

  const openPlaylist = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setSelectedUser(null);
    setCurrentPage('library');
    onNavigate?.();
  };

  const createPlaylist = () => {
    setShowCreateDialog(true);
    onNavigate?.();
  };

  return (
    <section
      className={s.section}
      aria-labelledby={rail ? undefined : headingId}
      aria-label={rail ? 'Playlists' : undefined}
    >
      <div className={s.sectionHeader}>
        {rail ? null : (
          <h2 id={headingId} className={s.sectionLabel}>
            Playlists
          </h2>
        )}
        <IconButton icon="plus" size={sheet ? 'md' : 'xs'} label="Create Playlist" onClick={createPlaylist} />
      </div>

      {empty ? (
        rail ? null : (
          <div className={s.empty}>
            <p className={s.emptyTitle}>No playlists yet</p>
            <p className={s.emptyText}>Create one with the + button to keep your favorites close.</p>
          </div>
        )
      ) : (
        <ul className={s.playlists}>
          {playlists.map((playlist) => {
            const active = selectedId === playlist.id;
            return (
              <li key={playlist.id}>
                <button
                  type="button"
                  className={s.playlistItem}
                  aria-current={active ? 'true' : undefined}
                  aria-label={rail ? `${playlist.title}${playlist.shared ? ' (Shared)' : ''}` : undefined}
                  title={rail ? playlist.title : undefined}
                  onClick={() => openPlaylist(playlist)}
                >
                  <PlaylistArtwork playlist={playlist} size={rail ? 40 : 36} className={s.playlistArt} />
                  {rail ? null : (
                    <span className={s.playlistText}>
                      <span className={s.playlistTitle}>{playlist.title}</span>
                      <span className={s.playlistMeta}>
                        <span className={s.playlistCount}>{formatCount(playlist.tracks.length, 'track')}</span>
                        {playlist.shared ? (
                          <Badge variant="outline" className={s.sharedBadge}>
                            Shared
                          </Badge>
                        ) : null}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
});
