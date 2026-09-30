'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { filterCommandPaletteEntries } from '../../command-palette-core';
import type { CommandPaletteCommand } from '../../command-palette';
import { useSpiceUi } from '../context';
import { Icon, type IconName } from '../icons';
import { Dialog, Kbd } from '../primitives';
import type { SpiceUiModel } from '../model';
import { useCommandShortcutLabel } from './tray-keyboard';
import s from './command-menu.module.css';

/** Presentational only — CommandPaletteCommand carries no icon of its own. */
const COMMAND_ICONS: Record<string, IconName> = {
  'page-home': 'home',
  'page-search': 'search',
  'page-library': 'library',
  'page-account': 'user',
  'page-settings': 'settings',
  'player-toggle': 'play',
  'player-queue': 'listMusic',
  'player-smart-queue': 'sparkles',
  'player-expanded': 'maximize',
  'playlist-create': 'listPlus',
  'remote-connect': 'cast',
  'interface-preview': 'monitor',
};

/** Browse-mode section headings, derived from the command id prefix. */
function commandGroup(id: string) {
  if (id.startsWith('page-')) return 'Go to';
  if (id.startsWith('player-')) return 'Playback';
  if (id.startsWith('playlist-')) return 'Library';
  if (id.startsWith('remote-')) return 'Devices';
  if (id.startsWith('interface-')) return 'Interface';
  return 'Commands';
}

/** More than the classic palette's 12: browsing should list every command. */
const BROWSE_LIMIT = 24;

const optionId = (key: string) => `spice-command-option-${key}`;

/**
 * ⌘K / Ctrl K command menu. Reuses the classic filtering core so results
 * match the legacy command palette exactly; open state and the keyboard
 * shortcut itself live in SpiceApp (`commandPaletteOpen`).
 */
export function CommandMenu() {
  const m = useSpiceUi();
  return (
    <Dialog open={m.commandPaletteOpen} onOpenChange={m.setCommandPaletteOpen} size="lg" hideClose label="Command menu">
      {/* Mounted fresh each time it opens (Dialog renders nothing while closed), so the
          query and selection always start clean without an effect-driven reset. */}
      {m.commandPaletteOpen ? <CommandMenuBody m={m} /> : null}
    </Dialog>
  );
}

function CommandMenuBody({ m }: { m: SpiceUiModel }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const shortcutLabel = useCommandShortcutLabel();

  const filtered = useMemo(
    () => filterCommandPaletteEntries(m.commandPaletteCommands, query, BROWSE_LIMIT),
    [m.commandPaletteCommands, query],
  );
  const trimmed = query.trim();
  const hasQuickSearch = trimmed.length > 0;
  const resultCount = filtered.length + (hasQuickSearch ? 1 : 0);
  const activeIndex = Math.min(selectedIndex, Math.max(0, resultCount - 1));
  const activeOptionId =
    activeIndex < filtered.length
      ? optionId(filtered[activeIndex]?.id ?? '')
      : hasQuickSearch
        ? optionId('quick-search')
        : undefined;

  // Browse mode keeps the palette's own order (its ids are already contiguous per
  // section) and just labels runs; a typed query stays one relevance-ranked list.
  const sections = useMemo(() => {
    const runs: Array<{ label: string; start: number; commands: CommandPaletteCommand[] }> = [];
    filtered.forEach((command, index) => {
      const label = hasQuickSearch ? 'Commands' : commandGroup(command.id);
      const last = runs[runs.length - 1];
      if (last && last.label === label) last.commands.push(command);
      else runs.push({ label, start: index, commands: [command] });
    });
    return runs;
  }, [filtered, hasQuickSearch]);

  const runEntry = (command: CommandPaletteCommand) => {
    m.setCommandPaletteOpen(false);
    command.run();
  };

  const runQuickSearch = () => {
    m.setCommandPaletteOpen(false);
    m.runCommandQuickSearch(trimmed);
  };

  const runActive = () => {
    if (activeIndex < filtered.length) {
      const command = filtered[activeIndex];
      if (command) runEntry(command);
    } else if (hasQuickSearch) {
      runQuickSearch();
    }
  };

  const moveSelection = (next: number) => {
    setSelectedIndex(next);
    // Keyboard moves keep the active row visible; hover changes deliberately do not.
    requestAnimationFrame(() => {
      resultsRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(resultCount > 0 ? (activeIndex + 1) % resultCount : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(resultCount > 0 ? (activeIndex - 1 + resultCount) % resultCount : 0);
    } else if (event.key === 'Enter' && resultCount > 0 && !event.nativeEvent.isComposing) {
      event.preventDefault();
      runActive();
    }
  };

  return (
    <div className={s.panel}>
      <div className={s.inputRow}>
        <Icon name="search" size={16} />
        {/* Dialog focuses the panel's first focusable child on mount, which is this
            input, so no explicit autoFocus/initialFocusRef wiring is needed here. */}
        <input
          className={s.input}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Type a command or search your music..."
          aria-label="Command or search query"
          role="combobox"
          aria-expanded="true"
          aria-controls="spice-command-results"
          aria-activedescendant={activeOptionId}
          autoComplete="off"
        />
        <Kbd>Esc</Kbd>
      </div>

      <div ref={resultsRef} id="spice-command-results" className={s.results} role="listbox" aria-label="Commands">
        {sections.map((section) => (
          <div key={`${section.label}:${section.start}`} className={s.group} role="group" aria-label={section.label}>
            <div className={s.groupLabel} aria-hidden="true">
              {section.label}
            </div>
            {section.commands.map((command, offset) => {
              const index = section.start + offset;
              const active = activeIndex === index;
              return (
                <button
                  key={command.id}
                  id={optionId(command.id)}
                  type="button"
                  tabIndex={-1}
                  role="option"
                  aria-selected={active}
                  data-active={active ? 'true' : undefined}
                  className={s.item}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => runEntry(command)}
                >
                  <span className={s.itemIcon}>
                    <Icon name={COMMAND_ICONS[command.id] ?? 'command'} size={16} />
                  </span>
                  <span className={s.itemText}>
                    <span className={s.itemLabel}>{command.label}</span>
                    {command.description ? <span className={s.itemDescription}>{command.description}</span> : null}
                  </span>
                  {command.shortcut ? (
                    <span className={s.itemShortcut}>
                      <Kbd>{command.shortcut}</Kbd>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}

        {hasQuickSearch ? (
          <div className={s.group} role="group" aria-label="Search">
            <div className={s.groupLabel} aria-hidden="true">
              Search
            </div>
            <button
              id={optionId('quick-search')}
              type="button"
              tabIndex={-1}
              role="option"
              aria-selected={activeIndex === filtered.length}
              data-active={activeIndex === filtered.length ? 'true' : undefined}
              className={s.item}
              onMouseEnter={() => setSelectedIndex(filtered.length)}
              onClick={runQuickSearch}
            >
              <span className={s.itemIcon}>
                <Icon name="arrowUpRight" size={16} />
              </span>
              <span className={s.itemText}>
                <span className={s.itemLabel}>Search for &ldquo;{trimmed}&rdquo;</span>
                <span className={s.itemDescription}>Open global Hybrid music search</span>
              </span>
              <span className={s.itemShortcut}>
                <Kbd>Enter</Kbd>
              </span>
            </button>
          </div>
        ) : null}

        {resultCount === 0 ? <p className={s.empty}>No matching commands.</p> : null}
      </div>

      <footer className={s.footer}>
        <span className={s.footerHint}>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className={s.footerHint}>
          <Kbd>Enter</Kbd> run
        </span>
        <span className={s.footerHint}>
          Global shortcut <Kbd>{shortcutLabel}</Kbd>
        </span>
      </footer>
    </div>
  );
}
