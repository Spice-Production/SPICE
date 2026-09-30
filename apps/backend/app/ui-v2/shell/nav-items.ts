import type { AppPage } from '../../spice-app';
import type { SpiceUiModel } from '../model';
import type { IconName } from '../icons';

export interface ShellNavItem {
  page: AppPage;
  label: string;
  icon: IconName;
}

export const PAGE_ICONS: Record<AppPage, IconName> = {
  home: 'home',
  search: 'search',
  library: 'library',
  account: 'user',
  settings: 'settings',
};

/** Sidebar pages, honoring Settings → Sidebar panels exactly like the classic sidebar. */
export function sidebarNavItems(
  m: Pick<SpiceUiModel, 'sidebarSearchEnabled' | 'sidebarProfileEnabled' | 'sidebarSettingsEnabled'>,
): ShellNavItem[] {
  const items: ShellNavItem[] = [{ page: 'home', label: 'Home', icon: PAGE_ICONS.home }];
  if (m.sidebarSearchEnabled) items.push({ page: 'search', label: 'Search', icon: PAGE_ICONS.search });
  items.push({ page: 'library', label: 'Library', icon: PAGE_ICONS.library });
  if (m.sidebarProfileEnabled) items.push({ page: 'account', label: 'Profile', icon: PAGE_ICONS.account });
  if (m.sidebarSettingsEnabled) items.push({ page: 'settings', label: 'Settings', icon: PAGE_ICONS.settings });
  return items;
}

/** Phone tab bar. Like the classic mobile bar it ignores the sidebar panel toggles. */
export const MOBILE_NAV_ITEMS: ReadonlyArray<ShellNavItem> = [
  { page: 'home', label: 'Home', icon: PAGE_ICONS.home },
  { page: 'search', label: 'Search', icon: PAGE_ICONS.search },
  { page: 'library', label: 'Library', icon: PAGE_ICONS.library },
  { page: 'settings', label: 'Settings', icon: PAGE_ICONS.settings },
];
