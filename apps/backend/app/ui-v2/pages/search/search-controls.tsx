'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

import { parseSupportedMediaLink, type SupportedMediaLink } from '@/lib/media-link';
import type { SearchProvider } from '../../../spice-app';
import { useSpiceUi } from '../../context';
import { Icon, type IconName } from '../../icons';
import { Button, cn, IconButton, Input, Kbd, primitiveStyles as ps, Spinner, Switch } from '../../primitives';
import s from '../search.module.css';

/** Same options (and order) as the classic provider select. */
const PROVIDER_OPTIONS: ReadonlyArray<{ value: SearchProvider; label: string; icon: IconName }> = [
  { value: 'hybrid', label: 'Hybrid', icon: 'layers' },
  { value: 'youtube_music', label: 'YouTube Music', icon: 'youtube' },
  { value: 'youtube_videos', label: 'YouTube Videos', icon: 'video' },
  { value: 'soundcloud', label: 'SoundCloud', icon: 'cloud' },
];

/**
 * Focus on mount like the classic `autoFocus`, but only where it won't raise a phone
 * keyboard, and never while a keyboard user is arrowing through the Tracks/Users tabs
 * (the field mounts on every tab switch and would steal focus from the tab list).
 */
function useDesktopAutoFocus(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (!window.matchMedia('(min-width: 769px)').matches) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.getAttribute('role') === 'tab' && active.matches(':focus-visible')) return;
    ref.current?.focus({ preventScroll: true });
  }, [ref]);
}

/** The classic "For you" toggle write: state plus best-effort persistence. */
export function useSetSearchForYou() {
  const m = useSpiceUi();
  return (next: boolean) => {
    m.setSearchForYouOnly(next);
    try {
      localStorage.setItem('spice_search_for_you', String(next));
    } catch {
      // Persistence is best-effort; the toggle still applies for this session.
    }
  };
}

function describeLink(link: SupportedMediaLink) {
  if (link.provider === 'soundcloud') return 'SoundCloud link';
  return `YouTube ${link.kind} link`;
}

export function TrackSearchInput() {
  const m = useSpiceUi();
  const inputRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(inputRef);
  const [opening, setOpening] = useState(false);
  const query = m.searchQuery;
  const pastedLink = useMemo(() => parseSupportedMediaLink(query), [query]);

  // Enter: open a pasted YouTube/SoundCloud link in SPICE, otherwise search now.
  const submit = (value: string) => {
    setOpening(true);
    void m
      .resolvePastedMediaLink(value)
      .then((handled) => {
        if (!handled) m.queueSearch(value, m.searchProvider);
      })
      .finally(() => setOpening(false));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submit(event.currentTarget.value);
  };

  const clear = () => {
    m.setSearchQuery('');
    m.queueSearch('');
    inputRef.current?.focus();
  };

  const hasTrailing = m.isSearching || query.length > 0;

  return (
    <div className={s.inputBlock}>
      <Input
        ref={inputRef}
        type="text"
        size="lg"
        icon="search"
        value={query}
        onChange={m.handleSearchInput}
        onKeyDown={onKeyDown}
        placeholder={`Search ${m.SEARCH_PROVIDER_LABELS[m.searchProvider]} or paste a media link…`}
        aria-label="Search tracks"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        className={cn(s.searchInput, hasTrailing && s.searchInputTrailing)}
        trailing={hasTrailing ? <SearchTrailing busy={m.isSearching} busyLabel="Searching" onClear={query ? clear : undefined} /> : undefined}
      />
      {pastedLink ? (
        <div className={s.linkHint}>
          <Icon name="link" size={14} className={s.linkHintIcon} />
          <span className={s.linkHintText}>
            {describeLink(pastedLink)} detected. Open it directly in SPICE.
          </span>
          <span className={s.linkHintKey} aria-hidden="true">
            <Kbd>Enter</Kbd>
          </span>
          <Button size="sm" variant="secondary" icon="arrowRight" onClick={() => submit(query)} loading={opening}>
            Open link
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function UserSearchInput() {
  const m = useSpiceUi();
  const inputRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(inputRef);
  // handleUserSearch stores the trimmed query; keep the typed text (inner
  // spaces included) on screen while it still matches what was searched.
  const [draft, setDraft] = useState(m.userSearchQuery);
  const value = draft.trim() === m.userSearchQuery ? draft : m.userSearchQuery;

  const search = (next: string) => {
    setDraft(next);
    void m.handleUserSearch(next);
  };

  const hasTrailing = m.isSearchingUsers || value.length > 0;

  return (
    <div className={s.inputBlock}>
      <Input
        ref={inputRef}
        type="text"
        size="lg"
        icon="search"
        value={value}
        onChange={(event) => search(event.target.value)}
        placeholder="Search users by username or display name…"
        aria-label="Search listeners"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        className={cn(s.searchInput, hasTrailing && s.searchInputTrailing)}
        trailing={
          hasTrailing ? (
            <SearchTrailing
              busy={m.isSearchingUsers}
              busyLabel="Searching listeners"
              onClear={
                value
                  ? () => {
                      search('');
                      inputRef.current?.focus();
                    }
                  : undefined
              }
            />
          ) : undefined
        }
      />
    </div>
  );
}

function SearchTrailing({ busy, busyLabel, onClear }: { busy: boolean; busyLabel: string; onClear?: () => void }) {
  return (
    <>
      {busy ? <Spinner size={14} label={busyLabel} className={s.trailingSpinner} /> : null}
      {onClear ? <IconButton icon="x" label="Clear search" size="xs" onClick={onClear} className={s.clearButton} /> : null}
    </>
  );
}

/**
 * Native select so the classic handleSearchProviderChange receives its real
 * change event (it persists the provider and re-runs the current query).
 */
export function ProviderSelect() {
  const m = useSpiceUi();
  const current = PROVIDER_OPTIONS.find((option) => option.value === m.searchProvider) ?? PROVIDER_OPTIONS[0];
  return (
    <div className={cn(ps.inputWrap, s.provider)} title={`Searching ${m.SEARCH_PROVIDER_LABELS[m.searchProvider]}`}>
      <Icon name={current.icon} size={14} className={ps.inputIcon} />
      <select
        className={cn(ps.select, ps['input-sm'], ps.inputWithIcon, s.providerSelect)}
        value={m.searchProvider}
        onChange={m.handleSearchProviderChange}
        aria-label="Search provider"
      >
        {PROVIDER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={14} className={ps.selectChevron} />
    </div>
  );
}

/** Only offered once the private taste profile is ready (classic parity). */
export function ForYouToggle() {
  const m = useSpiceUi();
  const setForYou = useSetSearchForYou();
  const id = useId();
  return (
    <div className={s.forYou} data-checked={m.searchForYouOnly ? 'true' : undefined} title="Show only results that match this profile's taste">
      <Icon name="sparkles" size={14} className={s.forYouIcon} />
      <label htmlFor={id} className={s.forYouLabel}>
        For you
      </label>
      <Switch id={id} checked={m.searchForYouOnly} onCheckedChange={setForYou} />
    </div>
  );
}
