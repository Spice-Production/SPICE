'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  filterCommandPaletteEntries,
  isCommandPaletteShortcut,
  type CommandPaletteEntry,
} from '../../command-palette-core';

export interface PaletteCommand extends CommandPaletteEntry {
  run: () => void;
}

/**
 * Command palette (Ctrl/Cmd+K): navigation across the rebuilt tree plus
 * transport and view actions. Same matching, scoring, and shortcut as
 * the original; the command list is rebuilt for v2 surfaces.
 */
export function CommandPalette({ commands }: { commands: PaletteCommand[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [seenQuery, setSeenQuery] = useState(query);

  // Derived state: a new query restarts highlighting at the top.
  if (query !== seenQuery) {
    setSeenQuery(query);
    setHighlight(0);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isCommandPaletteShortcut(event)) {
        event.preventDefault();
        setOpen((prev) => !prev);
        setQuery('');
        setHighlight(0);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const matches = useMemo(() => filterCommandPaletteEntries(commands, query, 12), [commands, query]);

  if (!open) return null;

  const choose = (entry: PaletteCommand) => {
    setOpen(false);
    setQuery('');
    entry.run();
  };

  return (
    <>
      <style>{`
        .v2-pal-back { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,0.6); }
        .v2-pal { position: fixed; z-index: 61; left: 50%; top: 12vh; transform: translateX(-50%);
          width: min(560px, calc(100vw - 48px)); background: var(--spk-surface, #101014);
          border: 1px solid var(--spk-line, rgba(255,255,255,0.09));
          border-radius: var(--spk-radius-md, 12px); overflow: hidden;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .v2-pal-input { width: 100%; box-sizing: border-box; background: transparent; border: none;
          border-bottom: 1px solid var(--spk-line, rgba(255,255,255,0.09));
          color: var(--spk-text, #e8eaf0); font-size: 0.95rem; padding: 14px 16px; outline: none; }
        .v2-pal-input::placeholder { color: var(--spk-text-3, #6b6f7d); }
        .v2-pal-list { max-height: 320px; overflow-y: auto; padding: 6px; }
        .v2-pal-item { display: block; width: 100%; text-align: left; border: none; background: transparent;
          color: var(--spk-text, #e8eaf0); border-radius: 8px; padding: 9px 10px; cursor: pointer; font-size: 0.88rem; }
        .v2-pal-item[data-on="true"] { background: var(--spk-accent-soft, rgba(139,147,248,0.14)); }
        .v2-pal-sub { display: block; font-size: 0.74rem; color: var(--spk-text-3, #6b6f7d); margin-top: 1px; }
        .v2-pal-empty { padding: 16px; font-size: 0.85rem; color: var(--spk-text-3, #6b6f7d); }
      `}</style>
      <div className="v2-pal-back" aria-hidden onClick={() => setOpen(false)} />
      <div className="v2-pal" role="dialog" aria-label="Command palette">
        <input
          className="v2-pal-input"
          autoFocus
          placeholder="Type a command…"
          aria-label="Command palette"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, matches.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if (e.key === 'Enter' && matches[highlight]) choose(matches[highlight]);
          }}
        />
        <div className="v2-pal-list" role="listbox">
          {matches.length === 0 && <div className="v2-pal-empty">No matching commands.</div>}
          {matches.map((entry, i) => (
            <button
              key={entry.id}
              type="button"
              role="option"
              aria-selected={i === highlight}
              data-on={i === highlight ? 'true' : 'false'}
              className="v2-pal-item"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(entry)}
            >
              {entry.label}
              {entry.description && <span className="v2-pal-sub">{entry.description}</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** The v2 music command list: pages, transport, and view toggles. */
export function useMusicCommands(actions: {
  toggle: () => void;
  next: () => void;
  prev: () => void;
  toggleLyrics: () => void;
}): PaletteCommand[] {
  const router = useRouter();
  const { toggle, next, prev, toggleLyrics } = actions;
  return useMemo(
    () => [
      { id: 'go-music', label: 'Go to Music', keywords: ['player', 'songs'], run: () => router.push('/v2/music') },
      { id: 'go-movies', label: 'Go to Movies', keywords: ['films'], run: () => router.push('/v2/movie') },
      { id: 'go-shows', label: 'Go to Shows', keywords: ['series', 'tv'], run: () => router.push('/v2/shows') },
      { id: 'go-anime', label: 'Go to Anime', keywords: ['animation'], run: () => router.push('/v2/anime') },
      { id: 'go-home', label: 'Go to Home', keywords: ['hub', 'start'], run: () => router.push('/v2') },
      { id: 'play-pause', label: 'Play / Pause', keywords: ['toggle', 'stop'], run: toggle },
      { id: 'next', label: 'Next track', keywords: ['skip', 'forward'], run: next },
      { id: 'prev', label: 'Previous track', keywords: ['back', 'restart'], run: prev },
      { id: 'lyrics', label: 'Toggle lyrics', keywords: ['karaoke', 'words'], run: toggleLyrics },
    ],
    [router, toggle, next, prev, toggleLyrics],
  );
}
