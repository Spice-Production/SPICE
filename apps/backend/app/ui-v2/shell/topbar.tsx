'use client';

import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { IconButton, Kbd, useIsMobile } from '../primitives';
import { NotificationsMenu } from './notifications';
import { ProfileMenu } from './profile-menu';
import { TopbarSearch } from './search-tray';
import { useCommandShortcutLabel } from './tray-keyboard';
import s from './topbar.module.css';

/**
 * Topbar: back button, search + its tray, the ⌘K hint, notifications,
 * settings shortcut, and the profile menu. Honors `topbarLayout`
 * ('embedded' = bordered bar, 'floating' = borderless) via `data-layout`.
 */
export function Topbar({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const m = useSpiceUi();
  const isMobile = useIsMobile();
  const shortcutLabel = useCommandShortcutLabel();
  const inDetailView = Boolean(m.selectedPlaylist || m.selectedUser);
  const settingsActive = m.currentPage === 'settings' && !m.selectedPlaylist;
  // A playlist opened from a listener's profile returns to that profile (the
  // classic "Back to Profile"); everything else leaves to the underlying page.
  const backToProfile = Boolean(m.selectedPlaylist && m.selectedUser);

  const goBack = () => {
    if (m.selectedPlaylist) m.setSelectedPlaylist(null);
    else m.setSelectedUser(null);
  };

  return (
    <header className={s.topbar} data-layout={m.topbarLayout} aria-label="SPICE topbar">
      {isMobile ? <IconButton icon="menu" label="Open navigation" onClick={onOpenNavigation} /> : null}

      {inDetailView ? (
        <IconButton icon="chevronLeft" label={backToProfile ? 'Back to profile' : 'Back'} className={s.backBtn} onClick={goBack} />
      ) : null}

      <TopbarSearch />

      {!isMobile ? (
        <button type="button" className={s.commandHint} onClick={() => m.setCommandPaletteOpen(true)}>
          <Icon name="command" size={13} />
          <span>Command menu</span>
          <Kbd>{shortcutLabel}</Kbd>
        </button>
      ) : null}

      <div className={s.actions}>
        <NotificationsMenu />
        {!isMobile ? (
          <IconButton
            icon="settings"
            label="Open settings"
            active={settingsActive}
            onClick={m.openSettingsFromTopbar}
          />
        ) : null}
        <ProfileMenu />
      </div>
    </header>
  );
}
