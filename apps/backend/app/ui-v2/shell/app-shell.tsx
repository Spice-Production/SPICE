'use client';

import { useEffect, useRef, useState } from 'react';

import { ScrollContainerContext, useSpiceUi } from '../context';
import { Overlays } from '../overlays/overlays';
import { AccountPage } from '../pages/account';
import { HomePage } from '../pages/home';
import { LibraryPage } from '../pages/library';
import { PlaylistPage } from '../pages/playlist';
import { SearchPage } from '../pages/search';
import { SettingsPage } from '../pages/settings/settings-page';
import { UserProfilePage } from '../pages/user-profile';
import { PlayerRegion } from '../player/player-region';
import { Alert, IconButton, Sheet, useIsMobile } from '../primitives';
import { CommandMenu } from './command-menu';
import { MobileNav } from './mobile-nav';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import s from './shell.module.css';

/** Route resolution mirrors the classic interface: playlist > user > page. */
function PageOutlet() {
  const m = useSpiceUi();
  if (m.selectedPlaylist) return <PlaylistPage />;
  if (m.selectedUser) return <UserProfilePage />;
  switch (m.currentPage) {
    case 'search':
      return <SearchPage />;
    case 'library':
      return <LibraryPage />;
    case 'account':
      return <AccountPage />;
    case 'settings':
      return <SettingsPage />;
    case 'home':
    default:
      return <HomePage />;
  }
}

export function AppShell() {
  const m = useSpiceUi();
  const mainRef = useRef<HTMLElement>(null);
  const isMobile = useIsMobile();
  const [navSheetOpen, setNavSheetOpen] = useState(false);

  const selectedUserKey = m.selectedUser ? String(m.selectedUser.id ?? m.selectedUser.username ?? 'user') : '';
  const routeKey = m.selectedPlaylist
    ? `playlist:${m.selectedPlaylist.id}`
    : m.selectedUser
      ? `user:${selectedUserKey}`
      : `page:${m.currentPage}`;

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [routeKey]);

  return (
    <div
      className={s.shell}
      data-sidebar={m.sidebarHidden ? 'collapsed' : 'expanded'}
      data-player-placement={m.playerPlacement}
      data-player-mode={m.playerViewMode}
      data-topbar={m.topbarLayout}
      data-density={m.playerBarDensity}
    >
      {!isMobile ? (
        <div className={s.sidebarArea}>
          <Sidebar collapsed={m.sidebarHidden} />
        </div>
      ) : null}

      <div className={s.mainArea}>
        <Topbar onOpenNavigation={() => setNavSheetOpen(true)} />
        <ScrollContainerContext.Provider value={mainRef}>
          <main ref={mainRef} id="main" className={s.content} tabIndex={-1} aria-label="Content">
            <div className={s.page} key={routeKey}>
              {m.error ? (
                <Alert
                  variant="danger"
                  title="Something went wrong"
                  className={s.errorAlert}
                  action={<IconButton icon="x" label="Dismiss error" size="xs" onClick={() => m.setError(undefined)} />}
                >
                  {m.error}
                </Alert>
              ) : null}
              <PageOutlet />
            </div>
          </main>
        </ScrollContainerContext.Provider>
      </div>

      <div className={s.playerArea}>
        <PlayerRegion />
      </div>

      {isMobile ? (
        <div className={s.mobileNavArea}>
          <MobileNav />
        </div>
      ) : null}

      {isMobile ? (
        <Sheet side="left" open={navSheetOpen} onOpenChange={setNavSheetOpen} title="SPICE">
          <Sidebar variant="sheet" onNavigate={() => setNavSheetOpen(false)} />
        </Sheet>
      ) : null}

      <CommandMenu />
      <Overlays />
    </div>
  );
}
