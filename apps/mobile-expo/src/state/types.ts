import type { AppUpdateInfo } from '../core/update';
import type {
  AccentTheme,
  AccountBlock,
  AccountSession,
  AppScreen,
  DownloadedTrack,
  EmailVerificationChallenge,
  FeedSection,
  LibrarySyncSummary,
  LibraryTab,
  LyricsPayload,
  PairedDeviceCredential,
  PendingPlaylistInvite,
  Playlist,
  PlaylistInvitePreview,
  PlaylistMembersSummary,
  ProfileSummary,
  RemoteDevice,
  SearchProvider,
  SharedPlaylistTracks,
  StreamQuality,
  SurfaceTheme,
  Track,
} from '../core/models';
import type { PlayerState } from '../engine/engine';

export type UiState = {
  screen: AppScreen;
  homeSections: FeedSection[];
  homeLoading: boolean;
  searchQuery: string;
  searchResults: Track[];
  searchLoading: boolean;
  resolvingTrackId: string | null;
  currentTrack: Track | null;
  playbackQueue: Track[];
  queueIndex: number;
  likedTracks: Track[];
  historyTracks: Track[];
  playlists: Playlist[];
  downloads: DownloadedTrack[];
  libraryTab: LibraryTab;
  quality: StreamQuality;
  searchProvider: SearchProvider;
  crossfadeDurationMs: number;
  smartQueueEnabled: boolean;
  accentTheme: AccentTheme;
  surfaceTheme: SurfaceTheme;
  accountSession: AccountSession | null;
  accountBlock: AccountBlock | null;
  pairedDeviceCredential: PairedDeviceCredential | null;
  spiceConnectEnabled: boolean;
  pairingLoading: boolean;
  profileSummary: ProfileSummary | null;
  profileLoading: boolean;
  profileEditOpen: boolean;
  profileEditLoading: boolean;
  emailVerification: EmailVerificationChallenge | null;
  accountLoading: boolean;
  syncLoading: boolean;
  lastSync: LibrarySyncSummary | null;
  pendingInvitePreview: PlaylistInvitePreview | null;
  inviteLoading: boolean;
  pendingAccountInvites: PendingPlaylistInvite[];
  accountInvitesLoading: boolean;
  sharingPlaylistId: string | null;
  activeMemberPlaylist: Playlist | null;
  playlistMembers: PlaylistMembersSummary | null;
  sharedPlaylistTracks: SharedPlaylistTracks | null;
  membersLoading: boolean;
  memberActionLoading: boolean;
  sharedTrackActionLoading: boolean;
  downloadTrackId: string | null;
  downloadProgress: string | null;
  downloadPlaylistId: string | null;
  downloadPlaylistCompleted: number;
  downloadPlaylistTotal: number;
  pendingRemoteDownloadTrack: Track | null;
  lyricsTrackId: string | null;
  lyricsPayload: LyricsPayload | null;
  lyricsLoading: boolean;
  remoteDeviceId: string;
  remoteDevices: RemoteDevice[];
  selectedPlaybackDeviceId: string;
  lanConnectedDeviceIds: string[];
  incomingRemoteControllerDeviceId: string;
  connectLoading: boolean;
  connectStatus: string;
  player: PlayerState;
  message: string | null;
  appUpdate: AppUpdateState;
};

export type AppUpdateState =
  | { status: 'idle' | 'checking' | 'current' }
  | { status: 'available' | 'ready'; update: AppUpdateInfo }
  | { status: 'downloading'; update: AppUpdateInfo; percent: number }
  | { status: 'error'; error: string; update: AppUpdateInfo | null };
