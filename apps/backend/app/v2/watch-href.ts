/**
 * v2 watch links. Mirrors watchPageHref's routing (shows carry ?s=/&e=
 * resume params, everything else lands on the movie player) but stays
 * inside the rebuilt tree.
 */
export function v2WatchPageHref(entry: { kind: string; tmdbId: string; season?: number; episode?: number }): string {
  if (entry.kind === 'show') {
    const params = new URLSearchParams();
    if (entry.season) params.set('s', String(entry.season));
    if (entry.episode) params.set('e', String(entry.episode));
    const query = params.toString();
    return `/v2/shows/watch/${entry.tmdbId}${query ? `?${query}` : ''}`;
  }
  return `/v2/movie/watch/${entry.tmdbId}`;
}
