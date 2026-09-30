// SPICE cloud API client: account, sync, playlists, profiles, and the Spice
// Connect command queue. Endpoints and payloads match the Kotlin client.

import { asArray, asObject, clamp, int, obj, str, type Json } from './json.ts';
import { cleanLyricsArtist, cleanLyricsTitle, selectLyricsMatch } from './lyrics.ts';
import type {
  AccountSession,
  EmailVerificationChallenge,
  LibrarySyncResult,
  LyricsPayload,
  PairedDeviceCredential,
  PendingPlaylistInvite,
  Playlist,
  PlaylistInvite,
  PlaylistInvitePreview,
  PlaylistMember,
  PlaylistMembersSummary,
  ProfileSummary,
  RemoteCommand,
  RemoteDevice,
  RepeatMode,
  SharedPlaylistTracks,
  SpiceAccount,
  SpiceProfile,
  Track,
} from './models.ts';
import {
  SpiceApiError,
  parseAccount,
  parseAccountSession,
  parseEmailVerificationChallenge,
  parseHistoryTracks,
  parseLikedTracks,
  parsePairedDeviceCredential,
  parsePendingPlaylistInvites,
  parsePlaylist,
  parsePlaylistInvite,
  parsePlaylistInvitePreview,
  parsePlaylistMember,
  parsePlaylistMembersSummary,
  parsePlaylists,
  parseProfileSummary,
  parseProfiles,
  parseRemoteCommands,
  parseRemoteDevices,
  parseSharedPlaylistTracks,
  playlistToSnapshotJson,
  profileToSyncJson,
  repeatModeToRemote,
  trackToRemoteJson,
  trackToSnapshotJson,
} from './parsers.ts';
import {
  MAX_SYNCED_HISTORY,
  mergeSyncHistory,
  mergeSyncLikes,
  mergeSyncPlaylists,
  syncPlaylistsMatch,
  syncTracksMatch,
} from './sync.ts';

export const DEFAULT_CLOUD_BASE_URL = 'https://music.spice-app.xyz';

type Fetch = typeof fetch;

export type SyncOptions = {
  profileId?: string;
  pendingLikedTrackIds?: ReadonlySet<string>;
  initialLikesReconciliation?: boolean;
  pendingHistoryTrackIds?: ReadonlySet<string>;
  initialHistoryReconciliation?: boolean;
};

export type RemoteDeviceUpdate = {
  deviceId: string;
  displayName: string;
  currentTrack: Track | null;
  isPlaying: boolean;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  progressMs: number;
  durationMs: number;
  volume: number;
  queue: Track[];
  queueIndex: number;
};

function encodeQuery(value: string): string {
  return encodeURIComponent(value);
}

export class SpiceApi {
  readonly cloudBaseUrl: string;
  private readonly fetchImpl: Fetch;
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(options: { cloudBaseUrl?: string; fetchImpl?: Fetch; userAgent?: string; timeoutMs?: number } = {}) {
    this.cloudBaseUrl = (options.cloudBaseUrl ?? DEFAULT_CLOUD_BASE_URL).trim().replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.userAgent = options.userAgent ?? 'Spice-Mobile/1.0';
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  // --- Account -----------------------------------------------------------

  async signIn(email: string, password: string): Promise<AccountSession> {
    return parseAccountSession(await this.post('/api/auth/spice/signin', { email: email.trim(), password }));
  }

  async fetchAccountMe(token: string): Promise<SpiceAccount> {
    const payload = await this.get('/api/account/me', token);
    return parseAccount(obj(payload, 'account') ?? obj(payload, 'user') ?? {});
  }

  async signUp(email: string, password: string, username: string): Promise<EmailVerificationChallenge> {
    return parseEmailVerificationChallenge(
      await this.post('/api/auth/spice/signup', { email: email.trim(), password, username: username.trim() }),
    );
  }

  async verifyEmail(registrationId: string, code: string): Promise<AccountSession> {
    return parseAccountSession(await this.post('/api/auth/spice/verify-email', { registrationId, code: code.trim() }));
  }

  async resendEmailVerification(registrationId: string): Promise<EmailVerificationChallenge> {
    return parseEmailVerificationChallenge(await this.post('/api/auth/spice/resend-verification', { registrationId }));
  }

  async claimPairingCode(code: string, deviceId: string, displayName: string): Promise<PairedDeviceCredential> {
    return parsePairedDeviceCredential(
      await this.post('/api/remote/pairing/claim', { code: code.trim(), deviceId, displayName }),
    );
  }

  // --- Library sync ------------------------------------------------------

  async fetchLibrary(token: string, profileId = 'default', includePlaylists = true): Promise<LibrarySyncResult> {
    const datasets = includePlaylists ? '' : '&datasets=likes,history';
    const payload = await this.get(`/api/sync/library?profileId=${encodeQuery(profileId)}${datasets}`, token);
    const likedTracks = parseLikedTracks(payload);
    const historyTracks = parseHistoryTracks(payload);
    const playlists = includePlaylists ? parsePlaylists(payload) : [];
    return {
      summary: { likedCount: likedTracks.length, historyCount: historyTracks.length, playlistCount: playlists.length },
      likedTracks,
      historyTracks,
      playlists,
    };
  }

  async syncLibrary(
    token: string,
    liked: Track[],
    history: Track[],
    playlists: Playlist[],
    options: SyncOptions = {},
  ): Promise<LibrarySyncResult> {
    const profileId = options.profileId ?? 'default';
    const remote = await this.fetchLibrary(token, profileId);
    const mergedLiked = mergeSyncLikes(
      remote.likedTracks,
      liked,
      options.pendingLikedTrackIds,
      options.initialLikesReconciliation,
    );
    const mergedHistory = mergeSyncHistory(
      remote.historyTracks,
      history,
      options.pendingHistoryTrackIds,
      options.initialHistoryReconciliation,
    ).slice(0, MAX_SYNCED_HISTORY);
    const mergedPlaylists = mergeSyncPlaylists(remote.playlists, playlists);
    const changedLikes = !syncTracksMatch(remote.likedTracks, mergedLiked);
    const changedHistory = !syncTracksMatch(remote.historyTracks, mergedHistory);
    const changedPlaylists = !syncPlaylistsMatch(remote.playlists, mergedPlaylists);
    if (changedLikes || changedHistory || changedPlaylists) {
      const body: Json = { profileId };
      if (changedLikes) Object.assign(body, likesBody(mergedLiked));
      if (changedHistory) body.history = mergedHistory.map(trackToSnapshotJson);
      if (changedPlaylists) body.playlists = mergedPlaylists.map(playlistToSnapshotJson);
      await this.post('/api/sync/library', body, token);
    }
    return {
      summary: { likedCount: mergedLiked.length, historyCount: mergedHistory.length, playlistCount: mergedPlaylists.length },
      likedTracks: mergedLiked,
      historyTracks: mergedHistory,
      playlists: mergedPlaylists,
    };
  }

  async syncTaste(token: string, liked: Track[], history: Track[], options: SyncOptions = {}): Promise<LibrarySyncResult> {
    const profileId = options.profileId ?? 'default';
    const remote = await this.fetchLibrary(token, profileId, false);
    const mergedLiked = mergeSyncLikes(
      remote.likedTracks,
      liked,
      options.pendingLikedTrackIds,
      options.initialLikesReconciliation,
    );
    const mergedHistory = mergeSyncHistory(
      remote.historyTracks,
      history,
      options.pendingHistoryTrackIds,
      options.initialHistoryReconciliation,
    ).slice(0, MAX_SYNCED_HISTORY);
    const changedLikes = !syncTracksMatch(remote.likedTracks, mergedLiked);
    const changedHistory = !syncTracksMatch(remote.historyTracks, mergedHistory);
    if (changedLikes || changedHistory) {
      const body: Json = { profileId };
      if (changedLikes) Object.assign(body, likesBody(mergedLiked));
      if (changedHistory) body.history = mergedHistory.map(trackToSnapshotJson);
      await this.post('/api/sync/library', body, token);
    }
    return {
      summary: { likedCount: mergedLiked.length, historyCount: mergedHistory.length, playlistCount: 0 },
      likedTracks: mergedLiked,
      historyTracks: mergedHistory,
      playlists: [],
    };
  }

  async syncHistory(token: string, history: Track[], options: SyncOptions = {}): Promise<Track[]> {
    const profileId = options.profileId ?? 'default';
    const remote = parseHistoryTracks(await this.get(`/api/sync/history?profileId=${encodeQuery(profileId)}`, token));
    const merged = mergeSyncHistory(
      remote,
      history,
      options.pendingHistoryTrackIds,
      options.initialHistoryReconciliation,
    ).slice(0, MAX_SYNCED_HISTORY);
    if (!syncTracksMatch(remote, merged)) {
      await this.post('/api/sync/history', { profileId, history: merged.map(trackToSnapshotJson) }, token);
    }
    return merged;
  }

  async setTrackLiked(token: string, track: Track, liked: boolean, profileId = 'default'): Promise<void> {
    await this.request('/api/sync/likes', 'PATCH', { profileId, liked, track: trackToSnapshotJson(track) }, token);
  }

  async fetchTasteStates(token: string, profileId = 'default'): Promise<Json> {
    return this.get(`/api/sync/taste?profileId=${encodeQuery(profileId)}`, token);
  }

  async pushTasteStates(token: string, states: Json[], profileId = 'default'): Promise<void> {
    await this.post('/api/sync/taste', { profileId, states }, token);
  }

  async fetchListenersLikeYou(token: string, profileId = 'default'): Promise<Json> {
    return this.get(`/api/listeners/like-you?profileId=${encodeQuery(profileId)}`, token);
  }

  // --- Playlists -----------------------------------------------------------

  async createPlaylistInvite(token: string, playlistId: string): Promise<PlaylistInvite> {
    return parsePlaylistInvite(await this.post('/api/playlists/invites', { playlistId }, token));
  }

  async previewPlaylistInvite(inviteToken: string): Promise<PlaylistInvitePreview> {
    return parsePlaylistInvitePreview(await this.get(`/api/playlists/invites/${encodeQuery(inviteToken)}`), inviteToken);
  }

  async acceptPlaylistInvite(token: string, inviteToken: string): Promise<Playlist> {
    const payload = await this.post(`/api/playlists/invites/${encodeQuery(inviteToken)}`, {}, token);
    const playlist = parsePlaylist(obj(payload, 'playlist') ?? {});
    if (!playlist) throw new SpiceApiError('Spice accepted the invite, but no playlist was returned.');
    return playlist;
  }

  async fetchPendingPlaylistInvites(token: string): Promise<PendingPlaylistInvite[]> {
    return parsePendingPlaylistInvites(await this.get('/api/account/invites', token));
  }

  async acceptPendingPlaylistInvite(token: string, playlistId: string): Promise<void> {
    await this.post(`/api/account/invites/${encodeQuery(playlistId)}/accept`, {}, token);
  }

  async rejectPendingPlaylistInvite(token: string, playlistId: string): Promise<void> {
    await this.post(`/api/account/invites/${encodeQuery(playlistId)}/reject`, {}, token);
  }

  async fetchPlaylistMembers(token: string, playlistId: string): Promise<PlaylistMembersSummary> {
    return parsePlaylistMembersSummary(
      await this.get(`/api/playlists/shared/members?playlistId=${encodeQuery(playlistId)}`, token),
      playlistId,
    );
  }

  async invitePlaylistMember(token: string, playlistId: string, username: string): Promise<PlaylistMember> {
    const payload = await this.post('/api/playlists/shared/members', { playlistId, username: username.trim() }, token);
    const member = parsePlaylistMember(obj(payload, 'member') ?? {});
    if (!member) throw new SpiceApiError('Spice sent the invite, but no member was returned.');
    return member;
  }

  async removePlaylistMember(token: string, playlistId: string, userId?: string): Promise<void> {
    const body: Json = { playlistId };
    if (userId && userId.trim()) body.userId = userId;
    await this.request('/api/playlists/shared/members', 'DELETE', body, token);
  }

  async fetchSharedPlaylistTracks(token: string, playlistId: string): Promise<SharedPlaylistTracks> {
    return parseSharedPlaylistTracks(await this.get(`/api/playlists/shared/${encodeQuery(playlistId)}/tracks`, token), playlistId);
  }

  async addSharedPlaylistTrack(token: string, playlistId: string, track: Track): Promise<number> {
    const payload = await this.post(`/api/playlists/shared/${encodeQuery(playlistId)}/tracks`, { track: trackToSnapshotJson(track) }, token);
    return int(payload, 'position', -1);
  }

  async removeSharedPlaylistTrack(token: string, playlistId: string, position: number): Promise<void> {
    await this.request(`/api/playlists/shared/${encodeQuery(playlistId)}/tracks`, 'DELETE', { position }, token);
  }

  // --- Profiles ------------------------------------------------------------

  async fetchProfileSummary(token: string, userId: string, profileId = 'default'): Promise<ProfileSummary> {
    return parseProfileSummary(
      await this.get(`/api/users/profile?userId=${encodeQuery(userId)}&profileId=${encodeQuery(profileId)}`, token),
    );
  }

  async fetchProfiles(token: string): Promise<SpiceProfile[]> {
    return parseProfiles(await this.get('/api/sync/profiles', token));
  }

  async syncProfiles(token: string, profiles: SpiceProfile[]): Promise<void> {
    await this.post('/api/sync/profiles', { profiles: profiles.map(profileToSyncJson) }, token);
  }

  async updateUsername(token: string, username: string, profileId = 'default'): Promise<void> {
    await this.request('/api/account/username', 'PUT', { username, profileId }, token);
  }

  // --- Spice Connect ------------------------------------------------------

  async fetchRemoteDevices(token: string): Promise<RemoteDevice[]> {
    return parseRemoteDevices(await this.get('/api/remote/devices', token));
  }

  async forgetRemoteDevice(token: string, sourceDeviceId: string, deviceId: string): Promise<void> {
    await this.request(
      `/api/remote/devices?sourceDeviceId=${encodeQuery(sourceDeviceId)}&deviceId=${encodeQuery(deviceId)}`,
      'DELETE',
      {},
      token,
    );
  }

  async updateRemoteDevice(token: string, update: RemoteDeviceUpdate): Promise<void> {
    await this.post(
      '/api/remote/devices',
      {
        deviceId: update.deviceId,
        displayName: update.displayName,
        currentTrack: update.currentTrack ? trackToRemoteJson(update.currentTrack) : null,
        queue: update.queue.map(trackToRemoteJson),
        queueIndex: clamp(update.queueIndex, 0, Math.max(update.queue.length - 1, 0)),
        isPlaying: update.isPlaying,
        shuffleEnabled: update.shuffleEnabled,
        repeatMode: repeatModeToRemote(update.repeatMode),
        progress: Math.max(update.progressMs, 0) / 1000,
        duration: Math.max(update.durationMs, 0) / 1000,
        volume: clamp(update.volume, 0, 100),
      },
      token,
    );
  }

  async sendRemoteCommand(
    token: string,
    targetDeviceId: string,
    sourceDeviceId: string,
    command: string,
    payload: Json = {},
  ): Promise<void> {
    await this.post('/api/remote/commands', { targetDeviceId, sourceDeviceId, command, payload }, token);
  }

  async fetchRemoteCommands(token: string, deviceId: string): Promise<RemoteCommand[]> {
    return parseRemoteCommands(await this.get(`/api/remote/commands?deviceId=${encodeQuery(deviceId)}`, token));
  }

  remoteEventsUrl(deviceId: string): string {
    return `${this.cloudBaseUrl}/api/remote/events?deviceId=${encodeQuery(deviceId)}`;
  }

  // --- Lyrics (LRCLIB) ----------------------------------------------------

  async fetchLyrics(track: Track): Promise<LyricsPayload> {
    const title = cleanLyricsTitle(track.title);
    const artist = cleanLyricsArtist(track.artist);
    const durationSec = Math.max(1, Math.floor((track.durationMs > 0 ? track.durationMs : 180_000) / 1000));
    let match: Json | null = null;
    try {
      match = asObject(
        await this.external(
          `https://lrclib.net/api/get?track_name=${encodeQuery(title)}&artist_name=${encodeQuery(artist)}&duration=${durationSec}`,
          'Lyrics lookup',
        ),
      );
    } catch {
      match = null;
    }
    if (!match) {
      try {
        const results = asArray(
          await this.external(
            `https://lrclib.net/api/search?track_name=${encodeQuery(title)}&artist_name=${encodeQuery(artist)}`,
            'Lyrics search',
          ),
        );
        match = results ? selectLyricsMatch(results, title, artist, durationSec) : null;
      } catch {
        match = null;
      }
    }
    const syncedLyrics = str(match, 'syncedLyrics');
    return { plainLyrics: str(match, 'plainLyrics'), syncedLyrics, isSynced: syncedLyrics.trim() !== '' };
  }

  // --- Transport -----------------------------------------------------------

  private get(path: string, token?: string): Promise<Json> {
    return this.request(path, 'GET', undefined, token);
  }

  private post(path: string, body: Json, token?: string): Promise<Json> {
    return this.request(path, 'POST', body, token);
  }

  async request(path: string, method: string, body?: Json, token?: string): Promise<Json> {
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': this.userAgent };
    if (token && token.trim()) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await this.withTimeout((signal) =>
      this.fetchImpl(this.cloudBaseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      }),
    );
    const text = await response.text();
    let json: Json = {};
    try {
      json = asObject(JSON.parse(text)) ?? {};
    } catch {
      json = {};
    }
    if (!response.ok) {
      const code = str(json, 'error') || null;
      throw new SpiceApiError(str(json, 'message') || code || `Spice API request failed with HTTP ${response.status}.`, {
        statusCode: response.status,
        code,
        moderationStatus: str(json, 'status') || null,
        moderationExpiresAt: str(json, 'expiresAt') || null,
        moderationReason: str(json, 'reason') || null,
      });
    }
    return json;
  }

  private async external(url: string, label: string): Promise<unknown> {
    const response = await this.withTimeout((signal) =>
      this.fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': this.userAgent }, signal }),
    );
    if (!response.ok) throw new SpiceApiError(`${label} failed with HTTP ${response.status}.`);
    return JSON.parse(await response.text());
  }

  private async withTimeout<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await task(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new SpiceApiError('The SPICE server took too long to respond.', { cause: error });
      if (error instanceof SpiceApiError) throw error;
      throw new SpiceApiError(error instanceof Error && error.message ? error.message : 'Network request failed.', { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }
}

function likesBody(liked: Track[]): Json {
  const details: Json = {};
  for (const track of liked) details[track.id] = trackToSnapshotJson(track);
  return { likedTracks: liked.map((track) => track.id), likedTrackDetails: details };
}

export function accountBlockFromError(error: unknown): { status: 'banned' | 'timeout'; reason: string; expiresAt: string } | null {
  if (!(error instanceof SpiceApiError)) return null;
  if (error.code !== 'account_timed_out' && error.code !== 'account_banned') return null;
  return {
    status: error.code === 'account_timed_out' ? 'timeout' : 'banned',
    reason: (error.moderationReason ?? '').trim(),
    expiresAt: (error.moderationExpiresAt ?? '').trim(),
  };
}

export function isSpiceApiStatus(error: unknown, status: number): boolean {
  return error instanceof SpiceApiError && error.statusCode === status;
}

