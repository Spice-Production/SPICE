/**
 * Typed views over the loosely typed listener payloads SpiceApp keeps
 * (`userSearchResults`, `selectedUser`, `selectedUserProfileData` are `any`).
 * Handlers always receive the original objects; these views only drive rendering.
 */

import type { Playlist } from '../../../spice-app';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown, fallback = '') {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function count(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface ListenerSummary {
  id: string;
  /** Stable React key, same shape as the classic list. */
  key: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  gradient: string | undefined;
  isPrivate: boolean;
  songsPlayed: number;
}

/** A row from `/users/search` (or the `selectedUser` object built from one). */
export function toListenerSummary(value: unknown): ListenerSummary | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const username = text(value.username);
  const displayName = text(value.displayName) || username || 'Spice Listener';
  return {
    id,
    key: `${id}:${text(value.profileId) || username}`,
    username,
    displayName,
    avatarUrl: text(value.avatarUrl) || null,
    gradient: text(value.gradient) || undefined,
    isPrivate: value.isPrivate === true,
    songsPlayed: count(value.songsPlayed),
  };
}

export interface ListenerRow {
  /** The payload object, handed unchanged to handleSelectUser. */
  source: unknown;
  view: ListenerSummary;
}

export function toListenerRows(values: readonly unknown[]): ListenerRow[] {
  const rows: ListenerRow[] = [];
  for (const source of values) {
    const view = toListenerSummary(source);
    if (view) rows.push({ source, view });
  }
  return rows;
}

export interface ListenerProfile {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  gradient: string | undefined;
  joinedAt: string;
  isPrivate: boolean;
}

export interface ListenerStats {
  songsPlayed: number;
  likedCount: number;
  playlistsCount: number;
}

export interface ListenerPlaylist {
  /** The payload object, handed unchanged to setSelectedPlaylist like the classic grid. */
  source: Playlist;
  /** Render-safe view (always has a title and a tracks array). */
  view: Playlist;
  trackCount: number;
}

export interface ListenerProfileData {
  profile: ListenerProfile;
  likesCount: number;
  isLikedByMe: boolean;
  playlists: ListenerPlaylist[];
  stats: ListenerStats | null;
}

function toListenerPlaylist(entry: UnknownRecord): ListenerPlaylist {
  const source = entry as unknown as Playlist;
  const hasTracks = Array.isArray(entry.tracks);
  const title = text(entry.title);
  const view = hasTracks && title ? source : ({ ...entry, title: title || 'Untitled playlist', tracks: hasTracks ? entry.tracks : [] } as unknown as Playlist);
  return { source, view, trackCount: view.tracks.length };
}

/** The `/users/profile` payload. */
export function toListenerProfileData(value: unknown): ListenerProfileData | null {
  if (!isRecord(value) || !isRecord(value.profile)) return null;
  const profile = value.profile;
  const username = text(profile.username);
  const playlists = Array.isArray(value.playlists)
    ? value.playlists
        .filter((entry): entry is UnknownRecord => isRecord(entry) && typeof entry.id === 'string')
        .map(toListenerPlaylist)
    : [];
  const stats = isRecord(value.stats)
    ? {
        songsPlayed: count(value.stats.songsPlayed),
        likedCount: count(value.stats.likedCount),
        playlistsCount: count(value.stats.playlistsCount),
      }
    : null;
  return {
    profile: {
      displayName: text(profile.displayName) || username || 'Spice Listener',
      username,
      avatarUrl: text(profile.avatarUrl) || null,
      bio: text(profile.bio),
      gradient: text(profile.gradient) || undefined,
      joinedAt: text(profile.joinedAt),
      isPrivate: profile.isPrivate === true,
    },
    likesCount: count(value.likesCount),
    isLikedByMe: value.isLikedByMe === true,
    playlists,
    stats,
  };
}
