import * as Crypto from 'expo-crypto';
import { Platform, Share } from 'react-native';

import { accountBlockFromError, SpiceApi } from '../core/api';
import {
  BoundedCommandIds,
  COMMAND_POLL_INTERVAL_MS,
  COMMAND_STATE_SETTLE_MS,
  DEVICE_SYNC_INTERVAL_MS,
  HANDOFF_ACCEPT_TIMEOUT_MS,
  HANDOFF_COMPLETE_TIMEOUT_MS,
  MAX_APPLIED_COMMAND_IDS,
  OPTIMISTIC_STATE_WINDOW_MS,
  PROGRESS_REPORT_BUCKET_MS,
  REALTIME_FALLBACK_POLL_INTERVAL_MS,
  REALTIME_RECONNECT_MAX_MS,
  REALTIME_RECONNECT_MIN_MS,
  acceptHandoffReady,
  acceptsPreparedCommit,
  beginHandoff,
  completesHandoff,
  hasConnectAccess,
  nextDeviceSyncAt,
  normalizePairingCodeInput,
  normalizeTransferId,
  pairingCodeForSubmission,
  requiresDeviceRegistration,
  shouldResetDeviceRegistration,
  shouldResumeSource,
  shouldStartConnect,
  shouldSyncDevices,
  type PendingHandoff,
  type PreparedHandoff,
  type RealtimeEvent,
} from '../core/connect';
import {
  isPairedCredentialExpired,
  queueKey,
  type AccentTheme,
  type AccountSession,
  type AppScreen,
  type AuthMode,
  type DownloadedTrack,
  type FeedSection,
  type LibrarySyncSummary,
  type LibraryTab,
  type PendingPlaylistInvite,
  type Playlist,
  type RemoteCommand,
  type RemoteDevice,
  type ResolvedPlayback,
  type SearchProvider,
  type SharedPlaylistTrack,
  type SpiceProfile,
  type StreamQuality,
  type SurfaceTheme,
  type Track,
} from '../core/models';
import { SpiceApiError, parseListenerFavorites, repeatModeToRemote, trackToRemoteJson } from '../core/parsers';
import {
  effectiveCrossfadeDurationMs,
  nextRepeatMode,
  normalizeCrossfadeDurationMs,
  normalizePlaybackHistoryForQueue,
  normalizeQueue,
  planShuffleQueueIndex,
  playbackHistoryTarget,
  replaceAt,
  resolveQueueSelectionIndex,
  shouldPrepareTransition,
  shouldResetShuffleRound,
  shouldRestartTrackForPrevious,
  shouldStartTransition,
  shouldTreatSeekAsSkip,
  trackFeedbackForManualDeparture,
  type TrackFeedback,
  MAX_PLAYBACK_HISTORY_ENTRIES,
} from '../core/playback';
import {
  buildRecommendationSeeds,
  recommendationSections,
  reorderTracksByTaste,
  smartQueueCandidates,
  tasteContext,
  type RecommendationBatch,
} from '../core/recommendations';
import { findPortableSpiceConnectPlaylist, findSyncedPlaylist, resolveLikeMutation } from '../core/sync';
import {
  deleteDownloadFile,
  isSegmentedStream,
  openDownload as openDownloadFile,
  shareDownload as shareDownloadFile,
  startTrackDownload,
  type ActiveDownload,
} from '../data/downloads';
import { LibraryRepository } from '../data/library';
import { PREF, prefs } from '../data/prefs';
import { pairedCredentialStore, sessionStore } from '../data/secure';
import { EMPTY_PLAYER_STATE, engine, type PlayerState } from '../engine/engine';
import { awaitRemoteEvent } from './realtime';
import { Mutex, Store, delay } from './store';
import type { UiState } from './types';

const DISPLAY_NAME = Platform.OS === 'ios' ? 'Spice iPhone' : 'Spice Android';
const USER_AGENT = 'Spice-Mobile/1.0';
const SEARCH_DEBOUNCE_MS = 400;
const AUTO_HISTORY_SYNC_DEBOUNCE_MS = 90_000;
const AUTO_TASTE_SYNC_DEBOUNCE_MS = 30_000;
const LAN_SIGNAL_COMMAND = 'lan_signal';

type PlannedQueueIndex = { queueIndex: number; historyCursorTarget: number | null; startsNewShuffleRound: boolean };
type PendingDeparture = { trackKey: string; feedback: TrackFeedback };
type PreparedTransition = {
  outgoingTrackKey: string;
  nextTrackKey: string;
  queue: Track[];
  nextIndex: number;
  historyCursorTarget: number | null;
  startsNewShuffleRound: boolean;
  playback: ResolvedPlayback;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function readEnum<T extends string>(key: string, values: readonly T[], fallback: T): T {
  const value = prefs.getString(key, fallback) as T;
  return values.includes(value) ? value : fallback;
}

/** Cancelable delay that resolves early when aborted. */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done);
  });
}

/**
 * The app's single source of behavior: a TypeScript port of the Kotlin
 * client's SpiceViewModel. Screens read `store` and call these methods.
 */
export class SpiceController {
  readonly store: Store<UiState>;
  readonly api = new SpiceApi({ userAgent: USER_AGENT });
  readonly library = new LibraryRepository();

  private readonly remoteDeviceId: string;
  private playGeneration = 0;
  private searchGeneration = 0;
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;
  private lyricsGeneration = 0;
  private homeGeneration = 0;
  private remoteVolumeTimer: ReturnType<typeof setTimeout> | null = null;
  private historySyncTimer: ReturnType<typeof setTimeout> | null = null;
  private tasteSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private adaptiveTasteTimer: ReturnType<typeof setTimeout> | null = null;
  private connectRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private connectAbort: AbortController | null = null;
  private connectWakeup: (() => void) | null = null;
  private pendingWakeup: RealtimeEvent | null = null;
  private connectRealtimeAvailable = false;
  private handoffAcceptTimer: ReturnType<typeof setTimeout> | null = null;
  private handoffCompleteTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingHandoff: PendingHandoff | null = null;
  private readonly preparedHandoffs = new Map<string, PreparedHandoff>();
  private readonly likeMutationRevisions = new Map<string, number>();
  private transitionPreparing = false;
  private transitionGeneration = 0;
  private preparedTransition: PreparedTransition | null = null;
  private crossfadeInProgress = false;
  private crossfadeBypassOutgoingKey = '';
  private playbackHistory: string[] = [];
  private playbackHistoryCursor = -1;
  private shuffleCycleTrackKeys = new Set<string>();
  private shuffleRoundPlayCount = 0;
  private feedbackRecordedForCurrentPlayback = false;
  private lastObservedShuffleEnabled = false;
  private restoringMediaId = '';
  private readonly cloudLibrarySyncMutex = new Mutex();
  private readonly remoteLibraryMutationMutex = new Mutex();
  private optimisticRemoteDeviceId: string | null = null;
  private optimisticRemoteStateUntilMs = 0;
  private optimisticRemoteTrackChanged = false;
  private readonly optimisticallyForgottenRemoteDeviceIds = new Set<string>();
  private readonly appliedRemoteCommandIds: BoundedCommandIds;
  private activeDownload: ActiveDownload | null = null;
  private downloadCancelled = false;
  private unsubscribeEngine: (() => void) | null = null;
  private unsubscribeLibrary: (() => void) | null = null;

  constructor() {
    this.remoteDeviceId = this.loadRemoteDeviceId();
    this.appliedRemoteCommandIds = new BoundedCommandIds(
      MAX_APPLIED_COMMAND_IDS,
      prefs.getStringList(PREF.appliedRemoteCommandIds),
    );
    let pairedCredential = pairedCredentialStore.load();
    if (pairedCredential && pairedCredential.deviceId !== this.remoteDeviceId) {
      pairedCredentialStore.clear();
      pairedCredential = null;
    }
    const spiceConnectEnabled = prefs.has(PREF.spiceConnectEnabled)
      ? prefs.getBoolean(PREF.spiceConnectEnabled, false)
      : pairedCredential !== null;
    const library = this.library.snapshot();
    this.store = new Store<UiState>({
      screen: 'Home',
      homeSections: [],
      homeLoading: true,
      searchQuery: '',
      searchResults: [],
      searchLoading: false,
      resolvingTrackId: null,
      currentTrack: null,
      playbackQueue: [],
      queueIndex: -1,
      likedTracks: library.liked,
      historyTracks: library.history,
      playlists: library.playlists,
      downloads: library.downloads,
      libraryTab: 'Playlists',
      quality: readEnum<StreamQuality>(PREF.quality, ['High', 'Standard', 'DataSaver'], 'Standard'),
      searchProvider: readEnum<SearchProvider>(PREF.searchProvider, ['All', 'YouTube', 'SoundCloud'], 'All'),
      crossfadeDurationMs: normalizeCrossfadeDurationMs(prefs.getNumber(PREF.crossfadeDurationMs, 0)),
      smartQueueEnabled: prefs.getBoolean(PREF.smartQueueEnabled, true),
      accentTheme: readEnum<AccentTheme>(
        PREF.accentTheme,
        ['NeonSpice', 'OceanBreeze', 'SolarFire', 'JadeEmerald', 'ImperialGold', 'CrimsonMoon', 'MidnightVelvet'],
        'MidnightVelvet',
      ),
      surfaceTheme: readEnum<SurfaceTheme>(PREF.surfaceTheme, ['Midnight', 'Daylight'], 'Midnight'),
      accountSession: sessionStore.load(),
      accountBlock: null,
      pairedDeviceCredential: pairedCredential,
      spiceConnectEnabled,
      pairingLoading: false,
      profileSummary: null,
      profileLoading: false,
      profileEditOpen: false,
      profileEditLoading: false,
      emailVerification: null,
      accountLoading: false,
      syncLoading: false,
      lastSync: null,
      pendingInvitePreview: null,
      inviteLoading: false,
      pendingAccountInvites: [],
      accountInvitesLoading: false,
      sharingPlaylistId: null,
      activeMemberPlaylist: null,
      playlistMembers: null,
      sharedPlaylistTracks: null,
      membersLoading: false,
      memberActionLoading: false,
      sharedTrackActionLoading: false,
      downloadTrackId: null,
      downloadProgress: null,
      downloadPlaylistId: null,
      downloadPlaylistCompleted: 0,
      downloadPlaylistTotal: 0,
      pendingRemoteDownloadTrack: null,
      lyricsTrackId: null,
      lyricsPayload: null,
      lyricsLoading: false,
      remoteDeviceId: this.remoteDeviceId,
      remoteDevices: [],
      selectedPlaybackDeviceId: prefs.getString(PREF.selectedPlaybackDeviceId, ''),
      lanConnectedDeviceIds: [],
      incomingRemoteControllerDeviceId: '',
      connectLoading: false,
      connectStatus: '',
      player: EMPTY_PLAYER_STATE,
      message: null,
    });
  }

  private get state(): UiState {
    return this.store.get();
  }

  private set(patch: Partial<UiState>) {
    this.store.set(patch);
  }

  private get player(): PlayerState {
    return this.state.player;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start(): void {
    this.unsubscribeLibrary = this.library.subscribe(() => {
      const snapshot = this.library.snapshot();
      this.set({
        likedTracks: snapshot.liked,
        historyTracks: snapshot.history,
        playlists: snapshot.playlists,
        downloads: snapshot.downloads,
      });
    });
    this.unsubscribeEngine = engine.subscribe({
      onPlayerState: (state) => this.handlePlayerState(state),
      onPlaybackEnded: (mediaId) => void this.handlePlaybackEnded(mediaId),
      onTrackRepeated: () => this.handleTrackRepeated(),
      onCrossfadeCompleted: (trackKey) => this.handleCrossfadeCompleted(trackKey),
      onCrossfadeFailed: (trackKey) => this.handleCrossfadeFailed(trackKey),
      onRemoteCommand: (command) => (command === 'next' ? this.playNext() : this.playPrevious()),
    });
    void engine.connect().then((state) => this.handlePlayerState(state));
    this.drainBackgroundHistory();
    void this.initializeLibraryAndHome();
    const session = this.state.accountSession;
    if (session) this.verifyRestoredAccountSession(session);
    if (this.shouldStartSpiceConnect()) this.startSpiceConnect();
  }

  stop(): void {
    this.unsubscribeEngine?.();
    this.unsubscribeLibrary?.();
    this.connectAbort?.abort();
    this.activeDownload?.cancel();
  }

  onForeground(): void {
    this.drainBackgroundHistory();
  }

  private drainBackgroundHistory() {
    const entries = engine.drainBackgroundHistory();
    for (const entry of entries.sort((a, b) => a.playedAt - b.playedAt)) {
      const { playedAt, ...track } = entry;
      this.library.addToHistory(track, playedAt);
    }
    if (entries.length > 0) this.scheduleHistorySync();
  }

  // ---------------------------------------------------------------------------
  // Account
  // ---------------------------------------------------------------------------

  private verifyRestoredAccountSession(session: AccountSession) {
    this.api
      .fetchAccountMe(session.token)
      .then((account) => {
        if (account.moderationStatus !== 'active') {
          this.set({
            accountBlock: {
              status: account.moderationStatus === 'timeout' ? 'timeout' : 'banned',
              reason: account.moderationReason.trim(),
              expiresAt: account.moderationExpiresAt.trim(),
            },
          });
          return;
        }
        this.loadProfileSummary(session);
        this.loadPendingAccountInvites(session);
      })
      .catch((error: unknown) => {
        // A blocked account rejects /account/me before the rest of the session work starts.
        if (!this.applyAccountBlockFromApiError(error)) {
          // Offline or transient failure: keep the restored session so local playback still works.
          this.loadProfileSummary(session);
          this.loadPendingAccountInvites(session);
        }
      });
  }

  private applyAccountBlockFromApiError(error: unknown): boolean {
    const block = accountBlockFromError(error);
    if (!block) return false;
    this.set({ accountBlock: block, accountLoading: false, profileLoading: false });
    return true;
  }

  async submitAccount(mode: AuthMode, email: string, password: string, username: string): Promise<boolean> {
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    if (!trimmedEmail || !password || (mode === 'SignUp' && !trimmedUsername)) {
      this.set({ message: 'Enter the required account fields.' });
      return false;
    }
    this.set({ accountLoading: true, message: null });
    if (mode === 'SignUp') {
      try {
        const challenge = await this.api.signUp(trimmedEmail, password, trimmedUsername);
        this.set({
          emailVerification: challenge,
          accountLoading: false,
          message: `We sent a six-digit code to ${challenge.email}.`,
        });
        return true;
      } catch (error) {
        this.set({ accountLoading: false, message: errorMessage(error, 'Account registration failed.') });
        return false;
      }
    }
    try {
      this.completeAccountSignIn(await this.api.signIn(trimmedEmail, password));
      return true;
    } catch (error) {
      this.applyAccountBlockFromApiError(error);
      this.set({ accountLoading: false, message: errorMessage(error, 'Account sign-in failed.') });
      return false;
    }
  }

  async submitEmailVerification(code: string): Promise<void> {
    const challenge = this.state.emailVerification;
    if (!challenge) return;
    const digits = code.replace(/\D/g, '').slice(0, 6);
    if (digits.length !== 6) {
      this.set({ message: 'Enter the six-digit verification code.' });
      return;
    }
    this.set({ accountLoading: true, message: null });
    try {
      this.completeAccountSignIn(await this.api.verifyEmail(challenge.registrationId, digits));
    } catch (error) {
      this.set({ accountLoading: false, message: errorMessage(error, 'Email verification failed.') });
    }
  }

  async resendEmailVerification(): Promise<void> {
    const challenge = this.state.emailVerification;
    if (!challenge) return;
    this.set({ accountLoading: true, message: null });
    try {
      const refreshed = await this.api.resendEmailVerification(challenge.registrationId);
      this.set({
        emailVerification: refreshed,
        accountLoading: false,
        message: `A new verification code was sent to ${refreshed.email}.`,
      });
    } catch (error) {
      this.set({ accountLoading: false, message: errorMessage(error, 'Could not resend the verification code.') });
    }
  }

  cancelEmailVerification(): void {
    this.set({ emailVerification: null, accountLoading: false, message: 'Enter your account details to try again.' });
  }

  private completeAccountSignIn(session: AccountSession) {
    sessionStore.save(session);
    this.set({
      accountSession: session,
      emailVerification: null,
      accountLoading: false,
      message: `Signed in as ${session.account.email}.`,
    });
    this.loadProfileSummary(session);
    void this.syncLibrary(session);
    this.loadPendingAccountInvites(session);
    if (this.shouldStartSpiceConnect()) this.startSpiceConnect();
  }

  signOut(): void {
    sessionStore.clear();
    this.clearTimer('historySyncTimer');
    this.clearTimer('tasteSyncTimer');
    this.stopSpiceConnectLoops();
    this.clearPendingHandoff();
    this.preparedHandoffs.clear();
    this.clearOptimisticRemoteState();
    prefs.remove(PREF.selectedPlaybackDeviceId);
    this.set({
      accountSession: null,
      accountBlock: null,
      profileSummary: null,
      profileLoading: false,
      emailVerification: null,
      lastSync: null,
      pendingAccountInvites: [],
      pendingInvitePreview: null,
      activeMemberPlaylist: null,
      playlistMembers: null,
      sharedPlaylistTracks: null,
      remoteDevices: [],
      selectedPlaybackDeviceId: '',
      lanConnectedDeviceIds: [],
      connectLoading: false,
      connectStatus: '',
      message: 'Signed out of Spice account.',
    });
    if (this.shouldStartSpiceConnect()) this.startSpiceConnect();
  }

  syncNow(): void {
    const session = this.state.accountSession;
    if (!session) {
      this.set({ message: 'Sign in before syncing.' });
      return;
    }
    void this.syncLibrary(session);
    this.loadProfileSummary(session);
    this.loadPendingAccountInvites(session);
  }

  private loadProfileSummary(session: AccountSession) {
    this.set({ profileLoading: true });
    this.api
      .fetchProfileSummary(session.token, session.account.id)
      .then((summary) => {
        const current = this.state.accountSession;
        if (!current || current.token !== session.token) return;
        const updated: AccountSession = {
          ...current,
          account: {
            ...current.account,
            username: summary.profile.username,
            displayName: summary.profile.displayName,
            avatarUrl: summary.profile.avatarUrl,
          },
        };
        sessionStore.save(updated);
        this.set({ accountSession: updated, profileSummary: summary, profileLoading: false });
      })
      .catch((error: unknown) => {
        this.applyAccountBlockFromApiError(error);
        this.set({ profileLoading: false });
      });
  }

  private loadPendingAccountInvites(session: AccountSession, silent = false) {
    if (!silent) this.set({ accountInvitesLoading: true });
    this.api
      .fetchPendingPlaylistInvites(session.token)
      .then((invites) => this.set({ pendingAccountInvites: invites, accountInvitesLoading: false }))
      .catch((error: unknown) =>
        this.set({
          accountInvitesLoading: false,
          message: silent ? this.state.message : errorMessage(error, 'Could not load playlist invites.'),
        }),
      );
  }

  openProfileEditor(): void {
    if (!this.state.accountSession) {
      this.set({ message: 'Sign in before editing your profile.' });
      return;
    }
    this.set({ profileEditOpen: true, message: null });
  }

  dismissProfileEditor(): void {
    this.set({ profileEditOpen: false, profileEditLoading: false });
  }

  profileEditDefaults() {
    const { accountSession: session, profileSummary } = this.state;
    const profile = profileSummary?.profile;
    return {
      displayName: profile?.displayName || session?.account.displayName || (session?.account.email.split('@')[0] ?? ''),
      username: profile?.username || session?.account.username || '',
      avatarUrl: profile?.avatarUrl || session?.account.avatarUrl || '',
      bio: profile?.bio ?? '',
      isPrivate: profile?.isPrivate === true,
    };
  }

  async saveProfileEdit(edit: { displayName: string; username: string; avatarUrl: string; bio: string; isPrivate: boolean }) {
    const session = this.state.accountSession;
    if (!session) {
      this.set({ message: 'Sign in before editing your profile.' });
      return;
    }
    const displayName = edit.displayName.trim() || 'Spice Listener';
    const username = edit.username.trim().toLowerCase();
    const avatarUrl = edit.avatarUrl.trim();
    const bio = edit.bio.trim() || 'No bio written yet.';
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      this.set({ message: 'Username must be 3-20 letters, numbers, or underscores.' });
      return;
    }
    if (avatarUrl && !avatarUrl.startsWith('https://') && !avatarUrl.startsWith('http://')) {
      this.set({ message: 'Profile picture must be an http or https URL.' });
      return;
    }
    this.set({ profileEditLoading: true, message: null });
    try {
      const remoteProfiles = await this.api.fetchProfiles(session.token);
      const summary = this.state.profileSummary;
      const currentProfile: SpiceProfile = remoteProfiles.find((profile) => profile.id === 'default') ??
        summary?.profile ?? {
          id: 'default',
          displayName,
          username,
          avatarUrl: '',
          bio: '',
          gradient: 'linear-gradient(135deg, #a855f7, #ec4899)',
          joinedAt: '',
          isPrivate: false,
          songsPlayed: 0,
          passcode: '',
        };
      const updatedProfile: SpiceProfile = {
        ...currentProfile,
        displayName,
        username,
        avatarUrl,
        bio,
        isPrivate: edit.isPrivate,
        songsPlayed: currentProfile.songsPlayed > 0 ? currentProfile.songsPlayed : summary?.stats.songsPlayed ?? 0,
      };
      const profiles = remoteProfiles.some((profile) => profile.id === updatedProfile.id)
        ? remoteProfiles.map((profile) => (profile.id === updatedProfile.id ? updatedProfile : profile))
        : [...remoteProfiles, updatedProfile];
      if (username !== session.account.username) await this.api.updateUsername(session.token, username, updatedProfile.id);
      await this.api.syncProfiles(session.token, profiles);
      const refreshed = await this.api.fetchProfileSummary(session.token, session.account.id, updatedProfile.id);
      const updatedSession: AccountSession = {
        ...session,
        account: {
          ...session.account,
          username: refreshed.profile.username,
          displayName: refreshed.profile.displayName,
          avatarUrl: refreshed.profile.avatarUrl,
        },
      };
      sessionStore.save(updatedSession);
      this.set({
        accountSession: updatedSession,
        profileSummary: refreshed,
        profileEditOpen: false,
        profileEditLoading: false,
        message: 'Profile updated.',
      });
    } catch (error) {
      this.set({ profileEditLoading: false, message: errorMessage(error, 'Could not update profile.') });
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation & settings
  // ---------------------------------------------------------------------------

  selectScreen(screen: AppScreen): void {
    this.set({ screen });
  }

  setLibraryTab(tab: LibraryTab): void {
    this.set({ libraryTab: tab });
  }

  clearMessage(): void {
    this.set({ message: null });
    engine.clearError();
  }

  showMessage(message: string): void {
    this.set({ message });
  }

  setAccentTheme(theme: AccentTheme): void {
    prefs.set(PREF.accentTheme, theme);
    this.set({ accentTheme: theme });
  }

  setSurfaceTheme(surface: SurfaceTheme): void {
    prefs.set(PREF.surfaceTheme, surface);
    this.set({ surfaceTheme: surface });
  }

  setQuality(quality: StreamQuality): void {
    prefs.set(PREF.quality, quality);
    this.set({ quality });
    engine.updatePlaybackContextSettings(quality, this.state.crossfadeDurationMs);
  }

  setCrossfadeDurationMs(durationMs: number): void {
    const normalized = normalizeCrossfadeDurationMs(durationMs);
    prefs.set(PREF.crossfadeDurationMs, normalized);
    this.set({ crossfadeDurationMs: normalized });
    engine.updatePlaybackContextSettings(this.state.quality, normalized);
    if (normalized === 0) this.cancelPlaybackTransition();
  }

  setSmartQueueEnabled(enabled: boolean): void {
    prefs.set(PREF.smartQueueEnabled, enabled);
    this.set({ smartQueueEnabled: enabled });
  }

  setSearchProvider(provider: SearchProvider): void {
    prefs.set(PREF.searchProvider, provider);
    this.set({ searchProvider: provider });
  }

  // ---------------------------------------------------------------------------
  // Search & home
  // ---------------------------------------------------------------------------

  setSearchQuery(query: string): void {
    this.set({ searchQuery: query });
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    const normalized = query.trim();
    if (!normalized) {
      this.searchGeneration += 1;
      this.set({ searchResults: [], searchLoading: false });
      return;
    }
    this.searchDebounce = setTimeout(() => void this.runSearch(normalized), SEARCH_DEBOUNCE_MS);
  }

  search(query: string = this.state.searchQuery): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    const normalized = query.trim();
    if (!normalized) return;
    this.set({ searchQuery: normalized, searchLoading: true, message: null });
    void this.runSearch(normalized);
  }

  private async runSearch(normalized: string) {
    const generation = ++this.searchGeneration;
    this.set({ searchLoading: true, message: null });
    try {
      const tracks = await engine.search(normalized, 20, this.state.searchProvider);
      if (generation !== this.searchGeneration) return;
      const reordered = this.reorderSearchResultsForTaste(tracks);
      this.set({
        screen: 'Search',
        searchResults: reordered,
        searchLoading: false,
        message: reordered.length === 0 ? 'No tracks found.' : null,
      });
    } catch (error) {
      if (generation !== this.searchGeneration) return;
      this.set({ searchLoading: false, message: errorMessage(error, 'Search failed.') });
    }
  }

  /** Subtle taste re-ranking with the same affinity signals as the home feed. */
  private reorderSearchResultsForTaste(tracks: Track[]): Track[] {
    if (tracks.length < 2) return tracks;
    const history = this.state.historyTracks;
    if (history.length === 0) return tracks;
    return reorderTracksByTaste(tracks, tasteContext(history, this.state.likedTracks, (key) => engine.trackPriority(key)));
  }

  retryHome(): void {
    void this.loadHome();
  }

  private async initializeLibraryAndHome() {
    const session = this.state.accountSession;
    if (session) {
      try {
        this.set({ lastSync: await this.refreshCloudTaste(session) });
      } catch {
        // Offline start: the local library still loads.
      }
    }
    await this.loadHome();
  }

  private async loadHome() {
    const generation = ++this.homeGeneration;
    this.set({ homeLoading: true, message: null });
    try {
      const history = this.library.historySnapshot();
      const liked = this.library.likedSnapshot();
      const seeds = buildRecommendationSeeds(history, liked);
      const batches = (
        await Promise.all(
          seeds.map(async (seed): Promise<RecommendationBatch | null> => {
            try {
              return { seed, tracks: await engine.search(seed.query, 14, 'All') };
            } catch {
              return null;
            }
          }),
        )
      ).filter((batch): batch is RecommendationBatch => batch !== null);
      const personalized = recommendationSections(batches, history, liked, (key) => engine.trackPriority(key));
      const fallbackQueries: [string, string][] = [['Quick Picks', 'Top Hits 2026']];
      if (personalized.length === 0) {
        fallbackQueries.push(['Lofi & Chill', 'Chill Study Lofi Beats'], ['Workout Energy', 'Workout Gym Power']);
      }
      const fallback = (
        await Promise.all(
          fallbackQueries.map(async ([title, query]): Promise<FeedSection | null> => {
            try {
              return { title, tracks: await engine.search(query, 10, 'All') };
            } catch {
              return null;
            }
          }),
        )
      ).filter((section): section is FeedSection => section !== null);
      let sections = [...personalized, ...fallback].filter((section) => section.tracks.length > 0);
      const session = this.state.accountSession;
      if (session) {
        try {
          const favorites = parseListenerFavorites(await this.api.fetchListenersLikeYou(session.token)).slice(0, 10);
          if (favorites.length > 0) {
            sections = [
              { title: 'Listeners like you', tracks: favorites },
              ...sections.filter((section) => section.title !== 'Listeners like you'),
            ];
          }
        } catch {
          // Collaborative picks are optional.
        }
      }
      if (generation !== this.homeGeneration) return;
      this.set({
        homeSections: sections,
        homeLoading: false,
        message: sections.length === 0 ? 'Home feed is unavailable right now.' : this.state.message,
      });
    } catch (error) {
      if (generation !== this.homeGeneration) return;
      this.set({ homeLoading: false, message: errorMessage(error, 'Home feed failed to load.') });
    }
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  play(track: Track, queue: Track[] = [track], queueIndexHint?: number): void {
    const target = this.activeRemoteTargetId();
    if (target) {
      if (queueIndexHint !== undefined) this.playQueueIndexOnRemoteDevice(target, track, queueIndexHint);
      else this.playOnRemoteDevice(target, track, queue);
      return;
    }
    const normalizedQueue = normalizeQueue(queue, track);
    const nextIndex = resolveQueueSelectionIndex(normalizedQueue, track, queueIndexHint);
    const departure = this.state.currentTrack ? this.pendingManualDeparture() : null;
    this.playQueueIndex(normalizedQueue, nextIndex, null, false, departure);
  }

  playNext(): void {
    const target = this.activeRemoteTargetId();
    if (target) {
      // The receiver owns shuffle history, repeat boundaries, and continuation.
      this.sendRemoteCommand(target, 'next');
      return;
    }
    this.playNextLocally();
  }

  private playNextLocally() {
    const state = this.state;
    const plan = this.nextQueuePlan(state.playbackQueue.length > 0);
    if (!plan) {
      this.set({ message: 'No next track in queue.' });
      return;
    }
    this.playQueueIndex(state.playbackQueue, plan.queueIndex, plan.historyCursorTarget, plan.startsNewShuffleRound, this.pendingManualDeparture());
  }

  playPrevious(): void {
    const target = this.activeRemoteTargetId();
    if (target) {
      // Previous can restart the current track, so never guess the remote queue position.
      this.sendRemoteCommand(target, 'previous');
      return;
    }
    this.playPreviousLocally();
  }

  private playPreviousLocally() {
    const state = this.state;
    const queue = state.playbackQueue;
    if (queue.length === 0) {
      this.set({ message: 'No previous track in queue.' });
      return;
    }
    if (shouldRestartTrackForPrevious(this.player.positionMs)) {
      this.cancelPlaybackTransition();
      engine.seekTo(0);
      this.feedbackRecordedForCurrentPlayback = false;
      return;
    }
    if (this.player.shuffleEnabled) {
      const target = this.historyTraversalIndex(queue, -1);
      if (target) {
        this.playQueueIndex(queue, target[1], target[0], false, this.pendingManualDeparture());
        return;
      }
      this.set({ message: 'No earlier track in playback history.' });
      return;
    }
    const previousIndex = state.queueIndex > 0 ? state.queueIndex - 1 : queue.length - 1;
    this.playQueueIndex(queue, previousIndex, null, false, this.pendingManualDeparture());
  }

  private playQueueIndex(
    queue: Track[],
    index: number,
    historyCursorTarget: number | null = null,
    startsNewShuffleRound = false,
    manualDeparture: PendingDeparture | null = null,
  ): Promise<void> {
    const track = queue[index];
    if (!track) return Promise.resolve();
    this.cancelPlaybackTransition();
    const generation = ++this.playGeneration;
    this.set({ resolvingTrackId: track.id, message: null });
    return engine
      .resolvePlayable(track, this.state.quality)
      .then((playback) => {
        if (generation !== this.playGeneration) return;
        this.commitResolvedPlayback(queue, index, playback, historyCursorTarget, startsNewShuffleRound, manualDeparture);
      })
      .catch((error: unknown) => {
        if (generation !== this.playGeneration) return;
        this.set({ resolvingTrackId: null, message: errorMessage(error, 'No playable source is available.') });
      });
  }

  private cancelPendingLocalPlayResolution() {
    this.playGeneration += 1;
    if (this.state.resolvingTrackId !== null) this.set({ resolvingTrackId: null });
  }

  private commitResolvedPlayback(
    queue: Track[],
    index: number,
    playback: ResolvedPlayback,
    historyCursorTarget: number | null,
    startsNewShuffleRound: boolean,
    manualDeparture: PendingDeparture | null,
  ) {
    this.applyManualDeparture(manualDeparture);
    const updatedQueue = replaceAt(queue, index, playback.track);
    if (
      this.player.shuffleEnabled &&
      shouldResetShuffleRound(this.state.playbackQueue.map(queueKey), queue.map(queueKey))
    ) {
      this.shuffleCycleTrackKeys.clear();
      this.shuffleRoundPlayCount = 0;
    }
    this.recordPlaybackStarted(updatedQueue, playback.track, historyCursorTarget, startsNewShuffleRound);
    this.set({
      resolvingTrackId: null,
      currentTrack: playback.track,
      playbackQueue: updatedQueue,
      queueIndex: index,
      message: playback.usedFallback ? `Playing full SoundCloud source: ${playback.track.title}` : null,
    });
    engine.clearError();
    engine.play(playback.track, playback.stream.url, {
      queue: updatedQueue,
      queueIndex: index,
      quality: this.state.quality,
      crossfadeDurationMs: this.state.crossfadeDurationMs,
      repeatMode: this.player.repeatMode,
      shuffleEnabled: this.player.shuffleEnabled,
      shuffleRoundTrackKeys: [...this.shuffleCycleTrackKeys],
      shuffleRoundPlayCount: this.shuffleRoundPlayCount,
      playbackHistory: [...this.playbackHistory],
      playbackHistoryCursor: this.playbackHistoryCursor,
    });
    this.library.addToHistory(playback.track);
    this.scheduleHistorySync();
  }

  togglePlayback(): void {
    const target = this.activeRemoteTargetId();
    if (!target) {
      this.cancelPendingLocalPlayResolution();
      this.cancelPlaybackTransition();
      engine.toggle();
      return;
    }
    const device = this.selectedRemoteDevice();
    if (!device) {
      this.unavailableRemoteTarget();
      return;
    }
    if (!device.isPlaying && !device.currentTrack) {
      this.set({ message: `Choose a track for ${device.displayName} first.` });
      return;
    }
    this.patchRemoteDevice(target, (current) => ({ ...current, isPlaying: !device.isPlaying }));
    this.sendRemoteCommand(target, device.isPlaying ? 'pause' : 'play');
  }

  seekTo(positionMs: number): void {
    const target = this.activeRemoteTargetId();
    if (!target) {
      this.cancelPendingLocalPlayResolution();
      this.cancelPlaybackTransition();
      if (shouldTreatSeekAsSkip(this.player.positionMs, positionMs, this.player.durationMs)) this.recordManualDeparture();
      engine.seekTo(positionMs);
      return;
    }
    const device = this.selectedRemoteDevice();
    if (!device) {
      this.unavailableRemoteTarget();
      return;
    }
    const safePosition = Math.min(Math.max(positionMs, 0), device.durationMs > 0 ? device.durationMs : Number.MAX_SAFE_INTEGER);
    this.patchRemoteDevice(target, (current) => ({ ...current, progressMs: safePosition }));
    this.sendRemoteCommand(target, 'seek', { progress: safePosition / 1000 });
  }

  setRemoteVolume(volume: number): void {
    const target = this.selectedRemoteDevice();
    if (!target) return;
    if (!target.isOnline) {
      this.unavailableRemoteTarget();
      return;
    }
    const safeVolume = Math.min(Math.max(Math.round(volume), 0), 100);
    this.patchRemoteDevice(target.deviceId, (current) => ({ ...current, volume: safeVolume }));
    if (this.remoteVolumeTimer) clearTimeout(this.remoteVolumeTimer);
    this.remoteVolumeTimer = setTimeout(
      () => this.sendRemoteCommand(target.deviceId, 'volume', { volume: safeVolume }),
      75,
    );
  }

  isControllingRemoteDevice(): boolean {
    return this.selectedRemoteDevice()?.isOnline === true;
  }

  toggleShuffle(): void {
    const target = this.activeRemoteTargetId();
    if (!target) {
      const enabling = !this.player.shuffleEnabled;
      this.shuffleCycleTrackKeys.clear();
      this.shuffleRoundPlayCount = 0;
      const current = this.state.currentTrack;
      if (enabling && current) {
        this.shuffleCycleTrackKeys.add(queueKey(current));
        this.shuffleRoundPlayCount = 1;
      }
      engine.setShuffle(enabling);
      return;
    }
    const device = this.selectedRemoteDevice();
    if (!device) {
      this.unavailableRemoteTarget();
      return;
    }
    const enabled = !device.shuffleEnabled;
    this.patchRemoteDevice(target, (current) => ({ ...current, shuffleEnabled: enabled }));
    this.sendRemoteCommand(target, 'shuffle', { enabled });
  }

  cycleRepeat(): void {
    const target = this.activeRemoteTargetId();
    if (!target) {
      engine.setRepeatMode(nextRepeatMode(this.player.repeatMode));
      return;
    }
    const device = this.selectedRemoteDevice();
    if (!device) {
      this.unavailableRemoteTarget();
      return;
    }
    const mode = nextRepeatMode(device.repeatMode);
    this.patchRemoteDevice(target, (current) => ({ ...current, repeatMode: mode }));
    this.sendRemoteCommand(target, 'repeat', { mode: repeatModeToRemote(mode) });
  }

  stopPlayback(): void {
    this.cancelPendingLocalPlayResolution();
    this.cancelPlaybackTransition();
    const target = this.activeRemoteTargetId();
    if (target) {
      this.patchRemoteDevice(target, (current) => ({ ...current, isPlaying: false }));
      this.sendRemoteCommand(target, 'pause');
      return;
    }
    this.recordManualDeparture();
    engine.stop();
    this.set({ currentTrack: null, playbackQueue: [], queueIndex: -1, resolvingTrackId: null });
    this.playbackHistory = [];
    this.playbackHistoryCursor = -1;
    this.shuffleCycleTrackKeys.clear();
    this.shuffleRoundPlayCount = 0;
    this.feedbackRecordedForCurrentPlayback = false;
  }

  private nextQueuePlan(allowWrap: boolean): PlannedQueueIndex | null {
    const state = this.state;
    const queue = state.playbackQueue;
    if (queue.length === 0) return null;
    if (this.player.shuffleEnabled) {
      const history = this.historyTraversalIndex(queue, 1);
      if (history) return { queueIndex: history[1], historyCursorTarget: history[0], startsNewShuffleRound: false };
      if (queue.length > 1) {
        const plan = planShuffleQueueIndex({
          queueIndices: queue.map((_, index) => index),
          currentIndex: state.queueIndex,
          playedTrackKeys: this.shuffleCycleTrackKeys,
          roundPlayCount: this.shuffleRoundPlayCount,
          allowWrap,
          trackKeyForIndex: (index) => queueKey(queue[index]!),
          priorityForIndex: (index) => engine.trackPriority(queueKey(queue[index]!)),
          randomUnit: Math.random(),
        });
        if (plan) return { queueIndex: plan.queueIndex, historyCursorTarget: null, startsNewShuffleRound: plan.startsNewRound };
      }
    }
    const next = state.queueIndex + 1;
    if (next >= 0 && next < queue.length) return { queueIndex: next, historyCursorTarget: null, startsNewShuffleRound: false };
    return allowWrap ? { queueIndex: 0, historyCursorTarget: null, startsNewShuffleRound: false } : null;
  }

  private historyTraversalIndex(queue: Track[], step: number): [number, number] | null {
    const target = playbackHistoryTarget(this.playbackHistory, this.playbackHistoryCursor, step, new Set(queue.map(queueKey)));
    if (!target) return null;
    return [target[0], queue.findIndex((track) => queueKey(track) === target[1])];
  }

  private recordPlaybackStarted(
    queue: Track[],
    track: Track,
    historyCursorTarget: number | null,
    startsNewShuffleRound: boolean,
  ) {
    const queueKeys = new Set(queue.map(queueKey));
    const key = queueKey(track);
    if (this.playbackHistory.some((entry) => !queueKeys.has(entry))) {
      this.playbackHistory = [];
      this.playbackHistoryCursor = -1;
    }
    if (historyCursorTarget !== null && historyCursorTarget >= 0 && historyCursorTarget < this.playbackHistory.length) {
      this.playbackHistoryCursor = historyCursorTarget;
      this.playbackHistory[historyCursorTarget] = key;
    } else {
      this.playbackHistory = this.playbackHistory.slice(0, this.playbackHistoryCursor + 1);
      if (this.playbackHistory[this.playbackHistory.length - 1] !== key) this.playbackHistory.push(key);
      this.playbackHistoryCursor = this.playbackHistory.length - 1;
    }
    if (this.player.shuffleEnabled) {
      if (startsNewShuffleRound) {
        this.shuffleCycleTrackKeys.clear();
        this.shuffleRoundPlayCount = 0;
      }
      if (historyCursorTarget === null) {
        this.shuffleCycleTrackKeys.add(key);
        this.shuffleRoundPlayCount = Math.min(this.shuffleRoundPlayCount + 1, queue.length);
      }
    }
    if (this.playbackHistory.length > MAX_PLAYBACK_HISTORY_ENTRIES) {
      const removeCount = this.playbackHistory.length - MAX_PLAYBACK_HISTORY_ENTRIES;
      this.playbackHistory = this.playbackHistory.slice(removeCount);
      this.playbackHistoryCursor = Math.max(this.playbackHistoryCursor - removeCount, 0);
    }
    this.feedbackRecordedForCurrentPlayback = false;
    this.crossfadeBypassOutgoingKey = '';
  }

  // --- Adaptive feedback ------------------------------------------------------

  private pendingManualDeparture(): PendingDeparture | null {
    const track = this.state.currentTrack;
    if (!track || this.feedbackRecordedForCurrentPlayback) return null;
    const player = this.player;
    if (player.mediaId && player.mediaId !== track.id) return null;
    return { trackKey: queueKey(track), feedback: trackFeedbackForManualDeparture(player.positionMs, player.durationMs) };
  }

  private recordManualDeparture() {
    this.applyManualDeparture(this.pendingManualDeparture());
  }

  private applyManualDeparture(departure: PendingDeparture | null) {
    if (!departure || this.feedbackRecordedForCurrentPlayback) return;
    engine.recordTrackFeedback(departure.trackKey, departure.feedback);
    this.feedbackRecordedForCurrentPlayback = true;
    this.scheduleAdaptiveTasteSync();
  }

  private recordCompletedPlayback(trackKeyOverride?: string) {
    const current = this.state.currentTrack;
    const trackKey = trackKeyOverride ?? (current ? queueKey(current) : null);
    if (!trackKey || this.feedbackRecordedForCurrentPlayback) return;
    engine.recordTrackFeedback(trackKey, 'Completed');
    this.feedbackRecordedForCurrentPlayback = true;
    this.scheduleAdaptiveTasteSync();
  }

  // Pushes local skip/completion learning (debounced) so taste follows the
  // listener across desktop and phone.
  private scheduleAdaptiveTasteSync() {
    const session = this.state.accountSession;
    if (!session) return;
    this.clearTimer('adaptiveTasteTimer');
    this.adaptiveTasteTimer = setTimeout(() => {
      const now = Date.now();
      this.api
        .pushTasteStates(session.token, [{ kind: 'adaptive', payload: engine.trackPriorityPayload(), updatedAt: now }])
        .then(() => prefs.set(PREF.tasteAdaptiveSyncedAt, now))
        .catch(() => undefined);
    }, AUTO_TASTE_SYNC_DEBOUNCE_MS);
  }

  private async pullAdaptiveTaste(session: AccountSession) {
    try {
      const payload = await this.api.fetchTasteStates(session.token);
      const states = payload.states as Record<string, unknown> | undefined;
      const adaptive = states && typeof states === 'object' ? (states.adaptive as Record<string, unknown> | undefined) : undefined;
      if (!adaptive) return;
      const updatedAt = typeof adaptive.updatedAt === 'number' ? adaptive.updatedAt : Number(adaptive.updatedAt ?? 0);
      if (!(updatedAt > prefs.getNumber(PREF.tasteAdaptiveSyncedAt, 0))) return;
      engine.replaceTrackPriorities(typeof adaptive.payload === 'string' ? adaptive.payload : '[]');
      prefs.set(PREF.tasteAdaptiveSyncedAt, updatedAt);
    } catch {
      // Taste sync is best effort.
    }
  }

  // --- Engine events -----------------------------------------------------------

  private handlePlayerState(player: PlayerState) {
    this.set({ player });
    const restoring = this.restoreLocalPlaybackContextIfNeeded(player);
    if (!restoring) this.updateObservedShuffleState(player);
    this.evaluatePlaybackTransition(player);
  }

  private restoreLocalPlaybackContextIfNeeded(player: PlayerState): boolean {
    if (!player.connected || !player.mediaId) return false;
    if (this.crossfadeInProgress || this.preparedTransition) return false;
    const state = this.state;
    if (state.currentTrack?.id === player.mediaId && state.playbackQueue.length > 0) return false;
    if (state.resolvingTrackId !== null || this.restoringMediaId === player.mediaId) return false;
    this.restoringMediaId = player.mediaId;
    void engine.restoredPlaybackContext(player.mediaId).then((context) => {
      this.restoringMediaId = '';
      if (!context || this.player.mediaId !== player.mediaId) return;
      const currentTrack = context.queue[context.queueIndex];
      if (!currentTrack) return;
      const queueKeys = new Set(context.queue.map(queueKey));
      const [history, cursor] = normalizePlaybackHistoryForQueue(context.playbackHistory, context.playbackHistoryCursor, queueKeys);
      this.playbackHistory = history;
      this.playbackHistoryCursor = cursor;
      this.shuffleCycleTrackKeys = new Set(context.shuffleRoundTrackKeys.filter((key) => queueKeys.has(key)));
      this.shuffleRoundPlayCount = Math.min(Math.max(context.shuffleRoundPlayCount, 0), context.queue.length);
      this.feedbackRecordedForCurrentPlayback = false;
      this.lastObservedShuffleEnabled = context.shuffleEnabled;
      this.set({
        currentTrack,
        playbackQueue: context.queue,
        queueIndex: context.queueIndex,
        resolvingTrackId: null,
        quality: context.quality,
        crossfadeDurationMs: context.crossfadeDurationMs,
        message: null,
      });
      // The service may have advanced the queue on its own; adopt its history.
      this.drainBackgroundHistory();
    });
    return true;
  }

  private updateObservedShuffleState(player: PlayerState) {
    if (player.shuffleEnabled === this.lastObservedShuffleEnabled) return;
    this.shuffleCycleTrackKeys.clear();
    this.shuffleRoundPlayCount = 0;
    const current = this.state.currentTrack;
    if (player.shuffleEnabled && current) {
      this.shuffleCycleTrackKeys.add(queueKey(current));
      this.shuffleRoundPlayCount = 1;
    }
    this.lastObservedShuffleEnabled = player.shuffleEnabled;
  }

  private evaluatePlaybackTransition(player: PlayerState) {
    const state = this.state;
    const current = state.currentTrack;
    const outgoingKey = current ? queueKey(current) : '';
    const configured = state.crossfadeDurationMs;
    if (
      this.activeRemoteTargetId() !== null ||
      !player.isPlaying ||
      !current ||
      configured <= 0 ||
      player.repeatMode === 'One' ||
      !player.localCrossfadeSupported ||
      this.crossfadeInProgress ||
      this.crossfadeBypassOutgoingKey === outgoingKey
    ) {
      if (this.preparedTransition?.outgoingTrackKey !== outgoingKey) {
        this.transitionGeneration += 1;
        this.transitionPreparing = false;
        this.preparedTransition = null;
      }
      return;
    }
    const prepared = this.preparedTransition;
    if (
      prepared &&
      (prepared.outgoingTrackKey !== outgoingKey ||
        (state.playbackQueue[prepared.nextIndex] ? queueKey(state.playbackQueue[prepared.nextIndex]!) : '') !== prepared.nextTrackKey)
    ) {
      this.preparedTransition = null;
    }
    if (
      !this.preparedTransition &&
      !this.transitionPreparing &&
      shouldPrepareTransition(player.positionMs, player.durationMs, configured, true)
    ) {
      const plan = this.nextQueuePlan(player.repeatMode === 'All');
      const nextTrack = plan ? state.playbackQueue[plan.queueIndex] : undefined;
      if (plan && nextTrack) {
        const nextIndex = plan.queueIndex;
        const queueSnapshot = state.playbackQueue;
        const generation = ++this.transitionGeneration;
        this.transitionPreparing = true;
        void engine
          .resolvePlayable(nextTrack, this.state.quality)
          .then(async (playback) => {
            if (generation !== this.transitionGeneration) return;
            const latest = this.state;
            const stillQueued = () =>
              (latest.currentTrack ? queueKey(latest.currentTrack) : '') === outgoingKey &&
              (latest.playbackQueue[nextIndex] ? queueKey(latest.playbackQueue[nextIndex]!) : '') === queueKey(nextTrack);
            if (!stillQueued()) return;
            const ready = await engine.prepareCrossfade({
              trackKey: queueKey(playback.track),
              track: playback.track,
              streamUrl: playback.stream.url,
              queueIndex: nextIndex,
              crossfadeDurationMs: configured,
              startsNewShuffleRound: plan.startsNewShuffleRound,
              countsAsShuffleDraw: plan.historyCursorTarget === null,
              historyCursorTarget: plan.historyCursorTarget,
            });
            if (generation !== this.transitionGeneration) return;
            const now = this.state;
            if (
              ready &&
              (now.currentTrack ? queueKey(now.currentTrack) : '') === outgoingKey &&
              (now.playbackQueue[nextIndex] ? queueKey(now.playbackQueue[nextIndex]!) : '') === queueKey(nextTrack)
            ) {
              this.preparedTransition = {
                outgoingTrackKey: outgoingKey,
                nextTrackKey: queueKey(nextTrack),
                queue: queueSnapshot,
                nextIndex,
                historyCursorTarget: plan.historyCursorTarget,
                startsNewShuffleRound: plan.startsNewShuffleRound,
                playback,
              };
            } else if (!ready) {
              this.crossfadeBypassOutgoingKey = outgoingKey;
            }
          })
          .catch(() => undefined)
          .finally(() => {
            if (generation === this.transitionGeneration) this.transitionPreparing = false;
          });
      }
    }
    const ready = this.preparedTransition;
    if (!ready || this.crossfadeInProgress) return;
    if (shouldStartTransition(player.positionMs, player.durationMs, configured, true)) {
      const effective = effectiveCrossfadeDurationMs(configured, player.durationMs - player.positionMs);
      if (effective === null) {
        this.crossfadeBypassOutgoingKey = outgoingKey;
        this.preparedTransition = null;
        engine.cancelPreparedCrossfade();
      } else {
        this.startPlaybackTransition(ready, effective);
      }
    }
  }

  private startPlaybackTransition(prepared: PreparedTransition, durationMs: number) {
    this.transitionGeneration += 1;
    this.transitionPreparing = false;
    this.crossfadeInProgress = true;
    void engine.startPreparedCrossfade(durationMs).then((started) => {
      if (started) return;
      this.crossfadeBypassOutgoingKey = prepared.outgoingTrackKey;
      this.crossfadeInProgress = false;
      this.preparedTransition = null;
      engine.cancelPreparedCrossfade();
    });
  }

  private cancelPlaybackTransition() {
    this.transitionGeneration += 1;
    this.transitionPreparing = false;
    engine.cancelPreparedCrossfade();
    this.crossfadeInProgress = false;
    this.preparedTransition = null;
  }

  private handleCrossfadeCompleted(trackKey: string) {
    const transition = this.preparedTransition;
    if (!transition || queueKey(transition.playback.track) !== trackKey) {
      this.crossfadeInProgress = false;
      this.preparedTransition = null;
      return;
    }
    this.recordCompletedPlayback(transition.outgoingTrackKey);
    const updatedQueue = replaceAt(transition.queue, transition.nextIndex, transition.playback.track);
    this.set({
      resolvingTrackId: null,
      currentTrack: transition.playback.track,
      playbackQueue: updatedQueue,
      queueIndex: transition.nextIndex,
      message: transition.playback.usedFallback ? `Playing full SoundCloud source: ${transition.playback.track.title}` : null,
    });
    this.recordPlaybackStarted(updatedQueue, transition.playback.track, transition.historyCursorTarget, transition.startsNewShuffleRound);
    this.preparedTransition = null;
    this.crossfadeInProgress = false;
    this.library.addToHistory(transition.playback.track);
    this.scheduleHistorySync();
  }

  private handleCrossfadeFailed(trackKey: string) {
    const transition = this.preparedTransition;
    if (transition && queueKey(transition.playback.track) === trackKey) {
      this.crossfadeBypassOutgoingKey = transition.outgoingTrackKey;
    }
    this.preparedTransition = null;
    this.crossfadeInProgress = false;
  }

  private handleTrackRepeated() {
    this.recordCompletedPlayback();
    this.feedbackRecordedForCurrentPlayback = false;
  }

  private async handlePlaybackEnded(endedMediaId: string) {
    if (this.crossfadeInProgress || this.preparedTransition) return;
    const state = this.state;
    if (!endedMediaId || state.currentTrack?.id !== endedMediaId) return;
    this.recordCompletedPlayback();
    const plan = this.nextQueuePlan(this.player.repeatMode === 'All');
    if (!plan) {
      if (state.smartQueueEnabled) {
        const continuation = smartQueueCandidates(state.homeSections, state.playbackQueue);
        if (continuation.length > 0) {
          await this.playQueueIndex([...state.playbackQueue, ...continuation], state.playbackQueue.length);
          return;
        }
      }
      this.set({ message: 'Queue finished.' });
      return;
    }
    await this.playQueueIndex(state.playbackQueue, plan.queueIndex, plan.historyCursorTarget, plan.startsNewShuffleRound);
  }

  // ---------------------------------------------------------------------------
  // Likes, library, playlists
  // ---------------------------------------------------------------------------

  async toggleLike(track: Track): Promise<void> {
    const liked = this.library.toggleLike(track);
    const revision = (this.likeMutationRevisions.get(track.id) ?? 0) + 1;
    this.likeMutationRevisions.set(track.id, revision);
    const session = this.state.accountSession;
    const savedMessage = liked ? `Saved ${track.title} to Liked.` : `Removed ${track.title} from Liked.`;
    if (!session) {
      this.syncLikeToActiveReceiver(track, liked);
      this.set({ message: savedMessage });
      return;
    }
    let succeeded = true;
    let failure: unknown = null;
    try {
      await this.api.setTrackLiked(session.token, track, liked);
    } catch (error) {
      succeeded = false;
      failure = error;
    }
    const resolution = resolveLikeMutation({
      requestRevision: revision,
      latestRevision: this.likeMutationRevisions.get(track.id) ?? revision,
      requestedLiked: liked,
      currentlyLiked: this.library.isLiked(track.id),
      succeeded,
    });
    if (resolution === 'Confirm') {
      this.library.markLikeMutationSynced(track.id);
      this.syncLikeToActiveReceiver(track, liked);
      this.set({ message: savedMessage });
    } else if (resolution === 'ReconcileNewerChange') {
      // A newer local or cross-device state won while this request was in flight.
      this.library.markLikeMutationPending(track.id);
      if (!succeeded) this.scheduleTasteSync();
    } else {
      this.library.setLiked(track, !liked, false);
      this.library.markLikeMutationSynced(track.id);
      this.set({ message: errorMessage(failure, 'The Like could not be saved, so the change was restored.') });
    }
    if (succeeded && this.library.pendingLikedTrackIds().length > 0) this.scheduleTasteSync();
  }

  isLiked(trackId: string): boolean {
    return this.state.likedTracks.some((track) => track.id === trackId);
  }

  createPlaylist(title?: string): Playlist {
    const playlist = this.library.createPlaylist(title);
    this.set({ libraryTab: 'Playlists', message: `Created ${playlist.title}.` });
    return playlist;
  }

  renamePlaylist(playlist: Playlist, title: string): void {
    if (!title.trim()) return;
    this.library.renamePlaylist(playlist.id, title);
  }

  deletePlaylist(playlist: Playlist): void {
    this.library.deletePlaylist(playlist.id);
    this.set({ message: `Deleted ${playlist.title}.` });
  }

  removeTrackFromLocalPlaylist(playlist: Playlist, position: number): void {
    this.library.removeTrackFromPlaylist(playlist.id, position);
  }

  activePlayerTrack(): Track | null {
    const state = this.state;
    return state.selectedPlaybackDeviceId ? this.selectedRemoteDevice()?.currentTrack ?? null : state.currentTrack;
  }

  addTrackToPlaylist(playlistId: string, track: Track): void {
    const playlist = this.state.playlists.find((entry) => entry.id === playlistId) ?? null;
    if (playlist?.shared) {
      void this.addTrackToSharedPlaylist(playlist, track);
      return;
    }
    const added = this.library.addTrackToPlaylist(playlistId, track);
    if (added) this.syncPlaylistAddToActiveReceiver(track, playlist);
    this.set({
      message: added
        ? `Added ${track.title} to ${playlist?.title ?? 'playlist'}.`
        : `${track.title} is already in ${playlist?.title ?? 'that playlist'}.`,
    });
  }

  private async addTrackToSharedPlaylist(playlist: Playlist, track: Track) {
    const session = this.state.accountSession;
    if (!session) {
      this.set({ message: 'Sign in before editing shared playlists.' });
      return;
    }
    if (playlist.shareRole !== 'owner' && playlist.shareRole !== 'editor') {
      this.set({ message: 'You need editor access to add tracks to this shared playlist.' });
      return;
    }
    if (playlist.tracks.some((entry) => queueKey(entry) === queueKey(track))) {
      this.set({ message: `${track.title} is already in ${playlist.title}.` });
      return;
    }
    this.set({ sharedTrackActionLoading: true, message: null });
    try {
      await this.api.addSharedPlaylistTrack(session.token, playlist.id, track);
      const refresh = await this.refreshCloudLibrary(session);
      const liveTracks =
        this.state.activeMemberPlaylist?.id === playlist.id
          ? await this.api.fetchSharedPlaylistTracks(session.token, playlist.id)
          : null;
      this.syncPlaylistAddToActiveReceiver(track, playlist);
      this.set({
        sharedPlaylistTracks: liveTracks ?? this.state.sharedPlaylistTracks,
        sharedTrackActionLoading: false,
        lastSync: refresh.summary,
        message: `Added ${track.title} to ${playlist.title}.`,
      });
    } catch (error) {
      this.set({ sharedTrackActionLoading: false, message: errorMessage(error, 'Could not add track to shared playlist.') });
    }
  }

  async sharePlaylist(playlist: Playlist): Promise<void> {
    const state = this.state;
    const session = state.accountSession;
    if (!session) {
      this.set({ message: 'Sign in before sharing playlists.' });
      return;
    }
    if (state.syncLoading || state.sharingPlaylistId) {
      this.set({ message: 'Wait for the current sync to finish before sharing.' });
      return;
    }
    this.set({ sharingPlaylistId: playlist.id, syncLoading: true, message: null });
    try {
      const refresh = await this.refreshCloudLibrary(session);
      const cloudPlaylist = findSyncedPlaylist(playlist, refresh.playlists);
      if (!cloudPlaylist) throw new Error('Sync finished, but this playlist was not returned from the cloud.');
      if (cloudPlaylist.shared && cloudPlaylist.shareRole !== 'owner') throw new Error('Only the playlist owner can create share links.');
      const invite = await this.api.createPlaylistInvite(session.token, cloudPlaylist.id);
      this.set({ syncLoading: false, sharingPlaylistId: null, lastSync: refresh.summary });
      await Share.share(
        { title: `Spice playlist: ${cloudPlaylist.title}`, message: `Join my Spice playlist "${cloudPlaylist.title}": ${invite.inviteUrl}` },
        { dialogTitle: 'Share playlist', subject: `Spice playlist: ${cloudPlaylist.title}` },
      );
      this.set({ message: `Share link ready for ${cloudPlaylist.title}.` });
    } catch (error) {
      this.set({ syncLoading: false, sharingPlaylistId: null, message: errorMessage(error, 'Could not create playlist share link.') });
    }
  }

  openPlaylistInviteFromUrl(url: string | null | undefined): void {
    if (!url) return;
    const match = /[?&]playlistInvite=([^&#]+)/.exec(url);
    const token = match ? decodeURIComponent(match[1]!).trim() : '';
    if (token) void this.openPlaylistInvite(token);
  }

  async openPlaylistInvite(token: string): Promise<void> {
    const normalized = token.trim();
    if (!normalized || this.state.inviteLoading) return;
    this.set({ inviteLoading: true, message: null });
    try {
      const preview = await this.api.previewPlaylistInvite(normalized);
      this.set({ screen: 'Library', libraryTab: 'Playlists', inviteLoading: false, pendingInvitePreview: preview });
    } catch (error) {
      this.set({ inviteLoading: false, message: errorMessage(error, 'Could not open playlist invite.') });
    }
  }

  dismissPlaylistInvite(): void {
    this.set({ pendingInvitePreview: null, inviteLoading: false });
  }

  async acceptPlaylistInvite(): Promise<void> {
    const state = this.state;
    const preview = state.pendingInvitePreview;
    if (!preview) return;
    const session = state.accountSession;
    if (!session) {
      this.set({ screen: 'Settings', message: 'Sign in before accepting playlist invites.' });
      return;
    }
    this.set({ inviteLoading: true, message: null });
    try {
      await this.api.acceptPlaylistInvite(session.token, preview.token);
      const refresh = await this.refreshCloudLibrary(session);
      this.loadPendingAccountInvites(session, true);
      this.set({
        screen: 'Library',
        libraryTab: 'Playlists',
        inviteLoading: false,
        pendingInvitePreview: null,
        lastSync: refresh.summary,
        message: `Added ${preview.playlist.title} to your shared playlists.`,
      });
    } catch (error) {
      this.set({ inviteLoading: false, message: errorMessage(error, 'Could not accept playlist invite.') });
    }
  }

  refreshPendingAccountInvites(): void {
    const session = this.state.accountSession;
    if (!session) {
      this.set({ message: 'Sign in before checking playlist invites.' });
      return;
    }
    this.loadPendingAccountInvites(session);
  }

  async acceptPendingPlaylistInvite(invite: PendingPlaylistInvite): Promise<void> {
    const session = this.state.accountSession;
    if (!session) {
      this.set({ message: 'Sign in before accepting playlist invites.' });
      return;
    }
    this.set({ accountInvitesLoading: true, message: null });
    try {
      await this.api.acceptPendingPlaylistInvite(session.token, invite.playlistId);
      const refresh = await this.refreshCloudLibrary(session);
      const pending = await this.api.fetchPendingPlaylistInvites(session.token);
      this.set({
        screen: 'Library',
        libraryTab: 'Playlists',
        accountInvitesLoading: false,
        pendingAccountInvites: pending,
        lastSync: refresh.summary,
        message: `Joined ${invite.playlistTitle}.`,
      });
    } catch (error) {
      this.set({ accountInvitesLoading: false, message: errorMessage(error, 'Could not accept playlist invite.') });
    }
  }

  async rejectPendingPlaylistInvite(invite: PendingPlaylistInvite): Promise<void> {
    const session = this.state.accountSession;
    if (!session) {
      this.set({ message: 'Sign in before rejecting playlist invites.' });
      return;
    }
    this.set({ accountInvitesLoading: true, message: null });
    try {
      await this.api.rejectPendingPlaylistInvite(session.token, invite.playlistId);
      const pending = await this.api.fetchPendingPlaylistInvites(session.token);
      this.set({ accountInvitesLoading: false, pendingAccountInvites: pending, message: `Rejected ${invite.playlistTitle}.` });
    } catch (error) {
      this.set({ accountInvitesLoading: false, message: errorMessage(error, 'Could not reject playlist invite.') });
    }
  }

  async openPlaylistMembers(playlist: Playlist): Promise<void> {
    const state = this.state;
    const session = state.accountSession;
    if (!session && playlist.shared) {
      this.set({ message: 'Sign in before managing shared playlists.' });
      return;
    }
    if (state.membersLoading || state.memberActionLoading) return;
    this.set({
      activeMemberPlaylist: playlist,
      playlistMembers: null,
      sharedPlaylistTracks: {
        playlistId: playlist.id,
        role: playlist.shareRole || (playlist.shared ? 'viewer' : 'owner'),
        tracks: playlist.tracks.map((track, index) => ({ position: index, track, addedBy: null })),
      },
      membersLoading: true,
      message: null,
    });
    if (!session) {
      this.set({ membersLoading: false });
      return;
    }
    try {
      const [members, tracks] = await Promise.all([
        this.api.fetchPlaylistMembers(session.token, playlist.id),
        this.api.fetchSharedPlaylistTracks(session.token, playlist.id),
      ]);
      if (this.state.activeMemberPlaylist?.id !== playlist.id) return;
      this.set({ playlistMembers: members, sharedPlaylistTracks: tracks, membersLoading: false });
    } catch (error) {
      // Private phone-only playlists have no cloud members yet; keep the local track list.
      this.set({ membersLoading: false, message: playlist.shared ? errorMessage(error, 'Could not load playlist members.') : null });
    }
  }

  dismissPlaylistMembers(): void {
    this.set({
      activeMemberPlaylist: null,
      playlistMembers: null,
      sharedPlaylistTracks: null,
      membersLoading: false,
      memberActionLoading: false,
      sharedTrackActionLoading: false,
    });
  }

  async invitePlaylistMember(username: string): Promise<boolean> {
    const state = this.state;
    const session = state.accountSession;
    const playlist = state.activeMemberPlaylist;
    const trimmed = username.trim();
    if (!session || !playlist) {
      this.set({ message: 'Open a signed-in playlist before inviting members.' });
      return false;
    }
    if (!trimmed) {
      this.set({ message: 'Enter a Spice username to invite.' });
      return false;
    }
    this.set({ memberActionLoading: true, message: null });
    try {
      await this.api.invitePlaylistMember(session.token, playlist.id, trimmed);
      const members = await this.api.fetchPlaylistMembers(session.token, playlist.id);
      this.set({ playlistMembers: members, memberActionLoading: false, message: `Join request sent to @${trimmed}.` });
      return true;
    } catch (error) {
      this.set({ memberActionLoading: false, message: errorMessage(error, 'Could not invite playlist member.') });
      return false;
    }
  }

  async removePlaylistMember(userId: string): Promise<void> {
    const { accountSession: session, activeMemberPlaylist: playlist } = this.state;
    if (!session || !playlist) return;
    this.set({ memberActionLoading: true, message: null });
    try {
      await this.api.removePlaylistMember(session.token, playlist.id, userId);
      const members = await this.api.fetchPlaylistMembers(session.token, playlist.id);
      this.set({ playlistMembers: members, memberActionLoading: false, message: 'Member removed.' });
    } catch (error) {
      this.set({ memberActionLoading: false, message: errorMessage(error, 'Could not remove playlist member.') });
    }
  }

  async removeSharedPlaylistTrack(item: SharedPlaylistTrack): Promise<void> {
    const { accountSession: session, activeMemberPlaylist: playlist } = this.state;
    if (!playlist) return;
    if (!playlist.shared) {
      this.removeTrackFromLocalPlaylist(playlist, item.position);
      const updated = this.state.playlists.find((entry) => entry.id === playlist.id) ?? playlist;
      this.set({
        activeMemberPlaylist: updated,
        sharedPlaylistTracks: {
          playlistId: updated.id,
          role: 'owner',
          tracks: updated.tracks.map((track, index) => ({ position: index, track, addedBy: null })),
        },
        message: `Removed ${item.track.title} from ${playlist.title}.`,
      });
      return;
    }
    if (!session) return;
    this.set({ sharedTrackActionLoading: true, message: null });
    try {
      await this.api.removeSharedPlaylistTrack(session.token, playlist.id, item.position);
      const refresh = await this.refreshCloudLibrary(session);
      const liveTracks = await this.api.fetchSharedPlaylistTracks(session.token, playlist.id);
      this.set({
        sharedPlaylistTracks: liveTracks,
        sharedTrackActionLoading: false,
        lastSync: refresh.summary,
        message: `Removed ${item.track.title} from ${playlist.title}.`,
      });
    } catch (error) {
      this.set({ sharedTrackActionLoading: false, message: errorMessage(error, 'Could not remove track from shared playlist.') });
    }
  }

  async refreshActiveSharedPlaylistTracks(): Promise<void> {
    const { accountSession: session, activeMemberPlaylist: playlist } = this.state;
    if (!session || !playlist) return;
    this.set({ sharedTrackActionLoading: true, message: null });
    try {
      const tracks = await this.api.fetchSharedPlaylistTracks(session.token, playlist.id);
      this.set({ sharedPlaylistTracks: tracks, sharedTrackActionLoading: false });
    } catch (error) {
      this.set({ sharedTrackActionLoading: false, message: errorMessage(error, 'Could not refresh shared playlist tracks.') });
    }
  }

  async leaveActiveSharedPlaylist(): Promise<void> {
    const { accountSession: session, activeMemberPlaylist: playlist } = this.state;
    if (!session || !playlist) return;
    this.set({ memberActionLoading: true, message: null });
    try {
      await this.api.removePlaylistMember(session.token, playlist.id);
      const refresh = await this.refreshCloudLibrary(session);
      this.set({
        activeMemberPlaylist: null,
        playlistMembers: null,
        sharedPlaylistTracks: null,
        memberActionLoading: false,
        lastSync: refresh.summary,
        message: `Left ${playlist.title}.`,
      });
    } catch (error) {
      this.set({ memberActionLoading: false, message: errorMessage(error, 'Could not leave shared playlist.') });
    }
  }

  // ---------------------------------------------------------------------------
  // Cloud sync
  // ---------------------------------------------------------------------------

  private async syncLibrary(session: AccountSession) {
    if (this.state.syncLoading) return;
    this.clearTimer('historySyncTimer');
    this.clearTimer('tasteSyncTimer');
    this.set({ syncLoading: true, message: null });
    try {
      const { summary } = await this.refreshCloudLibrary(session);
      this.set({
        syncLoading: false,
        lastSync: summary,
        message: `Synced ${summary.likedCount} liked tracks, ${summary.historyCount} history items, and ${summary.playlistCount} playlists.`,
      });
      await this.pullAdaptiveTaste(session);
      await this.loadHome();
    } catch (error) {
      this.set({ syncLoading: false, message: errorMessage(error, 'Cloud sync failed.') });
    }
  }

  private refreshCloudLibrary(session: AccountSession): Promise<{ summary: LibrarySyncSummary; playlists: Playlist[] }> {
    return this.cloudLibrarySyncMutex.withLock(async () => {
      const likesRevision = this.library.likesSyncRevision();
      const historyRevision = this.library.historySyncRevision();
      const result = await this.api.syncLibrary(
        session.token,
        this.library.likedSnapshot(),
        this.library.historySnapshot(),
        this.library.playlistSnapshot(),
        {
          pendingLikedTrackIds: new Set(this.library.pendingLikedTrackIds()),
          initialLikesReconciliation: this.library.needsInitialLikesReconciliation(),
          pendingHistoryTrackIds: new Set(this.library.pendingHistoryTrackIds()),
          initialHistoryReconciliation: this.library.needsInitialHistoryReconciliation(),
        },
      );
      const syncedLikes = this.library.replaceSyncedLikedTracks(result.likedTracks, likesRevision);
      const syncedHistory = this.library.replaceSyncedHistoryTracks(result.historyTracks, historyRevision);
      this.library.replacePlaylists(result.playlists);
      return {
        summary: { ...result.summary, likedCount: syncedLikes.length, historyCount: syncedHistory.length },
        playlists: result.playlists,
      };
    });
  }

  private refreshCloudTaste(session: AccountSession): Promise<LibrarySyncSummary> {
    return this.cloudLibrarySyncMutex.withLock(async () => {
      const likesRevision = this.library.likesSyncRevision();
      const historyRevision = this.library.historySyncRevision();
      const result = await this.api.syncTaste(session.token, this.library.likedSnapshot(), this.library.historySnapshot(), {
        pendingLikedTrackIds: new Set(this.library.pendingLikedTrackIds()),
        initialLikesReconciliation: this.library.needsInitialLikesReconciliation(),
        pendingHistoryTrackIds: new Set(this.library.pendingHistoryTrackIds()),
        initialHistoryReconciliation: this.library.needsInitialHistoryReconciliation(),
      });
      const syncedLikes = this.library.replaceSyncedLikedTracks(result.likedTracks, likesRevision);
      const syncedHistory = this.library.replaceSyncedHistoryTracks(result.historyTracks, historyRevision);
      return {
        likedCount: syncedLikes.length,
        historyCount: syncedHistory.length,
        playlistCount: this.library.playlistSnapshot().length,
      };
    });
  }

  private syncCloudHistory(session: AccountSession): Promise<LibrarySyncSummary> {
    return this.cloudLibrarySyncMutex.withLock(async () => {
      const historyRevision = this.library.historySyncRevision();
      const history = await this.api.syncHistory(session.token, this.library.historySnapshot(), {
        pendingHistoryTrackIds: new Set(this.library.pendingHistoryTrackIds()),
        initialHistoryReconciliation: this.library.needsInitialHistoryReconciliation(),
      });
      const syncedHistory = this.library.replaceSyncedHistoryTracks(history, historyRevision);
      return {
        likedCount: this.library.likedSnapshot().length,
        historyCount: syncedHistory.length,
        playlistCount: this.library.playlistSnapshot().length,
      };
    });
  }

  private scheduleHistorySync() {
    const session = this.state.accountSession;
    if (!session) return;
    this.clearTimer('historySyncTimer');
    this.historySyncTimer = setTimeout(() => {
      if (this.library.pendingHistoryTrackIds().length === 0) return;
      this.syncCloudHistory(session)
        .then((summary) => this.set({ lastSync: summary }))
        .catch(() => undefined);
    }, AUTO_HISTORY_SYNC_DEBOUNCE_MS);
  }

  private scheduleTasteSync() {
    const session = this.state.accountSession;
    if (!session) return;
    this.clearTimer('tasteSyncTimer');
    this.tasteSyncTimer = setTimeout(() => {
      if (this.library.pendingLikedTrackIds().length === 0) return;
      this.refreshCloudTaste(session)
        .then((summary) => {
          this.set({ lastSync: summary });
          void this.loadHome();
        })
        .catch(() => undefined);
    }, AUTO_TASTE_SYNC_DEBOUNCE_MS);
  }

  private clearTimer(name: 'historySyncTimer' | 'tasteSyncTimer' | 'adaptiveTasteTimer' | 'connectRefreshTimer') {
    const timer = this[name];
    if (timer) clearTimeout(timer);
    this[name] = null;
  }

  // ---------------------------------------------------------------------------
  // Lyrics
  // ---------------------------------------------------------------------------

  loadCurrentLyrics(): void {
    const track = this.activePlayerTrack();
    if (!track) {
      this.set({ message: 'Play a track before opening lyrics.' });
      return;
    }
    const generation = ++this.lyricsGeneration;
    this.set({ lyricsTrackId: track.id, lyricsPayload: null, lyricsLoading: true, message: null });
    this.api
      .fetchLyrics(track)
      .then((lyrics) => {
        if (generation !== this.lyricsGeneration || this.state.lyricsTrackId !== track.id) return;
        this.set({
          lyricsPayload: lyrics,
          lyricsLoading: false,
          message: !lyrics.plainLyrics.trim() && !lyrics.syncedLyrics.trim() ? `No lyrics found for ${track.title}.` : null,
        });
      })
      .catch((error: unknown) => {
        if (generation !== this.lyricsGeneration || this.state.lyricsTrackId !== track.id) return;
        this.set({ lyricsLoading: false, message: errorMessage(error, 'Could not load lyrics.') });
      });
  }

  dismissLyrics(): void {
    this.lyricsGeneration += 1;
    this.set({ lyricsTrackId: null, lyricsPayload: null, lyricsLoading: false });
  }

  // ---------------------------------------------------------------------------
  // Downloads (direct-stream copies kept in the app's private Spice folder)
  // ---------------------------------------------------------------------------

  downloadTrack(track: Track): void {
    if (this.activeDownload || this.state.downloadTrackId) {
      this.set({ message: 'A download is already running.' });
      return;
    }
    this.set({ downloadTrackId: track.id, downloadProgress: 'Preparing download...', message: null });
    this.downloadCancelled = false;
    void this.downloadOneTrack(track)
      .then((download) =>
        this.set({
          downloadTrackId: null,
          downloadProgress: null,
          libraryTab: 'Downloads',
          message: `Saved ${track.title} as ${download.fileName}.`,
        }),
      )
      .catch((error: unknown) =>
        this.set({
          downloadTrackId: null,
          downloadProgress: null,
          message: this.downloadCancelled ? 'Download cancelled.' : errorMessage(error, 'Download failed.'),
        }),
      );
  }

  async downloadPlaylist(playlist: Playlist): Promise<void> {
    if (this.activeDownload || this.state.downloadTrackId) {
      this.set({ message: 'A download is already running.' });
      return;
    }
    if (playlist.tracks.length === 0) return;
    const total = playlist.tracks.length;
    this.downloadCancelled = false;
    this.set({
      downloadPlaylistId: playlist.id,
      downloadPlaylistCompleted: 0,
      downloadPlaylistTotal: total,
      downloadProgress: 'Preparing playlist download...',
      message: null,
    });
    let completed = 0;
    let failed = 0;
    for (const track of playlist.tracks) {
      if (this.downloadCancelled) break;
      this.set({ downloadTrackId: track.id, downloadProgress: `${completed + 1}/${total}: Preparing ${track.title}` });
      try {
        await this.downloadOneTrack(track, `${completed + 1}/${total}`);
      } catch {
        if (this.downloadCancelled) break;
        failed += 1;
      }
      completed += 1;
      this.set({ downloadPlaylistCompleted: completed });
    }
    const saved = completed - failed;
    this.set({
      downloadTrackId: null,
      downloadProgress: null,
      downloadPlaylistId: null,
      downloadPlaylistCompleted: 0,
      downloadPlaylistTotal: 0,
      libraryTab: this.downloadCancelled ? this.state.libraryTab : 'Downloads',
      message: this.downloadCancelled
        ? `Playlist download cancelled after ${completed} tracks.`
        : failed === 0
          ? `Saved all ${saved} playlist tracks.`
          : `Saved ${saved} of ${total} playlist tracks.`,
    });
  }

  private async downloadOneTrack(track: Track, prefix = ''): Promise<DownloadedTrack> {
    const label = (status: string) => [prefix, status].filter(Boolean).join(': ');
    this.set({ downloadProgress: label('Resolving a direct audio stream') });
    const playback = await engine.resolvePlayable(track, this.state.quality);
    if (isSegmentedStream(playback.stream)) {
      throw new Error('This track only streams in segments here, so it cannot be saved as a single file yet.');
    }
    this.set({ downloadProgress: label('Direct stream ready; starting download') });
    const active = startTrackDownload(playback.track, playback.stream, ({ bytesWritten, totalBytes }) => {
      const percent = totalBytes > 0 ? Math.min(100, Math.floor((bytesWritten / totalBytes) * 100)) : null;
      this.set({ downloadProgress: label(percent === null ? 'Downloading audio' : `Downloading ${percent}%`) });
    });
    this.activeDownload = active;
    try {
      const result = await active.done;
      return this.library.addDownload(playback.track, result.filePath, result.fileName, result.bytes, result.mimeType);
    } finally {
      this.activeDownload = null;
    }
  }

  cancelDownload(): void {
    if (!this.activeDownload && !this.state.downloadTrackId) {
      this.set({ message: 'No active download to cancel.' });
      return;
    }
    this.downloadCancelled = true;
    this.activeDownload?.cancel();
    this.activeDownload = null;
    this.set({
      downloadTrackId: null,
      downloadProgress: null,
      downloadPlaylistId: null,
      downloadPlaylistCompleted: 0,
      downloadPlaylistTotal: 0,
      message: 'Download cancelled.',
    });
  }

  async openDownload(download: DownloadedTrack): Promise<void> {
    try {
      await openDownloadFile(download);
    } catch (error) {
      this.set({ message: errorMessage(error, 'No app can open this download.') });
    }
  }

  async shareDownload(download: DownloadedTrack): Promise<void> {
    try {
      await shareDownloadFile(download);
    } catch (error) {
      this.set({ message: errorMessage(error, 'No app can share this download.') });
    }
  }

  removeDownload(download: DownloadedTrack): void {
    deleteDownloadFile(download);
    this.library.removeDownload(download.id);
    this.set({ message: `Removed ${download.fileName}.` });
  }

  approvePendingRemoteDownload(): void {
    const track = this.state.pendingRemoteDownloadTrack;
    if (!track) return;
    this.set({ pendingRemoteDownloadTrack: null });
    this.downloadTrack(track);
  }

  dismissPendingRemoteDownload(): void {
    this.set({ pendingRemoteDownloadTrack: null });
  }

  // ---------------------------------------------------------------------------
  // Spice Connect: access, pairing, selection
  // ---------------------------------------------------------------------------

  private loadRemoteDeviceId(): string {
    const existing = prefs.getString(PREF.remoteDeviceId, '');
    if (existing) return existing;
    const id = `spice-android-${Crypto.randomUUID()}`;
    prefs.set(PREF.remoteDeviceId, id);
    return id;
  }

  private activeRemoteTargetId(): string | null {
    return this.state.selectedPlaybackDeviceId || null;
  }

  private selectedRemoteDevice(): RemoteDevice | null {
    const state = this.state;
    return state.remoteDevices.find((device) => device.deviceId === state.selectedPlaybackDeviceId) ?? null;
  }

  private hasRemoteAccess(): boolean {
    return hasConnectAccess(this.state.accountSession !== null, this.activePairedCredential() !== null);
  }

  private shouldStartSpiceConnect(): boolean {
    const state = this.state;
    return shouldStartConnect(state.spiceConnectEnabled, state.accountSession !== null, state.pairedDeviceCredential !== null);
  }

  private activePairedCredential() {
    const credential = this.state.pairedDeviceCredential;
    if (!credential) return null;
    if (credential.deviceId !== this.remoteDeviceId || isPairedCredentialExpired(credential)) {
      this.clearPairedCredential('Paired-device access expired. Enter a new pairing code.');
      return null;
    }
    return credential;
  }

  private clearPairedCredential(message: string) {
    pairedCredentialStore.clear();
    this.clearPendingHandoff();
    this.preparedHandoffs.clear();
    this.clearOptimisticRemoteState();
    const state = this.state;
    const accountFallback = state.accountSession !== null;
    if (!accountFallback) {
      this.stopSpiceConnectLoops();
      prefs.remove(PREF.selectedPlaybackDeviceId);
    }
    this.set({
      pairedDeviceCredential: null,
      pairingLoading: false,
      remoteDevices: accountFallback ? state.remoteDevices : [],
      selectedPlaybackDeviceId: accountFallback ? state.selectedPlaybackDeviceId : '',
      connectLoading: false,
      connectStatus: accountFallback ? 'Using the signed-in Spice account for Connect.' : '',
      message,
    });
  }

  private async withRemoteAccess<T>(block: (token: string) => Promise<T>): Promise<T> {
    const paired = this.activePairedCredential();
    const accountToken = this.state.accountSession?.token;
    if (paired) {
      try {
        return await block(paired.accessToken);
      } catch (error) {
        if (!(error instanceof SpiceApiError) || error.statusCode !== 401) throw error;
        this.clearPairedCredential('Paired-device access was revoked or expired.');
        if (accountToken) return block(accountToken);
        throw new SpiceApiError('Pairing expired or was revoked. Enter a new pairing code.', { statusCode: 401, cause: error });
      }
    }
    if (accountToken) return block(accountToken);
    throw new SpiceApiError('Sign in or pair this phone to use Spice Connect.', { statusCode: 401 });
  }

  async claimPairingCode(code: string): Promise<boolean> {
    const submitted = pairingCodeForSubmission(code);
    if (!submitted) {
      this.set({ message: 'Enter the eight-character pairing code.' });
      return false;
    }
    this.set({ pairingLoading: true, message: null });
    try {
      const credential = await this.api.claimPairingCode(submitted, this.remoteDeviceId, DISPLAY_NAME);
      pairedCredentialStore.save(credential);
      prefs.set(PREF.spiceConnectEnabled, true);
      this.set({
        pairedDeviceCredential: credential,
        spiceConnectEnabled: true,
        pairingLoading: false,
        connectStatus: 'This phone is securely paired for Spice Connect.',
        message: 'Pairing complete. Spice Connect is ready.',
      });
      this.startSpiceConnect();
      return true;
    } catch (error) {
      this.set({ pairingLoading: false, message: errorMessage(error, 'Could not claim the pairing code.') });
      return false;
    }
  }

  normalizePairingCode(value: string): string {
    return normalizePairingCodeInput(value);
  }

  disconnectPairedDevice(): void {
    this.clearPairedCredential('Paired-device access was removed from this phone.');
  }

  setSpiceConnectEnabled(enabled: boolean): void {
    prefs.set(PREF.spiceConnectEnabled, enabled);
    this.set({
      spiceConnectEnabled: enabled,
      connectStatus: enabled ? 'Spice Connect enabled on this phone.' : 'Spice Connect disabled on this phone.',
    });
    if (enabled) {
      if (this.hasRemoteAccess()) this.startSpiceConnect();
      return;
    }
    this.stopSpiceConnectLoops();
    this.clearPendingHandoff();
    this.preparedHandoffs.clear();
    this.clearOptimisticRemoteState();
    prefs.remove(PREF.selectedPlaybackDeviceId);
    this.set({
      remoteDevices: [],
      selectedPlaybackDeviceId: '',
      lanConnectedDeviceIds: [],
      incomingRemoteControllerDeviceId: '',
      connectLoading: false,
    });
  }

  selectPlaybackDevice(deviceId: string | null): void {
    const normalized = deviceId && deviceId.trim() !== this.remoteDeviceId ? deviceId.trim() : '';
    const previous = this.state.selectedPlaybackDeviceId;
    if (normalized && !this.hasRemoteAccess()) {
      this.set({ message: 'Sign in or pair this phone to use Spice Connect.' });
      return;
    }
    if (!normalized) {
      this.clearOptimisticRemoteState();
      prefs.remove(PREF.selectedPlaybackDeviceId);
      this.set({ selectedPlaybackDeviceId: '', connectStatus: 'Player controls now target this phone.' });
      if (previous) this.sendRemoteCommand(previous, 'connect', { connected: false });
      return;
    }
    const target = this.state.remoteDevices.find((device) => device.deviceId === normalized);
    if (!target) {
      this.set({ message: 'That Spice Connect device is no longer available.' });
      this.refreshSpiceConnect();
      return;
    }
    this.clearOptimisticRemoteState();
    prefs.set(PREF.selectedPlaybackDeviceId, normalized);
    this.set({ selectedPlaybackDeviceId: normalized, connectStatus: `Player controls now target ${target.displayName}.` });
    if (previous && previous !== normalized) this.sendRemoteCommand(previous, 'connect', { connected: false });
    if (previous !== normalized) this.sendRemoteCommand(normalized, 'connect', { connected: true });
    if (target.isOnline && this.state.currentTrack) this.handoffPlaybackToSelectedDevice();
  }

  forgetSpiceConnectDevice(deviceId: string): void {
    if (!deviceId || deviceId === this.remoteDeviceId) return;
    const before = this.state;
    const removed = before.remoteDevices.find((device) => device.deviceId === deviceId);
    if (!removed) return;
    const wasSelected = before.selectedPlaybackDeviceId === deviceId;
    this.optimisticallyForgottenRemoteDeviceIds.add(deviceId);
    if (wasSelected) {
      this.clearOptimisticRemoteState(deviceId);
      prefs.remove(PREF.selectedPlaybackDeviceId);
    }
    this.set({
      remoteDevices: before.remoteDevices.filter((device) => device.deviceId !== deviceId),
      selectedPlaybackDeviceId: wasSelected ? '' : before.selectedPlaybackDeviceId,
      connectStatus: `Removing ${removed.displayName} everywhere and revoking its access...`,
    });
    this.withRemoteAccess((token) => this.api.forgetRemoteDevice(token, this.remoteDeviceId, deviceId))
      .then(() => {
        this.set({
          remoteDevices: this.state.remoteDevices.filter((device) => device.deviceId !== deviceId),
          connectStatus: 'Removed the device everywhere and revoked its Spice Connect access.',
        });
        this.refreshSpiceConnect();
      })
      .catch((error: unknown) => {
        this.optimisticallyForgottenRemoteDeviceIds.delete(deviceId);
        const current = this.state;
        const restored = current.remoteDevices.some((device) => device.deviceId === deviceId)
          ? current.remoteDevices
          : [...current.remoteDevices, removed].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (wasSelected) prefs.set(PREF.selectedPlaybackDeviceId, deviceId);
        this.set({
          remoteDevices: restored,
          selectedPlaybackDeviceId: wasSelected ? deviceId : current.selectedPlaybackDeviceId,
          connectStatus: 'The device could not be removed, so it was restored.',
          message: errorMessage(error, 'Could not forget that device.'),
        });
      });
  }

  refreshSpiceConnect(): void {
    if (!this.hasRemoteAccess()) {
      this.set({ message: 'Sign in or pair this phone to use Spice Connect.' });
      return;
    }
    this.set({ connectLoading: true, connectStatus: '' });
    this.withRemoteAccess(async (token) => {
      await this.publishDevice(token);
      return this.api.fetchRemoteDevices(token);
    })
      .then((devices) =>
        this.applyRemoteDeviceSnapshot(
          devices,
          false,
          `${devices.filter((device) => device.deviceId !== this.remoteDeviceId).length} other device(s) visible.`,
        ),
      )
      .catch((error: unknown) =>
        this.set({
          connectLoading: false,
          connectStatus: errorMessage(error, 'Could not refresh Spice Connect.'),
          message: errorMessage(error, 'Could not refresh Spice Connect.'),
        }),
      );
  }

  downloadTrackOnSelectedReceiver(track: Track): void {
    const deviceId = this.activeRemoteTargetId();
    if (!deviceId) {
      this.set({ message: 'Choose a Spice Connect receiver first.' });
      return;
    }
    const receiverName = this.selectedRemoteDevice()?.displayName ?? 'the selected receiver';
    this.sendRemoteCommand(deviceId, 'download', { track: trackToRemoteJson(track) }, {
      onSuccess: () => this.set({ message: `Asked ${receiverName} to download ${track.title}.` }),
    });
  }

  // --- Commands --------------------------------------------------------------

  private sendRemoteCommand(
    deviceId: string,
    command: string,
    payload: Record<string, unknown> = {},
    options: { onSuccess?: () => void; onFailure?: (error: unknown) => void; quiet?: boolean } = {},
  ): void {
    if (!this.hasRemoteAccess()) {
      options.onFailure?.(new Error('Sign in or pair this phone to use Spice Connect.'));
      this.set({ message: 'Sign in or pair this phone to use Spice Connect.' });
      return;
    }
    if (deviceId === this.remoteDeviceId) {
      options.onFailure?.(new Error('Choose another Spice Connect device.'));
      this.set({ connectStatus: 'Choose another Spice Connect device.' });
      return;
    }
    const target = this.state.remoteDevices.find((device) => device.deviceId === deviceId);
    if (target && !target.isOnline) {
      options.onFailure?.(new Error(`${target.displayName} is offline.`));
      this.set({ message: `${target.displayName} is offline.` });
      return;
    }
    this.withRemoteAccess((token) => this.api.sendRemoteCommand(token, deviceId, this.remoteDeviceId, command, payload))
      .then(() => {
        options.onSuccess?.();
        if (!options.quiet && command !== 'handoff') {
          this.set({ connectStatus: `Sent ${command} through Spice Connect cloud fallback.` });
        }
        this.scheduleRemoteDeviceRefresh();
      })
      .catch((error: unknown) => {
        options.onFailure?.(error);
        this.clearOptimisticRemoteState(deviceId);
        if (!options.quiet) {
          this.set({
            connectStatus: errorMessage(error, 'Spice Connect command failed.'),
            message: errorMessage(error, 'Spice Connect command failed.'),
          });
        }
        this.refreshSpiceConnect();
      });
  }

  private scheduleRemoteDeviceRefresh() {
    this.clearTimer('connectRefreshTimer');
    this.connectRefreshTimer = setTimeout(() => {
      this.withRemoteAccess((token) => this.api.fetchRemoteDevices(token))
        .then((devices) => this.applyRemoteDeviceSnapshot(devices))
        .catch(() => undefined);
    }, COMMAND_STATE_SETTLE_MS);
  }

  private playOnRemoteDevice(targetDeviceId: string, track: Track, queue: Track[]) {
    const target = this.state.remoteDevices.find((device) => device.deviceId === targetDeviceId);
    if (!target || !target.isOnline) {
      this.unavailableRemoteTarget();
      return;
    }
    const normalizedQueue = normalizeQueue(queue, track);
    const queueIndex = Math.max(
      normalizedQueue.findIndex((entry) => queueKey(entry) === queueKey(track)),
      0,
    );
    this.patchRemoteDevice(targetDeviceId, (current) => ({
      ...current,
      currentTrack: track,
      queue: normalizedQueue,
      queueIndex,
      isPlaying: true,
      progressMs: 0,
      durationMs: track.durationMs,
    }));
    this.sendRemoteCommand(targetDeviceId, 'play_track', {
      track: trackToRemoteJson(track),
      queue: normalizedQueue.map(trackToRemoteJson),
      queueIndex,
    });
    this.set({ connectStatus: `Sent ${track.title} to ${target.displayName}.` });
  }

  private playQueueIndexOnRemoteDevice(targetDeviceId: string, track: Track, queueIndex: number) {
    const target = this.state.remoteDevices.find((device) => device.deviceId === targetDeviceId);
    if (!target || !target.isOnline || queueIndex < 0 || queueIndex >= target.queue.length) {
      this.unavailableRemoteTarget();
      return;
    }
    this.patchRemoteDevice(targetDeviceId, (current) => ({
      ...current,
      currentTrack: track,
      queueIndex,
      isPlaying: true,
      progressMs: 0,
      durationMs: track.durationMs,
    }));
    this.sendRemoteCommand(targetDeviceId, 'play_queue_index', { queueIndex });
    this.set({ connectStatus: `Selected ${track.title} on ${target.displayName}.` });
  }

  private patchRemoteDevice(deviceId: string, transform: (device: RemoteDevice) => RemoteDevice) {
    const now = Date.now();
    this.optimisticRemoteDeviceId = deviceId;
    this.optimisticRemoteStateUntilMs = now + OPTIMISTIC_STATE_WINDOW_MS;
    this.set({
      remoteDevices: this.state.remoteDevices.map((device) => {
        if (device.deviceId !== deviceId) return device;
        const updated = { ...transform(device), observedAtMs: now };
        this.optimisticRemoteTrackChanged =
          (device.currentTrack ? queueKey(device.currentTrack) : '') !== (updated.currentTrack ? queueKey(updated.currentTrack) : '');
        return updated;
      }),
    });
  }

  private clearOptimisticRemoteState(deviceId?: string) {
    if (deviceId !== undefined && this.optimisticRemoteDeviceId !== deviceId) return;
    this.optimisticRemoteDeviceId = null;
    this.optimisticRemoteStateUntilMs = 0;
    this.optimisticRemoteTrackChanged = false;
  }

  private unavailableRemoteTarget() {
    this.set({ message: 'The selected Spice Connect device is unavailable. Refreshing devices.' });
    this.refreshSpiceConnect();
  }

  private syncLikeToActiveReceiver(track: Track, liked: boolean) {
    const deviceId = this.activeRemoteTargetId();
    if (!deviceId) return;
    this.sendRemoteCommand(deviceId, 'set_like', { track: trackToRemoteJson(track), liked }, { quiet: true });
  }

  private syncPlaylistAddToActiveReceiver(track: Track, playlist: Playlist | null) {
    const deviceId = this.activeRemoteTargetId();
    if (!deviceId || !playlist?.id) return;
    this.sendRemoteCommand(
      deviceId,
      'add_to_playlist',
      { track: trackToRemoteJson(track), playlistId: playlist.id, playlistTitle: playlist.title },
      { quiet: true },
    );
  }

  // --- Handoff ---------------------------------------------------------------

  handoffPlaybackToSelectedDevice(): void {
    const state = this.state;
    const target = this.selectedRemoteDevice();
    const track = state.currentTrack;
    if (!target || !target.isOnline || !track) {
      this.set({ message: 'Play something on this phone, then choose another online device.' });
      return;
    }
    const existing = this.pendingHandoff;
    if (existing) {
      if (existing.phase === 'WaitingForComplete') {
        this.set({ message: `${existing.targetName} already accepted a transfer. Wait for its playback confirmation.` });
        return;
      }
      this.clearPendingHandoff();
      this.sendRemoteCommand(existing.targetDeviceId, 'handoff_cancel', { transferId: existing.transferId, reason: 'superseded' }, { quiet: true });
    }
    const transferId = normalizeTransferId(`${this.remoteDeviceId}:${target.deviceId}:${Date.now().toString(36)}:${Crypto.randomUUID()}`);
    const pending = beginHandoff(transferId, target.deviceId, target.displayName, this.player.isPlaying || this.player.isBuffering);
    this.pendingHandoff = pending;
    this.handoffAcceptTimer = setTimeout(() => {
      if (this.pendingHandoff !== pending) return;
      this.clearPendingHandoff();
      this.sendRemoteCommand(target.deviceId, 'handoff_cancel', { transferId, reason: 'ready_timeout' }, { quiet: true });
      this.set({
        connectStatus: `${target.displayName} did not accept the transfer in time. Playback stayed on this phone.`,
        message: `${target.displayName} did not accept the transfer. Playback stayed here.`,
      });
    }, HANDOFF_ACCEPT_TIMEOUT_MS);
    this.set({ connectStatus: `Waiting for ${target.displayName} to accept the playback transfer...` });
    this.sendRemoteCommand(target.deviceId, 'handoff_prepare', { transferId }, {
      quiet: true,
      onFailure: () => {
        if (this.pendingHandoff !== pending) return;
        this.clearPendingHandoff();
        this.set({ connectStatus: `Could not ask ${target.displayName} to accept playback. Playback stayed here.` });
      },
    });
  }

  private clearPendingHandoff() {
    if (this.handoffAcceptTimer) clearTimeout(this.handoffAcceptTimer);
    if (this.handoffCompleteTimer) clearTimeout(this.handoffCompleteTimer);
    this.handoffAcceptTimer = null;
    this.handoffCompleteTimer = null;
    this.pendingHandoff = null;
  }

  private async applyIncomingHandoff(command: RemoteCommand): Promise<boolean> {
    const track = command.payloadTrack;
    if (!track) return false;
    const queue = normalizeQueue(command.payloadQueue, track);
    const requested = command.payloadQueueIndex >= 0 && command.payloadQueueIndex < queue.length ? command.payloadQueueIndex : null;
    const trackIndex = queue.findIndex((entry) => queueKey(entry) === queueKey(track));
    this.selectPlaybackDevice(null);
    if (command.volume !== null) engine.setVolume(command.volume);
    if (command.shuffleEnabled !== null) engine.setShuffle(command.shuffleEnabled);
    if (command.repeatMode !== null) engine.setRepeatMode(command.repeatMode);
    await this.playQueueIndex(queue, requested ?? (trackIndex >= 0 ? trackIndex : 0));
    if (command.seekPositionMs !== null) engine.seekTo(command.seekPositionMs);
    if (command.shouldPlay === false) engine.pause();
    return true;
  }

  // --- Receiver loop -----------------------------------------------------------

  private stopSpiceConnectLoops() {
    this.connectAbort?.abort();
    this.connectAbort = null;
    this.connectRealtimeAvailable = false;
    this.clearTimer('connectRefreshTimer');
    if (this.state.lanConnectedDeviceIds.length > 0) this.set({ lanConnectedDeviceIds: [] });
  }

  private startSpiceConnect() {
    this.stopSpiceConnectLoops();
    this.clearPendingHandoff();
    this.preparedHandoffs.clear();
    this.pendingWakeup = null;
    const abort = new AbortController();
    this.connectAbort = abort;
    void this.runConnectPollLoop(abort.signal);
    void this.runConnectRealtimeLoop(abort.signal);
  }

  private wake(event: RealtimeEvent) {
    this.pendingWakeup = event;
    this.connectWakeup?.();
  }

  private waitForWakeup(ms: number, signal: AbortSignal): Promise<void> {
    if (this.pendingWakeup) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        if (this.connectWakeup === done) this.connectWakeup = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener('abort', done);
      this.connectWakeup = done;
    });
  }

  private async runConnectPollLoop(signal: AbortSignal) {
    let nextDeviceSnapshotAt = 0;
    let nextHeartbeatAt = 0;
    let lastPublishedFingerprint: string | null = null;
    let publishedAccessIdentity: string | null = null;
    while (!signal.aborted) {
      if (!this.hasRemoteAccess()) return;
      const receivedStateUpdate = this.pendingWakeup === 'State';
      this.pendingWakeup = null;
      try {
        await this.withRemoteAccess(async (token) => {
          const identity = this.accessIdentity(token);
          if (requiresDeviceRegistration(publishedAccessIdentity, identity)) {
            await this.publishDevice(token);
            publishedAccessIdentity = identity;
            nextDeviceSnapshotAt = 0;
            lastPublishedFingerprint = this.deviceFingerprint();
            nextHeartbeatAt = Date.now() + DEVICE_SYNC_INTERVAL_MS;
          }
          let commands: RemoteCommand[];
          try {
            commands = await this.api.fetchRemoteCommands(token, this.remoteDeviceId);
          } catch (error) {
            if (!(error instanceof SpiceApiError) || !shouldResetDeviceRegistration(error.statusCode)) throw error;
            publishedAccessIdentity = null;
            await this.publishDevice(token);
            publishedAccessIdentity = identity;
            lastPublishedFingerprint = this.deviceFingerprint();
            nextHeartbeatAt = Date.now() + DEVICE_SYNC_INTERVAL_MS;
            try {
              commands = await this.api.fetchRemoteCommands(token, this.remoteDeviceId);
            } catch (retryError) {
              if (retryError instanceof SpiceApiError && shouldResetDeviceRegistration(retryError.statusCode)) {
                publishedAccessIdentity = null;
              }
              throw retryError;
            }
          }
          if (signal.aborted) return;
          await this.applyRemoteCommands(commands);
          // Player callbacks settle asynchronously after a remote command.
          if (commands.length > 0) await delay(COMMAND_STATE_SETTLE_MS);
          const now = Date.now();
          const fingerprint = this.deviceFingerprint();
          if (commands.length > 0 || fingerprint !== lastPublishedFingerprint || now >= nextHeartbeatAt) {
            await this.publishDevice(token);
            lastPublishedFingerprint = this.deviceFingerprint();
            nextHeartbeatAt = now + DEVICE_SYNC_INTERVAL_MS;
          }
          const isControlling = this.activeRemoteTargetId() !== null;
          if (
            shouldSyncDevices({
              nowMs: now,
              nextDeviceSyncAtMs: nextDeviceSnapshotAt,
              receivedCommands: commands.length > 0,
              receivedStateUpdate,
              isControllingRemoteDevice: isControlling,
            })
          ) {
            this.applyRemoteDeviceSnapshot(await this.api.fetchRemoteDevices(token));
            nextDeviceSnapshotAt = nextDeviceSyncAt(now, commands.length > 0, isControlling);
          }
        });
      } catch (error) {
        if (!signal.aborted) this.set({ connectStatus: errorMessage(error, this.state.connectStatus) });
      }
      await this.waitForWakeup(
        this.connectRealtimeAvailable ? REALTIME_FALLBACK_POLL_INTERVAL_MS : COMMAND_POLL_INTERVAL_MS,
        signal,
      );
    }
  }

  private async runConnectRealtimeLoop(signal: AbortSignal) {
    let reconnectDelay = REALTIME_RECONNECT_MIN_MS;
    while (!signal.aborted && this.hasRemoteAccess()) {
      try {
        const event = await this.withRemoteAccess((token) =>
          awaitRemoteEvent(
            this.api.remoteEventsUrl(this.remoteDeviceId),
            token,
            USER_AGENT,
            () => {
              this.connectRealtimeAvailable = true;
              // Poll once after LISTEN is established so a command queued during
              // connection setup cannot wait for the fallback tick.
              this.wake('Command');
            },
            signal,
          ),
        );
        reconnectDelay = REALTIME_RECONNECT_MIN_MS;
        if (event === 'Command' || event === 'State') {
          this.wake(event);
          continue;
        }
        this.connectRealtimeAvailable = false;
        await wait(REALTIME_RECONNECT_MIN_MS, signal);
      } catch {
        this.connectRealtimeAvailable = false;
        // The durable command poll stays active while the stream reconnects.
        await wait(reconnectDelay, signal);
        reconnectDelay = Math.min(reconnectDelay * 2, REALTIME_RECONNECT_MAX_MS);
      }
    }
    this.connectRealtimeAvailable = false;
  }

  private accessIdentity(token: string): string {
    const state = this.state;
    if (state.pairedDeviceCredential?.accessToken === token) {
      return `pair:${state.pairedDeviceCredential.ownerUserId}:${state.pairedDeviceCredential.authorizationId}`;
    }
    if (state.accountSession?.token === token) return `account:${state.accountSession.account.id}`;
    return `unknown:${token.length}:${token.slice(-6)}`;
  }

  private playbackSnapshot() {
    const track = this.state.currentTrack;
    const player = this.player;
    const matches = track !== null && player.mediaId === track.id;
    return {
      track,
      player,
      isPlaying: matches && player.isPlaying,
      progressMs: matches ? player.positionMs : 0,
      durationMs: matches && player.durationMs > 0 ? player.durationMs : track?.durationMs ?? 0,
    };
  }

  private deviceFingerprint(): string {
    const state = this.state;
    const playback = this.playbackSnapshot();
    return [
      state.currentTrack?.id ?? '',
      state.playbackQueue.map((track) => track.id).join(','),
      state.queueIndex,
      playback.isPlaying,
      playback.player.shuffleEnabled,
      playback.player.repeatMode,
      playback.player.volume,
      Math.floor(playback.progressMs / PROGRESS_REPORT_BUCKET_MS),
      playback.durationMs,
    ].join('|');
  }

  private async publishDevice(token: string) {
    const playback = this.playbackSnapshot();
    await this.api.updateRemoteDevice(token, {
      deviceId: this.remoteDeviceId,
      displayName: DISPLAY_NAME,
      currentTrack: playback.track,
      isPlaying: playback.isPlaying,
      shuffleEnabled: playback.player.shuffleEnabled,
      repeatMode: playback.player.repeatMode,
      progressMs: playback.progressMs,
      durationMs: playback.durationMs,
      volume: playback.player.volume,
      queue: this.state.playbackQueue,
      queueIndex: Math.max(this.state.queueIndex, 0),
    });
  }

  private applyRemoteDeviceSnapshot(
    devices: RemoteDevice[],
    loading: boolean = this.state.connectLoading,
    status: string = this.state.connectStatus,
  ) {
    const state = this.state;
    const now = Date.now();
    const observedIds = new Set(devices.map((device) => device.deviceId));
    for (const id of [...this.optimisticallyForgottenRemoteDeviceIds]) {
      if (!observedIds.has(id)) this.optimisticallyForgottenRemoteDeviceIds.delete(id);
    }
    const observed = devices
      .filter((device) => !this.optimisticallyForgottenRemoteDeviceIds.has(device.deviceId))
      .map((device) => ({ ...device, observedAtMs: now }));
    if (this.optimisticRemoteStateUntilMs <= now) this.clearOptimisticRemoteState();
    const optimistic = this.optimisticRemoteDeviceId
      ? state.remoteDevices.find((device) => device.deviceId === this.optimisticRemoteDeviceId) ?? null
      : null;
    const reconciled = optimistic
      ? observed.map((device) => {
          if (device.deviceId !== optimistic.deviceId) return device;
          if (this.acknowledgesOptimisticState(device, optimistic)) {
            this.clearOptimisticRemoteState(device.deviceId);
            return device;
          }
          if (
            this.optimisticRemoteTrackChanged &&
            (device.currentTrack ? queueKey(device.currentTrack) : '') === (optimistic.currentTrack ? queueKey(optimistic.currentTrack) : '')
          ) {
            this.optimisticRemoteTrackChanged = false;
            return {
              ...optimistic,
              currentTrack: device.currentTrack ?? optimistic.currentTrack,
              queue: device.queue.length > 0 ? device.queue : optimistic.queue,
              queueIndex: device.queueIndex,
              durationMs: device.durationMs > 0 ? device.durationMs : optimistic.durationMs,
              updatedAt: device.updatedAt,
            };
          }
          return { ...optimistic, updatedAt: device.updatedAt };
        })
      : observed;
    const selectedId = state.selectedPlaybackDeviceId;
    const selectedStillExists = !selectedId || reconciled.some((device) => device.deviceId === selectedId);
    if (!selectedStillExists) {
      this.clearOptimisticRemoteState(selectedId);
      prefs.remove(PREF.selectedPlaybackDeviceId);
    }
    this.set({
      remoteDevices: reconciled,
      selectedPlaybackDeviceId: selectedStillExists ? selectedId : '',
      connectLoading: loading,
      connectStatus: selectedStillExists ? status : 'Selected device went offline; using this phone.',
      message: selectedStillExists ? state.message : 'Selected Spice Connect device went offline. Playback controls are local again.',
    });
  }

  private acknowledgesOptimisticState(observed: RemoteDevice, optimistic: RemoteDevice): boolean {
    return (
      (observed.currentTrack ? queueKey(observed.currentTrack) : '') === (optimistic.currentTrack ? queueKey(optimistic.currentTrack) : '') &&
      observed.isPlaying === optimistic.isPlaying &&
      observed.shuffleEnabled === optimistic.shuffleEnabled &&
      observed.repeatMode === optimistic.repeatMode &&
      observed.volume === optimistic.volume &&
      (observed.queue.length === 0 || observed.queueIndex === optimistic.queueIndex) &&
      Math.abs(observed.progressMs - optimistic.progressMs) <= PROGRESS_REPORT_BUCKET_MS * 2
    );
  }

  private async applyRemoteCommands(commands: RemoteCommand[]) {
    for (const command of commands) {
      if (this.appliedRemoteCommandIds.contains(command.id)) continue;
      if (command.command === 'connect' && command.connected === false) {
        if (this.state.incomingRemoteControllerDeviceId === command.sourceDeviceId) {
          this.set({ incomingRemoteControllerDeviceId: '' });
        }
      } else if (
        command.sourceDeviceId &&
        !['handoff_ready', 'handoff_complete', 'handoff_cancel', LAN_SIGNAL_COMMAND].includes(command.command)
      ) {
        this.set({ incomingRemoteControllerDeviceId: command.sourceDeviceId });
      }
      await this.applyRemoteCommand(command);
      this.appliedRemoteCommandIds.markIfNew(command.id);
      prefs.setStringList(PREF.appliedRemoteCommandIds, this.appliedRemoteCommandIds.snapshot());
    }
  }

  private async applyRemoteCommand(command: RemoteCommand) {
    switch (command.command) {
      case 'toggle':
        engine.toggle();
        return;
      case 'pause':
        engine.pause();
        return;
      case 'play':
        if (!this.player.isPlaying && this.state.currentTrack) engine.toggle();
        return;
      case 'next':
        this.playNextLocally();
        return;
      case 'previous':
        this.playPreviousLocally();
        return;
      case 'seek':
        if (command.seekPositionMs !== null) engine.seekTo(command.seekPositionMs);
        return;
      case 'volume':
        if (command.volume !== null) engine.setVolume(command.volume);
        return;
      case 'shuffle':
        if (command.shuffleEnabled !== null) engine.setShuffle(command.shuffleEnabled);
        return;
      case 'repeat':
        if (command.repeatMode !== null) engine.setRepeatMode(command.repeatMode);
        return;
      case 'play_track': {
        const track = command.payloadTrack;
        if (!track) return;
        const queue = normalizeQueue(command.payloadQueue, track);
        const requested = command.payloadQueueIndex >= 0 && command.payloadQueueIndex < queue.length ? command.payloadQueueIndex : null;
        const trackIndex = queue.findIndex((entry) => queueKey(entry) === queueKey(track));
        void this.playQueueIndex(queue, requested ?? (trackIndex >= 0 ? trackIndex : 0));
        return;
      }
      case 'play_queue_index': {
        const queue = this.state.playbackQueue;
        if (command.payloadQueueIndex >= 0 && command.payloadQueueIndex < queue.length) {
          void this.playQueueIndex(queue, command.payloadQueueIndex);
        }
        return;
      }
      case 'set_like':
        void this.remoteLibraryMutationMutex.withLock(() => this.applyIncomingLike(command));
        return;
      case 'add_to_playlist':
        void this.remoteLibraryMutationMutex.withLock(() => this.applyIncomingPlaylistAdd(command));
        return;
      case 'download':
        if (command.payloadTrack) {
          this.set({
            pendingRemoteDownloadTrack: command.payloadTrack,
            message: `Spice Connect requested a download for ${command.payloadTrack.title}.`,
          });
        }
        return;
      case 'handoff_prepare': {
        const transferId = normalizeTransferId(command.transferId);
        if (!transferId) return;
        const now = Date.now();
        for (const [key, prepared] of this.preparedHandoffs) {
          if (prepared.expiresAtMs <= now) this.preparedHandoffs.delete(key);
        }
        this.preparedHandoffs.set(transferId, {
          transferId,
          sourceDeviceId: command.sourceDeviceId,
          expiresAtMs: now + HANDOFF_ACCEPT_TIMEOUT_MS,
        });
        this.set({ connectStatus: 'Another device is preparing to move playback here.' });
        this.sendRemoteCommand(command.sourceDeviceId, 'handoff_ready', { transferId }, { quiet: true });
        return;
      }
      case 'handoff_ready':
        this.handleHandoffReady(command);
        return;
      case 'handoff_commit': {
        const transferId = normalizeTransferId(command.transferId);
        if (!transferId) return;
        const prepared = this.preparedHandoffs.get(transferId);
        if (acceptsPreparedCommit(prepared, transferId, command.sourceDeviceId, Date.now())) {
          this.preparedHandoffs.delete(transferId);
          let applied = false;
          try {
            applied = await this.applyIncomingHandoff(command);
          } catch {
            applied = false;
          }
          if (applied) {
            this.sendRemoteCommand(command.sourceDeviceId, 'handoff_complete', { transferId }, { quiet: true });
            this.set({ connectStatus: 'Playback was accepted from another device.' });
          } else {
            this.sendRemoteCommand(
              command.sourceDeviceId,
              'handoff_cancel',
              { transferId, reason: 'destination_playback_failed' },
              { quiet: true },
            );
          }
        } else {
          this.sendRemoteCommand(command.sourceDeviceId, 'handoff_cancel', { transferId, reason: 'transfer_not_prepared' }, { quiet: true });
        }
        return;
      }
      case 'handoff_complete': {
        const transferId = normalizeTransferId(command.transferId);
        const pending = this.pendingHandoff;
        if (completesHandoff(pending, transferId, command.sourceDeviceId)) {
          const targetName = pending?.targetName ?? 'the other device';
          this.clearPendingHandoff();
          this.set({
            connectStatus: `Playback moved to ${targetName} and was confirmed there.`,
            message: `Playback moved to ${targetName}.`,
          });
        }
        return;
      }
      case 'handoff_cancel': {
        const transferId = normalizeTransferId(command.transferId);
        this.preparedHandoffs.delete(transferId);
        const pending = this.pendingHandoff;
        if (pending && pending.transferId === transferId && pending.targetDeviceId === command.sourceDeviceId) {
          const resume = shouldResumeSource(pending, true);
          this.clearPendingHandoff();
          if (resume && !this.player.isPlaying) engine.toggle();
          this.set({ connectStatus: `${pending.targetName} could not accept the transfer. Playback is available on this phone.` });
        }
        return;
      }
      case 'handoff':
        await this.applyIncomingHandoff(command);
        return;
      default:
        // 'connect' and LAN signaling need no local action in this build.
        return;
    }
  }

  private handleHandoffReady(command: RemoteCommand) {
    const player = this.player;
    const sourceWasPlaying = player.isPlaying || player.isBuffering;
    const accepted = acceptHandoffReady(this.pendingHandoff, normalizeTransferId(command.transferId), command.sourceDeviceId, sourceWasPlaying);
    if (!accepted) return;
    this.pendingHandoff = accepted;
    if (this.handoffAcceptTimer) clearTimeout(this.handoffAcceptTimer);
    this.handoffAcceptTimer = null;
    const state = this.state;
    const track = state.currentTrack;
    if (!track) {
      this.clearPendingHandoff();
      this.sendRemoteCommand(accepted.targetDeviceId, 'handoff_cancel', { transferId: accepted.transferId, reason: 'source_track_missing' }, { quiet: true });
      return;
    }
    const queue = normalizeQueue(state.playbackQueue, track).slice(0, 80);
    const queueIndex = Math.min(Math.max(state.queueIndex, 0), Math.max(queue.length - 1, 0));
    if (sourceWasPlaying) engine.pause();
    this.patchRemoteDevice(accepted.targetDeviceId, (device) => ({
      ...device,
      currentTrack: track,
      queue,
      queueIndex,
      isPlaying: sourceWasPlaying,
      progressMs: player.positionMs,
      durationMs: player.durationMs > 0 ? player.durationMs : track.durationMs,
      volume: player.volume,
      shuffleEnabled: player.shuffleEnabled,
      repeatMode: player.repeatMode,
    }));
    this.set({ connectStatus: `${accepted.targetName} accepted the transfer. Starting it there now...` });
    this.sendRemoteCommand(
      accepted.targetDeviceId,
      'handoff_commit',
      {
        transferId: accepted.transferId,
        track: trackToRemoteJson(track),
        queue: queue.map(trackToRemoteJson),
        queueIndex,
        progress: player.positionMs / 1000,
        volume: Math.min(Math.max(player.volume, 0), 100),
        isPlaying: sourceWasPlaying,
        shuffleEnabled: player.shuffleEnabled,
        repeatMode: repeatModeToRemote(player.repeatMode),
      },
      {
        quiet: true,
        onSuccess: () => {
          if (this.pendingHandoff !== accepted) return;
          if (this.handoffCompleteTimer) clearTimeout(this.handoffCompleteTimer);
          this.handoffCompleteTimer = setTimeout(() => {
            if (this.pendingHandoff !== accepted) return;
            this.clearPendingHandoff();
            this.set({
              connectStatus: `${accepted.targetName} accepted the transfer but did not confirm playback. This phone remains paused to prevent double playback.`,
              message: 'Transfer confirmation timed out. Press Play here to recover.',
            });
          }, HANDOFF_COMPLETE_TIMEOUT_MS);
        },
        onFailure: () => {
          if (this.pendingHandoff !== accepted) return;
          this.clearPendingHandoff();
          this.sendRemoteCommand(accepted.targetDeviceId, 'handoff_cancel', { transferId: accepted.transferId, reason: 'commit_failed' }, { quiet: true });
          this.set({
            connectStatus: `Transfer delivery to ${accepted.targetName} could not be confirmed. This phone remains paused to prevent double playback.`,
            message: 'Transfer delivery is uncertain. Press Play here to recover.',
          });
        },
      },
    );
  }

  private async applyIncomingLike(command: RemoteCommand) {
    const track = command.payloadTrack;
    const liked = command.liked;
    if (!track || liked === null) return;
    this.library.setLiked(track, liked);
    const text = liked ? `Liked ${track.title} from Spice Connect.` : `Unliked ${track.title} from Spice Connect.`;
    const session = this.state.accountSession;
    if (session) {
      try {
        await this.api.setTrackLiked(session.token, track, liked);
        this.library.markLikeMutationSynced(track.id);
      } catch {
        this.library.markLikeMutationPending(track.id);
        this.scheduleTasteSync();
      }
    }
    this.set({ message: text });
  }

  private async applyIncomingPlaylistAdd(command: RemoteCommand) {
    const track = command.payloadTrack;
    if (!track) return;
    const title = command.playlistTitle.trim();
    const playlist =
      findPortableSpiceConnectPlaylist(this.state.playlists, command.playlistId, title) ??
      (title ? this.library.createPlaylist(title) : null);
    if (!playlist) {
      this.set({ message: 'The selected playlist is not available on this device.' });
      return;
    }
    if (playlist.shared) {
      const session = this.state.accountSession;
      if (!session || (playlist.shareRole !== 'owner' && playlist.shareRole !== 'editor')) {
        this.set({ message: `This device cannot edit ${playlist.title}.` });
        return;
      }
      try {
        await this.api.addSharedPlaylistTrack(session.token, playlist.id, track);
        await this.refreshCloudLibrary(session);
        this.set({ message: `Added ${track.title} to ${playlist.title} from Spice Connect.` });
      } catch (error) {
        this.set({ message: errorMessage(error, `Could not update ${playlist.title}.`) });
      }
      return;
    }
    const added = this.library.addTrackToPlaylist(playlist.id, track);
    this.set({
      message: added ? `Added ${track.title} to ${playlist.title} from Spice Connect.` : `${track.title} is already in ${playlist.title}.`,
    });
  }
}

