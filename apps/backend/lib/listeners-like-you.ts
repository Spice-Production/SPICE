// Collaborative taste: "listeners like you" aggregation.
//
// Privacy posture: this module only ever sees and returns track identities
// plus aggregate counts. No user ids, library shapes, or per-user rows are
// exposed to the client — the output answers "which tracks do people whose
// taste overlaps mine keep around", nothing more about any individual.

export interface ListenerTrackRow {
  userId: string;
  trackId: string;
  sourceId: string;
  title: string;
  artistsJson: string;
  artworkUrl: string | null;
  durationMs: number | null;
}

export interface NeighborSelection {
  neighborUserIds: string[];
  sharedCounts: Map<string, number>;
}

export const MIN_SHARED_TRACKS = 2;
export const MAX_NEIGHBORS = 24;
export const MAX_NEIGHBOR_SCAN_ROWS = 4_000;
export const MIN_LISTENERS_PER_TRACK = 2;
export const MAX_RESULT_TRACKS = 24;

/**
 * Picks the closest taste neighbors from rows of OTHER users' likes that
 * overlap the requester's known track ids. Rows are pre-filtered by the
 * caller (requester excluded, track ids limited); this function only groups
 * and ranks.
 */
export function selectTasteNeighbors(
  overlapRows: { userId: string; trackId: string }[],
  options: {
    requesterUserId: string;
    minSharedTracks?: number;
    maxNeighbors?: number;
  },
): NeighborSelection {
  const minSharedTracks = Math.max(1, options.minSharedTracks ?? MIN_SHARED_TRACKS);
  const maxNeighbors = Math.max(1, options.maxNeighbors ?? MAX_NEIGHBORS);
  const sharedCounts = new Map<string, number>();

  for (const row of overlapRows) {
    if (!row || !row.userId || !row.trackId) continue;
    if (row.userId === options.requesterUserId) continue;
    sharedCounts.set(row.userId, (sharedCounts.get(row.userId) ?? 0) + 1);
  }

  const neighborUserIds = Array.from(sharedCounts.entries())
    .filter(([, count]) => count >= minSharedTracks)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, maxNeighbors)
    .map(([userId]) => userId);

  return { neighborUserIds, sharedCounts };
}

export interface ListenerFavorite {
  sourceId: string;
  trackId: string;
  title: string;
  artists: { id?: string; name: string }[];
  artworkUrl: string | null;
  durationMs: number | null;
  listenerCount: number;
}

const parseArtists = (artistsJson: string) => {
  try {
    const parsed = JSON.parse(artistsJson || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((artist) => {
        if (!artist || typeof artist !== 'object') return null;
        const name = typeof artist.name === 'string' ? artist.name.trim() : '';
        if (!name) return null;
        const id = typeof artist.id === 'string' && artist.id.trim() ? artist.id.trim() : undefined;
        return id ? { id, name } : { name };
      })
      .filter((artist): artist is { id?: string; name: string } => artist !== null)
      .slice(0, 8);
  } catch {
    return [];
  }
};

/**
 * Aggregates the neighbors' saved/played tracks into a ranked list of
 * community favorites the requester has not already got in their library.
 */
export function aggregateListenerFavorites(
  neighborTrackRows: ListenerTrackRow[],
  options: {
    excludeTrackKeys?: ReadonlySet<string>;
    minListeners?: number;
    limit?: number;
  } = {},
): ListenerFavorite[] {
  const excludeTrackKeys = options.excludeTrackKeys ?? new Set<string>();
  const minListeners = Math.max(1, options.minListeners ?? MIN_LISTENERS_PER_TRACK);
  const limit = Math.max(1, options.limit ?? MAX_RESULT_TRACKS);

  const aggregated = new Map<string, ListenerFavorite & { userIds: Set<string> }>();
  for (const row of neighborTrackRows) {
    if (!row || !row.trackId || !row.userId || !row.title) continue;
    const key = `${row.sourceId}:${row.trackId}`.toLocaleLowerCase();
    if (excludeTrackKeys.has(key)) continue;
    const existing = aggregated.get(key);
    if (existing) {
      existing.userIds.add(row.userId);
      continue;
    }
    aggregated.set(key, {
      sourceId: row.sourceId,
      trackId: row.trackId,
      title: row.title,
      artists: parseArtists(row.artistsJson),
      artworkUrl: row.artworkUrl ?? null,
      durationMs: row.durationMs ?? null,
      listenerCount: 1,
      userIds: new Set([row.userId]),
    });
  }

  return Array.from(aggregated.values())
    .filter((entry) => entry.userIds.size >= minListeners)
    .sort((left, right) => (
      right.userIds.size - left.userIds.size
      || left.title.localeCompare(right.title)
    ))
    .slice(0, limit)
    .map(({ userIds, ...favorite }) => ({ ...favorite, listenerCount: userIds.size }));
}
