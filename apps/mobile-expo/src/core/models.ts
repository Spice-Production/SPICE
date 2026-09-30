// Shared SPICE mobile models. They mirror the native Android client's Kotlin
// models so cloud payloads, sync merges, and Spice Connect stay compatible.

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  artworkUrl: string;
  sourceId: string;
  localUri: string;
};

export type FeedSection = {
  title: string;
  tracks: Track[];
};

export type Playlist = {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  tracks: Track[];
  shared: boolean;
  shareRole: string;
  isPublic: boolean;
};

export type PlaylistInvite = {
  token: string;
  inviteUrl: string;
  expiresAt: string;
};

export type PlaylistInvitePreview = {
  token: string;
  role: string;
  expiresAt: string;
  playlist: Playlist;
};

export type PendingPlaylistInvite = {
  playlistId: string;
  playlistTitle: string;
  ownerId: string;
  ownerUsername: string;
  ownerDisplayName: string;
};

export type PlaylistMember = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  role: string;
  status: string;
  acceptedAt: string;
};

export type PlaylistMembersSummary = {
  playlistId: string;
  owner: PlaylistMember;
  members: PlaylistMember[];
  maxMembers: number;
};

export type SharedPlaylistTrack = {
  position: number;
  track: Track;
  addedBy: PlaylistMember | null;
};

export type SharedPlaylistTracks = {
  playlistId: string;
  role: string;
  tracks: SharedPlaylistTrack[];
};

export type DownloadedTrack = {
  id: string;
  track: Track;
  filePath: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  downloadedAt: number;
};

export type ResolvedStream = {
  url: string;
  container: string;
  bitrate: number;
  protocol: string;
  contentType: string;
  expiresAt: string;
};

export type ResolvedPlayback = {
  track: Track;
  stream: ResolvedStream;
  usedFallback: boolean;
};

export type SpiceAccount = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  accountRole: string;
  isAdmin: boolean;
  moderationStatus: string;
  moderationExpiresAt: string;
  moderationReason: string;
};

export type AccountBlock = {
  status: 'banned' | 'timeout';
  reason: string;
  expiresAt: string;
};

export type SpiceProfile = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  bio: string;
  gradient: string;
  joinedAt: string;
  isPrivate: boolean;
  songsPlayed: number;
  passcode: string;
};

export type ProfileStats = {
  songsPlayed: number;
  likedCount: number;
  playlistsCount: number;
};

export type ProfileSummary = {
  profile: SpiceProfile;
  stats: ProfileStats;
};

export type AccountSession = {
  token: string;
  account: SpiceAccount;
};

export type EmailVerificationChallenge = {
  registrationId: string;
  email: string;
  expiresAt: string;
};

export type PairedDeviceCredential = {
  accessToken: string;
  authorizationId: string;
  ownerUserId: string;
  expiresAt: string;
  expiresAtEpochMs: number;
  deviceId: string;
  displayName: string;
};

export type LibrarySyncSummary = {
  likedCount: number;
  historyCount: number;
  playlistCount: number;
};

export type LibrarySyncResult = {
  summary: LibrarySyncSummary;
  likedTracks: Track[];
  historyTracks: Track[];
  playlists: Playlist[];
};

export type LyricsPayload = {
  plainLyrics: string;
  syncedLyrics: string;
  isSynced: boolean;
};

export type RepeatMode = 'Off' | 'All' | 'One';

export type RemoteDevice = {
  deviceId: string;
  displayName: string;
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  progressMs: number;
  durationMs: number;
  volume: number;
  updatedAt: string;
  lastSeenSeconds: number;
  rememberedUntil: string;
  isOnline: boolean;
  observedAtMs: number;
};

export type RemoteCommand = {
  id: string;
  sourceDeviceId: string;
  command: string;
  createdAt: string;
  payloadJson: string;
  payloadTrack: Track | null;
  payloadQueue: Track[];
  payloadQueueIndex: number;
  seekPositionMs: number | null;
  volume: number | null;
  shuffleEnabled: boolean | null;
  repeatMode: RepeatMode | null;
  shouldPlay: boolean | null;
  connected: boolean | null;
  liked: boolean | null;
  playlistId: string;
  playlistTitle: string;
  transferId: string;
  failureReason: string;
};

export type AccentTheme =
  | 'NeonSpice'
  | 'OceanBreeze'
  | 'SolarFire'
  | 'JadeEmerald'
  | 'ImperialGold'
  | 'CrimsonMoon'
  | 'MidnightVelvet';

export const ACCENT_THEMES: readonly { id: AccentTheme; label: string; color: string }[] = [
  { id: 'NeonSpice', label: 'Neon Spice', color: '#ec4899' },
  { id: 'OceanBreeze', label: 'Ocean Breeze', color: '#3b82f6' },
  { id: 'SolarFire', label: 'Solar Fire', color: '#f97316' },
  { id: 'JadeEmerald', label: 'Jade Emerald', color: '#10b981' },
  { id: 'ImperialGold', label: 'Imperial Gold', color: '#f59e0b' },
  { id: 'CrimsonMoon', label: 'Crimson Moon', color: '#ff003c' },
  { id: 'MidnightVelvet', label: 'Midnight Velvet', color: '#7c3aed' },
];

export type SurfaceTheme = 'Midnight' | 'Daylight';

export type AppScreen = 'Home' | 'Search' | 'Library' | 'Settings';

export type StreamQuality = 'High' | 'Standard' | 'DataSaver';

export const STREAM_QUALITIES: readonly { id: StreamQuality; label: string; detail: string }[] = [
  { id: 'High', label: 'High definition', detail: 'Best available bitrate' },
  { id: 'Standard', label: 'Standard', detail: 'Balanced quality and reliability' },
  { id: 'DataSaver', label: 'Data saver', detail: 'Lowest available bitrate' },
];

export type SearchProvider = 'All' | 'YouTube' | 'SoundCloud';

export const SEARCH_PROVIDERS: readonly { id: SearchProvider; label: string }[] = [
  { id: 'All', label: 'YouTube + SoundCloud' },
  { id: 'YouTube', label: 'YouTube only' },
  { id: 'SoundCloud', label: 'SoundCloud only' },
];

export type AuthMode = 'SignIn' | 'SignUp';

export type LibraryTab = 'Playlists' | 'Liked' | 'History' | 'Downloads';

export const LIBRARY_TABS: readonly LibraryTab[] = ['Playlists', 'Liked', 'History', 'Downloads'];

export function makeTrack(fields: Partial<Track> & Pick<Track, 'id'>): Track {
  return {
    title: 'Track',
    artist: 'Unknown artist',
    album: '',
    durationMs: 0,
    artworkUrl: '',
    sourceId: 'youtube_music',
    localUri: '',
    ...fields,
  };
}

export function makePlaylist(fields: Partial<Playlist> & Pick<Playlist, 'id' | 'title'>): Playlist {
  return {
    description: '',
    coverUrl: '',
    tracks: [],
    shared: false,
    shareRole: '',
    isPublic: true,
    ...fields,
  };
}

export function queueKey(track: Pick<Track, 'sourceId' | 'id'>): string {
  return `${track.sourceId}:${track.id}`;
}

export function isPairedCredentialExpired(credential: PairedDeviceCredential, nowMs = Date.now()): boolean {
  return credential.expiresAtEpochMs <= 0 || credential.expiresAtEpochMs <= nowMs;
}
