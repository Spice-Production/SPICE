// Library sync merges shared with the Kotlin client: the phone is the source of
// truth for pending edits, the cloud snapshot wins once a change has settled.

import type { Playlist, Track } from './models.ts';

export const MAX_SYNCED_HISTORY = 50;

export function mergeTrackSnapshots(base: Track, incoming: Track): Track {
  return {
    id: incoming.id || base.id,
    title: (incoming.title !== 'Track' ? incoming.title : '') || base.title,
    artist: (incoming.artist !== 'Unknown artist' ? incoming.artist : '') || base.artist,
    album: incoming.album || base.album,
    durationMs: incoming.durationMs > 0 ? incoming.durationMs : base.durationMs,
    artworkUrl: incoming.artworkUrl || base.artworkUrl,
    sourceId: incoming.sourceId || base.sourceId,
    localUri: incoming.localUri || base.localUri,
  };
}

function mergeInto(merged: Map<string, Track>, incoming: Track) {
  const id = incoming.id.trim();
  if (!id) return;
  const existing = merged.get(id);
  merged.set(id, existing ? mergeTrackSnapshots(existing, incoming) : incoming);
}

export function mergeSyncTracks(remote: Track[], local: Track[]): Track[] {
  const merged = new Map<string, Track>();
  for (const track of [...remote, ...local]) mergeInto(merged, track);
  return [...merged.values()];
}

export function mergeSyncLikes(
  remote: Track[],
  local: Track[],
  pendingLocalTrackIds: ReadonlySet<string> = new Set(),
  initialReconciliation = false,
): Track[] {
  const merged = new Map<string, Track>();
  for (const track of remote) {
    const id = track.id.trim();
    if (id) merged.set(id, track);
  }
  if (initialReconciliation) {
    for (const track of local) mergeInto(merged, track);
  }
  const localById = new Map(local.map((track) => [track.id.trim(), track] as const));
  for (const pendingId of pendingLocalTrackIds) {
    const localTrack = localById.get(pendingId);
    if (!localTrack) {
      merged.delete(pendingId);
    } else {
      const existing = merged.get(pendingId);
      merged.set(pendingId, existing ? mergeTrackSnapshots(existing, localTrack) : localTrack);
    }
  }
  return [...merged.values()];
}

export function mergeSyncHistory(
  remote: Track[],
  local: Track[],
  pendingLocalTrackIds: ReadonlySet<string> = new Set(),
  initialReconciliation = false,
): Track[] {
  const localPending = local.filter((track) => pendingLocalTrackIds.has(track.id));
  const ordered =
    localPending.length > 0
      ? [...localPending, ...remote, ...local]
      : initialReconciliation
        ? [...remote, ...local]
        : remote;
  const merged = new Map<string, Track>();
  for (const track of ordered) mergeInto(merged, track);
  return [...merged.values()].slice(0, MAX_SYNCED_HISTORY);
}

function tracksEqual(first: Track, second: Track): boolean {
  return (
    first.id === second.id &&
    first.title === second.title &&
    first.artist === second.artist &&
    first.album === second.album &&
    first.durationMs === second.durationMs &&
    first.artworkUrl === second.artworkUrl &&
    first.sourceId === second.sourceId &&
    first.localUri === second.localUri
  );
}

export function syncTracksMatch(first: Track[], second: Track[]): boolean {
  return first.length === second.length && first.every((track, index) => tracksEqual(track, second[index]!));
}

function playlistsEqual(first: Playlist, second: Playlist): boolean {
  return (
    first.id === second.id &&
    first.title === second.title &&
    first.description === second.description &&
    first.coverUrl === second.coverUrl &&
    first.shared === second.shared &&
    first.shareRole === second.shareRole &&
    first.isPublic === second.isPublic &&
    syncTracksMatch(first.tracks, second.tracks)
  );
}

export function syncPlaylistsMatch(first: Playlist[], second: Playlist[]): boolean {
  return first.length === second.length && first.every((playlist, index) => playlistsEqual(playlist, second[index]!));
}

export function mergeSyncPlaylistTracks(preferred: Track[], incoming: Track[]): Track[] {
  const merged = [...preferred];
  const preferredIndexes = new Map<string, number[]>();
  merged.forEach((track, index) => {
    const indexes = preferredIndexes.get(track.id) ?? [];
    indexes.push(index);
    preferredIndexes.set(track.id, indexes);
  });
  const incomingOccurrences = new Map<string, number>();
  for (const track of incoming) {
    const occurrence = incomingOccurrences.get(track.id) ?? 0;
    incomingOccurrences.set(track.id, occurrence + 1);
    const preferredIndex = preferredIndexes.get(track.id)?.[occurrence];
    if (preferredIndex === undefined) {
      merged.push(track);
    } else {
      merged[preferredIndex] = mergeTrackSnapshots(merged[preferredIndex]!, track);
    }
  }
  return merged;
}

export function mergeSyncPlaylists(remote: Playlist[], local: Playlist[]): Playlist[] {
  const merged = new Map<string, Playlist>();
  for (const incoming of [...remote, ...local]) {
    const id = incoming.id.trim();
    if (!id) continue;
    const existing = merged.get(id);
    merged.set(
      id,
      existing
        ? {
            ...existing,
            title: incoming.title.trim() ? incoming.title : existing.title,
            description: incoming.description.trim() ? incoming.description : existing.description,
            coverUrl: incoming.coverUrl.trim() ? incoming.coverUrl : existing.coverUrl,
            shared: existing.shared || incoming.shared,
            shareRole: incoming.shareRole.trim() ? incoming.shareRole : existing.shareRole,
            isPublic: incoming.isPublic,
            tracks: mergeSyncPlaylistTracks(existing.tracks, incoming.tracks),
          }
        : incoming,
    );
  }
  return [...merged.values()];
}

export function findSyncedPlaylist(local: Playlist, remotePlaylists: Playlist[]): Playlist | null {
  const byId = remotePlaylists.find((remote) => remote.id === local.id);
  if (byId) return byId;
  const localTrackIds = local.tracks.map((track) => track.id).join('\u0000');
  return (
    remotePlaylists.find(
      (remote) => remote.title === local.title && remote.tracks.map((track) => track.id).join('\u0000') === localTrackIds,
    ) ?? null
  );
}

export type LikeMutationResolution = 'Confirm' | 'RollBack' | 'ReconcileNewerChange';

export function resolveLikeMutation(options: {
  requestRevision: number;
  latestRevision: number;
  requestedLiked: boolean;
  currentlyLiked: boolean;
  succeeded: boolean;
}): LikeMutationResolution {
  if (options.requestRevision !== options.latestRevision || options.requestedLiked !== options.currentlyLiked) {
    return 'ReconcileNewerChange';
  }
  return options.succeeded ? 'Confirm' : 'RollBack';
}

export function findPortableSpiceConnectPlaylist(
  playlists: Playlist[],
  playlistId: string,
  playlistTitle: string,
): Playlist | null {
  const byId = playlists.find((playlist) => playlist.id === playlistId);
  if (byId) return byId;
  const normalizedTitle = playlistTitle.trim();
  if (!normalizedTitle) return null;
  return (
    playlists.find(
      (playlist) => !playlist.shared && playlist.title.trim().toLowerCase() === normalizedTitle.toLowerCase(),
    ) ?? null
  );
}
