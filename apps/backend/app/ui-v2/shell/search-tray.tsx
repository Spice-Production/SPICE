'use client';

/* eslint-disable react-hooks/refs -- topbarSearchShellRef is a plain DOM RefObject owned by
   SpiceApp's model; attaching it via a JSX `ref` prop is the sanctioned way to hand it this
   trigger's container node so SpiceApp's own outside-click effect keeps working, not a
   render-time read of `.current`. The compiler-backed rule can't tell that apart once the
   ref flows through the shared model object, so it over-reports across this file. */

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { TopbarSearchMode, Track } from '../../spice-app';
import { clearSearchCache, deleteRecentSearchEntry, getRecentCachedSearches } from '../../spice-storage';
import { useNavigation } from '../actions';
import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { artistNames, TrackArtwork } from '../media';
import { Avatar, IconButton, Portal, Skeleton, Tabs, useAnchoredPosition } from '../primitives';
import { handleTrayArrowKeys, trayItems } from './tray-keyboard';
import s from './topbar.module.css';

/** `topbarUserSearchResults` is untyped (`any[]`) on the model; this is the
 * shape the classic topbar tray actually reads off each entry. */
interface TopbarUserResult {
  id: string;
  profileId?: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  gradient?: string;
}

/** Placeholder rows shown while a search is in flight and nothing is on screen yet. */
function TrayLoading() {
  return (
    <div className={s.trayLoading} aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className={s.skeletonRow}>
          <Skeleton width={36} height={36} radius="var(--sx-radius-sm)" />
          <span className={s.skeletonText}>
            <Skeleton width="58%" height={10} />
            <Skeleton width="34%" height={9} />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Search field + its results tray, mirroring the classic
 * `app-topbar__search-shell`. The field's wrapper carries
 * `topbarSearchShellRef`, which SpiceApp's own outside-click effect depends
 * on; the portaled tray stops its pointerdown from bubbling to `document`
 * so that legacy listener never races a click's mousedown against its own
 * click (see the file-level eslint-disable above for why the ref itself
 * flows in as a plain JSX `ref` prop).
 */
export function TopbarSearch() {
  const m = useSpiceUi();
  const { openUser } = useNavigation();
  const userResults = m.topbarUserSearchResults as TopbarUserResult[];
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { style, measured } = useAnchoredPosition(m.topbarSearchShellRef, panelRef, m.shouldShowTopbarSearchTray, {
    side: 'bottom',
    align: 'start',
    offset: 8,
  });
  const trimmedQuery = m.topbarSearchQuery.trim();
  const modeLabel = m.TOPBAR_SEARCH_MODE_LABELS[m.topbarSearchMode];

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      m.setTopbarSearchTrayOpen(false);
    } else if (event.key === 'ArrowDown' && m.shouldShowTopbarSearchTray) {
      // Result rows live in a portal, so hand focus over explicitly.
      const first = trayItems(panelRef.current)[0];
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      // Focusing the field re-opens the tray (its onFocus), so close afterwards.
      inputRef.current?.focus();
      m.setTopbarSearchTrayOpen(false);
      return;
    }
    handleTrayArrowKeys(event, trayItems(panelRef.current), () => inputRef.current?.focus());
  };

  return (
    <div className={s.searchArea} ref={m.topbarSearchShellRef}>
      <form className={s.searchForm} role="search" onSubmit={m.handleTopbarSearchSubmit}>
        <Icon name="search" size={15} />
        <input
          ref={inputRef}
          type="search"
          className={s.searchInput}
          placeholder={
            m.topbarSearchMode === 'users'
              ? 'Search users...'
              : `Search ${m.SEARCH_PROVIDER_LABELS[m.searchProvider]} or paste a link...`
          }
          value={m.topbarSearchQuery}
          onChange={m.handleTopbarSearchInput}
          onFocus={() => {
            const recent = getRecentCachedSearches();
            m.setRecentSearchEntries(recent);
            if (m.topbarSearchQuery.trim() || recent.length > 0 || m.searchResults.length > 0) {
              m.setTopbarSearchTrayOpen(true);
            }
          }}
          onKeyDown={onInputKeyDown}
          autoComplete="off"
          aria-label="Search SPICE"
        />
        <span className={s.modeSelectWrap}>
          {/* Invisible copy of the selected label so the picker sizes to its content. */}
          <span className={s.modeSizer} aria-hidden="true">
            {modeLabel}
          </span>
          <select
            className={s.modeSelect}
            value={m.topbarSearchMode}
            onChange={m.handleTopbarSearchModeChange}
            aria-label="Topbar search mode"
            title={`Search source: ${modeLabel}`}
          >
            {(Object.entries(m.TOPBAR_SEARCH_MODE_LABELS) as [TopbarSearchMode, string][]).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <span className={s.modeChevron} aria-hidden="true">
            <Icon name="chevronDown" size={12} />
          </span>
          <span className={s.modeGlyph} aria-hidden="true">
            <Icon name="sliders" size={16} />
          </span>
        </span>
      </form>

      {m.shouldShowTopbarSearchTray ? (
        <Portal>
          <div
            ref={panelRef}
            className={s.tray}
            style={style}
            data-measuring={measured ? undefined : 'true'}
            role="region"
            aria-label="Search results"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={onPanelKeyDown}
          >
            <div className={s.trayHeader}>
              <div className={s.trayHeaderText}>
                <span className={s.trayEyebrow}>Quick search</span>
                <span className={s.trayTitle}>{trimmedQuery || 'Recent searches'}</span>
              </div>
              <IconButton icon="x" size="sm" label="Close search tray" onClick={() => m.setTopbarSearchTrayOpen(false)} />
            </div>

            <div className={s.trayBody}>
              {trimmedQuery ? (
                <Tabs
                  value={m.quickSearchTab}
                  onValueChange={m.setQuickSearchTab}
                  label="Search results"
                  size="sm"
                  className={s.trayTabsRow}
                  items={[
                    { value: 'tracks', label: 'Songs' },
                    { value: 'users', label: 'Listeners' },
                  ]}
                />
              ) : null}

              {!trimmedQuery && m.topbarRecentSuggestions.length > 0 ? (
                <div className={s.traySection}>
                  <div className={s.traySectionTitle}>
                    <span>Previous queries</span>
                    <button
                      type="button"
                      className={s.linkBtn}
                      data-tray-item
                      title="Clear search history"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        clearSearchCache();
                        m.setRecentSearchEntries([]);
                      }}
                    >
                      Clear all
                    </button>
                  </div>
                  <div className={s.chipRow}>
                    {m.topbarRecentSuggestions.map((entry) => (
                      <span key={`${entry.sourceId ?? 'unknown'}:${entry.query}`} className={s.chip}>
                        <button
                          type="button"
                          className={s.chipLabel}
                          data-tray-item
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => m.runRecentTopbarSearch(entry)}
                          title={`Search ${entry.query}`}
                        >
                          {entry.query}
                        </button>
                        <button
                          type="button"
                          className={s.chipRemove}
                          data-tray-item
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            deleteRecentSearchEntry(entry.query, entry.sourceId);
                            m.setRecentSearchEntries(getRecentCachedSearches());
                          }}
                          title="Delete query"
                          aria-label={`Delete "${entry.query}" from recent searches`}
                        >
                          <Icon name="x" size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {!trimmedQuery || m.quickSearchTab === 'tracks' ? (
                <div className={s.traySection}>
                  <div className={s.traySectionTitle}>
                    <span aria-live="polite">{m.isSearching ? 'Searching…' : 'Songs'}</span>
                    {m.searchResultsSource === 'cache' ? <span>saved locally</span> : null}
                  </div>
                  {m.topbarTrayResults.length > 0 ? (
                    <div className={s.resultList}>
                      {m.topbarTrayResults.map((song) => (
                        <TrackResultRow key={`${song.sourceId || 'music'}:${song.id}`} track={song} />
                      ))}
                    </div>
                  ) : m.isSearching ? (
                    <TrayLoading />
                  ) : (
                    <p className={s.trayEmpty}>
                      {trimmedQuery ? 'No songs found matching this query.' : 'Pick a previous query or type a new search.'}
                    </p>
                  )}
                </div>
              ) : null}

              {trimmedQuery && m.quickSearchTab === 'users' ? (
                <div className={s.traySection}>
                  <div className={s.traySectionTitle}>
                    <span aria-live="polite">{m.isSearchingTopbarUsers ? 'Searching…' : 'Listeners'}</span>
                  </div>
                  {userResults.length > 0 ? (
                    <div className={s.resultList}>
                      {userResults.slice(0, 8).map((user) => {
                        const isSelf = user.id === m.cloudUser?.id;
                        return (
                          <div key={`${user.id}:${user.profileId || user.username}`} className={s.resultRow}>
                            <button
                              type="button"
                              className={s.resultMain}
                              data-tray-item
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                openUser(user);
                                m.setTopbarSearchTrayOpen(false);
                              }}
                            >
                              <Avatar src={user.avatarUrl} name={user.displayName} gradient={user.gradient} size={36} className={s.resultAvatar} />
                              <span className={s.resultText}>
                                <span className={s.resultTitle}>
                                  {user.displayName}
                                  {isSelf ? <span className={s.resultBadge}>You</span> : null}
                                </span>
                                <span className={s.resultMeta}>@{user.username}</span>
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : m.isSearchingTopbarUsers ? (
                    <TrayLoading />
                  ) : (
                    <p className={s.trayEmpty}>No users found matching this query.</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </Portal>
      ) : null}
    </div>
  );
}

function TrackResultRow({ track }: { track: Track }) {
  const m = useSpiceUi();
  return (
    <div className={s.resultRow}>
      <button
        type="button"
        className={s.resultMain}
        data-tray-item
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          m.startTrackOnActiveReceiver(track, m.searchResults);
          m.setTopbarSearchTrayOpen(false);
        }}
      >
        <TrackArtwork track={track} size={36} className={s.resultArt} />
        <span className={s.resultText}>
          <span className={s.resultTitle}>{track.title}</span>
          <span className={s.resultMeta}>
            {artistNames(track)}
            <span className={s.resultSource}>{m.trackSourceLabel(track)}</span>
          </span>
        </span>
      </button>
      <IconButton
        icon="share"
        size="sm"
        data-tray-item
        label={`Share "${track.title}"`}
        onClick={(event) => m.shareSongLink(track, event)}
      />
    </div>
  );
}
