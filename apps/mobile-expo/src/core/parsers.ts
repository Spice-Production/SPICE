// Cloud payload parsers and snapshot serializers, ported from the Kotlin
// client's SpiceApi so both apps read and write identical sync shapes.

import { arr, asObject, bool, clamp, has, int, num, obj, str, type Json } from './json.ts';
import {
  makePlaylist,
  makeTrack,
  type AccountSession,
  type EmailVerificationChallenge,
  type PairedDeviceCredential,
  type PendingPlaylistInvite,
  type Playlist,
  type PlaylistInvite,
  type PlaylistInvitePreview,
  type PlaylistMember,
  type PlaylistMembersSummary,
  type ProfileSummary,
  type RemoteCommand,
  type RemoteDevice,
  type RepeatMode,
  type SharedPlaylistTracks,
  type SpiceAccount,
  type SpiceProfile,
  type Track,
} from './models.ts';

export const DEFAULT_PROFILE_GRADIENT = 'linear-gradient(135deg, #a855f7, #ec4899)';

export class SpiceApiError extends Error {
  readonly statusCode: number | null;
  readonly code: string | null;
  readonly moderationStatus: string | null;
  readonly moderationExpiresAt: string | null;
  readonly moderationReason: string | null;

  constructor(
    message: string,
    options: {
      statusCode?: number | null;
      code?: string | null;
      moderationStatus?: string | null;
      moderationExpiresAt?: string | null;
      moderationReason?: string | null;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'SpiceApiError';
    this.statusCode = options.statusCode ?? null;
    this.code = options.code ?? null;
    this.moderationStatus = options.moderationStatus ?? null;
    this.moderationExpiresAt = options.moderationExpiresAt ?? null;
    this.moderationReason = options.moderationReason ?? null;
  }
}

function firstArtistName(item: Json): string {
  const artists = arr(item, 'artists');
  const first = artists ? asObject(artists[0]) : null;
  return str(first, 'name').trim();
}

export function parseTracks(payload: Json, defaultSourceId: string): Track[] {
  const tracks = arr(payload, 'tracks');
  if (!tracks) return [];
  const result: Track[] = [];
  for (const entry of tracks) {
    const item = asObject(entry);
    if (!item) continue;
    const id = str(item, 'id').trim();
    const title = str(item, 'title').trim();
    if (!id || !title) continue;
    result.push(
      makeTrack({
        id,
        title,
        artist: firstArtistName(item) || 'Unknown artist',
        album: str(obj(item, 'album'), 'title').trim(),
        durationMs: Math.max(0, int(item, 'durationMs', 0)),
        artworkUrl: str(item, 'artworkUrl'),
        sourceId: str(item, 'sourceId') || defaultSourceId,
      }),
    );
  }
  return result;
}

export function parseAccount(payload: Json): SpiceAccount {
  const moderation = obj(payload, 'moderation');
  return {
    id: str(payload, 'id').trim(),
    email: str(payload, 'email').trim(),
    username: str(payload, 'username').trim(),
    displayName: str(payload, 'displayName').trim(),
    avatarUrl: str(payload, 'avatarUrl').trim(),
    accountRole: str(payload, 'accountRole', 'user').trim() || 'user',
    isAdmin: bool(payload, 'isAdmin', false),
    moderationStatus: (moderation ? str(moderation, 'status', 'active') : '') || 'active',
    moderationExpiresAt: str(moderation, 'expiresAt'),
    moderationReason: str(moderation, 'reason'),
  };
}

export function parseAccountSession(payload: Json): AccountSession {
  const token = str(payload, 'token').trim();
  const account = parseAccount(obj(payload, 'account') ?? obj(payload, 'user') ?? {});
  if (!token || !account.id) {
    throw new SpiceApiError('Spice returned an invalid account session.');
  }
  return { token, account };
}

export function parseEmailVerificationChallenge(payload: Json): EmailVerificationChallenge {
  const registrationId = str(payload, 'registrationId').trim();
  const email = str(payload, 'email').trim();
  if (!bool(payload, 'verificationRequired', false) || !registrationId || !email) {
    throw new SpiceApiError('Spice returned an invalid email verification challenge.');
  }
  return { registrationId, email, expiresAt: str(payload, 'expiresAt').trim() };
}

const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;

/** Strict ISO-8601 parser matching the Kotlin client's accepted formats. */
export function parseSpiceTimestampEpochMs(value: string): number {
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parsePairedDeviceCredential(payload: Json): PairedDeviceCredential {
  const accessToken = str(payload, 'accessToken').trim();
  const authorizationId = str(payload, 'authorizationId').trim();
  const ownerUserId = str(payload, 'userId').trim();
  const expiresAt = str(payload, 'expiresAt').trim();
  const expiresAtEpochMs = parseSpiceTimestampEpochMs(expiresAt);
  const device = obj(payload, 'device') ?? {};
  const deviceId = str(device, 'deviceId').trim();
  const displayName = str(device, 'displayName').trim() || 'Spice Android';
  if (
    !accessToken.startsWith('spice_pair_') ||
    str(payload, 'scope') !== 'spice_connect' ||
    !authorizationId ||
    !ownerUserId ||
    expiresAtEpochMs <= 0 ||
    !deviceId
  ) {
    throw new SpiceApiError('Spice returned an invalid paired-device credential.');
  }
  return { accessToken, authorizationId, ownerUserId, expiresAt, expiresAtEpochMs, deviceId, displayName };
}

function parseProfileRecord(profile: Json, stats: Json | null): SpiceProfile {
  const username = str(profile, 'username').trim();
  return {
    id: str(profile, 'id').trim() || 'default',
    displayName: str(profile, 'displayName').trim() || username || 'Spice Listener',
    username,
    avatarUrl: str(profile, 'avatarUrl').trim(),
    bio: str(profile, 'bio').trim(),
    gradient: str(profile, 'gradient').trim() || DEFAULT_PROFILE_GRADIENT,
    joinedAt: str(profile, 'joinedAt').trim(),
    isPrivate: bool(profile, 'isPrivate', false),
    songsPlayed: Math.max(0, int(stats, 'songsPlayed', int(profile, 'songsPlayed', 0))),
    passcode: str(profile, 'passcode').trim(),
  };
}

export function parseProfileSummary(payload: Json): ProfileSummary {
  const profile = obj(payload, 'profile') ?? {};
  const stats = obj(payload, 'stats') ?? {};
  return {
    profile: parseProfileRecord(profile, stats),
    stats: {
      songsPlayed: Math.max(0, int(stats, 'songsPlayed', 0)),
      likedCount: Math.max(0, int(stats, 'likedCount', 0)),
      playlistsCount: Math.max(0, int(stats, 'playlistsCount', 0)),
    },
  };
}

export function parseProfiles(payload: Json): SpiceProfile[] {
  const profiles = arr(payload, 'profiles');
  if (!profiles) return [];
  const result: SpiceProfile[] = [];
  for (const entry of profiles) {
    const item = asObject(entry);
    if (!item) continue;
    const username = str(item, 'username').trim() || str(item, 'cloudUsername').trim();
    result.push({
      ...parseProfileRecord(item, null),
      displayName: str(item, 'displayName').trim() || str(item, 'username').trim() || 'Spice Listener',
      username,
      songsPlayed: Math.max(0, int(item, 'songsPlayed', 0)),
    });
  }
  return result;
}

export function parseRemoteRepeatMode(value: string): RepeatMode {
  switch (value.trim().toLowerCase()) {
    case 'all':
      return 'All';
    case 'one':
      return 'One';
    default:
      return 'Off';
  }
}

export function repeatModeToRemote(mode: RepeatMode): string {
  switch (mode) {
    case 'All':
      return 'all';
    case 'One':
      return 'one';
    default:
      return 'none';
  }
}

export function parseRemoteTrack(payload: Json | null): Track | null {
  if (!payload) return null;
  const id = str(payload, 'id').trim() || str(payload, 'videoId').trim();
  const title = str(payload, 'title').trim() || str(payload, 'track').trim();
  if (!id && !title) return null;
  const durationMs = int(payload, 'durationMs', 0);
  return makeTrack({
    id: id || title,
    title: title || 'Track',
    artist: firstArtistName(payload) || str(payload, 'artist').trim() || 'Unknown artist',
    album: str(payload, 'album').trim(),
    durationMs: durationMs > 0 ? durationMs : Math.max(0, Math.trunc(num(payload, 'duration', 0) * 1000)),
    artworkUrl: str(payload, 'artworkUrl').trim() || str(payload, 'albumArt').trim(),
    sourceId: str(payload, 'sourceId').trim() || 'youtube_music',
  });
}

function parseRemoteTracks(payload: unknown[] | null): Track[] {
  if (!payload) return [];
  const result: Track[] = [];
  for (const entry of payload) {
    const track = parseRemoteTrack(asObject(entry));
    if (track) result.push(track);
  }
  return result;
}

export function parseRemoteDevice(item: Json): RemoteDevice | null {
  const deviceId = str(item, 'deviceId').trim();
  const displayName = str(item, 'displayName').trim();
  if (!deviceId || !displayName) return null;
  const queue = parseRemoteTracks(arr(item, 'queue')).slice(0, 80);
  return {
    deviceId,
    displayName,
    currentTrack: parseRemoteTrack(obj(item, 'currentTrack')),
    queue,
    queueIndex: clamp(int(item, 'queueIndex', 0), 0, Math.max(queue.length - 1, 0)),
    isPlaying: bool(item, 'isPlaying', false),
    shuffleEnabled: bool(item, 'shuffleEnabled', false),
    repeatMode: parseRemoteRepeatMode(str(item, 'repeatMode')),
    progressMs: Math.max(0, Math.trunc(num(item, 'progress', 0) * 1000)),
    durationMs: Math.max(0, Math.trunc(num(item, 'duration', 0) * 1000)),
    volume: clamp(int(item, 'volume', 70), 0, 100),
    updatedAt: str(item, 'updatedAt').trim(),
    lastSeenSeconds: Math.max(0, int(item, 'lastSeenSeconds', 0)),
    rememberedUntil: str(item, 'rememberedUntil').trim(),
    isOnline: bool(item, 'isOnline', true),
    observedAtMs: 0,
  };
}

export function parseRemoteDevices(payload: Json): RemoteDevice[] {
  const devices = arr(payload, 'devices');
  if (!devices) return [];
  const result: RemoteDevice[] = [];
  for (const entry of devices) {
    const item = asObject(entry);
    const device = item ? parseRemoteDevice(item) : null;
    if (device) result.push(device);
  }
  return result;
}

export function parseRemoteCommands(payload: Json): RemoteCommand[] {
  const commands = arr(payload, 'commands');
  if (!commands) return [];
  const result: RemoteCommand[] = [];
  for (const entry of commands) {
    const item = asObject(entry);
    if (!item) continue;
    const id = str(item, 'id').trim();
    const command = str(item, 'command').trim();
    if (!id || !command) continue;
    const commandPayload = obj(item, 'payload') ?? {};
    let seekPositionMs: number | null = null;
    if (has(commandPayload, 'positionMs')) seekPositionMs = Math.max(0, int(commandPayload, 'positionMs', 0));
    else if (has(commandPayload, 'progressMs')) seekPositionMs = Math.max(0, int(commandPayload, 'progressMs', 0));
    else if (has(commandPayload, 'progress')) seekPositionMs = Math.max(0, Math.trunc(num(commandPayload, 'progress', 0) * 1000));
    else if (has(commandPayload, 'position')) seekPositionMs = Math.max(0, Math.trunc(num(commandPayload, 'position', 0) * 1000));
    const rawVolume = int(commandPayload, 'volume', -1);
    let shuffleEnabled: boolean | null = null;
    if (has(commandPayload, 'shuffleEnabled')) shuffleEnabled = bool(commandPayload, 'shuffleEnabled', false);
    else if (has(commandPayload, 'enabled')) shuffleEnabled = bool(commandPayload, 'enabled', false);
    let repeatValue: string | null = null;
    if (has(commandPayload, 'repeatMode')) repeatValue = str(commandPayload, 'repeatMode');
    else if (has(commandPayload, 'mode')) repeatValue = str(commandPayload, 'mode');
    result.push({
      id,
      sourceDeviceId: str(item, 'sourceDeviceId').trim(),
      command,
      createdAt: str(item, 'createdAt').trim(),
      payloadJson: JSON.stringify(commandPayload),
      payloadTrack: parseRemoteTrack(obj(commandPayload, 'track') ?? obj(commandPayload, 'currentTrack')),
      payloadQueue: parseRemoteTracks(arr(commandPayload, 'queue')),
      payloadQueueIndex: Math.max(0, int(commandPayload, 'queueIndex', 0)),
      seekPositionMs,
      volume: has(commandPayload, 'volume') && rawVolume >= 0 && rawVolume <= 100 ? rawVolume : null,
      shuffleEnabled,
      repeatMode: repeatValue === null ? null : parseRemoteRepeatMode(repeatValue),
      shouldPlay: has(commandPayload, 'isPlaying') ? bool(commandPayload, 'isPlaying', false) : null,
      connected: has(commandPayload, 'connected') ? bool(commandPayload, 'connected', false) : null,
      liked: has(commandPayload, 'liked') ? bool(commandPayload, 'liked', false) : null,
      playlistId: str(commandPayload, 'playlistId').trim(),
      playlistTitle: str(commandPayload, 'playlistTitle').trim(),
      transferId: str(commandPayload, 'transferId').trim(),
      failureReason: str(commandPayload, 'reason').trim(),
    });
  }
  return result;
}

export function parseTrackSnapshot(payload: Json | null, fallbackId = ''): Track {
  const item = payload ?? {};
  return makeTrack({
    id: (str(item, 'id') || fallbackId).trim(),
    title: str(item, 'title').trim() || 'Track',
    artist: firstArtistName(item) || str(item, 'artist').trim() || 'Unknown artist',
    durationMs: Math.max(0, int(item, 'durationMs', 0)),
    artworkUrl: str(item, 'artworkUrl'),
    sourceId: str(item, 'sourceId') || 'youtube_music',
  });
}

export function parsePlaylist(item: Json): Playlist | null {
  const id = str(item, 'id').trim();
  const title = str(item, 'title').trim();
  if (!id || !title) return null;
  const tracks = arr(item, 'tracks') ?? [];
  return makePlaylist({
    id,
    title,
    description: str(item, 'description'),
    coverUrl: str(item, 'coverUrl'),
    shared: bool(item, 'shared', false),
    shareRole: str(item, 'shareRole'),
    isPublic: bool(item, 'isPublic', true),
    tracks: tracks.flatMap((entry) => {
      const track = asObject(entry);
      return track ? [parseTrackSnapshot(track)] : [];
    }),
  });
}

export function parsePlaylists(payload: Json): Playlist[] {
  const playlists = arr(payload, 'playlists');
  if (!playlists) return [];
  return playlists.flatMap((entry) => {
    const item = asObject(entry);
    const playlist = item ? parsePlaylist(item) : null;
    return playlist ? [playlist] : [];
  });
}

export function parseLikedTracks(payload: Json): Track[] {
  const ids = arr(payload, 'likedTracks') ?? [];
  const details = obj(payload, 'likedTrackDetails') ?? {};
  const result: Track[] = [];
  for (const raw of ids) {
    const id = (typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : '').trim();
    if (!id) continue;
    result.push(parseTrackSnapshot(obj(details, id), id));
  }
  return result;
}

export function parseHistoryTracks(payload: Json): Track[] {
  const history = arr(payload, 'history') ?? [];
  return history.flatMap((entry) => {
    const item = asObject(entry);
    return item ? [parseTrackSnapshot(item)] : [];
  });
}

export function parseListenerFavorites(payload: Json): Track[] {
  const tracks = arr(payload, 'tracks') ?? [];
  const result: Track[] = [];
  for (const entry of tracks) {
    const item = asObject(entry);
    if (!item) continue;
    const normalized: Json = { ...item };
    if (!str(normalized, 'id').trim()) normalized.id = str(normalized, 'trackId');
    const track = parseTrackSnapshot(normalized);
    if (track.id.trim() && track.title.trim() && track.title !== 'Track') result.push(track);
  }
  return result;
}

export function parsePlaylistInvite(payload: Json): PlaylistInvite {
  const token = str(payload, 'token').trim();
  const inviteUrl = str(payload, 'inviteUrl').trim();
  if (!token || !inviteUrl) throw new SpiceApiError('Spice returned an invalid playlist invite.');
  return { token, inviteUrl, expiresAt: str(payload, 'expiresAt').trim() };
}

export function parsePlaylistInvitePreview(payload: Json, fallbackToken = ''): PlaylistInvitePreview {
  const invite = obj(payload, 'invite') ?? {};
  const playlist = parsePlaylist(obj(payload, 'playlist') ?? {});
  if (!playlist) throw new SpiceApiError('Spice returned an invalid playlist invite preview.');
  const token = str(invite, 'token').trim() || fallbackToken.trim();
  if (!token) throw new SpiceApiError('Spice returned an invalid playlist invite token.');
  return { token, role: str(invite, 'role').trim(), expiresAt: str(invite, 'expiresAt').trim(), playlist };
}

export function parsePendingPlaylistInvites(payload: Json): PendingPlaylistInvite[] {
  const invites = arr(payload, 'invites');
  if (!invites) return [];
  const result: PendingPlaylistInvite[] = [];
  for (const entry of invites) {
    const item = asObject(entry);
    if (!item) continue;
    const playlistId = str(item, 'playlistId').trim();
    const playlistTitle = str(item, 'playlistTitle').trim();
    if (!playlistId || !playlistTitle) continue;
    result.push({
      playlistId,
      playlistTitle,
      ownerId: str(item, 'ownerId').trim(),
      ownerUsername: str(item, 'ownerUsername').trim(),
      ownerDisplayName: str(item, 'ownerDisplayName').trim(),
    });
  }
  return result;
}

export function parsePlaylistMember(payload: Json): PlaylistMember | null {
  const userId = str(payload, 'userId').trim();
  if (!userId) return null;
  return {
    userId,
    username: str(payload, 'username').trim(),
    displayName: str(payload, 'displayName').trim() || str(payload, 'username').trim() || 'Unknown',
    avatarUrl: str(payload, 'avatarUrl').trim(),
    role: str(payload, 'role').trim(),
    status: str(payload, 'status').trim(),
    acceptedAt: str(payload, 'acceptedAt').trim(),
  };
}

export function parsePlaylistMembersSummary(payload: Json, fallbackPlaylistId = ''): PlaylistMembersSummary {
  const owner = parsePlaylistMember(obj(payload, 'owner') ?? {});
  if (!owner) throw new SpiceApiError('Spice returned an invalid playlist owner.');
  const members = (arr(payload, 'members') ?? []).flatMap((entry) => {
    const item = asObject(entry);
    const member = item ? parsePlaylistMember(item) : null;
    return member ? [member] : [];
  });
  return {
    playlistId: str(payload, 'playlistId').trim() || fallbackPlaylistId.trim(),
    owner,
    members,
    maxMembers: Math.max(0, int(payload, 'maxMembers', 4)),
  };
}

export function parseSharedPlaylistTracks(payload: Json, fallbackPlaylistId = ''): SharedPlaylistTracks {
  const tracks = arr(payload, 'tracks') ?? [];
  return {
    playlistId: str(payload, 'playlistId').trim() || fallbackPlaylistId.trim(),
    role: str(payload, 'role').trim(),
    tracks: tracks.flatMap((entry) => {
      const item = asObject(entry);
      if (!item) return [];
      const position = int(item, 'position', -1);
      if (position < 0) return [];
      return [{ position, track: parseTrackSnapshot(item), addedBy: parsePlaylistMember(obj(item, 'addedBy') ?? {}) }];
    }),
  };
}

export function trackToSnapshotJson(track: Track): Json {
  return {
    id: track.id,
    title: track.title,
    artists: [{ name: track.artist }],
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs,
    sourceId: track.sourceId,
  };
}

export function trackToRemoteJson(track: Track): Json {
  return { ...trackToSnapshotJson(track), artist: track.artist, album: track.album };
}

export function playlistToSnapshotJson(playlist: Playlist): Json {
  return {
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    coverUrl: playlist.coverUrl,
    shared: playlist.shared,
    shareRole: playlist.shareRole,
    isPublic: playlist.isPublic,
    tracks: playlist.tracks.map(trackToSnapshotJson),
  };
}

export function profileToSyncJson(profile: SpiceProfile): Json {
  return {
    id: profile.id.trim() || 'default',
    displayName: profile.displayName.trim() || 'Spice Listener',
    cloudUsername: profile.username.trim() ? profile.username : null,
    bio: profile.bio,
    gradient: profile.gradient.trim() || DEFAULT_PROFILE_GRADIENT,
    songsPlayed: Math.max(0, profile.songsPlayed),
    joinedAt: profile.joinedAt.trim() || 'July 2026',
    passcode: profile.passcode.trim() ? profile.passcode : null,
    avatarUrl: profile.avatarUrl.trim() ? profile.avatarUrl : null,
    isPrivate: profile.isPrivate,
  };
}
