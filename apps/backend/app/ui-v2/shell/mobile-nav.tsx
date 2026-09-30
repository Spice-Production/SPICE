'use client';

import { useNavigation } from '../actions';
import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { MOBILE_NAV_ITEMS } from './nav-items';
import s from './mobile-nav.module.css';

/** Phone tab bar. Mirrors the classic mobile bar's tabs, plus Home for faster reach. */
export function MobileNav() {
  const m = useSpiceUi();
  const { goTo } = useNavigation();
  // Matches the sidebar's own active check (and the classic mobile bar): only
  // a playlist detail view clears the highlight, not a user profile view.
  const active = m.selectedPlaylist ? null : m.currentPage;

  return (
    <nav className={s.nav} aria-label="Primary">
      {MOBILE_NAV_ITEMS.map((item) => {
        const isActive = active === item.page;
        return (
          <button
            key={item.page}
            type="button"
            className={s.tab}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => goTo(item.page)}
          >
            <Icon name={item.icon} size={20} />
            <span className={s.tabLabel}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
