import type { SpkNavItem } from '@/components/ui';

/** Shared primary nav for the rebuilt surfaces (copy-stable, one home). */
export const V2_NAV: SpkNavItem[] = [
  { id: 'music', label: 'Music', href: '/' },
  { id: 'movies', label: 'Movies', href: '/v2/movie' },
  { id: 'shows', label: 'Shows', href: '/v2/shows' },
  { id: 'anime', label: 'Anime', href: '/v2/anime' },
  { id: 'profile', label: 'Profile', href: '/v2/profile' },
  { id: 'settings', label: 'Settings', href: '/v2/settings' },
];
