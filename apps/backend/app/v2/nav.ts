import type { SpkNavItem } from '@/components/ui';

/** Shared primary nav for the rebuilt surfaces (copy-stable, one home).
 * Profile + Settings live behind the top-corner account control, not here. */
export const V2_NAV: SpkNavItem[] = [
  { id: 'music', label: 'Music', href: '/' },
  { id: 'search', label: 'Search', href: '/v2/music' },
  { id: 'library', label: 'Library', href: '/v2/music#library' },
  { id: 'movies', label: 'Movies', href: '/v2/movie' },
  { id: 'shows', label: 'Shows', href: '/v2/shows' },
  { id: 'anime', label: 'Anime', href: '/v2/anime' },
];
