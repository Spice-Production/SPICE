import * as Crypto from 'expo-crypto';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type { DownloadedTrack, Playlist, Track } from '../core/models';
import { makePlaylist, makeTrack } from '../core/models';
import { MAX_SYNCED_HISTORY, mergeSyncHistory, mergeSyncLikes } from '../core/sync';
import { PREF, prefs } from './prefs';

type TrackRow = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  artworkUrl: string;
  sourceId: string;
};

type PlaylistRow = {
  playlistId: string;
  playlistTitle: string;
  playlistDescription: string;
  playlistCoverUrl: string;
  playlistShared: number;
  playlistShareRole: string;
  playlistIsPublic: number;
  trackId: string | null;
  trackTitle: string | null;
  trackArtist: string | null;
  trackAlbum: string | null;
  trackDurationMs: number | null;
  trackArtworkUrl: string | null;
  trackSourceId: string | null;
  trackPosition: number | null;
};

type DownloadRow = {
  downloadId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  downloadedAt: number;
} & { [K in keyof TrackRow as `track${Capitalize<K>}`]: TrackRow[K] };

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  durationMs INTEGER NOT NULL,
  artworkUrl TEXT NOT NULL,
  sourceId TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS liked_tracks (
  trackId TEXT PRIMARY KEY NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  likedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS history_tracks (
  trackId TEXT PRIMARY KEY NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  playedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS index_history_tracks_playedAt ON history_tracks(playedAt);
CREATE TABLE IF NOT EXISTS downloads (
  id TEXT PRIMARY KEY NOT NULL,
  trackId TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  filePath TEXT NOT NULL,
  fileName TEXT NOT NULL,
  mimeType TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  downloadedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS index_downloads_downloadedAt ON downloads(downloadedAt);
CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  coverUrl TEXT NOT NULL,
  shared INTEGER NOT NULL,
  shareRole TEXT NOT NULL,
  isPublic INTEGER NOT NULL,
  sortIndex INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlistId TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  trackId TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (playlistId, position)
);
CREATE INDEX IF NOT EXISTS index_playlist_tracks_trackId ON playlist_tracks(trackId);
`;

const TRACK_COLUMNS = 'tracks.id, tracks.title, tracks.artist, tracks.album, tracks.durationMs, tracks.artworkUrl, tracks.sourceId';

function rowToTrack(row: TrackRow): Track {
  return makeTrack({
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    durationMs: row.durationMs,
    artworkUrl: row.artworkUrl,
    sourceId: row.sourceId,
  });
}

export type LibrarySnapshot = {
  liked: Track[];
  history: Track[];
  playlists: Playlist[];
  downloads: DownloadedTrack[];
};

/**
 * Phone-local library: the source of truth for likes, history, playlists, and
 * downloads, with pending-change bookkeeping for cloud reconciliation. Mirrors
 * the Kotlin client's Room repository and table layout.
 */
export class LibraryRepository {
  private readonly db: SQLiteDatabase;
  private readonly listeners = new Set<() => void>();

  constructor(databaseName = 'spice_mobile.db') {
    this.db = openDatabaseSync(databaseName);
    this.db.execSync(SCHEMA);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }

  snapshot(): LibrarySnapshot {
    return {
      liked: this.likedSnapshot(),
      history: this.historySnapshot(),
      playlists: this.playlistSnapshot(),
      downloads: this.downloadsSnapshot(),
    };
  }

  likedSnapshot(): Track[] {
    return this.db
      .getAllSync<TrackRow>(
        `SELECT ${TRACK_COLUMNS} FROM tracks INNER JOIN liked_tracks ON liked_tracks.trackId = tracks.id ORDER BY liked_tracks.likedAt DESC`,
      )
      .map(rowToTrack);
  }

  historySnapshot(): Track[] {
    return this.db
      .getAllSync<TrackRow>(
        `SELECT ${TRACK_COLUMNS} FROM tracks INNER JOIN history_tracks ON history_tracks.trackId = tracks.id ORDER BY history_tracks.playedAt DESC LIMIT ${MAX_SYNCED_HISTORY}`,
      )
      .map(rowToTrack);
  }

  playlistSnapshot(): Playlist[] {
    const rows = this.db.getAllSync<PlaylistRow>(`
      SELECT
        playlists.id AS playlistId, playlists.title AS playlistTitle, playlists.description AS playlistDescription,
        playlists.coverUrl AS playlistCoverUrl, playlists.shared AS playlistShared, playlists.shareRole AS playlistShareRole,
        playlists.isPublic AS playlistIsPublic,
        tracks.id AS trackId, tracks.title AS trackTitle, tracks.artist AS trackArtist, tracks.album AS trackAlbum,
        tracks.durationMs AS trackDurationMs, tracks.artworkUrl AS trackArtworkUrl, tracks.sourceId AS trackSourceId,
        playlist_tracks.position AS trackPosition
      FROM playlists
      LEFT JOIN playlist_tracks ON playlist_tracks.playlistId = playlists.id
      LEFT JOIN tracks ON tracks.id = playlist_tracks.trackId
      ORDER BY playlists.sortIndex ASC, playlist_tracks.position ASC
    `);
    const grouped = new Map<string, PlaylistRow[]>();
    for (const row of rows) {
      const group = grouped.get(row.playlistId) ?? [];
      group.push(row);
      grouped.set(row.playlistId, group);
    }
    return [...grouped.values()].map((group) => {
      const first = group[0]!;
      return makePlaylist({
        id: first.playlistId,
        title: first.playlistTitle,
        description: first.playlistDescription,
        coverUrl: first.playlistCoverUrl,
        shared: first.playlistShared === 1,
        shareRole: first.playlistShareRole,
        isPublic: first.playlistIsPublic === 1,
        tracks: group
          .filter((row) => row.trackId !== null)
          .sort((a, b) => (a.trackPosition ?? Number.MAX_SAFE_INTEGER) - (b.trackPosition ?? Number.MAX_SAFE_INTEGER))
          .map((row) =>
            makeTrack({
              id: row.trackId!,
              title: row.trackTitle ?? 'Track',
              artist: row.trackArtist ?? 'Unknown artist',
              album: row.trackAlbum ?? '',
              durationMs: row.trackDurationMs ?? 0,
              artworkUrl: row.trackArtworkUrl ?? '',
              sourceId: row.trackSourceId ?? 'youtube_music',
            }),
          ),
      });
    });
  }

  downloadsSnapshot(): DownloadedTrack[] {
    return this.db
      .getAllSync<DownloadRow>(`
        SELECT downloads.id AS downloadId, downloads.filePath AS filePath, downloads.fileName AS fileName,
          downloads.mimeType AS mimeType, downloads.bytes AS bytes, downloads.downloadedAt AS downloadedAt,
          tracks.id AS trackId, tracks.title AS trackTitle, tracks.artist AS trackArtist, tracks.album AS trackAlbum,
          tracks.durationMs AS trackDurationMs, tracks.artworkUrl AS trackArtworkUrl, tracks.sourceId AS trackSourceId
        FROM downloads INNER JOIN tracks ON tracks.id = downloads.trackId
        ORDER BY downloads.downloadedAt DESC
      `)
      .map((row) => ({
        id: row.downloadId,
        track: makeTrack({
          id: row.trackId,
          title: row.trackTitle,
          artist: row.trackArtist,
          album: row.trackAlbum,
          durationMs: row.trackDurationMs,
          artworkUrl: row.trackArtworkUrl,
          sourceId: row.trackSourceId,
          localUri: row.filePath,
        }),
        filePath: row.filePath,
        fileName: row.fileName,
        mimeType: row.mimeType,
        bytes: row.bytes,
        downloadedAt: row.downloadedAt,
      }));
  }

  isLiked(trackId: string): boolean {
    return this.db.getFirstSync('SELECT 1 FROM liked_tracks WHERE trackId = ?', trackId) !== null;
  }

  private upsertTrack(track: Track, updatedAt: number) {
    this.db.runSync(
      // A true upsert: REPLACE would delete the row and cascade away likes, history, and playlist entries.
      `INSERT INTO tracks (id, title, artist, album, durationMs, artworkUrl, sourceId, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, artist = excluded.artist, album = excluded.album,
         durationMs = excluded.durationMs, artworkUrl = excluded.artworkUrl, sourceId = excluded.sourceId, updatedAt = excluded.updatedAt`,
      track.id,
      track.title,
      track.artist,
      track.album,
      Math.trunc(track.durationMs),
      track.artworkUrl,
      track.sourceId,
      updatedAt,
    );
  }

  private trimHistory() {
    this.db.runSync(
      `DELETE FROM history_tracks WHERE trackId NOT IN (SELECT trackId FROM history_tracks ORDER BY playedAt DESC LIMIT ${MAX_SYNCED_HISTORY})`,
    );
  }

  addToHistory(track: Track, playedAt = Date.now()): void {
    this.db.withTransactionSync(() => {
      this.upsertTrack(track, playedAt);
      this.db.runSync('INSERT OR REPLACE INTO history_tracks (trackId, playedAt) VALUES (?, ?)', track.id, playedAt);
      this.trimHistory();
    });
    const pending = new Set(this.pendingHistoryTrackIds());
    pending.add(track.id);
    prefs.setStringList(PREF.pendingHistoryIds, pending);
    prefs.set(PREF.historySyncRevision, this.historySyncRevision() + 1);
    this.notify();
  }

  private replaceLikedTracksLocked(tracks: Track[]) {
    const now = Date.now();
    this.db.withTransactionSync(() => {
      this.db.runSync('DELETE FROM liked_tracks');
      tracks.forEach((track, index) => {
        this.upsertTrack(track, now - index);
        this.db.runSync('INSERT OR REPLACE INTO liked_tracks (trackId, likedAt) VALUES (?, ?)', track.id, now - index);
      });
    });
  }

  replaceSyncedLikedTracks(tracks: Track[], syncRevision: number): Track[] {
    const reconciled =
      this.likesSyncRevision() === syncRevision
        ? tracks
        : mergeSyncLikes(tracks, this.likedSnapshot(), new Set(this.pendingLikedTrackIds()));
    this.replaceLikedTracksLocked(reconciled);
    prefs.set(PREF.likesSyncInitialized, true);
    if (this.likesSyncRevision() === syncRevision) prefs.remove(PREF.pendingLikedIds);
    this.notify();
    return reconciled;
  }

  private replaceHistoryTracksLocked(tracks: Track[]) {
    const now = Date.now();
    this.db.withTransactionSync(() => {
      this.db.runSync('DELETE FROM history_tracks');
      tracks.slice(0, MAX_SYNCED_HISTORY).forEach((track, index) => {
        this.upsertTrack(track, now - index);
        this.db.runSync('INSERT OR REPLACE INTO history_tracks (trackId, playedAt) VALUES (?, ?)', track.id, now - index);
      });
      this.trimHistory();
    });
  }

  replaceSyncedHistoryTracks(tracks: Track[], syncRevision: number): Track[] {
    const reconciled =
      this.historySyncRevision() === syncRevision
        ? tracks
        : mergeSyncHistory(tracks, this.historySnapshot(), new Set(this.pendingHistoryTrackIds()));
    this.replaceHistoryTracksLocked(reconciled);
    prefs.set(PREF.historySyncInitialized, true);
    if (this.historySyncRevision() === syncRevision) prefs.remove(PREF.pendingHistoryIds);
    this.notify();
    return reconciled;
  }

  createPlaylist(title?: string): Playlist {
    const now = Date.now();
    const row = this.db.getFirstSync<{ value: number }>('SELECT COALESCE(MAX(sortIndex), -1) AS value FROM playlists');
    const index = (row?.value ?? -1) + 1;
    const playlist = makePlaylist({
      id: Crypto.randomUUID(),
      title: title && title.trim() ? title.trim() : `New Playlist ${index + 1}`,
      isPublic: true,
    });
    this.upsertPlaylist(playlist, index, now);
    this.notify();
    return playlist;
  }

  renamePlaylist(playlistId: string, title: string): void {
    this.db.runSync('UPDATE playlists SET title = ?, updatedAt = ? WHERE id = ?', title.trim(), Date.now(), playlistId);
    this.notify();
  }

  deletePlaylist(playlistId: string): void {
    this.db.runSync('DELETE FROM playlists WHERE id = ?', playlistId);
    this.notify();
  }

  removeTrackFromPlaylist(playlistId: string, position: number): void {
    this.db.withTransactionSync(() => {
      this.db.runSync('DELETE FROM playlist_tracks WHERE playlistId = ? AND position = ?', playlistId, position);
      this.db.runSync(
        'UPDATE playlist_tracks SET position = position - 1 WHERE playlistId = ? AND position > ?',
        playlistId,
        position,
      );
    });
    this.notify();
  }

  private upsertPlaylist(playlist: Playlist, sortIndex: number, updatedAt: number) {
    this.db.runSync(
      `INSERT INTO playlists (id, title, description, coverUrl, shared, shareRole, isPublic, sortIndex, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, coverUrl = excluded.coverUrl,
         shared = excluded.shared, shareRole = excluded.shareRole, isPublic = excluded.isPublic, sortIndex = excluded.sortIndex,
         updatedAt = excluded.updatedAt`,
      playlist.id,
      playlist.title,
      playlist.description,
      playlist.coverUrl,
      playlist.shared ? 1 : 0,
      playlist.shareRole,
      playlist.isPublic ? 1 : 0,
      sortIndex,
      updatedAt,
    );
  }

  addTrackToPlaylist(playlistId: string, track: Track): boolean {
    const now = Date.now();
    let added = false;
    this.db.withTransactionSync(() => {
      const exists = this.db.getFirstSync(
        'SELECT 1 FROM playlist_tracks WHERE playlistId = ? AND trackId = ?',
        playlistId,
        track.id,
      );
      if (exists) return;
      this.upsertTrack(track, now);
      const row = this.db.getFirstSync<{ value: number }>(
        'SELECT COALESCE(MAX(position), -1) AS value FROM playlist_tracks WHERE playlistId = ?',
        playlistId,
      );
      this.db.runSync(
        'INSERT OR REPLACE INTO playlist_tracks (playlistId, trackId, position) VALUES (?, ?, ?)',
        playlistId,
        track.id,
        (row?.value ?? -1) + 1,
      );
      added = true;
    });
    if (added) this.notify();
    return added;
  }

  replacePlaylists(playlists: Playlist[]): void {
    const now = Date.now();
    this.db.withTransactionSync(() => {
      this.db.runSync('DELETE FROM playlists');
      playlists.forEach((playlist, playlistIndex) => {
        this.upsertPlaylist(playlist, playlistIndex, now - playlistIndex);
        playlist.tracks.forEach((track, trackIndex) => {
          this.upsertTrack(track, now - trackIndex);
          this.db.runSync(
            'INSERT OR REPLACE INTO playlist_tracks (playlistId, trackId, position) VALUES (?, ?, ?)',
            playlist.id,
            track.id,
            trackIndex,
          );
        });
      });
    });
    this.notify();
  }

  addDownload(track: Track, filePath: string, fileName: string, bytes: number, mimeType: string): DownloadedTrack {
    const now = Date.now();
    const download: DownloadedTrack = {
      id: Crypto.randomUUID(),
      track: { ...track, localUri: filePath },
      filePath,
      fileName,
      mimeType,
      bytes: Math.max(bytes, 0),
      downloadedAt: now,
    };
    this.db.withTransactionSync(() => {
      this.upsertTrack(track, now);
      this.db.runSync(
        'INSERT OR REPLACE INTO downloads (id, trackId, filePath, fileName, mimeType, bytes, downloadedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        download.id,
        track.id,
        filePath,
        fileName,
        mimeType,
        download.bytes,
        now,
      );
    });
    this.notify();
    return download;
  }

  removeDownload(downloadId: string): void {
    this.db.runSync('DELETE FROM downloads WHERE id = ?', downloadId);
    this.notify();
  }

  toggleLike(track: Track): boolean {
    const now = Date.now();
    let liked = false;
    this.db.withTransactionSync(() => {
      const isLiked = this.isLiked(track.id);
      this.upsertTrack(track, now);
      if (isLiked) {
        this.db.runSync('DELETE FROM liked_tracks WHERE trackId = ?', track.id);
      } else {
        this.db.runSync('INSERT OR REPLACE INTO liked_tracks (trackId, likedAt) VALUES (?, ?)', track.id, now);
        liked = true;
      }
    });
    this.markLikeMutationPending(track.id);
    this.notify();
    return liked;
  }

  setLiked(track: Track, liked: boolean, markPending = true): void {
    const now = Date.now();
    this.db.withTransactionSync(() => {
      this.upsertTrack(track, now);
      if (liked) this.db.runSync('INSERT OR REPLACE INTO liked_tracks (trackId, likedAt) VALUES (?, ?)', track.id, now);
      else this.db.runSync('DELETE FROM liked_tracks WHERE trackId = ?', track.id);
    });
    if (markPending) this.markLikeMutationPending(track.id);
    this.notify();
  }

  markLikeMutationPending(trackId: string): void {
    const pending = new Set(this.pendingLikedTrackIds());
    pending.add(trackId);
    prefs.setStringList(PREF.pendingLikedIds, pending);
    prefs.set(PREF.likesSyncRevision, this.likesSyncRevision() + 1);
  }

  markLikeMutationSynced(trackId: string): void {
    const pending = new Set(this.pendingLikedTrackIds());
    pending.delete(trackId);
    prefs.set(PREF.likesSyncInitialized, true);
    prefs.setStringList(PREF.pendingLikedIds, pending);
  }

  pendingLikedTrackIds(): string[] {
    return prefs.getStringList(PREF.pendingLikedIds);
  }

  pendingHistoryTrackIds(): string[] {
    return prefs.getStringList(PREF.pendingHistoryIds);
  }

  needsInitialLikesReconciliation(): boolean {
    return !prefs.getBoolean(PREF.likesSyncInitialized, false);
  }

  needsInitialHistoryReconciliation(): boolean {
    return !prefs.getBoolean(PREF.historySyncInitialized, false);
  }

  likesSyncRevision(): number {
    return prefs.getNumber(PREF.likesSyncRevision, 0);
  }

  historySyncRevision(): number {
    return prefs.getNumber(PREF.historySyncRevision, 0);
  }
}
