'use client';

/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  enrichTrackSnapshot,
  enrichTrackSnapshots,
  getCachedSearch,
  getLatestCachedSearch,
  getPlaybackState,
  getRecentCachedSearches,
  mergeTrackLists,
  mergeTrackSnapshots,
  rememberSearchResults,
  rememberTrackSnapshots,
  savePlaybackState,
  savePlaybackProgress,
  clearSearchCache,
  deleteRecentSearchEntry,
} from './spice-storage';
import {
  computePlaylistWindow,
  PLAYLIST_ROW_HEIGHT_PX,
} from './playlist-performance';
import { mergePlaylistOccurrences } from './playlist-merge';
import { playlistArtworkCandidates } from './playlist-artwork';
import {
  fallbackSearchQuery,
  fallbackSoundCloudTrackId,
  isFallbackSoundCloudTrack,
  rankFallbackCandidates,
} from './playback-fallback';
import {
  filterTracksForYou,
  reorderTracksByTaste,
  smartQueueBaseScore,
  trackAffinityScore,
  type TasteAffinityContext,
} from './taste-affinity';
import {
  buildListeningTimeProfile,
  buildOnRepeatTracks,
  LISTENING_TIME_BUCKET_LABELS,
  LISTENING_TIME_BUCKET_QUERIES,
  LISTENING_TIME_MIN_BUCKET_EVENTS,
  pickFreshFindTracks,
} from './listening-context';
import CommandPalette, { type CommandPaletteCommand } from './command-palette';
import { isCommandPaletteShortcut } from './command-palette-core';
import ThemeEditor from './theme-editor';
import RuntimeDiagnosticsPanel from './runtime-diagnostics-panel';
import PlaybackProfilePanel from './playback-profile-panel';
import SecurePairingPanel, {
  type PairedDeviceAuthorization,
  type PairingCodeResult,
} from './secure-pairing-panel';
import {
  loadPlaybackProfileState,
  normalizePlaybackProfileState,
  savePlaybackProfileState,
  type PlaybackProfileState,
} from './playback-profiles';
import { createCrossfadePlan, crossfadeGains, crossfadeStateAt } from './crossfade';
import { buildSmartQueue, sequenceTracksByMoodFlow, smartQueueArtistKeys, smartQueueTrackKey } from './smart-queue';
import {
  adaptiveTrackWeights,
  classifyAdaptiveListen,
  normalizeAdaptiveTrackPriorityState,
  recordAdaptiveListenOutcome,
  shouldTreatAdaptiveSeekAsSkip,
  type AdaptiveTrackPriorityState,
} from './adaptive-track-priority';
import {
  alignShuffleHistory,
  nextShuffleTrack,
  previousShuffleTrack,
  resetShuffleHistory,
  type ShuffleHistoryState,
} from './shuffle-history';
import { buildHomeHistoryShelves } from './home-history';
import {
  createThemeCssVariables,
  DEFAULT_PURPLE_PALETTE,
  loadStoredThemePalette,
  type ThemePalette,
} from '@/lib/theme-palette';
import {
  buildPrivateTasteProfile,
  beginRecommendationListenProgress,
  buildRecommendationSeeds,
  buildRecommendationShelves,
  createRelatedRecommendationSeed,
  incrementRecommendationListenMs,
  rankRecommendedTracks,
  recordRecommendationListenProgress,
  recommendationListenThresholdSeconds,
  resetRecommendationListenObservation,
  shouldAwaitPersonalizedContinuation,
  shouldRepeatPlaylistAtQueueTail,
  trackTopicKeys,
  type RecommendationListenProgress,
  type RecommendationShelf,
} from './recommendations';
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  dislikeRecommendedTrack,
  hideRecommendedTrack,
  normalizeRecommendationPreferences,
  recordDiscoveryWin,
  snoozeRecommendedArtist,
  type RecommendationPreferences,
} from './recommendation-preferences';
import {
  appendListeningEvent,
  buildWeeklyListeningRecap,
  normalizeListeningEvents,
  type ListeningEvent,
} from './listening-insights';
import {
  DurableSyncOutbox,
  SyncOutboxPermanentError,
  type SyncOutboxItem,
} from './sync-outbox';
import {
  listenTogetherApiErrorMessage,
  listenTogetherNeedsSeek,
  listenTogetherTrackKey,
} from './listen-together-core';
import {
  applySpiceConnectLikeMutation,
  isSpiceConnectCommandFresh,
  isSpiceConnectPlaybackCommand,
  spiceConnectCommandPollDelay,
  spiceConnectEnabledFromStorage,
  SPICE_CONNECT_COMMAND_IDLE_BACKOFF_POLLS,
  SPICE_CONNECT_COMMAND_REALTIME_FALLBACK_POLL_INTERVAL_MS,
  SPICE_CONNECT_COMMAND_TTL_MS,
  SPICE_CONNECT_CONTROLLER_REFRESH_INTERVAL_MS,
  SPICE_CONNECT_CONTROLLER_REALTIME_FALLBACK_REFRESH_INTERVAL_MS,
  SPICE_CONNECT_DEVICE_SYNC_INTERVAL_MS,
  SPICE_CONNECT_OPTIMISTIC_STATE_WINDOW_MS,
  SPICE_CONNECT_POST_COMMAND_SYNC_DELAY_MS,
  SPICE_CONNECT_STATE_REPORT_DEBOUNCE_MS,
  SPICE_CONNECT_STALE_DEVICE_SECONDS,
} from '@/lib/spice-connect';
import {
  SpiceConnectLanTransport,
  SPICE_CONNECT_LAN_SIGNAL_COMMAND,
  type SpiceConnectLanDeviceState,
  type SpiceConnectLanSignal,
} from '@/lib/spice-connect-lan';
import {
  initialSpiceConnectSseParserState,
  parseSpiceConnectSseChunk,
  SPICE_CONNECT_REALTIME_RECONNECT_MAX_MS,
  SPICE_CONNECT_REALTIME_RECONNECT_MIN_MS,
} from '@/lib/spice-connect-realtime';
import {
  commitSpiceConnectHandoffDestination,
  createSpiceConnectTransferId,
  normalizeSpiceConnectTransferId,
  prepareSpiceConnectHandoffDestination,
  startSpiceConnectHandoffSource,
  transitionSpiceConnectHandoffSource,
  SPICE_CONNECT_HANDOFF_ACCEPT_TIMEOUT_MS,
  SPICE_CONNECT_HANDOFF_COMPLETE_TIMEOUT_MS,
  type SpiceConnectHandoffDestinationState,
  type SpiceConnectHandoffSourceState,
} from '@/lib/spice-connect-handoff';
import { SPICE_MEDIA_CORE_VERSION, RELEASE_NOTIFICATION_STORAGE_KEY, type ReleaseNotification } from '@/lib/release-notifications';
import {
  accountBoundProfiles,
  isHydratedCloudToken,
  readCloudSessionFromStorage,
} from '@/lib/profile-cloud-session';
import {
  DEFAULT_PROFILE_DISPLAY_NAME,
  mergeProfileAvatarUrl,
  mergeProfileDisplayName,
  mergeProfileUsername,
} from '@/lib/profile-identity';
import { mergeSongsPlayedCount } from '@/lib/profile-sync';
import { requiresProfileMetadataSync } from '@/lib/profile-metadata-sync';
import {
  beginProfileListenDelivery,
  createProfileListenDeliveryState,
  finishProfileListenDelivery,
  profileListenRetryDelayMs,
  type ProfileListenDeliveryState,
  type ProfileListenProvider,
  type ProfileListenType,
} from '@/lib/profile-listen-delivery';
import {
  normalizePlayerVolume,
  playerVolumeGain,
  shouldUsePlayerGainPath,
  shouldUseProxyForBoost,
} from '@/lib/player-audio';
import { parseSupportedMediaLink } from '@/lib/media-link';
import {
  IDLE_PLAYER_TRACK,
  profileScrobbleThresholdSeconds,
  projectRemotePlaybackProgress,
  reconcileOptimisticRemoteUpdates,
  remoteSnapshotAgeSeconds,
  resolvePlaybackQueueIndex,
  shouldBeginProfileListenCycle,
} from './spice-client-runtime';

const SPICE_VERSION_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const RECOMMENDATION_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SHARED_PLAYLIST_INVITE_POLL_INTERVAL_MS = 5 * 60 * 1000;
const LISTEN_TOGETHER_INVITE_POLL_INTERVAL_MS = 60 * 1000;
const LISTEN_TOGETHER_HOST_INVITE_POLL_INTERVAL_MS = 30 * 1000;
const LISTEN_TOGETHER_SYNC_INTERVAL_MS = 5000;
const LISTEN_TOGETHER_START_FAILURE_MESSAGE = 'Listen Together could not start right now. Please try again.';
const LISTEN_TOGETHER_NETWORK_FAILURE_MESSAGE = 'Could not reach Listen Together. Check your connection and try again.';
const UPDATE_RELOAD_REMOTE_SUPPRESS_MS = 30 * 1000;
const UPDATE_RELOAD_REMOTE_SUPPRESS_KEY = 'spice_update_reload_remote_suppress_until';
const SYNC_OUTBOX_STORAGE_KEY = 'spice_sync_outbox_v1';
const LISTEN_TOGETHER_STATE_STORAGE_KEY = 'spice_listen_together_state_v2';
const SPICE_CONNECT_TRANSPORT_DIAGNOSTICS_STORAGE_KEY = 'spice_connect_transport_diagnostics_v1';

const recommendationPreferencesStorageKey = (profileId: string) => `spice_recommendation_preferences:${profileId}`;
const listeningEventsStorageKey = (profileId: string) => `spice_listening_events:${profileId}`;
const adaptiveTrackPriorityStorageKey = (profileId: string) => `spice_adaptive_track_priority_v1:${profileId}`;

const readStoredJson = (key: string): unknown => {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
};

const isSpiceDocumentVisible = () => (
  typeof document === 'undefined' || document.visibilityState === 'visible'
);

const allowNativePlaybackIntent = (reason: string) => {
  if (typeof window === 'undefined') return;
  const allowPlayback = (window as Window & {
    __spiceNativeAllowPlaybackIntent?: (intentReason: string) => void;
  }).__spiceNativeAllowPlaybackIntent;
  if (typeof allowPlayback === 'function') allowPlayback(reason);
};

const PLAYBACK_STREAM_RETRY_LIMIT = 3;
const PLAYBACK_STREAM_RETRY_DELAY_MS = 1200;
const PLAYER_VOLUME_STORAGE_KEY = 'spice_player_volume';
const PLAYER_SHUFFLE_STORAGE_KEY = 'spice_is_shuffle';
const PLAYER_REPEAT_STORAGE_KEY = 'spice_repeat_mode';
const MAX_LOCAL_PROFILES = 6;
const SPICE_MEDIA_CORE_LABEL = `Spice Media Core v${SPICE_MEDIA_CORE_VERSION}`;
const LASTFM_CALLBACK_ORIGIN_STORAGE_KEY = 'spice_lastfm_callback_origin';
const REMOTE_PAIRING_CREDENTIAL_STORAGE_PREFIX = 'spice_remote_pairing_credential_v1:';

interface StoredRemotePairingCredential {
  token: string;
  authorizationId: string;
  deviceId: string;
  ownerUserId: string;
  expiresAt: string;
}

const remotePairingCredentialStorageKey = (profileId: string) =>
  `${REMOTE_PAIRING_CREDENTIAL_STORAGE_PREFIX}${profileId || 'default'}`;

function loadRemotePairingCredential(profileId: string): StoredRemotePairingCredential | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(remotePairingCredentialStorageKey(profileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const expiresAt = new Date(parsed?.expiresAt).getTime();
    if (
      typeof parsed?.token !== 'string'
      || typeof parsed?.authorizationId !== 'string'
      || typeof parsed?.deviceId !== 'string'
      || typeof parsed?.ownerUserId !== 'string'
      || typeof parsed?.expiresAt !== 'string'
      || !Number.isFinite(expiresAt)
      || expiresAt <= Date.now()
    ) {
      localStorage.removeItem(remotePairingCredentialStorageKey(profileId));
      return null;
    }
    return parsed as StoredRemotePairingCredential;
  } catch {
    localStorage.removeItem(remotePairingCredentialStorageKey(profileId));
    return null;
  }
}

type SpiceApiLane = 'local' | 'cloud';
const SPICE_RUNTIME_TARGET = process.env.NEXT_PUBLIC_SPICE_RUNTIME_TARGET === 'vercel' ? 'vercel' : 'local';
const SPICE_LOCAL_API_ORIGIN = normalizeApiOrigin(
  process.env.NEXT_PUBLIC_SPICE_LOCAL_API_ORIGIN || 'http://127.0.0.1:3939',
);

function spiceApiUrl(
  lane: SpiceApiLane,
  path: string,
  query?: URLSearchParams | Record<string, string | number | boolean | null | undefined>,
) {
  const [rawPath, rawQuery = ''] = path.startsWith('/') ? path.split('?') : `/${path}`.split('?');
  const origin = spiceApiOrigin(lane);
  const namespace = spiceApiNamespace(lane);
  const url = new URL(`/api${namespace}${rawPath}`, origin || 'http://spice.local');

  if (rawQuery) {
    const existing = new URLSearchParams(rawQuery);
    existing.forEach((value, key) => url.searchParams.set(key, value));
  }

  if (query instanceof URLSearchParams) {
    query.forEach((value, key) => url.searchParams.set(key, value));
  } else if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return origin ? url.toString() : `${url.pathname}${url.search}`;
}

function spiceFetch(
  lane: SpiceApiLane,
  path: string,
  init?: RequestInit,
  query?: URLSearchParams | Record<string, string | number | boolean | null | undefined>,
) {
  return fetch(spiceApiUrl(lane, path, query), init);
}

function spiceApiResponseUrl(lane: SpiceApiLane, url: string) {
  if (/^(?:https?:|blob:|data:)/i.test(url)) return url;
  const origin = spiceApiOrigin(lane);
  return origin ? new URL(url, origin).toString() : url;
}

function spiceApiOrigin(lane: SpiceApiLane) {
  if (lane === 'cloud') {
    return '';
  }

  return SPICE_RUNTIME_TARGET === 'vercel' ? SPICE_LOCAL_API_ORIGIN : '';
}

function spiceApiNamespace(lane: SpiceApiLane) {
  if (lane === 'cloud' && SPICE_RUNTIME_TARGET === 'vercel') {
    return '';
  }

  return `/${lane}`;
}

function normalizeApiOrigin(origin: string) {
  return origin.replace(/\/+$/, '');
}

function trustedLastFmCallbackOrigin(callbackUrl?: string) {
  if (!callbackUrl?.trim()) return '';

  try {
    return new URL(callbackUrl).origin;
  } catch {
    return '';
  }
}

function isTrustedLastFmMessageOrigin(origin: string) {
  if (origin === window.location.origin) return true;

  const callbackOrigin = localStorage.getItem(LASTFM_CALLBACK_ORIGIN_STORAGE_KEY);
  return Boolean(callbackOrigin && origin === callbackOrigin);
}

// ── Icons ──────────────────────────────────────────────────────────
const Icons = {
  play: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  eyeOff: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
  prev: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
    </svg>
  ),
  next: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  heartFilled: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" width="16" height="16">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  bookmark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  library: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  chevronLeft: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  chevronRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  volume: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  ),
  volumeMuted: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  ),
  playlist: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="18" height="18">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="18" height="18">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l5.67-5.67" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  unlock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  shuffle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  ),
  repeat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  repeatOne: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      <text x="12" y="14.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="bold">1</text>
    </svg>
  ),
  musicFolder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="14" r="3" />
      <path d="M15 14V10" />
    </svg>
  ),
  alertTriangle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  checkCircle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  musicNote: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  database: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5" />
      <path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3" />
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  clipboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51 15.42 17.49" />
      <path d="M15.41 6.51 8.59 10.49" />
    </svg>
  ),
  listenTogether: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      <path d="M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
      <path d="M6 21v-1a4 4 0 0 1 8 0v1" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  palette: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 22a10 10 0 1 1 10-10c0 1.1-.9 2-2 2h-3.1a2 2 0 0 0-1.6 3.2l.4.6A2.6 2.6 0 0 1 13.6 22z" />
    </svg>
  ),
  headphones: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />
    </svg>
  ),
  monitor: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9.5v5l5-2.5z" fill="currentColor" stroke="none" />
    </svg>
  ),
  miniPlayer: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="13" y="11" width="6" height="5" rx="1" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  tool: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M14.7 6.3a4 4 0 0 0-5-5L7 4l3 3 2.7-2.7a4 4 0 0 0 2 5L21 16l-5 5-6.3-6.3a4 4 0 0 0-5-2L2 15.4 5.6 19l2.7-2.7a4 4 0 0 0 5-5z" />
    </svg>
  ),
  microphone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
    </svg>
  ),
  expand: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  ),
  guitar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
      <path d="m14 6 4-4 4 4-4 4" />
      <path d="m16 8-5 5" />
      <path d="M12 12c2 2 2 5 0 7s-5 2-7 0-2-5 0-7 5-2 7 0z" />
      <circle cx="8.5" cy="15.5" r="1.5" />
    </svg>
  ),
  coffee: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v5a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6zM6 2v2M10 2v2M14 2v2M2 22h18" />
    </svg>
  ),
  piano: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M6 4v10M10 4v10M14 4v10M18 4v10M2 14h20" />
      <path d="M8 14v6M16 14v6" />
    </svg>
  ),
  trumpet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
      <path d="M3 10h11l7-4v12l-7-4H3z" />
      <path d="M7 10V7M10 10V7M13 10V7M4 14v3M8 14v3" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
};

// ── Types ──────────────────────────────────────────────────────────
interface Artist {
  id: string;
  name: string;
  artworkUrl?: string;
}

interface Album {
  id: string;
  title: string;
  artists: Artist[];
  artworkUrl?: string;
  year?: number;
}

interface Track {
  id: string;
  title: string;
  artists: Artist[];
  album?: Album;
  durationMs?: number;
  artworkUrl?: string;
  sourceId?: string;
  permalinkUrl?: string;
  previewOnly?: boolean;
  msListened?: number;
  addedBy?: { userId: string; username: string | null; displayName: string };
}

type AppPage = 'home' | 'search' | 'library' | 'account' | 'settings';
type SearchProvider = 'hybrid' | 'youtube_music' | 'youtube_videos' | 'soundcloud';
type StreamProtocol = 'proxy' | 'web' | 'embed';
type ProfileSyncStatus = 'idle' | 'playing' | 'scrobbled' | 'error';
type AccentTheme = 'pink' | 'blue' | 'orange' | 'green' | 'gold' | 'crimson' | 'deeppurple';
type VisualSurface = 'midnight' | 'glass' | 'solid' | 'aurora' | 'daylight';
type ArtworkShape = 'rounded' | 'soft' | 'circle';
type MotionLevel = 'full' | 'calm' | 'off';
type InterfaceScale = 'compact' | 'comfortable' | 'spacious';
type TopbarLayout = 'embedded' | 'floating';
type PlayerBarDensity = 'standard' | 'slim';
type PlayerVisualStyle = 'spice' | 'vk';
type NativeToolbarButtonKey = 'back' | 'reload' | 'home' | 'volume' | 'lyrics' | 'miniPlayer' | 'queue';
type TopbarSearchMode = SearchProvider | 'users';
type ReceiverSelectVariant = 'bar' | 'expanded' | 'mini';
type AccountRole = 'user' | 'admin' | string;
type SpiceNoticeKind = 'success' | 'info' | 'warning' | 'danger';

interface SpiceNotice {
  id: number;
  message: string;
  kind: SpiceNoticeKind;
}

interface SpiceConfirmDialog {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  kind?: SpiceNoticeKind;
  onConfirm: () => void;
}

interface SpiceDesktopNavigationDetail {
  action: 'back' | 'home' | 'settings';
  handled: boolean;
}

interface NativeShellPreferences {
  nativeMode: boolean;
  discordRpcEnabled: boolean;
  alwaysOnTop: boolean;
  toolbarButtons: Record<string, boolean>;
  customCss: string;
}

interface NativeShellUpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'error' | 'downloading' | 'downloaded';
  error?: string;
  progress?: { percent?: number };
  info?: { version?: string };
}

interface SpiceDesktopUpdaterBridge {
  checkForUpdates: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => void;
  getStartOnBoot?: () => Promise<DesktopStartOnBootPreference>;
  setStartOnBoot?: (enabled: boolean) => Promise<DesktopStartOnBootPreference>;
  onUpdateStatus: (callback: (status: NativeShellUpdateStatus) => void) => () => void;
}

interface DesktopOfflineLibraryEntry {
  fileName: string;
  bytes: number;
  updatedAt: string;
  url: string;
  track: Track;
}

interface SpiceDesktopOfflineLibraryBridge {
  getSettings: () => Promise<{ directory: string }>;
  chooseDirectory: () => Promise<{ canceled: boolean; directory: string }>;
  list: () => Promise<{ directory: string; tracks: DesktopOfflineLibraryEntry[] }>;
  save: (fileName: string, bytes: ArrayBuffer, track: Track) => Promise<{ success: boolean; directory: string; fileName: string }>;
  exists: (fileName: string) => Promise<{ exists: boolean; fileName: string }>;
  remove: (fileName: string) => Promise<{ success: boolean }>;
  show: (fileName?: string) => Promise<{ success: boolean; missing?: boolean }>;
}

interface SpiceDesktopRuntimeStatus {
  supported: boolean;
  installed: boolean;
  running: boolean;
  architectures?: Array<'arm64' | 'x64'>;
}

interface SpiceDesktopRuntimeBridge {
  prepare: () => Promise<SpiceDesktopRuntimeStatus>;
}

interface DesktopStartOnBootPreference {
  supported: boolean;
  enabled: boolean;
}

interface SpiceNativeShellBridge extends SpiceDesktopUpdaterBridge {
  getSettings: () => Promise<NativeShellPreferences>;
  setDiscordRpc: (enabled: boolean) => Promise<boolean>;
  setAlwaysOnTop: (enabled: boolean) => Promise<boolean>;
  setToolbarButtons: (buttons: Record<string, boolean>) => void;
  setCustomCss: (css: string) => void;
  openDevTools: () => void;
}

const NATIVE_TOOLBAR_CONTROLS: Array<{
  id: NativeToolbarButtonKey;
  label: string;
  description: string;
}> = [
  { id: 'back', label: 'Back', description: 'Navigate to the previous page.' },
  { id: 'reload', label: 'Reload', description: 'Reload the Native music view.' },
  { id: 'home', label: 'Home', description: 'Return to the Native launcher.' },
  { id: 'volume', label: 'Volume', description: 'Show shell volume and boost controls.' },
  { id: 'lyrics', label: 'Lyrics', description: 'Open the desktop lyrics window.' },
  { id: 'miniPlayer', label: 'Mini Player', description: 'Open the compact desktop player.' },
  { id: 'queue', label: 'Queue', description: 'Open the desktop queue window.' },
];

const getSpiceNativeShellBridge = () => {
  if (typeof window === 'undefined') return null;
  return (window as Window & { spiceNativeShell?: SpiceNativeShellBridge }).spiceNativeShell ?? null;
};

const getSpiceDesktopUpdaterBridge = () => {
  if (typeof window === 'undefined') return null;
  const updaterWindow = window as Window & {
    spiceDesktopUpdater?: SpiceDesktopUpdaterBridge;
    spiceNativeShell?: SpiceNativeShellBridge;
  };
  return updaterWindow.spiceDesktopUpdater ?? updaterWindow.spiceNativeShell ?? null;
};

const getSpiceDesktopOfflineLibraryBridge = () => {
  if (typeof window === 'undefined') return null;
  return (window as Window & {
    spiceDesktopOfflineLibrary?: SpiceDesktopOfflineLibraryBridge;
  }).spiceDesktopOfflineLibrary ?? null;
};

const getSpiceDesktopRuntimeBridge = () => {
  if (typeof window === 'undefined') return null;
  return (window as Window & {
    spiceDesktopRuntime?: SpiceDesktopRuntimeBridge;
  }).spiceDesktopRuntime ?? null;
};

const formatOfflineLibrarySize = (bytes: number) => {
  const safeBytes = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (safeBytes < 1024) return `${Math.round(safeBytes)} B`;
  if (safeBytes < 1024 * 1024) return `${(safeBytes / 1024).toFixed(1)} KB`;
  if (safeBytes < 1024 * 1024 * 1024) return `${(safeBytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(safeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const nativeUpdateStatusMessage = (status: NativeShellUpdateStatus | null) => {
  if (!status) return 'Ready to check for updates.';
  switch (status.status) {
    case 'checking': return 'Checking for updates...';
    case 'available': return `Update ${status.info?.version || ''} is available and will download automatically.`.replace('  ', ' ');
    case 'not-available': return 'SPICE Desktop is up to date.';
    case 'downloading': return `Downloading update... ${Math.round(status.progress?.percent ?? 0)}%`;
    case 'downloaded': return `Update ${status.info?.version || ''} is ready to install.`.replace('  ', ' ');
    case 'error': return status.error || 'The update check failed.';
    default: return 'Ready to check for updates.';
  }
};

interface SongShareDialog {
  track: Track;
  shareUrl: string;
}

const SEARCH_PROVIDER_LABELS: Record<SearchProvider, string> = {
  hybrid: 'YouTube + SoundCloud',
  youtube_music: 'YouTube Music',
  youtube_videos: 'YouTube Videos',
  soundcloud: 'SoundCloud',
};

const TOPBAR_SEARCH_MODE_LABELS: Record<TopbarSearchMode, string> = {
  ...SEARCH_PROVIDER_LABELS,
  users: 'Users',
};

const VISUAL_SURFACE_LABELS: Record<VisualSurface, string> = {
  midnight: 'Midnight Black',
  glass: 'Soft Glass',
  solid: 'Flat Graphite',
  aurora: 'Aurora Glow',
  daylight: 'Daylight',
};

const ARTWORK_SHAPE_LABELS: Record<ArtworkShape, string> = {
  rounded: 'Rounded Covers',
  soft: 'Soft Squares',
  circle: 'Circular Artwork',
};

const MOTION_LEVEL_LABELS: Record<MotionLevel, string> = {
  full: 'Full Motion',
  calm: 'Calm Motion',
  off: 'Motion Off',
};

const INTERFACE_SCALE_LABELS: Record<InterfaceScale, string> = {
  compact: 'Compact',
  comfortable: 'Comfortable',
  spacious: 'Spacious',
};

const TOPBAR_LAYOUT_LABELS: Record<TopbarLayout, string> = {
  embedded: 'Embedded Header',
  floating: 'Floating & Rounded',
};

const PLAYER_BAR_DENSITY_LABELS: Record<PlayerBarDensity, string> = {
  standard: 'Standard Bar',
  slim: 'Slim Bar',
};

const PLAYER_VISUAL_STYLE_LABELS: Record<PlayerVisualStyle, string> = {
  spice: 'SPICE Default',
  vk: 'VK Compact',
};

const PROFILE_SYNC_STATUS_LABELS: Record<ProfileSyncStatus, string> = {
  idle: 'Waiting for playback',
  playing: 'Now playing updated',
  scrobbled: 'Listen saved',
  error: 'Needs attention',
};

interface PendingInvite {
  playlistId: string;
  playlistTitle: string;
  ownerId: string;
  ownerUsername: string;
  ownerDisplayName: string;
}





interface PlaylistMember {
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  status?: string;
  acceptedAt?: string | null;
}

interface Playlist {
  id: string;
  title: string;
  description?: string;
  tracks: Track[];
  gradient: string;
  coverUrl?: string;
  createdAt: string;
  shared?: boolean;
  isPublic?: boolean;
  ownerId?: string;
  ownerUsername?: string | null;
  ownerDisplayName?: string;
  shareRole?: 'listener' | 'editor' | string;
  members?: PlaylistMember[];
}

function PlaylistCoverImage({
  playlist,
  alt,
  className,
  style,
}: {
  playlist: Playlist;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const candidates = playlistArtworkCandidates(playlist);
  const [failedCandidates, setFailedCandidates] = useState<string[]>([]);
  const src = candidates.find((candidate) => !failedCandidates.includes(candidate));

  if (!src) return null;

  return (
    <img
      key={src}
      src={src}
      alt={alt}
      className={className}
      style={style}
      onError={() => setFailedCandidates((failed) => (
        failed.includes(src) ? failed : [...failed, src]
      ))}
    />
  );
}

const trackListFingerprint = (tracks: Track[]) => {
  const trackKey = (track: Track | undefined) => track
    ? `${track.sourceId ?? 'unknown'}:${track.id}`
    : 'empty';
  const middleIndex = Math.floor(tracks.length / 2);
  return `${tracks.length}:${trackKey(tracks[0])}:${trackKey(tracks[middleIndex])}:${trackKey(tracks.at(-1))}`;
};

interface VirtualTrackRowsProps {
  tracks: Track[];
  height: number | string;
  rowHeight?: number;
  resetKey: string;
  focusIndex?: number;
  className?: string;
  ariaLabel: string;
  renderRow: (track: Track, index: number) => React.ReactNode;
}

function VirtualTrackRows({
  tracks,
  height,
  rowHeight = PLAYLIST_ROW_HEIGHT_PX,
  resetKey,
  focusIndex,
  className = '',
  ariaLabel,
  renderRow,
}: VirtualTrackRowsProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(rowHeight * 8);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateHeight = () => {
      setViewportHeight(Math.max(rowHeight, viewport.clientHeight));
    };
    updateHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }

    const observer = new ResizeObserver(updateHeight);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [rowHeight]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = 0;
    setScrollOffset(0);
  }, [resetKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || focusIndex === undefined || focusIndex < 0 || tracks.length === 0) return;
    const boundedFocusIndex = Math.min(tracks.length - 1, focusIndex);
    const itemTop = boundedFocusIndex * rowHeight;
    const itemBottom = itemTop + rowHeight;
    if (itemTop < viewport.scrollTop || itemBottom > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = Math.max(0, itemTop - Math.max(0, (viewport.clientHeight - rowHeight) / 2));
      setScrollOffset(viewport.scrollTop);
    }
  }, [focusIndex, resetKey, rowHeight, tracks.length, viewportHeight]);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  const renderWindow = computePlaylistWindow({
    itemCount: tracks.length,
    scrollOffset,
    viewportHeight,
    rowHeight,
  });
  const visibleTracks = tracks.slice(renderWindow.startIndex, renderWindow.endIndex);

  return (
    <div
      ref={viewportRef}
      className={`virtual-track-list custom-scrollbar ${className}`.trim()}
      style={{ height }}
      role="list"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={(event) => {
        const nextOffset = event.currentTarget.scrollTop;
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        animationFrameRef.current = requestAnimationFrame(() => {
          setScrollOffset(nextOffset);
          animationFrameRef.current = null;
        });
      }}
    >
      <div aria-hidden="true" style={{ height: renderWindow.paddingStart }} />
      {visibleTracks.map((track, visibleIndex) => {
        const index = renderWindow.startIndex + visibleIndex;
        return (
          <div
            key={`${track.sourceId || 'track'}:${track.id}:${index}`}
            className="virtual-track-list__row"
            style={{ height: rowHeight }}
            role="listitem"
            aria-posinset={index + 1}
            aria-setsize={tracks.length}
          >
            {renderRow(track, index)}
          </div>
        );
      })}
      <div aria-hidden="true" style={{ height: renderWindow.paddingEnd }} />
    </div>
  );
}

interface PlaylistInvitePreview {
  token: string;
  playlist: Playlist;
  expiresAt?: string | null;
}

interface CloudAccount {
  id: string;
  email: string;
  username?: string | null;
  emailVerified?: boolean;
  accountRole?: AccountRole;
  isAdmin?: boolean;
  subscription?: {
    tier: string;
    status: string;
    provider?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    isActive?: boolean;
  };
}

interface AccountBlockState {
  status: 'timeout' | 'banned';
  reason: string | null;
  expiresAt: string | null;
}

const ACCOUNT_BLOCK_ERROR_CODES = new Set(['account_timed_out', 'account_banned']);

function parseAccountBlockPayload(payload: unknown): AccountBlockState | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as Record<string, unknown>;
  const code = typeof body.error === 'string' ? body.error : '';
  if (!ACCOUNT_BLOCK_ERROR_CODES.has(code)) return null;

  const status = body.status === 'timeout' ? 'timeout' : 'banned';
  return {
    status,
    reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null,
    expiresAt: typeof body.expiresAt === 'string' && body.expiresAt ? body.expiresAt : null,
  };
}

type RemoteCommandType =
  | 'play'
  | 'pause'
  | 'toggle'
  | 'next'
  | 'previous'
  | 'seek'
  | 'volume'
  | 'shuffle'
  | 'repeat'
  | 'play_track'
  | 'play_queue_index'
  | 'set_like'
  | 'add_to_playlist'
  | 'download'
  | 'handoff'
  | 'handoff_prepare'
  | 'handoff_ready'
  | 'handoff_commit'
  | 'handoff_complete'
  | 'handoff_cancel'
  | 'connect'
  | 'lan_signal';

interface RemoteDevice {
  deviceId: string;
  displayName: string;
  currentTrack?: Track | null;
  queue?: Track[];
  queueIndex: number;
  isPlaying: boolean;
  shuffleEnabled: boolean;
  repeatMode: 'none' | 'all' | 'one';
  progress: number;
  duration: number;
  volume: number;
  updatedAt: string;
  rememberedUntil?: string | null;
  isOnline?: boolean;
  lastSeenSeconds?: number;
  syncedAtMs?: number;
}

interface OptimisticRemoteDeviceState {
  deviceId: string;
  expiresAt: number;
  updates: Partial<RemoteDevice>;
}

interface RemoteCommand {
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  command: RemoteCommandType;
  payload?: {
    progress?: number;
    volume?: number;
    enabled?: boolean;
    mode?: 'none' | 'all' | 'one';
    track?: Track;
    liked?: boolean;
    playlistId?: string;
    playlistTitle?: string;
    queue?: Track[];
    queueIndex?: number;
    isPlaying?: boolean;
    shuffleEnabled?: boolean;
    repeatMode?: 'none' | 'all' | 'one';
    connected?: boolean;
    transferId?: string;
    reason?: string;
    version?: number;
    kind?: string;
    sessionId?: string;
    description?: RTCSessionDescriptionInit;
    [key: string]: unknown;
  };
  createdAt: string;
}

interface SpiceConnectTransportDiagnostic {
  direction: 'sent' | 'received';
  transport: 'lan' | 'cloud';
  command: RemoteCommandType;
  peerDeviceId: string;
  observedAt: number;
  latencyMs?: number;
}

interface PendingSpiceConnectHandoff {
  state: SpiceConnectHandoffSourceState;
  targetName: string;
  acceptTimeoutId: number | null;
  completeTimeoutId: number | null;
}

function clearPendingSpiceConnectHandoffTimers(
  pending: PendingSpiceConnectHandoff | null,
) {
  if (!pending) return;
  if (pending.acceptTimeoutId !== null) {
    window.clearTimeout(pending.acceptTimeoutId);
    pending.acceptTimeoutId = null;
  }
  if (pending.completeTimeoutId !== null) {
    window.clearTimeout(pending.completeTimeoutId);
    pending.completeTimeoutId = null;
  }
}

interface UserProfile {
  id: string;
  displayName: string;
  bio: string;
  gradient: string;
  songsPlayed: number;
  joinedAt: string;
  passcode?: string; // 4 digit passcode
  likedTracks: string[];
  likedTrackDetails: Record<string, Track>;
  customPlaylists: Playlist[];
  history: Track[];
  avatarUrl?: string; // profile picture URL or preset avatar
  cloudToken?: string | null;
  cloudUser?: CloudAccount | null;
  cloudUsername?: string | null;
  isPrivate?: boolean;
}

type SyncOutboxPayload = Record<string, unknown>;

interface ProfileSyncProviderResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

interface ProfileSyncResponse {
  results?: {
    lastfm?: ProfileSyncProviderResult;
    listenbrainz?: ProfileSyncProviderResult;
  };
}

interface PreparedCrossfade {
  id: number;
  outgoingTrackKey: string;
  track: Track;
  queueIndex: number;
  streamUrl: string;
  slot: 0 | 1;
  queueSnapshot: Track[];
  shuffled: boolean;
  shuffleHistory?: ShuffleHistoryState;
  ready: boolean;
  started: boolean;
}

const PRESET_GRADIENTS = [
  'linear-gradient(135deg, #a855f7, #ec4899)',
  'linear-gradient(135deg, #f97316, #ef4444)',
  'linear-gradient(135deg, #06b6d4, #3b82f6)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #6366f1, #4f46e5)',
  'linear-gradient(135deg, #ff003c, #990011)',
  'linear-gradient(135deg, #4c1d95, #120024)',
];

const PRESET_AVATARS = [
  { name: 'Neon DJ', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&q=80' },
  { name: 'Synthwave Sunset', url: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=150&q=80' },
  { name: 'Galactic Beats', url: 'https://images.unsplash.com/photo-1614149162883-504ce4d13909?w=150&q=80' },
  { name: 'Retro Tape', url: 'https://images.unsplash.com/photo-1539625319135-8d4f9c7847a9?w=150&q=80' },
  { name: 'Cyber Headset', url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=150&q=80' },
  { name: 'Music Console', url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=150&q=80' }
];

const genres = [
  { name: 'Pop Hits', gradient: 'linear-gradient(135deg, #ec4899, #f43f5e)', icon: Icons.microphone },
  { name: 'Hip-Hop', gradient: 'linear-gradient(135deg, #f97316, #ef4444)', icon: Icons.headphones },
  { name: 'Rock Charts', gradient: 'linear-gradient(135deg, #64748b, #334155)', icon: Icons.guitar },
  { name: 'Lofi Chill', gradient: 'linear-gradient(135deg, #8b5cf6, #06b6d4)', icon: Icons.coffee },
  { name: 'Electronic', gradient: 'linear-gradient(135deg, #d97706, #b45309)', icon: Icons.piano },
  { name: 'Jazz Beats', gradient: 'linear-gradient(135deg, #059669, #0d9488)', icon: Icons.trumpet },
];

const formatTime = (seconds: number) => {
  if (isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const isSoundCloudTrack = (track: Track) =>
  track.sourceId === 'soundcloud' || track.id.startsWith('soundcloud:');

const isOfflineTrack = (track: Track) =>
  track.sourceId === 'offline' && Boolean(track.permalinkUrl?.startsWith('spice-offline://'));

const isYouTubeTrack = (track: Track) =>
  track.sourceId === 'youtube_music'
  || track.sourceId === 'youtube_video'
  || (!track.sourceId && !isSoundCloudTrack(track));

const soundCloudTrackId = (track: Track) =>
  track.id.startsWith('soundcloud:') ? track.id.slice('soundcloud:'.length) : track.id;

const trackSourceLabel = (track: Track) =>
  isOfflineTrack(track)
    ? 'Offline Library'
    : isSoundCloudTrack(track)
    ? 'SoundCloud'
    : track.sourceId === 'youtube_video'
      ? 'YouTube Video'
      : 'YouTube Music';

const isSearchProvider = (value: string | null): value is SearchProvider =>
  value === 'hybrid'
  || value === 'youtube_music'
  || value === 'youtube_videos'
  || value === 'soundcloud';

const isStreamProtocol = (value: string | null): value is StreamProtocol =>
  value === 'proxy' || value === 'web' || value === 'embed';

const isAccentTheme = (value: string | null): value is AccentTheme =>
  value === 'pink' || value === 'blue' || value === 'orange' || value === 'green' || value === 'gold' || value === 'crimson' || value === 'deeppurple';

const isVisualSurface = (value: string | null): value is VisualSurface =>
  value === 'midnight'
  || value === 'glass'
  || value === 'solid'
  || value === 'aurora'
  || value === 'daylight';

const isArtworkShape = (value: string | null): value is ArtworkShape =>
  value === 'rounded' || value === 'soft' || value === 'circle';

const isMotionLevel = (value: string | null): value is MotionLevel =>
  value === 'full' || value === 'calm' || value === 'off';

const isInterfaceScale = (value: string | null): value is InterfaceScale =>
  value === 'compact' || value === 'comfortable' || value === 'spacious';

const isTopbarLayout = (value: string | null): value is TopbarLayout =>
  value === 'embedded' || value === 'floating';

const isPlayerBarDensity = (value: string | null): value is PlayerBarDensity =>
  value === 'standard' || value === 'slim';

const isPlayerVisualStyle = (value: string | null): value is PlayerVisualStyle =>
  value === 'spice' || value === 'vk';

const isTopbarSearchMode = (value: string | null): value is TopbarSearchMode =>
  value === 'users' || isSearchProvider(value);

const isRepeatMode = (value: unknown): value is 'none' | 'all' | 'one' =>
  value === 'none' || value === 'all' || value === 'one';

const playableSearchTracks = (tracks: Track[]) =>
  tracks.filter((track) => !track.previewOnly);

const lyricsMetadataQuery = (track: Track) => {
  const params = new URLSearchParams();
  if (track.title) params.set('title', track.title);

  const artist = track.artists?.map((entry) => entry.name).filter(Boolean).join(', ');
  if (artist) params.set('artist', artist);

  if (track.durationMs && Number.isFinite(track.durationMs)) {
    params.set('durationMs', String(Math.round(track.durationMs)));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
};

const dedupeTracks = (tracks: Track[]) => {
  const seen = new Set<string>();
  const deduped: Track[] = [];

  for (const track of tracks) {
    const key = `${track.sourceId ?? 'youtube_music'}:${track.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(track);
  }

  return deduped;
};

const playbackTrackKey = (track: Track) =>
  `${track.sourceId ?? 'youtube_music'}:${track.id}`;

const adaptiveTasteSkipScores = (state: AdaptiveTrackPriorityState): Record<string, number> => {
  const scores: Record<string, number> = {};
  for (const [key, entry] of Object.entries(state?.tracks ?? {})) {
    if (!key || !entry || typeof entry.score !== 'number' || !Number.isFinite(entry.score)) continue;
    scores[key] = entry.score;
  }
  return scores;
};

const shuffleQueueKeys = (tracks: Track[]) => tracks.map(playbackTrackKey);

const currentTimestampMs = () => Date.now();

const resetAudioPlaybackPosition = (audio: HTMLAudioElement) => {
  audio.currentTime = 0;
};

const profileArtistName = (track: Track) =>
  track.artists.map((entry) => entry.name).filter(Boolean).join(', ') || 'Unknown Artist';

const profileOriginUrl = (track: Track) => {
  if (track.permalinkUrl) return track.permalinkUrl;
  if (isSoundCloudTrack(track)) return undefined;
  if (track.sourceId === 'youtube_video') return `https://www.youtube.com/watch?v=${track.id}`;
  if (track.sourceId === 'youtube_music' || !track.sourceId) return `https://music.youtube.com/watch?v=${track.id}`;
  return undefined;
};

const safeSharedString = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;


const encodeBase64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
};

const decodeBase64Url = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const encodeSongShareToken = (track: Track) => {
  // Use a compact array tuple to minimize Base64Url size.
  // Format: [id, title, artistName, sourceId, artworkUrl]
  // We omit artworkUrl for YouTube tracks to keep the URL as short as possible.
  const sId = track.sourceId || 'youtube_music';
  const isYouTube = sId === 'youtube_music' || sId === 'youtube_video';
  const artwork = isYouTube ? '' : (track.artworkUrl || '');

  const tuple = [
    track.id,
    track.title,
    track.artists.length > 0 ? track.artists[0].name : '',
    track.sourceId || '',
    artwork
  ];
  while (tuple.length > 0 && tuple[tuple.length - 1] === '') {
    tuple.pop();
  }
  return encodeBase64Url(JSON.stringify(tuple));
};

const decodeSongShareToken = (token: string): Track | null => {
  try {
    const payload = JSON.parse(decodeBase64Url(token));

    // Support the new compact tuple format
    if (Array.isArray(payload)) {
      const [id, title, artistName, sourceId, artworkUrl] = payload;
      if (!id) return null;

      const sId = safeSharedString(sourceId, 'youtube_music');
      const isYouTube = sId === 'youtube_music' || sId === 'youtube_video';

      const resolvedArtwork = artworkUrl
        ? safeSharedString(artworkUrl)
        : (isYouTube ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : undefined);

      return {
        id: safeSharedString(id),
        title: safeSharedString(title, 'Shared song'),
        artists: [{ id: 'shared-artist', name: safeSharedString(artistName, 'Unknown Artist') }],
        sourceId: sId,
        ...(resolvedArtwork ? { artworkUrl: resolvedArtwork } : {})
      };
    }

    // Fallback to legacy object format
    const id = safeSharedString(payload?.id);
    if (!id) return null;

    const artists = Array.isArray(payload?.artists)
      ? payload.artists.map((artist: any) => ({
        id: safeSharedString(artist?.id, artist?.name || 'artist'),
        name: safeSharedString(artist?.name, 'Unknown Artist'),
        ...(safeSharedString(artist?.artworkUrl) ? { artworkUrl: safeSharedString(artist.artworkUrl) } : {}),
      }))
      : [];

    const albumArtists = Array.isArray(payload?.album?.artists)
      ? payload.album.artists.map((artist: any) => ({
        id: safeSharedString(artist?.id, artist?.name || 'artist'),
        name: safeSharedString(artist?.name, 'Unknown Artist'),
        ...(safeSharedString(artist?.artworkUrl) ? { artworkUrl: safeSharedString(artist.artworkUrl) } : {}),
      }))
      : [];

    const durationMs = Number(payload?.durationMs);
    const year = Number(payload?.album?.year);

    return {
      id,
      title: safeSharedString(payload?.title, 'Shared song'),
      artists: artists.length > 0 ? artists : [{ id: 'shared-artist', name: 'Unknown Artist' }],
      ...(payload?.album ? {
        album: {
          id: safeSharedString(payload.album.id, 'shared-album'),
          title: safeSharedString(payload.album.title, 'Shared album'),
          artists: albumArtists.length > 0 ? albumArtists : artists,
          ...(safeSharedString(payload.album.artworkUrl) ? { artworkUrl: safeSharedString(payload.album.artworkUrl) } : {}),
          ...(Number.isFinite(year) ? { year } : {}),
        },
      } : {}),
      ...(Number.isFinite(durationMs) && durationMs > 0 ? { durationMs } : {}),
      ...(safeSharedString(payload?.artworkUrl) ? { artworkUrl: safeSharedString(payload.artworkUrl) } : {}),
      ...(safeSharedString(payload?.sourceId) ? { sourceId: safeSharedString(payload.sourceId) } : {}),
      ...(safeSharedString(payload?.permalinkUrl) ? { permalinkUrl: safeSharedString(payload.permalinkUrl) } : {}),
    };
  } catch {
    return null;
  }
};

const buildSongShareUrl = (track: Track) => {
  const url = new URL(window.location.href);
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (!isLocalHost) {
    url.protocol = 'https:';
    url.host = 'music.spice-app.xyz';
  }
  url.pathname = '/';
  url.hash = '';
  url.search = '';
  url.searchParams.set('song', encodeSongShareToken(track));
  return url.toString();
};

const buildPublicSongShareUrl = (track: Track) => {
  const url = new URL('https://music.spice-app.xyz/');
  url.searchParams.set('song', encodeSongShareToken(track));
  return url.toString();
};

const directAudioExtensionPattern = /\.(mp3|m4a|aac|wav|flac|ogg|opus|webm)(?:$|[?#])/iu;

const directAudioDownloadUrl = (track: Track) => {
  const candidates = [track.permalinkUrl].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate, typeof window !== 'undefined' ? window.location.origin : 'https://music.spice-app.xyz');
      if (directAudioExtensionPattern.test(url.pathname)) return url.toString();
    } catch {
      // Skip malformed URLs.
    }
  }

  return null;
};

const sanitizeDownloadName = (track: Track) => {
  const base = `${profileArtistName(track)} - ${track.title}`
    .replace(/[<>:"/\\|?*\x00-\x1F]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return (base || 'spice-song').slice(0, 90);
};

const extensionFromAudioUrl = (url: string) => {
  try {
    const match = new URL(url).pathname.match(/\.([a-z0-9]+)$/iu);
    return match?.[1]?.toLowerCase() || 'm4a';
  } catch {
    return 'm4a';
  }
};

/**
 * Generates a random number between 0 (inclusive) and 1 (exclusive) using crypto.getRandomValues
 * Fallback to Math.random() if crypto is not available.
 */
const getSecureRandom = () => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] / (0xffffffff + 1);
  }
  return Math.random();
};

const randomIndex = (length: number) => Math.floor(getSecureRandom() * length);
const randomSuffix = () => getSecureRandom().toString(36).substring(2, 5);
const playlistUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isPlaylistUuid = (id: string) => playlistUuidPattern.test(id);

const createPlaylistId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback RFC4122 version 4 UUID generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (getSecureRandom() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const ownedPlaylistsOnly = (playlists: Playlist[]) =>
  playlists.filter((playlist) => !playlist.shared);

const normalizePlaylistSnapshot = (playlist: any): Playlist => ({
  id: typeof playlist?.id === 'string' && playlist.id ? playlist.id : createPlaylistId(),
  title: typeof playlist?.title === 'string' && playlist.title ? playlist.title : 'Shared Playlist',
  description: typeof playlist?.description === 'string' ? playlist.description : '',
  tracks: Array.isArray(playlist?.tracks) ? enrichTrackSnapshots(playlist.tracks) : [],
  gradient: typeof playlist?.gradient === 'string' && playlist.gradient ? playlist.gradient : PRESET_GRADIENTS[0],
  coverUrl: typeof playlist?.coverUrl === 'string' ? playlist.coverUrl : undefined,
  isPublic: playlist?.isPublic !== false,
  createdAt: typeof playlist?.createdAt === 'string' && playlist.createdAt
    ? playlist.createdAt
    : new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
  ...(playlist?.shared ? { shared: true } : {}),
  ...(typeof playlist?.ownerId === 'string' ? { ownerId: playlist.ownerId } : {}),
  ...(typeof playlist?.ownerUsername === 'string' ? { ownerUsername: playlist.ownerUsername } : {}),
  ...(typeof playlist?.ownerDisplayName === 'string' ? { ownerDisplayName: playlist.ownerDisplayName } : {}),
  ...(typeof playlist?.shareRole === 'string' ? { shareRole: playlist.shareRole } : {}),
  ...(Array.isArray(playlist?.members) ? { members: playlist.members } : {}),
});

const createRemoteDeviceId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `device-${Date.now()}-${randomSuffix()}`;
};

const defaultRemoteDeviceName = () => {
  if (typeof navigator === 'undefined') return 'Spice Connect Device';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|android|mobile/.test(ua)) return 'Spice Connect Phone';
  if (/ipad|tablet/.test(ua)) return 'Spice Connect Tablet';
  return 'Spice Connect Desktop';
};

const sanitizePfpUrl = (url: string): string => {
  const cleaned = url.trim();
  if (!cleaned) return '';

  // Imgur gallery/album URLs: https://imgur.com/a/abc123x or https://imgur.com/gallery/abc123x
  const albumMatch = cleaned.match(/imgur\.com\/(?:a|gallery|r)\/([a-zA-Z0-9]+)/);
  if (albumMatch && albumMatch[1]) {
    return `https://i.imgur.com/${albumMatch[1]}.png`;
  }

  // Imgur direct image redirection helper: https://imgur.com/abc123x
  if (cleaned.includes('imgur.com') && !cleaned.includes('i.imgur.com') && !/\.(png|jpg|jpeg|gif|webp)$/i.test(cleaned)) {
    const idMatch = cleaned.match(/imgur\.com\/([a-zA-Z0-9]+)/);
    if (idMatch && idMatch[1]) {
      return `https://i.imgur.com/${idMatch[1]}.png`;
    }
  }

  return cleaned;
};

interface WordTiming {
  word: string;
  start: number;
  duration: number;
}

interface LyricLine {
  time: number;
  text: string;
  words: WordTiming[];
}

function parseLRC(lrcText: string, totalDurationSec: number): LyricLine[] {
  if (!lrcText) return [];

  const lines = lrcText.split(/\r?\n/);
  const parsedLines: LyricLine[] = [];

  // Parse time tags like [01:23.45] or [01:23] or [01:23:450]
  const timeRegex = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;

  for (const line of lines) {
    timeRegex.lastIndex = 0;
    const match = timeRegex.exec(line);
    if (!match) continue;

    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    const msStr = match[3] || '0';
    let ms = 0;
    if (msStr.length === 1) ms = parseInt(msStr, 10) * 100;
    else if (msStr.length === 2) ms = parseInt(msStr, 10) * 10;
    else ms = parseInt(msStr, 10);

    const timeInSeconds = min * 60 + sec + ms / 1000;
    const text = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();

    parsedLines.push({
      time: timeInSeconds,
      text,
      words: [],
    });
  }

  // Sort lines by time
  parsedLines.sort((a, b) => a.time - b.time);

  // Now, calculate the duration of each line and split into words
  for (let i = 0; i < parsedLines.length; i++) {
    const currentLine = parsedLines[i];
    const nextLineTime = i < parsedLines.length - 1 ? parsedLines[i + 1].time : totalDurationSec;
    const lineDuration = Math.max(0.5, nextLineTime - currentLine.time);

    // Split text into words (including whitespace/punctuation)
    const rawWords = currentLine.text.split(/(\s+)/).filter(w => w.length > 0);

    if (rawWords.length === 0) {
      currentLine.words = [];
      continue;
    }

    const totalChars = rawWords.reduce((sum, w) => sum + w.length, 0);

    let elapsed = 0;
    const wordsWithTiming: WordTiming[] = [];

    for (const rw of rawWords) {
      const wordDuration = (rw.length / totalChars) * lineDuration;
      wordsWithTiming.push({
        word: rw,
        start: currentLine.time + elapsed,
        duration: wordDuration,
      });
      elapsed += wordDuration;
    }

    currentLine.words = wordsWithTiming;
  }

  return parsedLines;
}

function parsePlainLyrics(lyricsText: string): LyricLine[] {
  if (!lyricsText) return [];

  return lyricsText
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ time: 0, text, words: [] }));
}

const initialDefaultProfile: UserProfile = {
  id: 'default',
  displayName: DEFAULT_PROFILE_DISPLAY_NAME,
  bio: 'Chasing the craziest tunes.',
  gradient: PRESET_GRADIENTS[0],
  songsPlayed: 0,
  joinedAt: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long' }),
  likedTracks: [],
  likedTrackDetails: {},
  customPlaylists: [],
  history: []
};

const createUserProfileId = () => 'profile_' + Date.now();

function saveProfilesToStorage(profiles: UserProfile[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("spice_profiles_list", JSON.stringify(profiles));
  } catch (error: any) {
    if (error.name === "QuotaExceededError" || error.message.toLowerCase().includes("quota")) {
      console.warn("Storage quota exceeded, shrinking profiles list...");
      const shrinkTrack = (t: Track) => ({
        id: t.id,
        title: t.title,
        artists: t.artists,
        sourceId: t.sourceId
      } as Track);
      const shrunkenProfiles = profiles.map(profile => {
        const newLikedTrackDetails: Record<string, Track> = {};
        for (const [id, t] of Object.entries(profile.likedTrackDetails || {})) {
          newLikedTrackDetails[id] = shrinkTrack(t);
        }
        return {
          ...profile,
          history: (profile.history || []).map(shrinkTrack),
          customPlaylists: (profile.customPlaylists || []).map(p => ({
            ...p,
            tracks: (p.tracks || []).map(shrinkTrack)
          })),
          likedTrackDetails: newLikedTrackDetails
        };
      });
      try {
        localStorage.setItem("spice_profiles_list", JSON.stringify(shrunkenProfiles));
      } catch (err) {
        console.error("Still exceeded quota after shrinking profiles", err);
      }
    } else {
      console.error("Failed to save profiles to storage", error);
    }
  }
}

export default function SpiceApp() {
  const [volumeBoosterAccepted, setVolumeBoosterAccepted] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [currentPage, setCurrentPage] = useState<AppPage>('search');
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const logDebug = useCallback((category: string, message: string) => {
    const time = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev.slice(-99), `[${time}] [${category.toUpperCase()}] ${message}`]);
  }, []);

  // Settings Configuration states
  const [accentTheme, setAccentTheme] = useState<AccentTheme>('deeppurple');
  const [customThemePalette, setCustomThemePalette] = useState<ThemePalette>(() => ({
    ...DEFAULT_PURPLE_PALETTE,
    colors: { ...DEFAULT_PURPLE_PALETTE.colors },
  }));
  const [customThemeEnabled, setCustomThemeEnabled] = useState(false);
  const [visualSurface, setVisualSurface] = useState<VisualSurface>('midnight');
  const [artworkShape, setArtworkShape] = useState<ArtworkShape>('rounded');
  const [motionLevel, setMotionLevel] = useState<MotionLevel>('full');
  const [interfaceScale, setInterfaceScale] = useState<InterfaceScale>('comfortable');
  const [topbarLayout, setTopbarLayout] = useState<TopbarLayout>('embedded');
  const [audioQuality, setAudioQuality] = useState<'standard' | 'high' | 'low'>('standard');
  const [streamProtocol, setStreamProtocol] = useState<StreamProtocol>('proxy');
  const [playbackProfileState, setPlaybackProfileState] = useState<PlaybackProfileState>(() => normalizePlaybackProfileState(null));
  const activePlaybackProfile = playbackProfileState.profiles.find((profile) => profile.id === playbackProfileState.activeProfileId)
    ?? playbackProfileState.profiles[0];
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sidebarSearchEnabled, setSidebarSearchEnabled] = useState(true);
  const [sidebarProfileEnabled, setSidebarProfileEnabled] = useState(true);
  const [sidebarSettingsEnabled, setSidebarSettingsEnabled] = useState(true);
  const [desktopUpdaterAvailable, setDesktopUpdaterAvailable] = useState(false);
  const [desktopStartOnBoot, setDesktopStartOnBoot] = useState<DesktopStartOnBootPreference | null>(null);
  const [desktopStartOnBootMessage, setDesktopStartOnBootMessage] = useState<string | null>(null);
  const [nativeShellAvailable, setNativeShellAvailable] = useState(false);
  const [nativeShellSettings, setNativeShellSettings] = useState<NativeShellPreferences | null>(null);
  const [nativeShellCssDraft, setNativeShellCssDraft] = useState('');
  const [nativeShellMessage, setNativeShellMessage] = useState<string | null>(null);
  const [nativeShellBusy, setNativeShellBusy] = useState<string | null>(null);
  const [nativeUpdateStatus, setNativeUpdateStatus] = useState<NativeShellUpdateStatus | null>(null);
  const [profileSyncEnabled, setProfileSyncEnabled] = useState(false);
  const [lastFmSessionKey, setLastFmSessionKey] = useState('');
  const [lastFmAccountLinked, setLastFmAccountLinked] = useState(false);
  const [lastFmLinkedUser, setLastFmLinkedUser] = useState('');
  const [lastFmLinkStatus, setLastFmLinkStatus] = useState<string | null>(null);
  const [lastFmPlaybackStatus, setLastFmPlaybackStatus] = useState<string | null>(null);
  const [isLinkingLastFm, setIsLinkingLastFm] = useState(false);
  const [listenBrainzToken, setListenBrainzToken] = useState('');
  const [listenBrainzAccountLinked, setListenBrainzAccountLinked] = useState(false);
  const [listenBrainzLinkStatus, setListenBrainzLinkStatus] = useState<string | null>(null);
  const listenBrainzSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const migratedLegacyListenBrainzRef = useRef(false);
  const [profileSyncStatus, setProfileSyncStatus] = useState<ProfileSyncStatus>('idle');
  const [showQueueDrawer, setShowQueueDrawer] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [spiceNotices, setSpiceNotices] = useState<SpiceNotice[]>([]);
  const [spiceConfirm, setSpiceConfirm] = useState<SpiceConfirmDialog | null>(null);
  const [songShareDialog, setSongShareDialog] = useState<SongShareDialog | null>(null);
  const [offlineLibraryEntries, setOfflineLibraryEntries] = useState<DesktopOfflineLibraryEntry[]>([]);
  const [offlineLibraryDirectory, setOfflineLibraryDirectory] = useState('');
  const [offlineLibraryBridgeState, setOfflineLibraryBridgeState] = useState<
    'checking' | 'available' | 'unavailable' | 'error'
  >('checking');
  const offlineLibraryTotalBytes = useMemo(
    () => offlineLibraryEntries.reduce((total, entry) => total + Math.max(0, entry.bytes || 0), 0),
    [offlineLibraryEntries],
  );
  const [offlineDownloadTrackId, setOfflineDownloadTrackId] = useState<string | null>(null);
  const offlineDownloadTrackIdRef = useRef<string | null>(null);
  const [playlistDownloadProgress, setPlaylistDownloadProgress] = useState<{
    playlistId: string;
    completed: number;
    total: number;
  } | null>(null);
  const playlistDownloadCancelledRef = useRef(false);
  const desktopMediaRuntimeReadyRef = useRef(false);
  const activeNoticeTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const activePlaybackProfileRef = useRef(activePlaybackProfile);

  useEffect(() => {
    activePlaybackProfileRef.current = activePlaybackProfile;
  }, [activePlaybackProfile]);

  useEffect(() => {
    const handleCommandPaletteShortcut = (event: KeyboardEvent) => {
      if (!isCommandPaletteShortcut(event)) return;
      event.preventDefault();
      setCommandPaletteOpen((current) => !current);
    };
    window.addEventListener('keydown', handleCommandPaletteShortcut);
    return () => window.removeEventListener('keydown', handleCommandPaletteShortcut);
  }, []);

  useEffect(() => {
    const bridge = getSpiceDesktopUpdaterBridge();
    if (!bridge) return;

    setDesktopUpdaterAvailable(true);
    if (bridge.getStartOnBoot) {
      void bridge.getStartOnBoot()
        .then(setDesktopStartOnBoot)
        .catch(() => setDesktopStartOnBoot(null));
    }
    const removeUpdateListener = bridge.onUpdateStatus((status) => {
      setNativeUpdateStatus(status);
      if (status.status !== 'checking' && status.status !== 'downloading') {
        setNativeShellBusy((current) => current === 'updates' ? null : current);
      }
    });

    return () => removeUpdateListener();
  }, []);

  useEffect(() => {
    const bridge = getSpiceNativeShellBridge();
    if (!bridge) return;

    let active = true;
    bridge.getSettings()
      .then((settings) => {
        if (!active || !settings.nativeMode) return;
        setNativeShellAvailable(true);
        setNativeShellSettings(settings);
        setNativeShellCssDraft(settings.customCss || '');
      })
      .catch((error) => {
        if (active) setNativeShellMessage(`Could not load Native shell settings: ${error instanceof Error ? error.message : String(error)}`);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const keepSelectWheelScrolling = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target.closest('select') : null;
      if (!(target instanceof HTMLSelectElement)) return;

      event.preventDefault();
      target.blur();
      const scrollContainer = target.closest<HTMLElement>('.main');
      if (scrollContainer) {
        scrollContainer.scrollBy({ top: event.deltaY, behavior: 'auto' });
      }
    };

    document.addEventListener('wheel', keepSelectWheelScrolling, { passive: false, capture: true });
    return () => document.removeEventListener('wheel', keepSelectWheelScrolling, { capture: true });
  }, []);

  const dismissSpiceNotice = useCallback((id: number) => {
    const timer = activeNoticeTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      activeNoticeTimersRef.current.delete(id);
    }
    setSpiceNotices((prev) => prev.filter((notice) => notice.id !== id));
  }, []);

  const showSpiceNotice = useCallback((message: string, kind: SpiceNoticeKind = 'info') => {
    const id = Date.now() + getSecureRandom();
    setSpiceNotices((prev) => {
      const next = prev.length >= 2 ? prev.slice(1) : prev;
      return [...next, { id, message, kind }];
    });

    const timer = setTimeout(() => {
      setSpiceNotices((prev) => prev.filter((notice) => notice.id !== id));
      activeNoticeTimersRef.current.delete(id);
    }, 4200);
    activeNoticeTimersRef.current.set(id, timer);
  }, []);

  const copyTextToClipboard = useCallback(async (text: string) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall back to a temporary selection for browsers without clipboard permission.
      }
    }

    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.setAttribute('readonly', 'true');
      textArea.style.position = 'fixed';
      textArea.style.top = '-1000px';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textArea);
      return copied;
    } catch {
      return false;
    }
  }, []);

  const shareSongLink = useCallback((track: Track, event?: React.MouseEvent<HTMLElement>) => {
    event?.stopPropagation();

    if (!track || track.id === 'placeholder' || track.id === 'spice-connect-placeholder') {
      showSpiceNotice('Choose a song before sharing.', 'warning');
      return;
    }

    setSongShareDialog({ track, shareUrl: profileOriginUrl(track) || buildSongShareUrl(track) });
  }, [showSpiceNotice]);

  const copySongShareLink = useCallback(async () => {
    if (!songShareDialog) return;
    const copied = await copyTextToClipboard(songShareDialog.shareUrl);
    if (copied) {
      showSpiceNotice(`Song link copied for "${songShareDialog.track.title}".`, 'success');
      setSongShareDialog(null);
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: songShareDialog.track.title,
          text: `${songShareDialog.track.title} - ${profileArtistName(songShareDialog.track)}`,
          url: songShareDialog.shareUrl,
        });
        showSpiceNotice('Song link opened in your share sheet.', 'success');
        setSongShareDialog(null);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    showSpiceNotice('Could not copy the song link from this browser.', 'warning');
  }, [copyTextToClipboard, showSpiceNotice, songShareDialog]);

  const refreshOfflineLibrary = useCallback(async () => {
    const bridge = getSpiceDesktopOfflineLibraryBridge();
    if (!bridge) {
      setOfflineLibraryBridgeState('unavailable');
      return false;
    }
    try {
      const snapshot = await bridge.list();
      setOfflineLibraryDirectory(snapshot.directory);
      setOfflineLibraryEntries(Array.isArray(snapshot.tracks) ? snapshot.tracks : []);
      setOfflineLibraryBridgeState('available');
      return true;
    } catch (error) {
      setOfflineLibraryBridgeState('error');
      throw error;
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const detectBridge = () => {
      if (disposed) return;
      const bridge = getSpiceDesktopOfflineLibraryBridge();
      if (bridge) {
        void refreshOfflineLibrary().catch((error) => {
          logDebug('error', `Offline library could not be loaded: ${error instanceof Error ? error.message : error}`);
        });
        return;
      }
      attempts += 1;
      if (attempts >= 10) {
        setOfflineLibraryBridgeState('unavailable');
        return;
      }
      retryTimer = setTimeout(detectBridge, 200);
    };
    const handleBridgeReady = () => detectBridge();
    window.addEventListener('spice-desktop-bridge-ready', handleBridgeReady);
    detectBridge();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('spice-desktop-bridge-ready', handleBridgeReady);
    };
  }, [logDebug, refreshOfflineLibrary]);

  const fetchTrackDownloadBlob = useCallback(async (track: Track) => {
    if (isOfflineTrack(track)) throw new Error('This song is already in the offline library.');
    const directUrl = directAudioDownloadUrl(track);
    if (directUrl && extensionFromAudioUrl(directUrl) === 'mp3') {
      try {
        const directResponse = await fetch(directUrl);
        if (directResponse.ok) return directResponse.blob();
      } catch {
        // Fall through to the same-origin resolver when a provider blocks CORS.
      }
    }

    const runtimeBridge = getSpiceDesktopRuntimeBridge();
    if (SPICE_RUNTIME_TARGET === 'vercel' && runtimeBridge && !desktopMediaRuntimeReadyRef.current) {
      try {
        const runtime = await runtimeBridge.prepare();
        if (!runtime?.running) {
          throw new Error('The SPICE local media runtime could not be started.');
        }
        desktopMediaRuntimeReadyRef.current = true;
      } catch (error) {
        desktopMediaRuntimeReadyRef.current = false;
        throw error;
      }
    }

    const trackEndpoint = isSoundCloudTrack(track)
      ? spiceApiUrl('local', `/sc/track/${encodeURIComponent(soundCloudTrackId(track))}`, { quality: audioQuality })
      : spiceApiUrl('local', `/yt/track/${encodeURIComponent(track.id)}`);
    let response: Response;
    try {
      response = await fetch(trackEndpoint);
    } catch {
      desktopMediaRuntimeReadyRef.current = false;
      throw new Error(
        runtimeBridge
          ? 'The SPICE local media runtime is not reachable. Retry the download to start it again.'
          : 'The SPICE local media runtime is not running. Open this song in SPICE Desktop and retry.',
      );
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.message || 'Failed to resolve the audio download.');
    }
    const data = await response.json();
    const stream = data.streamUrl || data.streams?.find((entry: { url?: string }) => entry.url)?.url;
    if (!stream) throw new Error('No downloadable audio stream is available.');

    const finalUrl = new URL(
      spiceApiResponseUrl('local', stream),
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    );
    finalUrl.searchParams.set('download', 'true');
    finalUrl.searchParams.set('format', 'mp3');
    finalUrl.searchParams.set('title', sanitizeDownloadName(track));
    let downloadResponse: Response;
    try {
      downloadResponse = await fetch(finalUrl.toString());
    } catch {
      desktopMediaRuntimeReadyRef.current = false;
      throw new Error('The local MP3 converter could not be reached. Retry the download.');
    }
    if (!downloadResponse.ok) {
      const payload = await downloadResponse.json().catch(() => ({}));
      throw new Error(payload?.message || 'The audio could not be converted to MP3.');
    }
    try {
      return await downloadResponse.blob();
    } catch {
      desktopMediaRuntimeReadyRef.current = false;
      throw new Error('The MP3 conversion stopped before the download finished. Retry the download.');
    }
  }, [audioQuality]);

  const saveTrackDownload = useCallback(async (track: Track) => {
    const blob = await fetchTrackDownloadBlob(track);
    const fileName = `${sanitizeDownloadName(track)}.mp3`;
    const bridge = getSpiceDesktopOfflineLibraryBridge();
    if (bridge) {
      await bridge.save(fileName, await blob.arrayBuffer(), track);
      await refreshOfflineLibrary();
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }, [fetchTrackDownloadBlob, refreshOfflineLibrary]);

  const downloadTrackToOfflineLibrary = useCallback(async (track: Track, quiet = false) => {
    if (offlineDownloadTrackIdRef.current) throw new Error('Another song is already downloading.');
    offlineDownloadTrackIdRef.current = track.id;
    setOfflineDownloadTrackId(track.id);
    if (!quiet) showSpiceNotice(`Preparing "${track.title}" for offline listening...`, 'info');
    try {
      await saveTrackDownload(track);
      if (!quiet) {
        showSpiceNotice(
          getSpiceDesktopOfflineLibraryBridge()
            ? `Saved "${track.title}" to your Spice offline library.`
            : `Downloaded "${track.title}" as MP3.`,
          'success',
        );
      }
    } finally {
      offlineDownloadTrackIdRef.current = null;
      setOfflineDownloadTrackId(null);
    }
  }, [saveTrackDownload, showSpiceNotice]);

  const downloadSharedSong = useCallback(async () => {
    if (!songShareDialog) return;
    try {
      await downloadTrackToOfflineLibrary(songShareDialog.track);
      setSongShareDialog(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logDebug('error', `Download stream failed: ${message}`);
      showSpiceNotice(`Failed to download audio: ${message}`, 'danger');
    }
  }, [downloadTrackToOfflineLibrary, logDebug, showSpiceNotice, songShareDialog]);

  const openSongSource = useCallback(() => {
    if (!songShareDialog) return;
    const sourceUrl = profileOriginUrl(songShareDialog.track);
    if (!sourceUrl) {
      showSpiceNotice('No source link is available for this song.', 'warning');
      return;
    }
    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
  }, [showSpiceNotice, songShareDialog]);

  const renderSongShareButton = (
    track: Track,
    className = 'library-item__action library-item__action--share',
  ) => (
    <button
      type="button"
      className={className}
      onClick={(event) => shareSongLink(track, event)}
      disabled={!track || track.id === 'placeholder' || track.id === 'spice-connect-placeholder'}
      title={`Share "${track.title}"`}
      aria-label={`Share ${track.title}`}
    >
      {Icons.share}
    </button>
  );

  const requestSpiceConfirm = useCallback((dialog: SpiceConfirmDialog) => {
    setSpiceConfirm(dialog);
  }, []);

  const cancelSpiceConfirm = useCallback(() => {
    setSpiceConfirm(null);
  }, []);

  useEffect(() => () => {
    activeNoticeTimersRef.current.forEach((timer) => clearTimeout(timer));
    activeNoticeTimersRef.current.clear();
  }, []);

  // Feedback System states
  const [feedbackCategory, setFeedbackCategory] = useState('general');
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [playedTracksCount, setPlayedTracksCount] = useState(0);
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);

  // ── Multi-Profile Accounts Setup ──────────────────────────────────
  const [profiles, setProfiles] = useState<UserProfile[]>([initialDefaultProfile]);
  const [activeProfileId, setActiveProfileId] = useState<string>('default');
  const [isProfileHydrated, setIsProfileHydrated] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState('theme-accent');

  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0] || initialDefaultProfile;
  const [recommendationPreferences, setRecommendationPreferences] = useState<RecommendationPreferences>(() => (
    normalizeRecommendationPreferences(readStoredJson(recommendationPreferencesStorageKey('default')))
  ));
  const [listeningEvents, setListeningEvents] = useState<ListeningEvent[]>(() => (
    normalizeListeningEvents(readStoredJson(listeningEventsStorageKey('default')))
  ));
  const adaptiveTrackPriorityRef = useRef<AdaptiveTrackPriorityState>(
    normalizeAdaptiveTrackPriorityState(readStoredJson(adaptiveTrackPriorityStorageKey('default'))),
  );
  const [adaptiveTasteScores, setAdaptiveTasteScores] = useState<Record<string, number>>(
    () => adaptiveTasteSkipScores(
      normalizeAdaptiveTrackPriorityState(readStoredJson(adaptiveTrackPriorityStorageKey('default'))),
    ),
  );
  const [listenersLikeYou, setListenersLikeYou] = useState<{ tracks: Track[]; neighborCount: number } | null>(null);
  const [collaborativeTasteScores, setCollaborativeTasteScores] = useState<Record<string, number>>({});
  const adaptiveListenCycleRef = useRef<{
    trackKey: string;
    completionDisqualified: boolean;
  } | null>(null);
  const adaptivePlaybackStartedRef = useRef<(track: Track) => void>(() => undefined);
  const [syncOutboxItems, setSyncOutboxItems] = useState<SyncOutboxItem<SyncOutboxPayload>[]>([]);

  const weeklyListeningRecap = useMemo(
    () => buildWeeklyListeningRecap(listeningEvents),
    [listeningEvents],
  );

  useEffect(() => {
    setRecommendationPreferences(normalizeRecommendationPreferences(
      readStoredJson(recommendationPreferencesStorageKey(activeProfileId)),
    ));
    setListeningEvents(normalizeListeningEvents(
      readStoredJson(listeningEventsStorageKey(activeProfileId)),
    ));
    const nextAdaptiveState = normalizeAdaptiveTrackPriorityState(
      readStoredJson(adaptiveTrackPriorityStorageKey(activeProfileId)),
    );
    adaptiveTrackPriorityRef.current = nextAdaptiveState;
    setAdaptiveTasteScores(adaptiveTasteSkipScores(nextAdaptiveState));
    adaptiveListenCycleRef.current = null;
  }, [activeProfileId]);

  // Security Locking
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const activeId = localStorage.getItem('spice_active_profile_id') || 'default';
      const saved = localStorage.getItem('spice_profiles_list');
      if (saved) {
        try {
          const list: UserProfile[] = JSON.parse(saved);
          const found = list.find(p => p.id === activeId);
          return !!found?.passcode;
        } catch (e) {
          console.error(e);
        }
      }
    }
    return false;
  });
  const [passcodeInput, setPasscodeInput] = useState<string>('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);

  // Profile management dialogs
  const [showCreateProfileDialog, setShowCreateProfileDialog] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileBio, setNewProfileBio] = useState('');
  const [newProfileGradient, setNewProfileGradient] = useState(PRESET_GRADIENTS[0]);
  const [newProfilePasscode, setNewProfilePasscode] = useState('');
  const [newProfileAvatarUrl, setNewProfileAvatarUrl] = useState('');

  // ── Music Core State (Decoupled & Bound to Active Profile) ────────
  const [currentTrack, setCurrentTrack] = useState<Track>(IDLE_PLAYER_TRACK);

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [remotePlaybackClock, setRemotePlaybackClock] = useState(() => currentTimestampMs());
  const [volume, setVolume] = useState(70);

  // States synchronized to the Active Profile
  const [likedTracks, setLikedTracks] = useState<Set<string>>(new Set(activeProfile.likedTracks));
  const [likedTrackDetails, setLikedTrackDetails] = useState<Record<string, Track>>(activeProfile.likedTrackDetails || {});
  const [customPlaylists, setCustomPlaylists] = useState<Playlist[]>(activeProfile.customPlaylists || []);
  const likedTracksRef = useRef(likedTracks);
  const likedTrackDetailsRef = useRef(likedTrackDetails);
  const customPlaylistsRef = useRef(customPlaylists);
  const [history, setHistory] = useState<Track[]>(activeProfile.history || []);
  const [queue, setQueue] = useState<Track[]>([IDLE_PLAYER_TRACK]);
  const [queueIndex, setQueueIndex] = useState(0);

  useEffect(() => {
    likedTracksRef.current = likedTracks;
    likedTrackDetailsRef.current = likedTrackDetails;
    customPlaylistsRef.current = customPlaylists;
  }, [customPlaylists, likedTrackDetails, likedTracks]);

  const homeHistoryShelves = useMemo(
    () => buildHomeHistoryShelves(history),
    [history],
  );

  const privateTasteProfile = useMemo(() => buildPrivateTasteProfile({
    history,
    likedTracks: Object.values(likedTrackDetails),
    playlists: customPlaylists,
    skipSignal: { trackScores: adaptiveTasteScores },
    listeningEvents,
  }), [history, likedTrackDetails, customPlaylists, listeningEvents, adaptiveTasteScores]);

  // The shared affinity context every taste-aware surface consumes: home
  // shelves, search ordering, the For You filter, Smart Mix, and radio.
  const tasteAffinityContext = useMemo(() => ({
    profile: privateTasteProfile,
    preferences: recommendationPreferences,
    adaptiveScores: adaptiveTasteScores,
    likedTrackKeys: likedTracks,
    recentTrackKeys: new Set(history.slice(0, 6).map(playbackTrackKey)),
    collaborativeScores: collaborativeTasteScores,
  }), [privateTasteProfile, recommendationPreferences, adaptiveTasteScores, likedTracks, history, collaborativeTasteScores]);

  const [libraryView, setLibraryView] = useState<'list' | 'grid'>('list');
  const [libraryFilter, setLibraryFilter] = useState<'playlists' | 'shared' | 'liked' | 'history' | 'downloads'>('playlists');

  useEffect(() => {
    if (libraryFilter !== 'downloads' || offlineLibraryBridgeState !== 'available') return;
    const refreshVisibleLibrary = () => {
      if (document.visibilityState === 'visible') {
        void refreshOfflineLibrary().catch((refreshError) => {
          logDebug(
            'error',
            `Offline library refresh failed: ${refreshError instanceof Error ? refreshError.message : refreshError}`,
          );
        });
      }
    };
    const refreshInterval = window.setInterval(refreshVisibleLibrary, 15_000);
    window.addEventListener('focus', refreshVisibleLibrary);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener('focus', refreshVisibleLibrary);
    };
  }, [libraryFilter, logDebug, offlineLibraryBridgeState, refreshOfflineLibrary]);

  // Sync profile details when changing profile
  const [editName, setEditName] = useState(activeProfile.displayName);
  const [editBio, setEditBio] = useState(activeProfile.bio);
  const [editGradient, setEditGradient] = useState(activeProfile.gradient);
  const [editPasscode, setEditPasscode] = useState(activeProfile.passcode || '');
  const [editAvatarUrl, setEditAvatarUrl] = useState(activeProfile.avatarUrl || '');
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Transfer Tool states
  const [ytPlaylistLink, setYtPlaylistLink] = useState('');
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false);
  const [playlistImportError, setPlaylistImportError] = useState<string | null>(null);
  const [playlistImportSuccess, setPlaylistImportSuccess] = useState<string | null>(null);

  const [jsonImportText, setJsonImportText] = useState('');
  const [_jsonBackupStatus, setJsonBackupStatus] = useState<'success' | 'error' | null>(null);

  // Dialog & Form states for Playlists
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newPlTitle, setNewPlTitle] = useState('');
  const [newPlDesc, setNewPlDesc] = useState('');
  const [playlistPickerTrack, setPlaylistPickerTrack] = useState<Track | null>(null);
  const [playlistPickerSavingId, setPlaylistPickerSavingId] = useState<string | null>(null);
  const [newPlaylistSeedTrack, setNewPlaylistSeedTrack] = useState<Track | null>(null);
  const [showEditPlaylistDialog, setShowEditPlaylistDialog] = useState(false);
  const [editPlTitle, setEditPlTitle] = useState('');
  const [editPlDesc, setEditPlDesc] = useState('');
  const [editPlGradient, setEditPlGradient] = useState('');
  const [editPlCoverUrl, setEditPlCoverUrl] = useState('');
  const [newPlIsPublic, setNewPlIsPublic] = useState(true);
  const [editPlIsPublic, setEditPlIsPublic] = useState(true);
  const [searchTab, setSearchTab] = useState<'tracks' | 'users'>('tracks');
  const [searchForYouOnly, setSearchForYouOnly] = useState<boolean>(() => {
    try {
      return localStorage.getItem('spice_search_for_you') === 'true';
    } catch {
      return false;
    }
  });
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [selectedUserProfileData, setSelectedUserProfileData] = useState<any | null>(null);
  const [myLikesCount, setMyLikesCount] = useState<number>(0);
  const [isLoadingUserProfile, setIsLoadingUserProfile] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Listen Together State
  const [listenTogetherSession, setListenTogetherSession] = useState<{ id: string } | null>(null);
  const [listenTogetherHostSessionId, setListenTogetherHostSessionId] = useState<string | null>(null);
  const [listenTogetherHostName, setListenTogetherHostName] = useState<string | null>(null);
  const [pendingListenInvites, setPendingListenInvites] = useState<any[]>([]);
  const [listenTogetherDialogOpen, setListenTogetherDialogOpen] = useState(false);
  const [listenTogetherInviteUsername, setListenTogetherInviteUsername] = useState('');
  const [listenTogetherJoinSessionId, setListenTogetherJoinSessionId] = useState('');
  const [listenTogetherInvitesList, setListenTogetherInvitesList] = useState<any[]>([]);
  const [isSendingListenTogetherInvite, setIsSendingListenTogetherInvite] = useState(false);
  const [listenTogetherStatus, setListenTogetherStatus] = useState('Ready to start or join a session.');

  useEffect(() => {
    const handleDesktopNavigation = (event: Event) => {
      const detail = (event as CustomEvent<SpiceDesktopNavigationDetail>).detail;
      if (!detail || detail.handled) return;

      if (detail.action === 'home') {
        setSelectedPlaylist(null);
        setSelectedUser(null);
        setCurrentPage('home');
        detail.handled = true;
        return;
      }

      if (detail.action === 'settings') {
        setSelectedPlaylist(null);
        setSelectedUser(null);
        setCurrentPage('settings');
        detail.handled = true;
        return;
      }

      if (detail.action !== 'back') return;

      if (selectedPlaylist) {
        setSelectedPlaylist(null);
      } else if (selectedUser) {
        setSelectedUser(null);
      } else if (currentPage !== 'home') {
        setCurrentPage('home');
      } else {
        return;
      }

      detail.handled = true;
    };

    window.addEventListener('spice-desktop-navigation', handleDesktopNavigation);
    return () => window.removeEventListener('spice-desktop-navigation', handleDesktopNavigation);
  }, [currentPage, selectedPlaylist, selectedUser]);
  const [isCreatingListenTogetherSession, setIsCreatingListenTogetherSession] = useState(false);

  const [sharingPlaylistId, setSharingPlaylistId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [invitePreview, setInvitePreview] = useState<PlaylistInvitePreview | null>(null);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [acceptingInvite, setAcceptingInvite] = useState(false);

  // Username & Shared Playlist Collaboration state
  const [cloudUsername, setCloudUsername] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return readCloudSessionFromStorage<CloudAccount>(
        localStorage,
        localStorage.getItem('spice_active_profile_id') || 'default',
      ).username;
    }
    return null;
  });

  const [editUsername, setEditUsername] = useState(cloudUsername || '');
  const [usernameError, setUsernameError] = useState<string | null>(null);


  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [pendingInvitesLoading, setPendingInvitesLoading] = useState(false);
  const [notificationTrayOpen, setNotificationTrayOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [selectedReleaseNotification, setSelectedReleaseNotification] = useState<ReleaseNotification | null>(null);
  const [readReleaseNotificationIds, setReadReleaseNotificationIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(RELEASE_NOTIFICATION_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const [releaseNotifications, setReleaseNotifications] = useState<ReleaseNotification[]>([]);

  useEffect(() => {
    spiceFetch('cloud', '/notifications/release')
      .then(res => res.json())
      .then(data => {
        if (data.notifications && Array.isArray(data.notifications)) {
          setReleaseNotifications(data.notifications);
        }
      })
      .catch(() => { });
  }, []);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersList, setMembersList] = useState<{ owner: PlaylistMember; members: PlaylistMember[]; maxMembers: number } | null>(null);
  const [inviteUsername, setInviteUsername] = useState('');
  const [invitingMember, setInvitingMember] = useState(false);
  const [memberActionStatus, setMemberActionStatus] = useState<string | null>(null);
  const [showCreateSharedDialog, setShowCreateSharedDialog] = useState(false);
  const [newSharedPlTitle, setNewSharedPlTitle] = useState('');
  const [newSharedPlDesc, setNewSharedPlDesc] = useState('');

  // Cloud Sync & Accounts state
  const [cloudToken, setCloudToken] = useState<string | null>(null);
  const [pairedRemoteCredential, setPairedRemoteCredential] = useState<StoredRemotePairingCredential | null>(() => (
    loadRemotePairingCredential(typeof window === 'undefined' ? 'default' : localStorage.getItem('spice_active_profile_id') || 'default')
  ));
  const [cloudUser, setCloudUser] = useState<CloudAccount | null>(() => {
    if (typeof window !== 'undefined') {
      return readCloudSessionFromStorage<CloudAccount>(
        localStorage,
        localStorage.getItem('spice_active_profile_id') || 'default',
      ).user;
    }
    return null;
  });
  const [syncingStatus, setSyncingStatus] = useState<'idle' | 'syncing' | 'success' | 'partial' | 'error' | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [accountBlock, setAccountBlock] = useState<AccountBlockState | null>(null);
  const [isLocalDbFallback, setIsLocalDbFallback] = useState<boolean>(false);
  const [remoteControlEnabled, setRemoteControlEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return spiceConnectEnabledFromStorage(localStorage.getItem('spice_remote_control_enabled'));
    }
    return false;
  });
  const [remoteRealtimeConnected, setRemoteRealtimeConnected] = useState(false);
  const [remoteDeviceId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('spice_remote_device_id');
      if (saved) return saved;
      const created = createRemoteDeviceId();
      localStorage.setItem('spice_remote_device_id', created);
      return created;
    }
    return 'server-device';
  });
  const activePairedRemoteCredential = pairedRemoteCredential?.deviceId === remoteDeviceId
    ? pairedRemoteCredential
    : null;
  const remoteAuthToken = activePairedRemoteCredential?.token || cloudToken;
  const [remoteDeviceName, setRemoteDeviceName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('spice_remote_device_name') || defaultRemoteDeviceName();
    }
    return 'Spice Connect Device';
  });
  const [remoteDevices, setRemoteDevices] = useState<RemoteDevice[]>([]);
  const [selectedRemoteDeviceId, setSelectedRemoteDeviceId] = useState(() => (
    typeof window === 'undefined' ? '' : localStorage.getItem('spice_connect_receiver_id') || ''
  ));
  const [incomingRemoteControllerId, setIncomingRemoteControllerId] = useState('');
  const [remoteStatus, setRemoteStatus] = useState<string | null>(null);
  const [remoteTransport, setRemoteTransport] = useState<'unknown' | 'redis' | 'postgresql'>('unknown');
  const [remoteLanPeerDeviceIds, setRemoteLanPeerDeviceIds] = useState<string[]>([]);
  const [remoteTransportDiagnosticsEnabled, setRemoteTransportDiagnosticsEnabled] = useState(false);
  const [remoteTransportDiagnostic, setRemoteTransportDiagnostic] = useState<SpiceConnectTransportDiagnostic | null>(null);
  const [remoteLanLatencyMsByDevice, setRemoteLanLatencyMsByDevice] = useState<Record<string, number>>({});
  const [remoteRedisConfigured, setRemoteRedisConfigured] = useState<boolean | null>(null);
  const [forgettingRemoteDeviceIds, setForgettingRemoteDeviceIds] = useState<Set<string>>(new Set());
  const [receiverMenuOpen, setReceiverMenuOpen] = useState<ReceiverSelectVariant | null>(null);
  const [playerPlacement, setPlayerPlacement] = useState<'bottom' | 'top'>('bottom');
  const [playerViewMode, setPlayerViewMode] = useState<'bar' | 'expanded' | 'mini'>('bar');
  const [playerBarDensity, setPlayerBarDensity] = useState<PlayerBarDensity>('standard');
  const [playerVisualStyle, setPlayerVisualStyle] = useState<PlayerVisualStyle>('spice');
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [miniPlayerPos, setMiniPlayerPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingMini, setIsDraggingMini] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'all' | 'one'>('all');
  const [expandedTab, setExpandedTab] = useState<'controls' | 'queue' | 'lyrics'>('controls');

  useEffect(() => {
    if (localStorage.getItem(SPICE_CONNECT_TRANSPORT_DIAGNOSTICS_STORAGE_KEY) === 'true') {
      setRemoteTransportDiagnosticsEnabled(true);
    }
    const toggleSpiceConnectTransportDiagnostics = (event: KeyboardEvent) => {
      if (
        event.code !== 'KeyL'
        || !event.ctrlKey
        || !event.shiftKey
        || !event.altKey
        || event.repeat
      ) return;
      event.preventDefault();
      setRemoteTransportDiagnosticsEnabled((enabled) => {
        const nextEnabled = !enabled;
        localStorage.setItem(
          SPICE_CONNECT_TRANSPORT_DIAGNOSTICS_STORAGE_KEY,
          String(nextEnabled),
        );
        setRemoteStatus(
          nextEnabled
            ? 'Secret Spice Connect transport diagnostics enabled.'
            : 'Spice Connect transport diagnostics hidden.',
        );
        return nextEnabled;
      });
    };
    window.addEventListener('keydown', toggleSpiceConnectTransportDiagnostics);
    return () => window.removeEventListener('keydown', toggleSpiceConnectTransportDiagnostics);
  }, []);

  // Dynamic Lyrics & Karaoke states
  const [lyricsData, setLyricsData] = useState<{
    lines: LyricLine[];
    plainLyrics: string;
    syncedLyrics: string;
    isSynced: boolean;
  } | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [isKaraokeMode, setIsKaraokeMode] = useState(false);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const [showBarLyrics, setShowBarLyrics] = useState(false);
  const [showMiniLyrics, setShowMiniLyrics] = useState(false);
  const [showMiniQueue, setShowMiniQueue] = useState(false);
  const [showSyncEmail, setShowSyncEmail] = useState(false);
  const lastUnlockedProfileIdRef = useRef<string>('default');

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [emailVerification, setEmailVerification] = useState<{ registrationId: string; email: string } | null>(null);
  const [emailVerificationCode, setEmailVerificationCode] = useState('');

  // Dynamic Home Page Queries
  const [homeTrending, setHomeTrending] = useState<Track[]>([]);
  const [homeRecommended, setHomeRecommended] = useState<Track[]>([]);
  const [homeRecommendationShelves, setHomeRecommendationShelves] = useState<RecommendationShelf<Track>[]>([]);
  const [homeBecauseShelf, setHomeBecauseShelf] = useState<{ label: string; reason: string; tracks: Track[] } | null>(null);
  const [homeFreshFinds, setHomeFreshFinds] = useState<Track[]>([]);
  const [homeTimeMix, setHomeTimeMix] = useState<{ label: string; reason: string; tracks: Track[] } | null>(null);

  const listeningTimeProfile = useMemo(
    () => buildListeningTimeProfile(listeningEvents),
    [listeningEvents],
  );

  // "On repeat": the week's most-replayed tracks, straight from the on-device
  // listening log — no network needed.
  const onRepeatShelf = useMemo(() => {
    const entries = buildOnRepeatTracks(listeningEvents);
    if (entries.length < 3) return null;
    const tracks = enrichTrackSnapshots(entries.map((entry) => ({
      id: entry.trackId,
      sourceId: entry.sourceId,
      title: entry.title,
      artists: entry.artists.map((name) => ({ id: name, name })),
      msListened: Math.min(600_000, entry.listenedMs),
    }))) as Track[];
    if (tracks.length < 3) return null;
    return {
      label: 'On repeat',
      reason: 'The songs you kept coming back to this week.',
      tracks,
    };
  }, [listeningEvents]);
  const [homeRecommendationSeed, setHomeRecommendationSeed] = useState<import('./recommendations').RecommendationSeed | null>(null);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [isLoadingHome, setIsLoadingHome] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [topbarSearchQuery, setTopbarSearchQuery] = useState('');
  const [searchProvider, setSearchProvider] = useState<SearchProvider>('hybrid');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchResultsSource, setSearchResultsSource] = useState<'network' | 'cache' | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [topbarSearchTrayOpen, setTopbarSearchTrayOpen] = useState(false);
  const [quickSearchTab, setQuickSearchTab] = useState<'tracks' | 'users'>('tracks');
  const [topbarUserSearchResults, setTopbarUserSearchResults] = useState<any[]>([]);
  const [isSearchingTopbarUsers, setIsSearchingTopbarUsers] = useState(false);
  const [recentSearchEntries, setRecentSearchEntries] = useState<ReturnType<typeof getRecentCachedSearches>>([]);
  const topbarSearchShellRef = useRef<HTMLDivElement | null>(null);
  const topbarProfileShellRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!topbarSearchTrayOpen) return;

    const dismissTopbarSearch = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && topbarSearchShellRef.current?.contains(target)) return;
      setTopbarSearchTrayOpen(false);
    };

    document.addEventListener('pointerdown', dismissTopbarSearch);
    return () => document.removeEventListener('pointerdown', dismissTopbarSearch);
  }, [topbarSearchTrayOpen]);

  useEffect(() => {
    if (!profileMenuOpen) return;

    const dismissProfileMenu = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && topbarProfileShellRef.current?.contains(target)) return;
      setProfileMenuOpen(false);
    };
    const dismissProfileMenuWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };

    document.addEventListener('pointerdown', dismissProfileMenu);
    document.addEventListener('keydown', dismissProfileMenuWithKeyboard);
    return () => {
      document.removeEventListener('pointerdown', dismissProfileMenu);
      document.removeEventListener('keydown', dismissProfileMenuWithKeyboard);
    };
  }, [profileMenuOpen]);

  const [selfTestRunning, setSelfTestRunning] = useState(false);
  const [selfTestResults, setSelfTestResults] = useState<{
    api: 'passed' | 'failed' | null;
    db: 'passed' | 'failed' | 'disabled' | null;
    embed: 'passed' | 'failed' | null;
    latency: number | null;
  }>({ api: null, db: null, embed: null, latency: null });
  const [terminalFilter, setTerminalFilter] = useState('');
  const [terminalAutoScroll, setTerminalAutoScroll] = useState(true);
  const [logsCopied, setLogsCopied] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const launchIntentHandledRef = useRef(false);

  const applyLastFmSession = useCallback((sessionKey: string, linkedUser?: string, accountLinked?: boolean) => {
    const trimmedSessionKey = sessionKey.trim();
    if (!trimmedSessionKey) return;

    const resolvedUser = linkedUser?.trim() || 'Last.fm account';
    setLastFmSessionKey(trimmedSessionKey);
    setLastFmLinkedUser(resolvedUser);
    if (typeof accountLinked === 'boolean') {
      setLastFmAccountLinked(accountLinked);
      localStorage.setItem('spice_lastfm_account_linked', String(accountLinked));
    }
    setProfileSyncEnabled(true);
    setLastFmLinkStatus(`Linked ${resolvedUser}${accountLinked ? ' to your SPICE account' : ''}. Profile sync is enabled.`);
    localStorage.setItem('spice_lastfm_session_key', trimmedSessionKey);
    localStorage.setItem('spice_lastfm_linked_user', resolvedUser);
    localStorage.setItem('spice_profile_sync_enabled', 'true');
    localStorage.removeItem('spice_lastfm_link_token');
    localStorage.removeItem(LASTFM_CALLBACK_ORIGIN_STORAGE_KEY);
    logDebug('profile', `Last.fm linked as ${resolvedUser}.`);
  }, [logDebug]);

  const prevTerminalAutoScrollRef = useRef(terminalAutoScroll);

  useEffect(() => {
    const toggledOn = terminalAutoScroll && !prevTerminalAutoScrollRef.current;
    prevTerminalAutoScrollRef.current = terminalAutoScroll;

    if (terminalAutoScroll && terminalEndRef.current) {
      const parent = terminalEndRef.current.parentElement;
      if (parent) {
        const isNearBottom = parent.scrollHeight - parent.scrollTop - parent.clientHeight < 100;
        if (isNearBottom || toggledOn) {
          terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [debugLogs, terminalAutoScroll]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedLastFmMessageOrigin(event.origin)) return;

      const data = event.data as {
        type?: unknown;
        sessionKey?: unknown;
        name?: unknown;
        accountLinked?: unknown;
      } | null;
      if (data?.type !== 'spice:lastfm-linked' || typeof data.sessionKey !== 'string') return;

      applyLastFmSession(
        data.sessionKey,
        typeof data.name === 'string' ? data.name : undefined,
        typeof data.accountLinked === 'boolean' ? data.accountLinked : undefined,
      );
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'spice_lastfm_session_key' || !event.newValue) return;
      applyLastFmSession(
        event.newValue,
        localStorage.getItem('spice_lastfm_linked_user') || undefined,
        localStorage.getItem('spice_lastfm_account_linked') === 'true',
      );
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, [applyLastFmSession]);

  const runSelfTest = async () => {
    setSelfTestRunning(true);
    logDebug('diagnostics', 'Starting full-system diagnostics self-test...');

    let apiStatus: 'passed' | 'failed' = 'failed';
    let dbStatus: 'passed' | 'failed' | 'disabled' = 'disabled';
    const startTime = Date.now();

    try {
      logDebug('diagnostics', 'Pinging YouTube InnerTube search endpoint...');
      const apiPing = await spiceFetch('local', '/yt/search', undefined, { q: 'Top Hits', limit: 1 });
      if (apiPing.ok) {
        apiStatus = 'passed';
        logDebug('diagnostics', 'InnerTube API ping successful!');
      } else {
        logDebug('diagnostics', `InnerTube API ping failed with status ${apiPing.status}`);
      }
    } catch {
      logDebug('diagnostics', 'InnerTube API ping failed to connect.');
    }

    try {
      logDebug('diagnostics', 'Pinging server database sync endpoint...');
      const headers: HeadersInit = {};
      if (cloudToken) {
        headers['Authorization'] = `Bearer ${cloudToken}`;
      }
      const dbPing = await spiceFetch('cloud', '/sync/likes', { headers });
      if (dbPing.status === 501) {
        dbStatus = 'disabled';
        logDebug('diagnostics', 'Cloud database bypassed: server is running in offline LocalStorage mode.');
      } else if (dbPing.status === 401) {
        dbStatus = 'passed';
        logDebug('diagnostics', 'Neon Cloud Database endpoint reachable (authentication required).');
      } else if (dbPing.ok) {
        dbStatus = 'passed';
        logDebug('diagnostics', 'Neon Cloud Database connection healthy and authenticated!');
      } else {
        dbStatus = 'failed';
        logDebug('diagnostics', `Cloud Database sync ping failed with status ${dbPing.status}`);
      }
    } catch {
      logDebug('diagnostics', 'Cloud Database connection failed.');
    }

    let embedStatus: 'passed' | 'failed' = 'failed';
    try {
      logDebug('diagnostics', 'Verifying YouTube Iframe API player library status...');
      const hasYT = (window as any).YT && (window as any).YT.Player;
      const hasPlayerInstance = ytPlayerRef.current !== null;
      if (hasYT && hasPlayerInstance) {
        embedStatus = 'passed';
        logDebug('diagnostics', 'YouTube Iframe Player API fully cued and initialized!');
      } else if (hasYT) {
        embedStatus = 'passed';
        logDebug('diagnostics', 'YouTube Iframe API loaded successfully.');
      } else {
        embedStatus = 'failed';
        logDebug('diagnostics', 'YouTube Iframe API not detected in window scope. Check script blocks or content-blockers.');
      }
    } catch {
      embedStatus = 'failed';
    }

    const latency = Date.now() - startTime;
    setSelfTestResults({ api: apiStatus, db: dbStatus, embed: embedStatus, latency });
    setSelfTestRunning(false);
    logDebug('diagnostics', `Self-test completed in ${latency}ms. Status: API=${apiStatus}, DB=${dbStatus}, EMBED=${embedStatus}`);
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioSlotRefs = useRef<[HTMLAudioElement | null, HTMLAudioElement | null]>([null, null]);
  const activeAudioSlotRef = useRef<0 | 1>(0);
  const audioTransitionGainsRef = useRef(new WeakMap<HTMLAudioElement, number>());
  const preparedCrossfadeRef = useRef<PreparedCrossfade | null>(null);
  const crossfadePreparationIdRef = useRef(0);
  const crossfadeAnimationFrameRef = useRef<number | null>(null);
  const crossfadeAnimationStarterRef = useRef<() => void>(() => undefined);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchRequestRef = useRef(0);
  const recommendationRequestRef = useRef(0);

  // References to preserve state variables and bypass stale React closures inside player events
  const queueIndexRef = useRef(queueIndex);
  const queueRef = useRef(queue);
  const repeatModeRef = useRef(repeatMode);
  const streamProtocolRef = useRef(streamProtocol);
  const isShuffleRef = useRef(isShuffle);
  const activeProfileRef = useRef(activeProfile);
  const activeProfileIdRef = useRef(activeProfileId);
  const listenTogetherHostSessionIdRef = useRef(listenTogetherHostSessionId);
  const cloudTokenRef = useRef(cloudToken);
  const cloudUserRef = useRef(cloudUser);
  const cloudUsernameRef = useRef(cloudUsername);
  const progressRef = useRef(progress);
  const currentTrackRef = useRef(currentTrack);
  const isPlayingRef = useRef(isPlaying);
  const streamUrlRef = useRef(streamUrl);
  const isLoadingStreamRef = useRef(isLoadingStream);
  const durationRef = useRef(duration);
  const volumeRef = useRef(volume);
  const playbackRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const playbackRetryCountsRef = useRef<Map<string, number>>(new Map());
  const playbackTelemetryRecordedRef = useRef<Set<string>>(new Set());
  const recommendationListenCreditedRef = useRef(false);
  const recommendationListenProgressRef = useRef<RecommendationListenProgress | null>(null);
  const personalizedQueueContinuationSuppressedRef = useRef<string | null>(null);
  const playlistQueueOriginRef = useRef<string | null>(null);
  const shuffleHistoryRef = useRef<ShuffleHistoryState | null>(null);
  const relatedQueueInFlightRef = useRef<Map<string, Promise<Track[]>>>(new Map());
  const relatedQueueCacheRef = useRef<Map<string, Track[]>>(new Map());
  const syncOutboxRef = useRef<DurableSyncOutbox<SyncOutboxPayload> | null>(null);
  const playbackRequestRef = useRef(0);
  const shouldAutoPlayRef = useRef(false);
  const clientBootedAtRef = useRef(0);
  const suppressRemotePlaybackUntilRef = useRef(0);
  const directEmbedRetryRef = useRef<Set<string>>(new Set());
  const embedProxyRetryRef = useRef<Set<string>>(new Set());
  const playbackFallbackAttemptedRef = useRef<Set<string>>(new Set());
  const boostProtocolHandoffRef = useRef(false);
  const syncLockRef = useRef<boolean>(false);
  const scrobbleStateRef = useRef<ProfileListenDeliveryState | null>(null);
  const profileListenRetryTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const remoteDeviceReportInFlightRef = useRef(false);
  const remoteDeviceReportQueuedRef = useRef(false);
  const remoteDeviceLoadInFlightRef = useRef(false);
  const remoteCommandPollInFlightRef = useRef(false);
  const emptyRemoteCommandPollsRef = useRef(0);
  const appliedRemoteCommandIdsRef = useRef<Set<string>>(new Set());
  const remoteStateSyncTimeoutRef = useRef<number | null>(null);
  const remoteTargetRefreshTimeoutRef = useRef<number | null>(null);
  const optimisticRemoteDeviceStateRef = useRef<OptimisticRemoteDeviceState | null>(null);
  const forgettingRemoteDeviceIdsRef = useRef<Set<string>>(new Set());
  const remoteDeviceListRevisionRef = useRef(0);
  const remoteRequestGenerationRef = useRef(0);
  const pendingSpiceConnectHandoffRef = useRef<PendingSpiceConnectHandoff | null>(null);
  const preparedSpiceConnectHandoffsRef = useRef<Map<string, SpiceConnectHandoffDestinationState>>(new Map());
  const remoteLanTransportRef = useRef<SpiceConnectLanTransport | null>(null);
  const applyRemoteCommandRef = useRef<(command: RemoteCommand, now: number, transport?: 'cloud' | 'lan') => void>(() => {});
  const handleRemoteLanStateRef = useRef<(peerDeviceId: string, state: SpiceConnectLanDeviceState) => void>(() => {});
  const sendRemoteCommandRef = useRef<(
    command: RemoteCommandType,
    payload?: RemoteCommand['payload'],
    targetDeviceId?: string,
    quiet?: boolean,
  ) => Promise<boolean>>(async () => false);
  const addTrackToPlaylistRef = useRef<(
    track: Track,
    playlistId: string,
    playlistTitle?: string,
  ) => Promise<boolean>>(
    async () => false,
  );
  const remotePlaylistMutationChainRef = useRef<Promise<void>>(Promise.resolve());

  const handleAudioEndedRef = useRef<(
    slot?: 0 | 1,
    audio?: HTMLAudioElement | null,
  ) => void>(() => { });
  const handleAudioErrorRef = useRef<() => void>(() => { });
  const playTrackRef = useRef<(
    track: Track,
    newQueue?: Track[],
    queueIndexHint?: number,
    isSyncLoopCall?: boolean,
    isRetryCall?: boolean,
    preserveCurrentListenCycle?: boolean,
    playlistQueueOriginId?: string,
  ) => Promise<void>>(async () => { });
  const handleNextRef = useRef<(overrideIndex?: any) => void>(() => { });
  const ensurePersonalizedUpNextRef = useRef<(track: Track) => Promise<Track[]>>(async () => []);
  const recordTrackDiscoveryWinRef = useRef<(track: Track) => void>(() => undefined);

  useEffect(() => {
    const resolveProfileToken = (profileId: string) => {
      if (profileId === activeProfileIdRef.current && cloudTokenRef.current) {
        return cloudTokenRef.current;
      }
      try {
        const storedProfiles = JSON.parse(localStorage.getItem('spice_profiles_list') || '[]') as UserProfile[];
        return storedProfiles.find((profile) => profile.id === profileId)?.cloudToken || null;
      } catch {
        return null;
      }
    };
    const routes: Record<string, string> = {
      history: '/sync/history',
      likes: '/sync/likes',
      playlists: '/sync/playlists',
      profiles: '/sync/profiles',
    };
    const outbox = new DurableSyncOutbox<SyncOutboxPayload>({
      storage: localStorage,
      storageKey: SYNC_OUTBOX_STORAGE_KEY,
      onChange: setSyncOutboxItems,
      onError: (syncError, item) => {
        logDebug('error', `Auto-sync ${item.kind} failed: ${syncError instanceof Error ? syncError.message : String(syncError)}`);
      },
      send: async (item) => {
        const token = resolveProfileToken(item.profileId);
        if (!token) throw new Error('Waiting for this profile to reconnect to SPICE Cloud.');
        const route = routes[item.kind];
        if (!route) throw new SyncOutboxPermanentError(`Unsupported sync item: ${item.kind}`);
        const res = await spiceFetch('cloud', route, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          logDebug('database', `${item.kind} auto-saved to cloud database.`);
          return;
        }
        const data = await res.json().catch(() => ({}));
        const message = data.message || data.error || `${res.status} ${res.statusText}`;
        if (res.status === 408 || res.status === 429 || res.status >= 500) {
          throw new Error(`${item.kind} sync failed: ${message}`);
        }
        throw new SyncOutboxPermanentError(`${item.kind} sync needs attention: ${message}`);
      },
    });
    syncOutboxRef.current = outbox;
    void outbox.flushAll();
    const retryWhenOnline = () => void outbox.flushAll();
    window.addEventListener('online', retryWhenOnline);
    return () => {
      window.removeEventListener('online', retryWhenOnline);
      outbox.dispose();
      if (syncOutboxRef.current === outbox) syncOutboxRef.current = null;
    };
  }, [logDebug]);

  // ---------------------------------------------------------------------------
  // Taste cloud sync: the adaptive skip/completion learning, recommendation
  // preferences, and the listening-event log follow the profile across
  // devices. Each kind syncs last-writer-wins using per-kind local change
  // stamps; listening events additionally merge by id so nothing is lost.
  // ---------------------------------------------------------------------------
  const tasteSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tasteSyncMetaKey = (profileId: string) => `spice_taste_sync_meta:${profileId}`;
  const tasteSyncDirtyKey = (profileId: string) => `spice_taste_dirty:${profileId}`;

  const readTasteSyncJson = (key: string): Record<string, number> => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const markTasteDirty = useCallback((kind: 'adaptive' | 'preferences' | 'events') => {
    const profileId = activeProfileIdRef.current;
    const dirty = readTasteSyncJson(tasteSyncDirtyKey(profileId));
    dirty[kind] = Date.now();
    try {
      localStorage.setItem(tasteSyncDirtyKey(profileId), JSON.stringify(dirty));
    } catch {
      // Best-effort stamp; the next change retries.
    }
  }, []);

  const resolveTasteSyncToken = (profileId: string) => {
    if (profileId === activeProfileIdRef.current && cloudTokenRef.current) {
      return cloudTokenRef.current;
    }
    try {
      const storedProfiles = JSON.parse(localStorage.getItem('spice_profiles_list') || '[]') as UserProfile[];
      return storedProfiles.find((profile) => profile.id === profileId)?.cloudToken || null;
    } catch {
      return null;
    }
  };

  const scheduleTasteCloudSync = useCallback((immediate = false) => {
    if (tasteSyncTimerRef.current) clearTimeout(tasteSyncTimerRef.current);
    const run = async () => {
      tasteSyncTimerRef.current = null;
      const profileId = activeProfileIdRef.current;
      const token = resolveTasteSyncToken(profileId);
      if (!token) return;
      const readLocal = (key: string, fallback: string) => {
        try {
          return localStorage.getItem(key) ?? fallback;
        } catch {
          return fallback;
        }
      };
      const dirty = readTasteSyncJson(tasteSyncDirtyKey(profileId));
      const stamp = (kind: string) => dirty[kind] ?? 0;
      const states = (['adaptive', 'preferences', 'events'] as const).map((kind) => ({
        kind,
        payload: readLocal(
          kind === 'adaptive'
            ? adaptiveTrackPriorityStorageKey(profileId)
            : kind === 'preferences'
              ? recommendationPreferencesStorageKey(profileId)
              : listeningEventsStorageKey(profileId),
          kind === 'events' ? '[]' : '{}',
        ),
        updatedAt: stamp(kind),
      })).filter((state) => state.updatedAt > 0);
      if (states.length === 0) return;
      try {
        const res = await spiceFetch('cloud', '/sync/taste', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ states, profileId }),
        });
        if (res.ok) {
          const meta = readTasteSyncJson(tasteSyncMetaKey(profileId));
          for (const state of states) meta[state.kind] = Math.max(meta[state.kind] ?? 0, state.updatedAt);
          try {
            localStorage.setItem(tasteSyncMetaKey(profileId), JSON.stringify(meta));
          } catch {
            // Meta is an optimization; losing it only causes extra merging.
          }
          logDebug('database', `Taste learning synced to SPICE Cloud (${states.map((state) => state.kind).join(', ')}).`);
        }
      } catch {
        // Taste sync retries on the next change; playback is unaffected.
      }
    };
    if (immediate) {
      void run();
      return;
    }
    tasteSyncTimerRef.current = setTimeout(run, 8000);
  }, [logDebug]);

  // Pull cloud taste learning on boot, sign-in, and profile switch. Adaptive
  // priorities and preferences adopt the cloud copy when it is newer;
  // listening events merge by id so both devices keep their entries.
  useEffect(() => {
    if (!cloudToken) return;
    const profileId = activeProfileIdRef.current;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await spiceFetch('cloud', '/sync/taste', {
          headers: { 'Authorization': `Bearer ${cloudToken}` },
        }, { profileId });
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({}));
        const states = data?.states ?? {};
        const meta = readTasteSyncJson(tasteSyncMetaKey(profileId));

        if (states.adaptive?.payload && (states.adaptive.updatedAt ?? 0) > (meta.adaptive ?? 0)) {
          const nextState = normalizeAdaptiveTrackPriorityState(JSON.parse(states.adaptive.payload));
          adaptiveTrackPriorityRef.current = nextState;
          setAdaptiveTasteScores(adaptiveTasteSkipScores(nextState));
          try {
            localStorage.setItem(adaptiveTrackPriorityStorageKey(profileId), JSON.stringify(nextState));
          } catch {
            // Keep the in-memory adoption even if storage fails.
          }
          meta.adaptive = states.adaptive.updatedAt;
        }

        if (states.preferences?.payload && (states.preferences.updatedAt ?? 0) > (meta.preferences ?? 0)) {
          const parsed = normalizeRecommendationPreferences(JSON.parse(states.preferences.payload));
          setRecommendationPreferences(parsed);
          try {
            localStorage.setItem(recommendationPreferencesStorageKey(profileId), JSON.stringify(parsed));
          } catch {
            // Keep the in-memory adoption even if storage fails.
          }
          meta.preferences = states.preferences.updatedAt;
        }

        if (states.events?.payload && (states.events.updatedAt ?? 0) > (meta.events ?? 0)) {
          const serverEvents = normalizeListeningEvents(JSON.parse(states.events.payload));
          setListeningEvents((previousEvents) => {
            const byId = new Map<string, ListeningEvent>();
            for (const eventItem of [...serverEvents, ...previousEvents]) {
              const existing = byId.get(eventItem.id);
              if (!existing || eventItem.listenedMs > existing.listenedMs) byId.set(eventItem.id, eventItem);
            }
            return normalizeListeningEvents(Array.from(byId.values()));
          });
          meta.events = states.events.updatedAt;
        }

        try {
          localStorage.setItem(tasteSyncMetaKey(profileId), JSON.stringify(meta));
        } catch {
          // Meta is an optimization; losing it only causes extra merging.
        }
      } catch {
        // Cloud taste is an enhancement; local learning keeps working offline.
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [cloudToken, activeProfileId]);

  const applyAudioElementVolume = useCallback((
    audio: HTMLAudioElement | null,
    nextVolume = volumeRef.current,
    options: { resumeAudioContext?: boolean } = {},
  ) => {
    if (!audio) return;

    const safeVolume = normalizePlayerVolume(nextVolume, volumeBoosterAccepted) ?? 100;
    const transitionGain = Math.min(1, Math.max(0, audioTransitionGainsRef.current.get(audio) ?? 1));
    const shouldUseGainNode = shouldUsePlayerGainPath(safeVolume, volumeBoosterAccepted);
    if (!shouldUseGainNode) {
      audio.volume = (safeVolume / 100) * transitionGain;
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = 1;
      }
      return;
    }

    audio.volume = 1;

    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        try {
          audioContextRef.current = new AudioContextClass();
        } catch (error) {
          console.error('Failed to initialize volume booster audio context:', error);
          audioContextRef.current = null;
        }
      }
    }

    if (audioContextRef.current && !sourceNodeRef.current) {
      try {
        sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audio);
        gainNodeRef.current = audioContextRef.current.createGain();
        sourceNodeRef.current.connect(gainNodeRef.current);
        gainNodeRef.current.connect(audioContextRef.current.destination);
      } catch (error) {
        console.error('Failed to initialize volume booster audio graph:', error);
        sourceNodeRef.current = null;
        gainNodeRef.current = null;
      }
    }

    if (options.resumeAudioContext && audioContextRef.current?.state === 'suspended') {
      void audioContextRef.current.resume().catch(() => undefined);
    }

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = playerVolumeGain(safeVolume) * transitionGain;
    } else {
      audio.volume = Math.min(1, safeVolume / 100) * transitionGain;
    }
  }, [volumeBoosterAccepted]);

  const bindAudioSlotRef = useCallback((slot: 0 | 1, node: HTMLAudioElement | null) => {
    audioSlotRefs.current[slot] = node;
    if (slot === activeAudioSlotRef.current) audioRef.current = node;
    if (!node) return;

    node.autoplay = false;
    node.dataset.spiceActive = String(slot === activeAudioSlotRef.current);
    audioTransitionGainsRef.current.set(node, 1);
    applyAudioElementVolume(node, volumeRef.current);
  }, [applyAudioElementVolume]);
  const bindAudioSlotZeroRef = useCallback((node: HTMLAudioElement | null) => bindAudioSlotRef(0, node), [bindAudioSlotRef]);
  const bindAudioSlotOneRef = useCallback((node: HTMLAudioElement | null) => bindAudioSlotRef(1, node), [bindAudioSlotRef]);

  useEffect(() => {
    activeProfileIdRef.current = activeProfileId;
    personalizedQueueContinuationSuppressedRef.current = null;
    listenTogetherHostSessionIdRef.current = listenTogetherHostSessionId;
    cloudTokenRef.current = cloudToken;
    cloudUserRef.current = cloudUser;
    cloudUsernameRef.current = cloudUsername;
    if (cloudToken) void syncOutboxRef.current?.flushAll();
  }, [activeProfileId, listenTogetherHostSessionId, cloudToken, cloudUser, cloudUsername]);

  const autoSyncProfiles = (updatedProfiles: UserProfile[]) => {
    const token = cloudTokenRef.current;
    if (!token) return;
    const profilesForAccount = accountBoundProfiles(
      updatedProfiles,
      token,
      cloudUserRef.current?.id,
    );
    syncOutboxRef.current?.enqueue(activeProfileIdRef.current, 'profiles', {
      profiles: profilesForAccount,
    });
  };

  // ── Sync Active Profile back to Profiles DB Helper ──────────────
  const updateProfileData = (profileId: string, updates: Partial<UserProfile>) => {
    const shouldSyncProfileMetadata = requiresProfileMetadataSync(Object.keys(updates));
    setProfiles(prev => {
      let baseProfiles = prev;
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('spice_profiles_list');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              baseProfiles = parsed;
            }
          } catch { }
        }
      }

      const updated = baseProfiles.map(p => {
        if (p.id === profileId) {
          return { ...p, ...updates };
        }
        return p;
      });
      saveProfilesToStorage(updated);
      if (shouldSyncProfileMetadata) autoSyncProfiles(updated);
      return updated;
    });
  };

  const updateActiveProfileData = (updates: Partial<UserProfile>) => {
    updateProfileData(activeProfileId, updates);
  };

  const autoSyncHistory = (
    updatedHistory: Track[],
    profileId = activeProfileIdRef.current,
    profileToken?: string | null,
  ) => {
    const token = profileToken ?? (
      profileId === activeProfileIdRef.current ? cloudTokenRef.current : null
    );
    if (!token) return;
    syncOutboxRef.current?.enqueue(profileId, 'history', { history: updatedHistory, profileId });
  };

  const autoSyncPlaylists = (updatedPlaylists: Playlist[]) => {
    if (!cloudTokenRef.current) return;
    const profileId = activeProfileIdRef.current;
    syncOutboxRef.current?.enqueue(profileId, 'playlists', {
      playlists: ownedPlaylistsOnly(updatedPlaylists),
      profileId,
      includeSnapshots: false,
    });
  };

  const autoSyncLikes = (updatedLikes: string[], updatedDetails: Record<string, Track>) => {
    if (!cloudTokenRef.current) return;
    const profileId = activeProfileIdRef.current;
    syncOutboxRef.current?.enqueue(profileId, 'likes', {
      likedTracks: updatedLikes,
      likedTrackDetails: updatedDetails,
      profileId,
    });
  };

  const handleUserSearch = async (query: string) => {
    const trimmed = query.trim();
    setUserSearchQuery(trimmed);
    if (!trimmed) {
      setUserSearchResults([]);
      setIsSearchingUsers(false);
      return;
    }

    setIsSearchingUsers(true);
    try {
      const res = await spiceFetch('cloud', '/users/search', {
        headers: cloudToken ? { Authorization: `Bearer ${cloudToken}` } : {},
      }, { q: trimmed });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setUserSearchResults(data.users || []);
    } catch (err) {
      console.error(err);
      showSpiceNotice('Failed to search users.', 'warning');
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleSelectUser = async (user: any) => {
    setSelectedUser(user);
    setSelectedUserProfileData(null);
    setIsLoadingUserProfile(true);
    setSelectedPlaylist(null);

    try {
      const res = await spiceFetch('cloud', '/users/profile', {
        headers: cloudToken ? { Authorization: `Bearer ${cloudToken}` } : {},
      }, { userId: user.id });
      if (!res.ok) throw new Error('Failed to load profile');
      const data = await res.json();
      setSelectedUserProfileData(data);
    } catch (err) {
      console.error(err);
      showSpiceNotice('Failed to load user profile.', 'warning');
      setSelectedUser(null);
    } finally {
      setIsLoadingUserProfile(false);
    }
  };

  const handleToggleProfileLike = async (userId: string) => {
    if (!cloudToken) {
      showSpiceNotice('Please sign in to like profiles.', 'info');
      return;
    }
    if (userId === cloudUser?.id) {
      showSpiceNotice('You cannot like your own profile.', 'info');
      return;
    }

    try {
      const res = await spiceFetch('cloud', '/users/like', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cloudToken}`,
        },
        body: JSON.stringify({ targetUserId: userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to toggle like');
      }
      const data = await res.json();

      setSelectedUserProfileData((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          likesCount: data.likesCount,
          isLikedByMe: data.isLiked,
        };
      });
      showSpiceNotice(data.isLiked ? 'Liked profile!' : 'Removed like from profile.', 'success');
    } catch (err: any) {
      console.error(err);
      showSpiceNotice(err.message || 'Failed to toggle like on profile.', 'warning');
    }
  };

  const restoreProfileConnections = useCallback(async (token: string | null = cloudToken) => {
    const requestProfileId = activeProfileIdRef.current;
    const requestGeneration = remoteRequestGenerationRef.current;
    const requestIsCurrent = () => (
      requestGeneration === remoteRequestGenerationRef.current
      && requestProfileId === activeProfileIdRef.current
      && token === cloudTokenRef.current
    );
    if (!token) {
      if (!requestIsCurrent()) return;
      setLastFmAccountLinked(false);
      setListenBrainzAccountLinked(false);
      setListenBrainzToken('');
      localStorage.setItem('spice_lastfm_account_linked', 'false');
      return;
    }

    try {
      const response = await spiceFetch('cloud', '/profile/connections', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({})) as {
        lastfm?: {
          linked?: boolean;
          name?: string;
          linkedAt?: string;
        };
        listenbrainz?: {
          linked?: boolean;
          token?: string;
          linkedAt?: string;
        };
        message?: string;
      };
      if (!requestIsCurrent()) return;

      if (!response.ok) {
        throw new Error(data.message || 'Failed to restore profile connections.');
      }

      if (data.lastfm?.linked) {
        const linkedUser = data.lastfm.name || 'Last.fm account';
        setLastFmAccountLinked(true);
        setLastFmLinkedUser(linkedUser);
        setProfileSyncEnabled(true);
        localStorage.setItem('spice_lastfm_account_linked', 'true');
        localStorage.setItem('spice_lastfm_linked_user', linkedUser);
        localStorage.setItem('spice_profile_sync_enabled', 'true');
        setLastFmLinkStatus(`Restored ${linkedUser} from your SPICE account. Profile sync is enabled.`);
        logDebug('profile', `Last.fm account link restored for ${linkedUser}.`);
      } else {
        setLastFmAccountLinked(false);
        localStorage.setItem('spice_lastfm_account_linked', 'false');
      }

      if (data.listenbrainz?.linked) {
        setListenBrainzAccountLinked(true);
        if (data.listenbrainz.token) {
          setListenBrainzToken(data.listenbrainz.token);
        }
        setProfileSyncEnabled(true);
        localStorage.setItem('spice_profile_sync_enabled', 'true');
        setListenBrainzLinkStatus('Restored ListenBrainz token from your SPICE account. Profile sync is enabled.');
        logDebug('profile', 'ListenBrainz token restored from SPICE account.');
      } else {
        setListenBrainzAccountLinked(false);
        setListenBrainzToken('');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to restore profile connections.';
      logDebug('error', `Profile connection restore failed: ${message}`);
    }
  }, [cloudToken, logDebug]);

  const saveListenBrainzToken = useCallback(async (rawToken: string) => {
    if (!cloudToken) {
      if (rawToken.trim()) {
        setListenBrainzLinkStatus('Sign in to SPICE to save your ListenBrainz token on your account.');
      }
      setListenBrainzAccountLinked(false);
      return;
    }

    setListenBrainzLinkStatus('Saving ListenBrainz token to your SPICE account...');
    try {
      const response = await spiceFetch('cloud', '/profile/connections', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${cloudToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listenbrainz: { token: rawToken.trim() || null },
        }),
      });
      const data = await response.json().catch(() => ({})) as {
        listenbrainz?: { linked?: boolean };
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save ListenBrainz token.');
      }

      if (data.listenbrainz?.linked) {
        setListenBrainzAccountLinked(true);
        setProfileSyncEnabled(true);
        localStorage.setItem('spice_profile_sync_enabled', 'true');
        setListenBrainzLinkStatus('ListenBrainz token saved to your SPICE account. Profile sync is enabled.');
        logDebug('profile', 'ListenBrainz token saved to SPICE account.');
      } else {
        setListenBrainzAccountLinked(false);
        setListenBrainzLinkStatus(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save ListenBrainz token.';
      setListenBrainzLinkStatus(message);
      logDebug('error', `ListenBrainz token save failed: ${message}`);
    }
  }, [cloudToken, logDebug]);

  const queueListenBrainzTokenSave = useCallback((token: string) => {
    if (listenBrainzSaveTimeoutRef.current) {
      clearTimeout(listenBrainzSaveTimeoutRef.current);
    }
    listenBrainzSaveTimeoutRef.current = setTimeout(() => {
      listenBrainzSaveTimeoutRef.current = null;
      void saveListenBrainzToken(token);
    }, 800);
  }, [saveListenBrainzToken]);

  const [isMounted, setIsMounted] = useState(false);

  // Load localStorage states safely on client mount to prevent SSR hydration mismatch
  useEffect(() => {
    setIsMounted(true);
    let restoredVolumeBoosterAccepted = false;
    if (typeof window !== 'undefined') {
      const now = currentTimestampMs();
      clientBootedAtRef.current = now;
      const suppressUntil = Number(localStorage.getItem(UPDATE_RELOAD_REMOTE_SUPPRESS_KEY) || 0);
      if (Number.isFinite(suppressUntil) && suppressUntil > now) {
        suppressRemotePlaybackUntilRef.current = suppressUntil;
      } else {
        localStorage.removeItem(UPDATE_RELOAD_REMOTE_SUPPRESS_KEY);
      }

      const savedBooster = localStorage.getItem('spice_volume_booster_accepted');
      restoredVolumeBoosterAccepted = savedBooster === 'true';
      if (restoredVolumeBoosterAccepted) setVolumeBoosterAccepted(true);
    }
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('spice_accent_theme');
      if (isAccentTheme(savedTheme)) setAccentTheme(savedTheme);
      const storedCustomTheme = loadStoredThemePalette();
      setCustomThemePalette(storedCustomTheme.palette);
      setCustomThemeEnabled(localStorage.getItem('spice_custom_theme_enabled') === 'true');
      setPlaybackProfileState(loadPlaybackProfileState(localStorage));

      const savedSurface = localStorage.getItem('spice_visual_surface');
      if (isVisualSurface(savedSurface)) setVisualSurface(savedSurface);

      const savedArtworkShape = localStorage.getItem('spice_artwork_shape');
      if (isArtworkShape(savedArtworkShape)) setArtworkShape(savedArtworkShape);

      const savedMotionLevel = localStorage.getItem('spice_motion_level');
      if (isMotionLevel(savedMotionLevel)) setMotionLevel(savedMotionLevel);

      const savedInterfaceScale = localStorage.getItem('spice_interface_scale');
      if (isInterfaceScale(savedInterfaceScale)) setInterfaceScale(savedInterfaceScale);

      const savedTopbarLayout = localStorage.getItem('spice_topbar_layout');
      if (isTopbarLayout(savedTopbarLayout)) setTopbarLayout(savedTopbarLayout);

      const savedQuality = localStorage.getItem('spice_audio_quality');
      if (savedQuality) setAudioQuality(savedQuality as any);

      const savedPlayerVolume = normalizePlayerVolume(
        localStorage.getItem(PLAYER_VOLUME_STORAGE_KEY),
        restoredVolumeBoosterAccepted,
      );
      const savedProtocol = localStorage.getItem('spice_stream_protocol');
      const embedTransportMigrationComplete = localStorage.getItem('spice_stream_embed_migration_v1034') === 'true';
      const boostedPlaybackRequiresProxy = savedPlayerVolume !== null
        && shouldUseProxyForBoost(savedPlayerVolume, savedProtocol || '');
      if (savedProtocol === 'embed' && (!embedTransportMigrationComplete || boostedPlaybackRequiresProxy)) {
        localStorage.setItem('spice_stream_protocol', 'proxy');
        localStorage.setItem('spice_stream_embed_migration_v1034', 'true');
        setStreamProtocol('proxy');
        streamProtocolRef.current = 'proxy';
        setShowVideoPlayer(false);
      } else if (isStreamProtocol(savedProtocol)) {
        setStreamProtocol(savedProtocol);
        streamProtocolRef.current = savedProtocol;
      }

      setProfileSyncEnabled(localStorage.getItem('spice_profile_sync_enabled') === 'true');
      setLastFmSessionKey(localStorage.getItem('spice_lastfm_session_key') || '');
      setLastFmAccountLinked(
        localStorage.getItem('spice_lastfm_account_linked') === 'true'
        && Boolean(localStorage.getItem('spice_cloud_token')),
      );
      setLastFmLinkedUser(localStorage.getItem('spice_lastfm_linked_user') || '');
      localStorage.removeItem('spice_lastfm_api_key');
      localStorage.removeItem('spice_lastfm_shared_secret');
      localStorage.removeItem('spice_lastfm_link_token');
      const legacyListenBrainzToken = localStorage.getItem('spice_listenbrainz_token');
      if (legacyListenBrainzToken) {
        setListenBrainzToken(legacyListenBrainzToken);
      }
      localStorage.removeItem('spice_listenbrainz_token');

      const savedSearchProvider = localStorage.getItem('spice_search_provider');
      if (isSearchProvider(savedSearchProvider)) {
        setSearchProvider(savedSearchProvider);
      }
      setRecentSearchEntries(getRecentCachedSearches());

      setSidebarHidden(localStorage.getItem('spice_sidebar_hidden') === 'true');

      const savedSidebarSearch = localStorage.getItem('spice_sidebar_search_enabled');
      if (savedSidebarSearch !== null) {
        setSidebarSearchEnabled(savedSidebarSearch !== 'false');
      }

      const savedSidebarProfile = localStorage.getItem('spice_sidebar_profile_enabled');
      if (savedSidebarProfile !== null) {
        setSidebarProfileEnabled(savedSidebarProfile !== 'false');
      }

      const savedSidebarSettings = localStorage.getItem('spice_sidebar_settings_enabled');
      if (savedSidebarSettings !== null) {
        setSidebarSettingsEnabled(savedSidebarSettings !== 'false');
      }

      const savedLocalDb = localStorage.getItem('spice_local_db_fallback');
      if (savedLocalDb) setIsLocalDbFallback(savedLocalDb === 'true');

      const savedPlacement = localStorage.getItem('spice_player_placement');
      if (savedPlacement) setPlayerPlacement(savedPlacement as any);

      const savedViewMode = localStorage.getItem('spice_player_view_mode');
      if (savedViewMode) setPlayerViewMode(savedViewMode as any);

      const savedPlayerBarDensity = localStorage.getItem('spice_player_bar_density');
      if (isPlayerBarDensity(savedPlayerBarDensity)) setPlayerBarDensity(savedPlayerBarDensity);

      const savedPlayerVisualStyle = localStorage.getItem('spice_player_visual_style');
      if (isPlayerVisualStyle(savedPlayerVisualStyle)) setPlayerVisualStyle(savedPlayerVisualStyle);

      const savedShuffle = localStorage.getItem(PLAYER_SHUFFLE_STORAGE_KEY);
      if (savedShuffle !== null) setIsShuffle(savedShuffle === 'true');

      const savedRepeat = localStorage.getItem(PLAYER_REPEAT_STORAGE_KEY);
      if (isRepeatMode(savedRepeat)) setRepeatMode(savedRepeat);

      if (savedPlayerVolume !== null) {
        volumeRef.current = savedPlayerVolume;
        setVolume(savedPlayerVolume);
      }

      const savedProfiles = localStorage.getItem('spice_profiles_list');
      const savedActiveId = localStorage.getItem('spice_active_profile_id') || 'default';

      let parsedProfiles = [initialDefaultProfile];
      if (savedProfiles) {
        try {
          const list = JSON.parse(savedProfiles);
          if (list.length > 0) {
            parsedProfiles = list;
            setProfiles(list);
          }
        } catch (e) {
          console.error(e);
        }
      }

      const activeProf = parsedProfiles.find(p => p.id === savedActiveId) || parsedProfiles[0];
      if (activeProf) {
        const hydratedHistory = enrichTrackSnapshots(activeProf.history || []);
        const likedDetailEntries = Object.entries(activeProf.likedTrackDetails || {});
        const hydratedLikedTracks = enrichTrackSnapshots(likedDetailEntries.map(([, track]) => track));
        const hydratedLikedDetails = Object.fromEntries(
          likedDetailEntries.map(([id], index) => [id, hydratedLikedTracks[index]]),
        );
        const hydratedPlaylists = (activeProf.customPlaylists || []).map((playlist) => ({
          ...playlist,
          tracks: enrichTrackSnapshots(playlist.tracks || []),
        }));
        rememberTrackSnapshots([
          ...hydratedHistory,
          ...Object.values(hydratedLikedDetails),
          ...hydratedPlaylists.flatMap((playlist) => playlist.tracks),
        ]);

        if (!activeProf.passcode) {
          lastUnlockedProfileIdRef.current = activeProf.id;
        }
        setActiveProfileId(activeProf.id);
        activeProfileIdRef.current = activeProf.id;
        setLikedTracks(new Set(activeProf.likedTracks));
        setLikedTrackDetails(hydratedLikedDetails);
        setCustomPlaylists(hydratedPlaylists);
        setHistory(hydratedHistory);
        setEditName(activeProf.displayName);
        setEditBio(activeProf.bio);
        setEditGradient(activeProf.gradient);
        setEditPasscode(activeProf.passcode || '');
        setEditAvatarUrl(activeProf.avatarUrl || '');

        // Native injects its account into global storage before this profile hydrates.
        const storedCloudSession = readCloudSessionFromStorage<CloudAccount>(localStorage, activeProf.id);
        const nextToken = storedCloudSession.token;
        const nextUser = storedCloudSession.user;
        const nextUsername = storedCloudSession.username;
        setCloudToken(nextToken);
        setCloudUser(nextUser);
        setCloudUsername(nextUsername);
        cloudTokenRef.current = nextToken;
        cloudUserRef.current = nextUser;
        cloudUsernameRef.current = nextUsername;
        if (nextToken) {
          localStorage.setItem('spice_cloud_profile_id', activeProf.id);
        } else if (localStorage.getItem('spice_cloud_profile_id') !== activeProf.id) {
          localStorage.removeItem('spice_cloud_token');
          localStorage.removeItem('spice_token');
          localStorage.removeItem('spice_cloud_user');
        }

        const savedPlayback = getPlaybackState(activeProf.id);
        if (savedPlayback) {
          if (isRepeatMode(savedPlayback.repeatMode)) setRepeatMode(savedPlayback.repeatMode);
          if (typeof savedPlayback.isShuffle === 'boolean') setIsShuffle(savedPlayback.isShuffle);
          const savedPlaybackVolume = normalizePlayerVolume(savedPlayback.volume, restoredVolumeBoosterAccepted);
          if (savedPlaybackVolume !== null) {
            volumeRef.current = savedPlaybackVolume;
            setVolume(savedPlaybackVolume);
          }
        }
        // A stored snapshot is useful for preferences and history, but it is not an
        // active playback session after a fresh launch. Keep it persisted without
        // presenting the last song as though it were currently loaded or playing.
        currentTrackRef.current = IDLE_PLAYER_TRACK;
        queueRef.current = [IDLE_PLAYER_TRACK];
        playlistQueueOriginRef.current = null;
        shuffleHistoryRef.current = null;
        queueIndexRef.current = 0;
        progressRef.current = 0;
        durationRef.current = 0;
        scrobbleStateRef.current = null;
        setCurrentTrack(IDLE_PLAYER_TRACK);
        setQueue([IDLE_PLAYER_TRACK]);
        setQueueIndex(0);
        setProgress(0);
        setDuration(0);
        shouldAutoPlayRef.current = false;
        isPlayingRef.current = false;
        setIsPlaying(false);
        setStreamUrl(null);
        streamUrlRef.current = null;

        const cachedSearch = getLatestCachedSearch();
        if (cachedSearch) {
          setSearchQuery(cachedSearch.query);
          setSearchResults(playableSearchTracks(cachedSearch.tracks as Track[]));
          setSearchResultsSource('cache');
          const cachedProvider = cachedSearch.sourceId ?? 'youtube_music';
          if (isSearchProvider(cachedProvider)) {
            setSearchProvider(cachedProvider);
          }
        }
        logDebug('system', `Loaded active profile "${activeProf.displayName}" successfully. Hydration secured.`);
        setIsProfileHydrated(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!cloudToken) return;
    void restoreProfileConnections(cloudToken);
  }, [cloudToken, restoreProfileConnections]);

  useEffect(() => {
    if (migratedLegacyListenBrainzRef.current || !cloudToken) return;
    const legacyToken = listenBrainzToken.trim();
    if (!legacyToken || listenBrainzAccountLinked) return;
    migratedLegacyListenBrainzRef.current = true;
    void saveListenBrainzToken(legacyToken);
  }, [cloudToken, listenBrainzToken, listenBrainzAccountLinked, saveListenBrainzToken]);

  const loadPlaylistInvite = useCallback(async (token: string) => {
    setInviteStatus('Loading shared playlist invite...');
    try {
      const response = await spiceFetch('cloud', `/playlists/invites/${encodeURIComponent(token)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'This shared playlist invite is not available.');
      }

      setInvitePreview({
        token,
        playlist: normalizePlaylistSnapshot(data.playlist),
        expiresAt: data.invite?.expiresAt || null,
      });
      setInviteStatus(cloudToken ? null : 'Sign in to your SPICE account to accept this shared playlist.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load shared playlist invite.';
      setInviteStatus(message);
      setInvitePreview(null);
      logDebug('error', `Shared playlist invite preview failed: ${message}`);
    }
  }, [cloudToken, logDebug]);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;

    const inviteToken = new URLSearchParams(window.location.search).get('playlistInvite');
    if (inviteToken) {
      void loadPlaylistInvite(inviteToken);
    }
  }, [isMounted, loadPlaylistInvite]);

  useEffect(() => {
    if (currentPage !== 'settings') return;
    const mainEl = document.getElementById('main');
    if (!mainEl) return;

    const sections = [
      'theme-accent',
      'visual-customization',
      'profile-privacy',
      'sidebar-controls',
      ...(desktopUpdaterAvailable ? ['desktop-updates'] : []),
      ...(nativeShellAvailable ? ['native-shell'] : []),
      ...(nativeShellAvailable ? ['discord-activity'] : []),
      'offline-library',
      'search-sources',
      'audio-streaming',
      'profile-sync',
      'player-layout',
      'playback-profiles',
      'spice-connect',
      'offline-runtime',
      'feedback-support',
      'storage-safety',
      'system-diagnostics',
    ];

    let animationFrame = 0;
    const handleScroll = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const topbar = mainEl.querySelector<HTMLElement>('.app-topbar');
        const marker = mainEl.scrollTop + (topbar?.offsetHeight ?? 0) + 32;
        let current = sections[0];
        for (const sectionId of sections) {
          const section = document.getElementById(sectionId);
          if (section && marker >= section.offsetTop) current = sectionId;
        }
        setActiveSettingsSection(current);
      });
    };

    handleScroll();
    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      mainEl.removeEventListener('scroll', handleScroll);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [currentPage, desktopUpdaterAvailable, nativeShellAvailable]);

  const scrollToSettingsSection = (id: string) => {
    const mainEl = document.getElementById('main');
    const targetEl = document.getElementById(id);
    if (mainEl && targetEl) {
      const topbar = mainEl.querySelector<HTMLElement>('.app-topbar');
      mainEl.scrollTo({
        top: Math.max(0, targetEl.offsetTop - (topbar?.offsetHeight ?? 0) - 24),
        behavior: 'smooth'
      });
      setActiveSettingsSection(id);
    }
  };

  const updateNativeShellBoolean = async (
    key: 'discordRpcEnabled' | 'alwaysOnTop',
    enabled: boolean,
  ) => {
    const bridge = getSpiceNativeShellBridge();
    if (!bridge || !nativeShellSettings) return;
    setNativeShellBusy(key);
    setNativeShellMessage(null);
    try {
      const applied = key === 'discordRpcEnabled'
        ? await bridge.setDiscordRpc(enabled)
        : await bridge.setAlwaysOnTop(enabled);
      setNativeShellSettings((current) => current ? { ...current, [key]: applied } : current);
      setNativeShellMessage(key === 'discordRpcEnabled'
        ? `Discord Rich Presence ${applied ? 'enabled' : 'disabled'}.`
        : `Always on Top ${applied ? 'enabled' : 'disabled'}.`);
    } catch (error) {
      setNativeShellMessage(`Could not update the Native shell: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setNativeShellBusy(null);
    }
  };

  const updateNativeToolbarControl = (key: NativeToolbarButtonKey, enabled: boolean) => {
    const bridge = getSpiceNativeShellBridge();
    if (!bridge || !nativeShellSettings) return;
    const toolbarButtons = { ...nativeShellSettings.toolbarButtons, [key]: enabled };
    bridge.setToolbarButtons(toolbarButtons);
    setNativeShellSettings({ ...nativeShellSettings, toolbarButtons });
    setNativeShellMessage('Native toolbar controls updated.');
  };

  const saveNativeShellCss = () => {
    const bridge = getSpiceNativeShellBridge();
    if (!bridge || !nativeShellSettings) return;
    bridge.setCustomCss(nativeShellCssDraft);
    setNativeShellSettings({ ...nativeShellSettings, customCss: nativeShellCssDraft });
    setNativeShellMessage(nativeShellCssDraft.trim() ? 'Custom desktop CSS saved.' : 'Custom desktop CSS cleared.');
  };

  const clearNativeShellCss = () => {
    const bridge = getSpiceNativeShellBridge();
    if (!bridge || !nativeShellSettings) return;
    bridge.setCustomCss('');
    setNativeShellCssDraft('');
    setNativeShellSettings({ ...nativeShellSettings, customCss: '' });
    setNativeShellMessage('Custom desktop CSS cleared.');
  };

  const copyNativeUtilityUrl = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setNativeShellMessage(`${label} URL copied.`);
    } catch (error) {
      setNativeShellMessage(`Could not copy the ${label} URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const checkDesktopUpdates = async () => {
    const bridge = getSpiceDesktopUpdaterBridge();
    if (!bridge) return;
    setNativeShellBusy('updates');
    setNativeShellMessage(null);
    setNativeUpdateStatus({ status: 'checking' });
    try {
      const result = await bridge.checkForUpdates();
      if (!result.success) {
        setNativeUpdateStatus({ status: 'error', error: result.error || 'The update check failed.' });
        setNativeShellBusy(null);
      }
    } catch (error) {
      setNativeUpdateStatus({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      setNativeShellBusy(null);
    }
  };

  const updateDesktopStartOnBoot = async (enabled: boolean) => {
    const bridge = getSpiceDesktopUpdaterBridge();
    if (!bridge?.setStartOnBoot) return;
    setNativeShellBusy('startOnBoot');
    setDesktopStartOnBootMessage(null);
    try {
      const preference = await bridge.setStartOnBoot(enabled);
      setDesktopStartOnBoot(preference);
      setDesktopStartOnBootMessage(`Start on boot ${preference.enabled ? 'enabled' : 'disabled'}.`);
    } catch (error) {
      setDesktopStartOnBootMessage(`Could not update start on boot: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setNativeShellBusy(null);
    }
  };

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;
    const themeColors: Record<AccentTheme, string> = {
      pink: '#ec4899',
      blue: '#3b82f6',
      orange: '#f97316',
      green: '#10b981',
      gold: '#eab308',
      crimson: '#e11d48',
      deeppurple: '#7c3aed'
    };
    const color = customThemeEnabled ? customThemePalette.colors.primary : (themeColors[accentTheme] || '#7c3aed');
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="32" fill="${color}" />
      <path d="M64 25v55.2a20 20 0 1 0 10 17.3V45h20V25H64Z" fill="#ffffff" />
    </svg>`;
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;

    let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    link.href = dataUrl;
    link.type = 'image/svg+xml';

    const appleLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
    if (appleLink) {
      appleLink.href = dataUrl;
    }
  }, [isMounted, accentTheme, customThemeEnabled, customThemePalette.colors.primary]);

  // ── YouTube Embedded Player Fallback API Integration ──────────────
  useEffect(() => {
    if (!isMounted || currentTrack.id === 'placeholder') return;

    savePlaybackState(activeProfileId, {
      currentTrack,
      queue,
      queueIndex,
      progress: progressRef.current,
      repeatMode,
      isShuffle,
      volume,
      savedAt: Date.now(),
    });
  }, [activeProfileId, currentTrack, isMounted, queue, queueIndex]);

  useEffect(() => {
    if (!isMounted || currentTrack.id === 'placeholder') return;

    const persistProgress = () => savePlaybackProgress(activeProfileId, currentTrack, progressRef.current);
    persistProgress();
    const interval = window.setInterval(persistProgress, 5000);
    return () => {
      window.clearInterval(interval);
      persistProgress();
    };
  }, [activeProfileId, currentTrack, isMounted]);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;
    localStorage.setItem(PLAYER_SHUFFLE_STORAGE_KEY, String(isShuffle));
    localStorage.setItem(PLAYER_REPEAT_STORAGE_KEY, repeatMode);
    localStorage.setItem(PLAYER_VOLUME_STORAGE_KEY, String(volume));
  }, [isMounted, isShuffle, repeatMode, volume]);

  const initializeYtPlayer = useCallback(() => {
    if (typeof window === 'undefined' || ytPlayerRef.current) return;
    try {
      logDebug('system', 'Initializing YouTube Embed Player Instance...');
      ytPlayerRef.current = new (window as any).YT.Player('spice-yt-iframe-container', {
        height: '100%',
        width: '100%',
        videoId: 'J7p4bzqLvCw',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3
        },
        events: {
          onReady: (event: any) => {
            logDebug('system', 'YouTube Iframe Embed Player instance successfully cued!');
            event.target.setVolume(volume);
          },
          onStateChange: (event: any) => {
            const state = event.data;
            if (state === -1) {
              logDebug('stream', 'YouTube Embed State: UNSTARTED (-1)');
            } else if (state === 1) { // Playing
              logDebug('stream', 'YouTube Embed State: ACTIVE AUDIO PLAYBACK (1)');
              if (!shouldAutoPlayRef.current) {
                if (typeof event.target?.pauseVideo === 'function') {
                  event.target.pauseVideo();
                }
                isPlayingRef.current = false;
                setIsPlaying(false);
                isLoadingStreamRef.current = false;
                setIsLoadingStream(false);
                return;
              }
              const playingVideoId = typeof event.target?.getVideoData === 'function'
                ? event.target.getVideoData()?.video_id
                : '';
              if (
                streamProtocolRef.current !== 'embed'
                || !isYouTubeTrack(currentTrackRef.current)
                || !playingVideoId
                || playingVideoId !== currentTrackRef.current.id
              ) return;
              adaptivePlaybackStartedRef.current(currentTrackRef.current);
              isPlayingRef.current = true;
              setIsPlaying(true);
              isLoadingStreamRef.current = false;
              setIsLoadingStream(false);
            } else if (state === 2) { // Paused
              logDebug('stream', 'YouTube Embed State: AUDIO PAUSED (2)');
              isPlayingRef.current = false;
              setIsPlaying(false);
            } else if (state === 3) { // Buffering
              logDebug('stream', 'YouTube Embed State: BUFFERING AUDIO (3)');
            } else if (state === 5) { // Cued
              logDebug('stream', 'YouTube Embed State: AUDIO TRACK CUED (5)');
            } else if (state === 0) { // Ended
              logDebug('stream', 'YouTube Embed State: PLAYBACK COMPLETED (0)');
              const endedVideoId = typeof event.target?.getVideoData === 'function'
                ? event.target.getVideoData()?.video_id
                : '';
              if (
                streamProtocolRef.current !== 'embed'
                || !isYouTubeTrack(currentTrackRef.current)
                || !endedVideoId
                || endedVideoId !== currentTrackRef.current.id
              ) return;
              handleAudioEndedRef.current?.();
            }
          },
          onError: (event: any) => {
            const code = event.data;
            const activeTrack = currentTrackRef.current;
            const activeTrackKey = playbackTrackKey(activeTrack);
            if (code === 2) {
              logDebug('error', 'YouTube Embed Error (2): The request contains an invalid parameter value.');
            } else if (code === 5) {
              logDebug('error', 'YouTube Embed Error (5): The requested content cannot be played in an HTML5 player.');
            } else if (code === 100) {
              logDebug('error', 'YouTube Embed Error (100): The requested video was not found (removed or marked as private).');
            } else if (code === 101 || code === 150) {
              logDebug('error', 'YouTube Embed Error (101/150): The video owner has disallowed embedded playbacks for this track. Switch stream endpoint to direct proxy.');
            } else {
              logDebug('error', `YouTube Embed Player error: code ${code}`);
            }
            if (
              activeTrack.id !== 'placeholder'
              && isYouTubeTrack(activeTrack)
              && streamProtocolRef.current === 'embed'
              && !embedProxyRetryRef.current.has(activeTrackKey)
            ) {
              embedProxyRetryRef.current.add(activeTrackKey);
              logDebug('diagnostics', 'YouTube embed was blocked. Retrying this track with the direct proxy transport.');
              setShowVideoPlayer(false);
              setStreamProtocol('proxy');
              streamProtocolRef.current = 'proxy';
              localStorage.setItem('spice_stream_protocol', 'proxy');
              void playTrackRef.current(activeTrack, queueRef.current, queueIndexRef.current, Boolean(listenTogetherHostSessionIdRef.current), true);
              return;
            }
            // Keep iframe failures on the same user-requested track.
            handleAudioErrorRef.current?.();
          }
        }
      });
    } catch (e) {
      console.error('Error initializing YouTube player:', e);
      logDebug('error', `YouTube Embed player initialization failed: ${e}`);
    }
  }, [volume, logDebug]);


  // Auto-update mechanism: poll API for new versions
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let currentBuildVersion: string | null = null;
    let isFetching = false;

    const checkVersion = async () => {
      if (isFetching) return;
      isFetching = true;
      try {
        const response = await spiceFetch('cloud', '/version');
        if (!response.ok) return;

        const data = await response.json();
        const serverVersion = data.version;

        if (serverVersion && serverVersion !== 'development') {
          if (currentBuildVersion === null) {
            // First time we get a valid version, just record it
            currentBuildVersion = serverVersion;
          } else if (currentBuildVersion !== serverVersion) {
            // Version changed! Wait a moment to ensure deployment finishes, then reload.
            logDebug('system', 'New deployment detected. Reloading app to update...');
            clearInterval(intervalId);
            shouldAutoPlayRef.current = false;
            const suppressUntil = currentTimestampMs() + UPDATE_RELOAD_REMOTE_SUPPRESS_MS;
            suppressRemotePlaybackUntilRef.current = suppressUntil;
            try {
              localStorage.setItem(UPDATE_RELOAD_REMOTE_SUPPRESS_KEY, String(suppressUntil));
            } catch {}
            window.setTimeout(() => window.location.reload(), 1500);
          }
        }
      } catch {
        // Silently ignore fetch errors (e.g. offline)
      } finally {
        isFetching = false;
      }
    };

    const handleVisibleCheck = () => {
      if (document.visibilityState === 'visible') {
        void checkVersion();
      }
    };
    const handleFocusCheck = () => {
      void checkVersion();
    };

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkVersion();
      }
    }, SPICE_VERSION_CHECK_INTERVAL_MS);
    const timeoutId = setTimeout(checkVersion, 15000);
    window.addEventListener('focus', handleFocusCheck);
    document.addEventListener('visibilitychange', handleVisibleCheck);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      window.removeEventListener('focus', handleFocusCheck);
      document.removeEventListener('visibilitychange', handleVisibleCheck);
    };
  }, [logDebug]);

  // Load YouTube Iframe API on client mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    logDebug('system', 'Client environment secure. Initializing YouTube Embed script loader...');
    if (!document.getElementById('youtube-iframe-api-script')) {
      logDebug('system', 'Injecting script tag: https://www.youtube.com/iframe_api');
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    (window as any).onYouTubeIframeAPIReady = () => {
      logDebug('system', 'Global onYouTubeIframeAPIReady hook triggered. Cueing video player instances.');
      initializeYtPlayer();
    };

    // Prevent race conditions where window.YT is defined but window.YT.Player is not yet populated
    const checkInterval = setInterval(() => {
      if ((window as any).YT && (window as any).YT.Player) {
        logDebug('system', 'YouTube Iframe API libraries detected. Initializing instances.');
        initializeYtPlayer();
        clearInterval(checkInterval);
      }
    }, 100);

    return () => clearInterval(checkInterval);
  }, [initializeYtPlayer]);

  // Keep one authoritative playback clock for the UI, scrobbling, Media Session,
  // and the native shell. HTMLMediaElement timeupdate can pause or become sparse
  // in a backgrounded view, so sample the actual player while playback is active.
  useEffect(() => {
    if (!isPlaying || currentTrack.id === 'placeholder') return;

    const samplePlaybackClock = () => {
      let currentTime = progressRef.current;
      let durationTime = durationRef.current;

      try {
        if (
          streamProtocol === 'embed'
          && isYouTubeTrack(currentTrack)
          && ytPlayerRef.current
          && typeof ytPlayerRef.current.getCurrentTime === 'function'
        ) {
          currentTime = Number(ytPlayerRef.current.getCurrentTime());
          durationTime = Number(ytPlayerRef.current.getDuration());
        } else {
          const audio = audioRef.current;
          if (audio) {
            currentTime = Number(audio.currentTime);
            durationTime = Number(audio.duration);
          }
        }
      } catch {
        return;
      }

      if (Number.isFinite(currentTime) && currentTime >= 0) {
        progressRef.current = currentTime;
        setProgress((previous) => Math.abs(previous - currentTime) >= 0.04 ? currentTime : previous);
      }
      if (Number.isFinite(durationTime) && durationTime > 0) {
        durationRef.current = durationTime;
        setDuration((previous) => Math.abs(previous - durationTime) >= 0.05 ? durationTime : previous);
        if (typeof navigator.mediaSession?.setPositionState === 'function') {
          try {
            navigator.mediaSession.setPositionState({
              duration: durationTime,
              playbackRate: 1,
              position: Math.min(Math.max(0, currentTime), durationTime),
            });
          } catch {
            // Some Chromium builds reject position state while metadata changes.
          }
        }
      }
    };

    samplePlaybackClock();
    const interval = window.setInterval(samplePlaybackClock, 250);
    return () => window.clearInterval(interval);
  }, [currentTrack.id, isPlaying, streamProtocol]);

  // Sync volume with Embed Player
  useEffect(() => {
    if (streamProtocol === 'embed' && isYouTubeTrack(currentTrack) && ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
      ytPlayerRef.current.setVolume(Math.max(0, Math.min(100, volume)));
    }
  }, [currentTrack.id, volume, streamProtocol]);

  // Fetch dynamic content on mount
  useEffect(() => {
    if (currentPage !== 'home') {
      setIsLoadingHome(false);
      return;
    }

    async function loadHomeContent() {
      setIsLoadingHome(true);
      try {
        // Seed the chart shelf from this profile's taste when it is ready so
        // Quick Picks stop being the same hardcoded query for every listener.
        const topTopic = privateTasteProfile.topics[0];
        const topArtist = privateTasteProfile.artists[0];
        const quickPicksQuery = privateTasteProfile.isReady
          ? (topTopic?.label ? `${topTopic.label} hits` : (topArtist?.label ? `${topArtist.label} hits` : 'Top Hits 2026'))
          : 'Top Hits 2026';
        const trendRes = await spiceFetch('local', '/yt/search', undefined, { q: quickPicksQuery, limit: 8 });
        const trendData = trendRes.ok ? await trendRes.json() : { tracks: [] };
        rememberTrackSnapshots(trendData.tracks || []);

        if (trendData.tracks?.length > 0) {
          setHomeTrending(reorderTracksByTaste(playableSearchTracks(trendData.tracks) as Track[], tasteAffinityContext));
        }

      } catch (err) {
        console.error('Failed to load dynamic home feeds:', err);
      } finally {
        setIsLoadingHome(false);
      }
    }

    loadHomeContent();

  }, [currentPage]);

  // Sync volume
  useEffect(() => {
    applyAudioElementVolume(audioRef.current, volume, { resumeAudioContext: isPlayingRef.current });
    const prepared = preparedCrossfadeRef.current;
    if (!prepared) return;
    const incoming = audioSlotRefs.current[prepared.slot];
    if (volume > 100 || volumeBoosterAccepted) {
      crossfadePreparationIdRef.current += 1;
      preparedCrossfadeRef.current = null;
      if (crossfadeAnimationFrameRef.current !== null) {
        cancelAnimationFrame(crossfadeAnimationFrameRef.current);
        crossfadeAnimationFrameRef.current = null;
      }
      incoming?.pause();
      incoming?.removeAttribute('src');
      if (incoming) delete incoming.dataset.spiceTrackKey;
      incoming?.load();
      if (incoming) audioTransitionGainsRef.current.set(incoming, 1);
      if (audioRef.current) audioTransitionGainsRef.current.set(audioRef.current, 1);
      applyAudioElementVolume(audioRef.current, volume);
      return;
    }
    applyAudioElementVolume(incoming, volume);
  }, [applyAudioElementVolume, volume, volumeBoosterAccepted]);

  // Audio Handlers
  const setAudioTransitionGain = (audio: HTMLAudioElement, gain: number) => {
    audioTransitionGainsRef.current.set(audio, Math.min(1, Math.max(0, gain)));
    applyAudioElementVolume(audio, volumeRef.current);
  };

  const cancelPreparedCrossfade = (restoreOutgoing = true) => {
    crossfadePreparationIdRef.current += 1;
    if (crossfadeAnimationFrameRef.current !== null) {
      cancelAnimationFrame(crossfadeAnimationFrameRef.current);
      crossfadeAnimationFrameRef.current = null;
    }
    crossfadeAnimationStarterRef.current = () => undefined;
    const prepared = preparedCrossfadeRef.current;
    preparedCrossfadeRef.current = null;
    if (prepared) {
      const incoming = audioSlotRefs.current[prepared.slot];
      if (incoming) {
        incoming.pause();
        incoming.removeAttribute('src');
        delete incoming.dataset.spiceTrackKey;
        incoming.load();
        setAudioTransitionGain(incoming, 1);
      }
    }
    if (restoreOutgoing && audioRef.current) setAudioTransitionGain(audioRef.current, 1);
  };

  const resolveCrossfadeStreamUrl = async (track: Track) => {
    if (isOfflineTrack(track) && track.permalinkUrl) return track.permalinkUrl;
    const endpoint = isSoundCloudTrack(track)
      ? spiceApiUrl('local', `/sc/track/${encodeURIComponent(soundCloudTrackId(track))}`, { quality: audioQuality })
      : spiceApiUrl('local', `/yt/track/${encodeURIComponent(track.id)}`);
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('Crossfade preload could not resolve the next track.');
    const payload = await response.json();
    if (!Array.isArray(payload.streams) || payload.streams.length === 0) {
      throw new Error('Crossfade preload found no compatible stream.');
    }
    return spiceApiResponseUrl('local', payload.streams[0].url);
  };

  // Playlist playback must remain an intentional playlist queue even if the
  // listener navigates away from its detail page. UI selection is not queue
  // provenance, so use the explicit origin recorded when playback starts.
  const isIntentionalPlaylistQueue = () => playlistQueueOriginRef.current !== null;

  const adaptiveWeightsForQueue = (tracks: Track[]) => adaptiveTrackWeights(
    adaptiveTrackPriorityRef.current,
    shuffleQueueKeys(tracks),
  );

  const beginAdaptiveListenCycle = (track: Track) => {
    const trackKey = playbackTrackKey(track);
    if (adaptiveListenCycleRef.current?.trackKey === trackKey) return;
    adaptiveListenCycleRef.current = track.id === 'placeholder' || !trackKey
      ? null
      : { trackKey, completionDisqualified: false };
  };

  useEffect(() => {
    adaptivePlaybackStartedRef.current = beginAdaptiveListenCycle;
  });

  const finishAdaptiveListenCycle = (completedNaturally: boolean) => {
    const cycle = adaptiveListenCycleRef.current;
    if (!cycle) return;
    adaptiveListenCycleRef.current = null;

    const outcome = classifyAdaptiveListen({
      completedNaturally: completedNaturally && !cycle.completionDisqualified,
      positionMs: Math.max(0, progressRef.current) * 1000,
      durationMs: Math.max(0, durationRef.current) * 1000,
    });
    const nextState = recordAdaptiveListenOutcome(
      adaptiveTrackPriorityRef.current,
      cycle.trackKey,
      outcome,
      currentTimestampMs(),
    );
    adaptiveTrackPriorityRef.current = nextState;
    setAdaptiveTasteScores(adaptiveTasteSkipScores(nextState));
    markTasteDirty('adaptive');
    scheduleTasteCloudSync();
    try {
      localStorage.setItem(
        adaptiveTrackPriorityStorageKey(activeProfileIdRef.current),
        JSON.stringify(nextState),
      );
    } catch {
      // Playback must continue even if local preference storage is unavailable.
    }
  };

  const nextCrossfadeTarget = (): {
    track: Track;
    queueIndex: number;
    shuffleHistory?: ShuffleHistoryState;
  } | null => {
    const currentQueue = queueRef.current;
    const currentIndex = queueIndexRef.current;
    if (currentQueue.length < 2 || repeatModeRef.current === 'one') return null;

    if (isShuffleRef.current) {
      const next = nextShuffleTrack(
        shuffleHistoryRef.current,
        shuffleQueueKeys(currentQueue),
        currentIndex,
        {
          random: getSecureRandom,
          wrap: repeatModeRef.current === 'all',
          weights: adaptiveWeightsForQueue(currentQueue),
        },
      );
      if (next.index === null) return null;
      const track = currentQueue[next.index];
      return track && track.id !== currentTrackRef.current.id
        ? { track, queueIndex: next.index, shuffleHistory: next.state }
        : null;
    }

    const atQueueTail = currentIndex >= currentQueue.length - 1;
    if (
      atQueueTail
      && !shouldRepeatPlaylistAtQueueTail(
        isIntentionalPlaylistQueue(),
        repeatModeRef.current,
      )
    ) return null;
    const nextIndex = (currentIndex + 1) % currentQueue.length;
    const track = currentQueue[nextIndex];
    return track && track.id !== currentTrackRef.current.id ? { track, queueIndex: nextIndex } : null;
  };

  const prepareCrossfade = async () => {
    const target = nextCrossfadeTarget();
    if (!target || preparedCrossfadeRef.current) return;
    const preparationId = ++crossfadePreparationIdRef.current;
    const outgoingTrackKey = playbackTrackKey(currentTrackRef.current);
    const slot = (activeAudioSlotRef.current === 0 ? 1 : 0) as 0 | 1;
    const prepared: PreparedCrossfade = {
      id: preparationId,
      outgoingTrackKey,
      track: target.track,
      queueIndex: target.queueIndex,
      streamUrl: '',
      slot,
      queueSnapshot: queueRef.current,
      shuffled: isShuffleRef.current,
      shuffleHistory: target.shuffleHistory,
      ready: false,
      started: false,
    };
    preparedCrossfadeRef.current = prepared;

    try {
      const resolvedUrl = await resolveCrossfadeStreamUrl(target.track);
      if (
        preparationId !== crossfadePreparationIdRef.current
        || outgoingTrackKey !== playbackTrackKey(currentTrackRef.current)
        || preparedCrossfadeRef.current !== prepared
        || prepared.queueSnapshot !== queueRef.current
        || prepared.shuffled !== isShuffleRef.current
      ) return;
      const incoming = audioSlotRefs.current[slot];
      if (!incoming) {
        cancelPreparedCrossfade();
        return;
      }
      prepared.streamUrl = resolvedUrl;
      setAudioTransitionGain(incoming, 0);
      incoming.dataset.spiceTrackKey = playbackTrackKey(target.track);
      incoming.src = resolvedUrl;
      incoming.load();
      prepared.ready = incoming.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
    } catch (error) {
      if (
        preparationId !== crossfadePreparationIdRef.current
        || outgoingTrackKey !== playbackTrackKey(currentTrackRef.current)
      ) return;
      logDebug('player', error instanceof Error ? error.message : 'Crossfade preload failed.');
      cancelPreparedCrossfade();
    }
  };

  const startPreparedCrossfade = () => {
    const prepared = preparedCrossfadeRef.current;
    const outgoing = audioRef.current;
    const incoming = prepared ? audioSlotRefs.current[prepared.slot] : null;
    if (!prepared || !outgoing || !incoming || !prepared.ready || prepared.started) return;
    if (!Number.isFinite(outgoing.duration)) return;
    const profile = activePlaybackProfileRef.current;
    if (!profile?.crossfade.enabled) return;
    const plan = createCrossfadePlan({
      trackDurationMs: outgoing.duration * 1000,
      crossfadeDurationMs: profile.crossfade.durationMs,
    });
    const state = crossfadeStateAt(plan, outgoing.currentTime * 1000);
    if (state.phase !== 'fading' && state.phase !== 'complete') return;
    prepared.started = true;
    resetAudioPlaybackPosition(incoming);
    setAudioTransitionGain(incoming, 0);
    void incoming.play().catch(() => {
      logDebug('player', 'Crossfade preload could not start; continuing the current track normally.');
      cancelPreparedCrossfade();
    });
    const animateGains = () => {
      const activePrepared = preparedCrossfadeRef.current;
      if (!activePrepared?.started || activePrepared.id !== prepared.id || audioRef.current !== outgoing) {
        crossfadeAnimationFrameRef.current = null;
        return;
      }
      if (outgoing.paused) {
        crossfadeAnimationFrameRef.current = null;
        return;
      }
      updateCrossfade(outgoing, outgoing.currentTime);
      crossfadeAnimationFrameRef.current = requestAnimationFrame(animateGains);
    };
    crossfadeAnimationStarterRef.current = () => {
      if (crossfadeAnimationFrameRef.current === null) {
        crossfadeAnimationFrameRef.current = requestAnimationFrame(animateGains);
      }
    };
    crossfadeAnimationStarterRef.current();
  };

  const updateCrossfade = (audio: HTMLAudioElement, currentTime: number) => {
    const profile = activePlaybackProfileRef.current;
    const currentQueue = queueRef.current;
    const currentQueueIndex = queueIndexRef.current;
    const hasEligibleNextTrack = currentQueue.length > 1
      && repeatModeRef.current !== 'one'
      && !(
        repeatModeRef.current === 'none'
        && !isShuffleRef.current
        && currentQueueIndex >= currentQueue.length - 1
      );
    if (
      !profile?.crossfade.enabled
      || profile.crossfade.durationMs <= 0
      || !Number.isFinite(audio.duration)
      || streamProtocolRef.current === 'embed'
      || volumeRef.current > 100
      || volumeBoosterAccepted
      || isControllingRemoteReceiver
      || !hasEligibleNextTrack
    ) {
      if (preparedCrossfadeRef.current) cancelPreparedCrossfade();
      else setAudioTransitionGain(audio, 1);
      return;
    }

    const preparedBeforeUpdate = preparedCrossfadeRef.current;
    if (preparedBeforeUpdate && (
      preparedBeforeUpdate.outgoingTrackKey !== playbackTrackKey(currentTrackRef.current)
      || preparedBeforeUpdate.queueSnapshot !== currentQueue
      || preparedBeforeUpdate.shuffled !== isShuffleRef.current
      || !currentQueue[preparedBeforeUpdate.queueIndex]
      || playbackTrackKey(currentQueue[preparedBeforeUpdate.queueIndex]) !== playbackTrackKey(preparedBeforeUpdate.track)
    )) {
      cancelPreparedCrossfade();
      return;
    }

    const plan = createCrossfadePlan({
      trackDurationMs: audio.duration * 1000,
      crossfadeDurationMs: profile.crossfade.durationMs,
    });
    const state = crossfadeStateAt(plan, currentTime * 1000);
    if (
      preparedCrossfadeRef.current?.started
      && state.phase !== 'fading'
      && state.phase !== 'complete'
    ) {
      cancelPreparedCrossfade();
      return;
    }
    if (state.shouldPreload && !preparedCrossfadeRef.current) {
      void prepareCrossfade();
    }
    const prepared = preparedCrossfadeRef.current;
    if ((state.phase === 'fading' || state.phase === 'complete') && prepared) {
      startPreparedCrossfade();
      if (prepared.started) {
        const incoming = audioSlotRefs.current[prepared.slot];
        const gains = crossfadeGains(state.progress, profile.crossfade.curve);
        setAudioTransitionGain(audio, gains.outgoing);
        if (incoming) setAudioTransitionGain(incoming, gains.incoming);
      }
    } else if (!prepared?.started) {
      setAudioTransitionGain(audio, 1);
    }
  };

  const handleTimeUpdate = (slot: 0 | 1, audio: HTMLAudioElement) => {
    if (slot !== activeAudioSlotRef.current || audioRef.current !== audio) return;
    progressRef.current = audio.currentTime;
    setProgress(audio.currentTime);
    updateCrossfade(audio, audio.currentTime);
  };

  const handleLoadedMetadata = (slot: 0 | 1, audio: HTMLAudioElement) => {
    if (slot === activeAudioSlotRef.current) {
      durationRef.current = audio.duration;
      setDuration(audio.duration);
    }
  };

  const handleAudioPlaying = (slot: 0 | 1, audio: HTMLAudioElement) => {
    if (
      slot !== activeAudioSlotRef.current
      || audioRef.current !== audio
      || audio.paused
      || !shouldAutoPlayRef.current
      || audio.dataset.spiceTrackKey !== playbackTrackKey(currentTrackRef.current)
    ) return;
    const activeStreamUrl = streamUrlRef.current;
    if (!activeStreamUrl || activeStreamUrl === 'youtube-embed-active') return;
    let normalizedStreamUrl = activeStreamUrl;
    try {
      normalizedStreamUrl = new URL(activeStreamUrl, window.location.href).href;
    } catch { }
    if (audio.currentSrc !== normalizedStreamUrl) return;
    adaptivePlaybackStartedRef.current(currentTrackRef.current);
  };

  const handleAudioCanPlay = (slot: 0 | 1, audio: HTMLAudioElement) => {
    const prepared = preparedCrossfadeRef.current;
    if (prepared?.slot === slot) {
      prepared.ready = true;
      startPreparedCrossfade();
      return;
    }
    if (slot !== activeAudioSlotRef.current || audioRef.current !== audio) return;

    setAudioTransitionGain(audio, 1);
    applyAudioElementVolume(audio, volumeRef.current);
    if (!shouldAutoPlayRef.current && !isPlayingRef.current) return;

    requestAnimationFrame(() => {
      const latestAudio = audioRef.current;
      if (!latestAudio || latestAudio !== audio || !shouldAutoPlayRef.current) return;
      applyAudioElementVolume(latestAudio, volumeRef.current, { resumeAudioContext: true });
      latestAudio.play().then(() => {
        setPlaybackPlaying(true);
      }).catch(() => {
        shouldAutoPlayRef.current = false;
        isPlayingRef.current = false;
        setIsPlaying(false);
        logDebug('stream', 'Direct audio is ready. Browser autoplay was blocked; use the play button to continue.');
      });
    });
  };

  // ── Cloud Accounts Synchronization & Authentication ──────────────
  const finalizePreparedCrossfade = () => {
    const prepared = preparedCrossfadeRef.current;
    if (!prepared?.started) return false;
    const outgoing = audioRef.current;
    const incoming = audioSlotRefs.current[prepared.slot];
    if (!incoming) return false;

    preparedCrossfadeRef.current = null;
    crossfadePreparationIdRef.current += 1;
    if (crossfadeAnimationFrameRef.current !== null) {
      cancelAnimationFrame(crossfadeAnimationFrameRef.current);
      crossfadeAnimationFrameRef.current = null;
    }
    crossfadeAnimationStarterRef.current = () => undefined;
    if (outgoing && outgoing !== incoming) {
      outgoing.dataset.spiceActive = 'false';
      outgoing.pause();
      outgoing.removeAttribute('src');
      delete outgoing.dataset.spiceTrackKey;
      outgoing.load();
      setAudioTransitionGain(outgoing, 1);
    }
    try { sourceNodeRef.current?.disconnect(); } catch { }
    try { gainNodeRef.current?.disconnect(); } catch { }
    sourceNodeRef.current = null;
    gainNodeRef.current = null;

    activeAudioSlotRef.current = prepared.slot;
    audioRef.current = incoming;
    incoming.dataset.spiceActive = 'true';
    setAudioTransitionGain(incoming, 1);
    currentTrackRef.current = prepared.track;
    queueIndexRef.current = prepared.queueIndex;
    if (prepared.shuffled && prepared.shuffleHistory) {
      shuffleHistoryRef.current = prepared.shuffleHistory;
    }
    streamUrlRef.current = prepared.streamUrl;
    progressRef.current = incoming.currentTime;
    durationRef.current = Number.isFinite(incoming.duration)
      ? incoming.duration
      : (prepared.track.durationMs || 0) / 1000;
    beginProfileListenCycle(prepared.track);
    beginAdaptiveListenCycle(prepared.track);
    setCurrentTrack(prepared.track);
    setQueueIndex(prepared.queueIndex);
    setStreamUrl(prepared.streamUrl);
    setProgress(incoming.currentTime);
    if (Number.isFinite(incoming.duration)) setDuration(incoming.duration);
    setPlaybackPlaying(true);
    setIsLoadingStream(false);
    isLoadingStreamRef.current = false;
    recordPlaybackTelemetry(prepared.track);
    logDebug('player', `Crossfade completed into "${prepared.track.title}".`);
    return true;
  };

  useEffect(() => () => {
    crossfadePreparationIdRef.current += 1;
    if (crossfadeAnimationFrameRef.current !== null) {
      cancelAnimationFrame(crossfadeAnimationFrameRef.current);
      crossfadeAnimationFrameRef.current = null;
    }
    for (const audio of audioSlotRefs.current) {
      if (!audio) continue;
      audio.pause();
      audio.removeAttribute('src');
      delete audio.dataset.spiceTrackKey;
      audio.load();
    }
    try { sourceNodeRef.current?.disconnect(); } catch { }
    try { gainNodeRef.current?.disconnect(); } catch { }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close().catch(() => undefined);
    }
  }, []);

  const syncWithCloud = async (
    token: string | null = cloudToken,
    profileId: string = activeProfileId,
    sessionOverride: Partial<Pick<UserProfile, 'cloudUser' | 'cloudUsername'>> = {},
  ) => {
    if (!token) return;
    if (syncLockRef.current) {
      logDebug('database', 'Sync already in progress. Skipping duplicate sync request.');
      return;
    }
    const syncProfileId = profileId;
    syncLockRef.current = true;
    setSyncingStatus('syncing');
    setDbError(null);
    logDebug('database', 'Initiating full sync merge with Cloud Neon Database...');

    // Retry helper with exponential backoff
    const fetchWithRetry = async (url: string, options: RequestInit = {}, label: string, maxRetries = 3): Promise<Response> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(url, options);
          if (res.ok) return res;
          if (attempt < maxRetries && res.status >= 500) {
            const delay = 500 * Math.pow(2, attempt - 1);
            logDebug('database', `[SYNC] [WARN] ${label} returned ${res.status}, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          return res; // Return non-retriable errors as-is
        } catch (err) {
          if (attempt < maxRetries) {
            const delay = 500 * Math.pow(2, attempt - 1);
            logDebug('database', `[SYNC] [WARN] ${label} network error, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
            await new Promise(r => setTimeout(r, delay));
          } else {
            throw err;
          }
        }
      }
      throw new Error(`${label} failed after ${maxRetries} retries`);
    };

    try {
      // 0. Read current local states directly from localStorage to completely bypass React state hydration race conditions
      const savedProfilesStr = localStorage.getItem('spice_profiles_list');
      let localProfiles: UserProfile[] = profiles;
      try {
        if (savedProfilesStr) {
          const parsed = JSON.parse(savedProfilesStr);
          if (parsed && parsed.length > 0) localProfiles = parsed;
        }
      } catch { }

      const activeProf = localProfiles.find(p => p.id === syncProfileId) || localProfiles[0] || initialDefaultProfile;
      const syncStillMatchesActiveProfile = () => (
        activeProfileIdRef.current === activeProf.id && cloudTokenRef.current === token
      );
      const canUseCurrentSession = syncStillMatchesActiveProfile();
      const activeSessionUser = sessionOverride.cloudUser !== undefined
        ? sessionOverride.cloudUser
        : (activeProf.cloudUser ?? (canUseCurrentSession ? cloudUserRef.current : null));
      const activeSessionUsername = sessionOverride.cloudUsername
        ?? activeProf.cloudUsername
        ?? (canUseCurrentSession ? cloudUsernameRef.current : null)
        ?? activeSessionUser?.username
        ?? null;

      const localLikes = new Set<string>(activeProf.likedTracks || []);
      const localLikedDetails = activeProf.likedTrackDetails || {};
      const localHistory = activeProf.history || [];
      const localPlaylists = activeProf.customPlaylists || [];

      // 1. Pull profiles list
      const profRes = await fetchWithRetry(spiceApiUrl('cloud', '/sync/profiles'), {
        headers: { 'Authorization': `Bearer ${token}` }
      }, 'Profiles pull');
      if (!profRes.ok) {
        const errJson = await profRes.json().catch(() => ({}));
        const block = parseAccountBlockPayload(errJson);
        if (block) setAccountBlock(block);
        throw new Error(errJson.message || `Failed to retrieve profiles (Status ${profRes.status})`);
      }
      const profData = await profRes.json();
      const serverProfiles = profData.profiles ?? [];
      logDebug('database', `[SYNC] [OK] Profiles pulled (${serverProfiles.length} from cloud)`);

      if (profData.localFallback) {
        setIsLocalDbFallback(true);
        localStorage.setItem('spice_local_db_fallback', 'true');
      } else {
        setIsLocalDbFallback(false);
        localStorage.setItem('spice_local_db_fallback', 'false');
      }

      // 2-4. Pull independent active-profile datasets concurrently.
      const pullOptionalSyncData = async (url: string, label: string): Promise<any | null> => {
        try {
          const response = await fetchWithRetry(url, {
            headers: { 'Authorization': `Bearer ${token}` },
          }, `${label} pull`);
          if (!response.ok) {
            logDebug('database', `[SYNC] [ERROR] ${label} pull failed (Status ${response.status}), using local only`);
            return null;
          }
          return await response.json();
        } catch (err: any) {
          logDebug('database', `[SYNC] [ERROR] ${label} pull error: ${err.message}, using local only`);
          return null;
        }
      };

      const [likesData, historyData, playlistsData] = await Promise.all([
        pullOptionalSyncData(spiceApiUrl('cloud', '/sync/likes', { profileId: activeProf.id }), 'Likes'),
        pullOptionalSyncData(spiceApiUrl('cloud', '/sync/history', { profileId: activeProf.id }), 'History'),
        pullOptionalSyncData(spiceApiUrl('cloud', '/sync/playlists', { profileId: activeProf.id }), 'Playlists'),
      ]);
      const serverLikes: string[] = likesData?.likedTracks ?? [];
      const serverLikedDetails: Record<string, Track> = likesData?.likedTrackDetails ?? {};
      const serverHistory: Track[] = historyData?.history ?? [];
      const serverPlaylists: any[] = playlistsData?.playlists ?? [];
      const playlistsPullSucceeded = playlistsData !== null;
      if (likesData !== null) {
        logDebug('database', `[SYNC] [OK] Likes pulled (${serverLikes.length} from cloud)`);
      }
      if (historyData !== null) {
        logDebug('database', `[SYNC] [OK] History pulled (${serverHistory.length} from cloud)`);
      }
      if (playlistsPullSucceeded) {
        logDebug('database', `[SYNC] [OK] Playlists pulled (${serverPlaylists.length} from cloud)`);
      }

      // 5. Merge Active Profile Data
      const mergedLikes = new Set([...localLikes, ...serverLikes]);
      const mergedLikesArray = Array.from(mergedLikes);
      const mergedLikedDetails = Object.fromEntries(
        mergedLikesArray
          .map((id) => {
            const localTrack = localLikedDetails[id];
            const serverTrack = serverLikedDetails[id];
            if (!localTrack && !serverTrack) return null;
            return [id, enrichTrackSnapshot(
              localTrack && serverTrack ? mergeTrackSnapshots(serverTrack, localTrack) : (localTrack || serverTrack),
            )];
          })
          .filter((entry): entry is [string, Track] => entry !== null),
      );

      const mergedHistoryMap = new Map<string, Track>();
      [...localHistory, ...serverHistory].forEach(track => {
        const key = playbackTrackKey(track);
        mergedHistoryMap.set(key, enrichTrackSnapshot(mergeTrackSnapshots(mergedHistoryMap.get(key), track)));
      });
      const mergedHistory = Array.from(mergedHistoryMap.values()).slice(0, 50);

      const localOwnedPlaylists = localPlaylists.filter((playlist) => !playlist.shared);
      const mergedPlaylists = playlistsPullSucceeded ? [...localOwnedPlaylists] : [...localPlaylists];
      serverPlaylists.forEach((serverPl: any) => {
        const incoming = normalizePlaylistSnapshot(serverPl);
        const existingIndex = mergedPlaylists.findIndex((playlist) => (
          playlist.id === incoming.id || (!playlist.shared && !incoming.shared && playlist.title === incoming.title)
        ));

        if (existingIndex === -1) {
          mergedPlaylists.push(incoming);
        } else {
          const existing = mergedPlaylists[existingIndex];
          const mergedTracks = mergePlaylistOccurrences(
            incoming.tracks,
            existing.tracks,
            (track) => `${track.sourceId ?? 'youtube_music'}:${track.id}`,
            (existingTrack, incomingTrack) => enrichTrackSnapshot(
              mergeTrackSnapshots(existingTrack, incomingTrack),
            ),
          );
          mergedPlaylists[existingIndex] = {
            ...existing,
            ...incoming,
            tracks: mergedTracks,
          };
        }
      });

      // 6. Merge Profiles Configuration List
      const mergedProfiles = [...localProfiles];
      serverProfiles.forEach((serverProf: any) => {
        const existingIdx = mergedProfiles.findIndex(p => p.id === serverProf.id);
        if (existingIdx !== -1) {
          const existingProfile = mergedProfiles[existingIdx];
          const mergedUsername = mergeProfileUsername(
            serverProf.username,
            existingProfile.cloudUsername,
            activeSessionUsername,
            serverProf.id === activeProf.id,
          );
          mergedProfiles[existingIdx] = {
            ...existingProfile,
            displayName: mergeProfileDisplayName(
              existingProfile.displayName,
              serverProf.displayName,
              mergedUsername,
            ),
            bio: serverProf.bio || '',
            gradient: serverProf.gradient,
            songsPlayed: mergeSongsPlayedCount(
              existingProfile.songsPlayed,
              serverProf.songsPlayed,
            ),
            joinedAt: serverProf.joinedAt,
            passcode: serverProf.passcode || undefined,
            avatarUrl: mergeProfileAvatarUrl(
              existingProfile.avatarUrl,
              serverProf.avatarUrl,
              serverProf.displayName,
            ),
            // Explicitly preserve credentials in case they are missing from serverProf
            cloudToken: existingProfile.cloudToken ?? null,
            cloudUser: existingProfile.cloudUser ?? null,
            cloudUsername: mergedUsername ?? null,
          };
        } else {
          const mergedUsername = mergeProfileUsername(
            serverProf.username,
            null,
            activeSessionUsername,
            serverProf.id === activeProf.id,
          );
          mergedProfiles.push({
            id: serverProf.id,
            displayName: mergeProfileDisplayName(
              undefined,
              serverProf.displayName,
              mergedUsername,
            ),
            bio: serverProf.bio || '',
            gradient: serverProf.gradient,
            songsPlayed: mergeSongsPlayedCount(0, serverProf.songsPlayed),
            joinedAt: serverProf.joinedAt,
            passcode: serverProf.passcode || undefined,
            avatarUrl: mergeProfileAvatarUrl(undefined, serverProf.avatarUrl, serverProf.displayName),
            likedTracks: [],
            likedTrackDetails: {},
            customPlaylists: [],
            history: [],
            cloudToken: token,
            cloudUser: activeSessionUser,
            cloudUsername: mergedUsername,
          });
        }
      });

      // 7. Inject active profile merges
      const finalProfiles = mergedProfiles.map(p => {
        if (p.id === activeProf.id) {
          return {
            ...p,
            displayName: mergeProfileDisplayName(
              p.displayName,
              p.displayName,
              activeSessionUsername ?? p.cloudUsername,
            ),
            songsPlayed: mergeSongsPlayedCount(
              p.songsPlayed,
              activeProf.songsPlayed,
              mergedHistory.length,
            ),
            likedTracks: mergedLikesArray,
            likedTrackDetails: mergedLikedDetails,
            customPlaylists: mergedPlaylists,
            history: mergedHistory,
            // Keep the authenticated account bound to this exact profile.
            cloudToken: token,
            cloudUser: activeSessionUser,
            cloudUsername: activeSessionUsername ?? p.cloudUsername ?? null,
          };
        }
        return p;
      });
      let latestSavedProfiles: UserProfile[] = [];
      const latestSavedProfilesStr = localStorage.getItem('spice_profiles_list');
      if (latestSavedProfilesStr) {
        try {
          const parsed = JSON.parse(latestSavedProfilesStr);
          if (Array.isArray(parsed)) {
            latestSavedProfiles = parsed;
          }
        } catch { }
      }
      const profilesToPersist = finalProfiles.map((profile) => {
        const latest = latestSavedProfiles.find(savedProfile => savedProfile.id === profile.id);
        if (!latest) return profile;

        if (profile.id === activeProf.id) {
          if (latest.cloudToken === token) {
            return {
              ...profile,
              cloudToken: token,
              cloudUser: latest.cloudUser !== undefined ? latest.cloudUser : profile.cloudUser,
              cloudUsername: mergeProfileUsername(latest.cloudUsername, profile.cloudUsername, null, false),
            };
          }
          return profile;
        }

        return {
          ...profile,
          cloudToken: latest.cloudToken !== undefined ? latest.cloudToken : (profile.cloudToken ?? null),
          cloudUser: latest.cloudUser !== undefined ? latest.cloudUser : (profile.cloudUser ?? null),
          cloudUsername: mergeProfileUsername(latest.cloudUsername, profile.cloudUsername, null, false),
        };
      });

      rememberTrackSnapshots([
        ...Object.values(mergedLikedDetails),
        ...mergedHistory,
        ...mergedPlaylists.flatMap((playlist) => playlist.tracks),
      ]);
      setProfiles(profilesToPersist);
      saveProfilesToStorage(profilesToPersist);

      // 8. Update visible client state only if this sync still belongs to the selected profile.
      if (activeProf && syncStillMatchesActiveProfile()) {
        const persistedActiveProfile = profilesToPersist.find(profile => profile.id === activeProf.id);
        const visibleProfile = persistedActiveProfile ?? activeProf;
        const visibleSessionUser = persistedActiveProfile?.cloudUser ?? activeSessionUser ?? null;
        const visibleSessionUsername = persistedActiveProfile?.cloudUsername ?? activeSessionUsername ?? null;
        setLikedTracks(mergedLikes);
        setLikedTrackDetails(mergedLikedDetails);
        setHistory(mergedHistory);
        setCustomPlaylists(mergedPlaylists);
        activeProfileRef.current = visibleProfile;
        setActiveProfileId(activeProf.id);
        localStorage.setItem('spice_active_profile_id', activeProf.id);
        setEditName(visibleProfile.displayName);
        setEditBio(visibleProfile.bio);
        setEditGradient(visibleProfile.gradient);
        setEditPasscode(visibleProfile.passcode || '');
        setEditAvatarUrl(visibleProfile.avatarUrl || '');
        setCloudToken(token);
        setCloudUser(visibleSessionUser);
        setCloudUsername(visibleSessionUsername);
        cloudTokenRef.current = token;
        cloudUserRef.current = visibleSessionUser;
        cloudUsernameRef.current = visibleSessionUsername;
      }

      // 9. Push Merged States to Cloud Database (each independently)
      const profilesForAccount = accountBoundProfiles(
        profilesToPersist,
        token,
        activeSessionUser?.id,
      );
      const pushEndpoints: Array<{ label: string; url: string; body: unknown }> = [
        { label: 'Profiles', url: spiceApiUrl('cloud', '/sync/profiles'), body: { profiles: profilesForAccount } },
      ];
      const skippedPushLabels: string[] = [];

      if (likesData !== null) {
        pushEndpoints.push({ label: 'Likes', url: spiceApiUrl('cloud', '/sync/likes'), body: { likedTracks: mergedLikesArray, likedTrackDetails: mergedLikedDetails, profileId: activeProf.id } });
      } else {
        skippedPushLabels.push('Likes');
      }
      if (historyData !== null) {
        pushEndpoints.push({ label: 'History', url: spiceApiUrl('cloud', '/sync/history'), body: { history: mergedHistory, profileId: activeProf.id } });
      } else {
        skippedPushLabels.push('History');
      }
      if (playlistsPullSucceeded) {
        pushEndpoints.push({ label: 'Playlists', url: spiceApiUrl('cloud', '/sync/playlists'), body: { playlists: ownedPlaylistsOnly(mergedPlaylists), profileId: activeProf.id, includeSnapshots: false } });
      } else {
        skippedPushLabels.push('Playlists');
      }

      const pushResults = await Promise.all(pushEndpoints.map(async (ep) => {
        try {
          const res = await fetchWithRetry(ep.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(ep.body)
          }, `${ep.label} push`);
          if (res.ok) {
            logDebug('database', `[SYNC] [OK] ${ep.label} pushed successfully`);
            return true;
          } else {
            logDebug('database', `[SYNC] [ERROR] ${ep.label} push failed (Status ${res.status})`);
            return false;
          }
        } catch (err: any) {
          logDebug('database', `[SYNC] [ERROR] ${ep.label} push error: ${err.message}`);
          return false;
        }
      }));
      const pushFailures = pushResults.filter((succeeded) => !succeeded).length;

      if (pushFailures === 0 && skippedPushLabels.length === 0) {
        logDebug('database', `[SYNC] Merged state with cloud database successfully. Merged: ${mergedLikesArray.length} likes, ${mergedHistory.length} history items, ${mergedPlaylists.length} playlists, ${profilesToPersist.length} profiles.`);
        setSyncingStatus('success');
      } else {
        const skippedSummary = skippedPushLabels.length > 0
          ? ` Skipped ${skippedPushLabels.join(', ')} pushes because their cloud pulls failed.`
          : '';
        logDebug('database', `[SYNC] Partial sync completed with ${pushFailures} push failure(s).${skippedSummary}`);
        setSyncingStatus('partial');
      }
      setTimeout(() => setSyncingStatus(null), 3000);
    } catch (err: any) {
      console.error('Cloud synchronization error:', err);
      logDebug('error', `Cloud synchronization failed: ${err.message || err}`);
      if (err.message === 'db_not_configured') {
        setDbError('Cloud database connection is not configured in the backend environment.');
      }
      setSyncingStatus('error');
    } finally {
      syncLockRef.current = false;
    }
  };

  const finishCloudAuthentication = async (data: any, authProfileId: string, sourceMode: 'login' | 'register') => {
      if (!data?.token || !data?.user) throw new Error('The account service returned an invalid session.');
      if (activeProfileIdRef.current !== authProfileId) {
        throw new Error('The active profile changed while signing in. Please try again on the intended profile.');
      }
      if (data.localFallback) {
        setIsLocalDbFallback(true);
        localStorage.setItem('spice_local_db_fallback', 'true');
      } else {
        setIsLocalDbFallback(false);
        localStorage.setItem('spice_local_db_fallback', 'false');
      }

      localStorage.setItem('spice_cloud_token', data.token);
      localStorage.setItem('spice_cloud_user', JSON.stringify(data.user));
      localStorage.setItem('spice_cloud_profile_id', authProfileId);
      setCloudToken(data.token);
      setCloudUser(data.user);
      remoteRequestGenerationRef.current += 1;
      setRemoteTransport('unknown');
      setRemoteRedisConfigured(null);
      const accountUsername = typeof data.user?.username === 'string'
        ? data.user.username.trim().toLowerCase()
        : '';
      const registeredUsername = accountUsername || (sourceMode === 'register' ? authUsername.trim().toLowerCase() : null);
      setCloudUsername(registeredUsername);
      cloudTokenRef.current = data.token;
      cloudUserRef.current = data.user;
      cloudUsernameRef.current = registeredUsername;
      updateProfileData(authProfileId, {
        cloudToken: data.token,
        cloudUser: data.user,
        cloudUsername: registeredUsername,
      });
      setAuthEmail('');
      setAuthPassword('');
      setAuthUsername('');
      setEmailVerification(null);
      setEmailVerificationCode('');
      logDebug('auth', `User "${data.user.email}" authenticated successfully via ${sourceMode}. Token generated.`);

      // Auto sync after login
      await syncWithCloud(data.token, authProfileId, { cloudUser: data.user, cloudUsername: registeredUsername });
      if (activeProfileIdRef.current !== authProfileId) return;
      await restoreProfileConnections(data.token);
      void fetchUsername(data.token, authProfileId);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const authProfileId = activeProfileIdRef.current;
    setAuthError(null);
    setAuthLoading(true);
    setDbError(null);

    const url = authMode === 'login' ? spiceApiUrl('cloud', '/auth/spice/signin') : spiceApiUrl('cloud', '/auth/spice/signup');
    try {
      const payload: any = { email: authEmail, password: authPassword };
      if (authMode === 'register') payload.username = authUsername;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        const block = parseAccountBlockPayload(data);
        if (block) setAccountBlock(block);
        throw new Error(data.message || 'Authentication failed.');
      }
      if (activeProfileIdRef.current !== authProfileId) {
        throw new Error('The active profile changed while signing in. Please try again on the intended profile.');
      }

      if (data.verificationRequired === true && typeof data.registrationId === 'string') {
        setEmailVerification({
          registrationId: data.registrationId,
          email: typeof data.email === 'string' ? data.email : authEmail,
        });
        setEmailVerificationCode('');
        setAuthPassword('');
        return;
      }

      await finishCloudAuthentication(data, authProfileId, authMode);
    } catch (err: any) {
      console.error(err);
      logDebug('error', `Authentication attempt failed: ${err.message || err}`);
      setAuthError(err.message || 'Server authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const disconnectListenTogetherForIdentityChange = (token = cloudTokenRef.current) => {
    if (token && listenTogetherSession) {
      void spiceFetch('cloud', '/listen-together/session', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    } else if (token && listenTogetherHostSessionId) {
      void spiceFetch('cloud', '/listen-together/invite', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }, { sessionId: listenTogetherHostSessionId }).catch(() => undefined);
    }
    setListenTogetherSession(null);
    setListenTogetherHostSessionId(null);
    setListenTogetherHostName(null);
    setListenTogetherInvitesList([]);
    setListenTogetherStatus('Ready to start or join a session.');
    localStorage.removeItem(LISTEN_TOGETHER_STATE_STORAGE_KEY);
  };

  const handleLogout = () => {
    remoteRequestGenerationRef.current += 1;
    const logoutProfileId = activeProfileIdRef.current;
    disconnectListenTogetherForIdentityChange();
    syncOutboxRef.current?.cancelProfile(logoutProfileId);
    localStorage.removeItem('spice_cloud_token');
    localStorage.removeItem('spice_cloud_user');
    localStorage.removeItem('spice_cloud_profile_id');
    localStorage.removeItem(remotePairingCredentialStorageKey(logoutProfileId));
    setCloudToken(null);
    setCloudUser(null);
    setCloudUsername(null);
    setAccountBlock(null);
    setPairedRemoteCredential(null);
    setRemoteDevices([]);
    setSelectedRemoteDeviceId('');
    setRemoteTransport('unknown');
    setRemoteRedisConfigured(null);
    localStorage.removeItem('spice_connect_receiver_id');
    optimisticRemoteDeviceStateRef.current = null;
    cloudTokenRef.current = null;
    cloudUserRef.current = null;
    cloudUsernameRef.current = null;
    updateProfileData(logoutProfileId, {
      cloudToken: null,
      cloudUser: null,
      cloudUsername: null,
    });
    setLastFmAccountLinked(false);
    setLastFmSessionKey('');
    setListenBrainzAccountLinked(false);
    setListenBrainzToken('');
    localStorage.removeItem('spice_lastfm_session_key');
    localStorage.setItem('spice_lastfm_account_linked', 'false');
    setDbError(null);
    setAuthError(null);
    logDebug('auth', 'Logged out from Spice Cloud Account. Switched to offline database sandbox mode.');
  };

  // Sync on load or profile switch
  useEffect(() => {
    if (!isHydratedCloudToken(isProfileHydrated, cloudToken)) return;
    void syncWithCloud(cloudToken, activeProfileId);
  }, [cloudToken, activeProfileId, isProfileHydrated]);

  const currentTrackKey = playbackTrackKey(currentTrack);
  const activeProfileListenProviders = (): ProfileListenProvider[] => [
    lastFmSessionKey.trim() || lastFmAccountLinked ? 'lastfm' : null,
    listenBrainzToken.trim() || listenBrainzAccountLinked ? 'listenbrainz' : null,
  ].filter((provider): provider is ProfileListenProvider => provider !== null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaSession) return;

    if (currentTrack.id === 'placeholder') {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    const rawArtwork = currentTrack.artworkUrl || currentTrack.album?.artworkUrl;
    let artworkUrl = '';
    if (rawArtwork) {
      try {
        artworkUrl = new URL(rawArtwork, window.location.origin).toString();
      } catch {
        artworkUrl = '';
      }
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: profileArtistName(currentTrack),
        album: currentTrack.album?.title || 'SPICE Music',
        ...(artworkUrl ? { artwork: [{ src: artworkUrl }] } : {}),
      });
    } catch {
      // Media Session is an enhancement; playback must not depend on it.
    }
  }, [currentTrackKey]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaSession || currentTrack.id === 'placeholder') return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [currentTrackKey, isPlaying]);

  useEffect(() => {
    const nativeWindow = window as Window & {
      __spiceGetPlaybackSnapshot?: () => Record<string, unknown>;
    };
    const getPlaybackSnapshot = () => {
      if (currentTrack.id === 'placeholder') {
        return {
          sourceService: 'spice_crazy',
          shellOnly: true,
          paused: true,
          currentTime: 0,
          duration: 0,
        };
      }

      let currentTime = progressRef.current;
      let currentDuration = durationRef.current || (currentTrack.durationMs || 0) / 1000;
      try {
        if (
          streamProtocol === 'embed'
          && isYouTubeTrack(currentTrack)
          && ytPlayerRef.current
          && typeof ytPlayerRef.current.getCurrentTime === 'function'
        ) {
          currentTime = Number(ytPlayerRef.current.getCurrentTime());
          currentDuration = Number(ytPlayerRef.current.getDuration()) || currentDuration;
        } else if (audioRef.current) {
          currentTime = Number(audioRef.current.currentTime);
          currentDuration = Number(audioRef.current.duration) || currentDuration;
        }
      } catch {
        // Ref-backed values below remain a consistent fallback.
      }

      const rawArtwork = currentTrack.artworkUrl || currentTrack.album?.artworkUrl || '';
      let artworkUrl = rawArtwork;
      if (rawArtwork) {
        try {
          artworkUrl = new URL(rawArtwork, window.location.origin).toString();
        } catch { }
      }

      return {
        sourceService: 'spice_crazy',
        id: currentTrack.id,
        sourceId: currentTrack.sourceId || 'youtube_music',
        title: currentTrack.title,
        artist: profileArtistName(currentTrack),
        album: currentTrack.album?.title || '',
        albumArt: artworkUrl,
        duration: Number.isFinite(currentDuration) && currentDuration > 0 ? currentDuration : 0,
        currentTime: Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0,
        paused: !isPlayingRef.current,
        listenUrl: buildPublicSongShareUrl(currentTrack),
        shuffle: isShuffleRef.current,
        repeat: repeatModeRef.current,
        likeStatus: likedTracks.has(currentTrack.id),
        queueIndex: queueIndexRef.current,
        queueLength: queueRef.current.length,
      };
    };

    Object.defineProperty(nativeWindow, '__spiceGetPlaybackSnapshot', {
      configurable: true,
      value: getPlaybackSnapshot,
      writable: true,
    });
    return () => {
      if (nativeWindow.__spiceGetPlaybackSnapshot === getPlaybackSnapshot) {
        Reflect.deleteProperty(nativeWindow, '__spiceGetPlaybackSnapshot');
      }
    };
  }, [currentTrackKey, streamProtocol, likedTracks]);

  const setPlaybackPlaying = (nextPlaying: boolean) => {
    if (isPlayingRef.current !== nextPlaying) {
      const track = currentTrackRef.current;
      recommendationListenProgressRef.current = resetRecommendationListenObservation(
        recommendationListenProgressRef.current,
        playbackTrackKey(track),
        Math.max(0, progressRef.current),
        currentTimestampMs(),
      );
    }
    isPlayingRef.current = nextPlaying;
    setIsPlaying(nextPlaying);
  };

  const beginProfileListenCycle = (track: Track) => {
    recommendationListenCreditedRef.current = false;
    if (!track || track.id === 'placeholder' || track.id === 'spice-connect-placeholder') {
      scrobbleStateRef.current = null;
      setProfileSyncStatus('idle');
      setLastFmPlaybackStatus(null);
      return;
    }

    recommendationListenProgressRef.current = beginRecommendationListenProgress(
      playbackTrackKey(track),
      0,
      currentTimestampMs(),
    );

    scrobbleStateRef.current = createProfileListenDeliveryState(
      playbackTrackKey(track),
      Math.floor(currentTimestampMs() / 1000),
    );
    setProfileSyncStatus('idle');
    setLastFmPlaybackStatus(null);
  };

  const clearPlaybackRetryTimer = () => {
    if (playbackRetryTimeoutRef.current) {
      clearTimeout(playbackRetryTimeoutRef.current);
      playbackRetryTimeoutRef.current = null;
    }
  };

  const schedulePlaybackRetry = (track: Track, retryQueue: Track[], reason: string) => {
    if (!track || track.id === 'placeholder') return false;

    const trackKey = playbackTrackKey(track);
    const isListenTogetherRetry = Boolean(listenTogetherHostSessionIdRef.current);
    const nextAttempt = (playbackRetryCountsRef.current.get(trackKey) ?? 0) + 1;

    if (nextAttempt > PLAYBACK_STREAM_RETRY_LIMIT) {
      playbackRetryCountsRef.current.delete(trackKey);
      shouldAutoPlayRef.current = false;
      setPlaybackPlaying(false);
      setIsLoadingStream(false);
      isLoadingStreamRef.current = false;
      setError('Playback failed after repeated retries. Press play to try again or choose another track.');
      logDebug('error', `Playback failed after ${PLAYBACK_STREAM_RETRY_LIMIT} retries for "${track.title}". ${reason}`);
      return true;
    }

    playbackRetryCountsRef.current.set(trackKey, nextAttempt);
    clearPlaybackRetryTimer();

    const delay = PLAYBACK_STREAM_RETRY_DELAY_MS * nextAttempt;
    const queueSnapshot = retryQueue.length > 0 ? retryQueue : [track];
    setPlaybackPlaying(false);
    setIsLoadingStream(false);
    isLoadingStreamRef.current = false;
    setError(`Playback failed. Retrying this track (${nextAttempt}/${PLAYBACK_STREAM_RETRY_LIMIT})...`);
    logDebug('player', `Playback failed for "${track.title}". Retrying the same track in ${delay}ms (${nextAttempt}/${PLAYBACK_STREAM_RETRY_LIMIT}). ${reason}`);

    playbackRetryTimeoutRef.current = setTimeout(() => {
      playbackRetryTimeoutRef.current = null;
      if (!shouldAutoPlayRef.current && !isPlayingRef.current) return;
      void playTrackRef.current(track, queueSnapshot, undefined, isListenTogetherRetry, true);
    }, delay);

    return true;
  };

  const recordPlaybackTelemetry = (track: Track) => {
    const trackKey = playbackTrackKey(track);
    if (playbackTelemetryRecordedRef.current.has(trackKey)) return;
    playbackTelemetryRecordedRef.current.add(trackKey);

    const profileHistory = activeProfileRef.current?.history || history;
    const existingTrack = profileHistory.find((item) => playbackTrackKey(item) === trackKey);
    const historyTrack = {
      ...mergeTrackSnapshots(existingTrack, track),
      msListened: existingTrack?.msListened ?? 0,
    } as Track;
    const filteredHist = profileHistory.filter((item) => playbackTrackKey(item) !== trackKey);
    const newHist = [historyTrack, ...filteredHist].slice(0, 50);
    activeProfileRef.current = {
      ...activeProfileRef.current,
      history: newHist,
    };
    setHistory(newHist);
    updateActiveProfileData({ history: newHist });
  };

  const handleAudioEnded = (
    slot: 0 | 1 = activeAudioSlotRef.current,
    audio: HTMLAudioElement | null = null,
  ) => {
    if (slot !== activeAudioSlotRef.current) {
      const prepared = preparedCrossfadeRef.current;
      if (prepared?.slot === slot) {
        if (
          audio
          && (
            !audio.ended
            || audio.dataset.spiceTrackKey !== playbackTrackKey(prepared.track)
          )
        ) return;
        logDebug('player', 'Prepared crossfade track ended before promotion; falling back to normal queue advance.');
        cancelPreparedCrossfade();
      }
      return;
    }

    if (audio) {
      const activeTrackKey = playbackTrackKey(currentTrackRef.current);
      if (
        audio !== audioRef.current
        || !audio.ended
        || audio.dataset.spiceTrackKey !== activeTrackKey
      ) return;

      const activeStreamUrl = streamUrlRef.current;
      if (!activeStreamUrl || activeStreamUrl === 'youtube-embed-active') return;
      let normalizedStreamUrl = activeStreamUrl;
      try {
        normalizedStreamUrl = new URL(activeStreamUrl, window.location.href).href;
      } catch { }
      if (audio.currentSrc !== normalizedStreamUrl) return;
    }
    playbackRetryCountsRef.current.delete(playbackTrackKey(currentTrackRef.current));
    const endedTrack = currentTrackRef.current;
    const endedTrackKey = playbackTrackKey(endedTrack);
    finishAdaptiveListenCycle(true);

    const currentRepeatMode = repeatModeRef.current;
    const currentStreamProtocol = streamProtocolRef.current;
    const currentQueue = queueRef.current;
    const currentQueueIndex = queueIndexRef.current;

    logDebug('player', `Audio track ended. repeatMode: ${currentRepeatMode}, protocol: ${currentStreamProtocol}`);

    const scrobbleState = scrobbleStateRef.current;
    const endedDurationSeconds = durationRef.current > 0
      ? durationRef.current
      : (endedTrack.durationMs || 0) / 1000;
    const endedScrobbleThreshold = profileScrobbleThresholdSeconds(endedDurationSeconds);
    const endedWallClockSeconds = scrobbleState
      ? Math.floor(currentTimestampMs() / 1000) - scrobbleState.startedAt
      : 0;
    if (
      profileSyncEnabled
      && endedTrack.id !== 'placeholder'
      && scrobbleState
      && scrobbleState.trackKey === endedTrackKey
      && endedScrobbleThreshold !== null
      && endedWallClockSeconds >= endedScrobbleThreshold
    ) {
      requestProfileListen(
        'scrobble',
        scrobbleState,
        activeProfileListenProviders(),
        endedTrack,
        endedDurationSeconds,
      );
    }

    if (preparedCrossfadeRef.current?.started && finalizePreparedCrossfade()) return;

    if (currentRepeatMode === 'one') {
      cancelPreparedCrossfade();
      if (currentStreamProtocol === 'embed' && isYouTubeTrack(endedTrack) && ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        logDebug('player', 'Repeat mode is ONE. Seeking to 0 in YouTube embed...');
        beginProfileListenCycle(endedTrack);
        ytPlayerRef.current.seekTo(0, true);
        ytPlayerRef.current.playVideo();
        progressRef.current = 0;
        setProgress(0);
        setPlaybackPlaying(true);
      } else if (audioRef.current) {
        logDebug('player', 'Repeat mode is ONE. Replaying HTML5 audio...');
        beginProfileListenCycle(endedTrack);
        audioRef.current.currentTime = 0;
        applyAudioElementVolume(audioRef.current, volumeRef.current, { resumeAudioContext: true });
        audioRef.current.play().catch(handleAudioError);
        progressRef.current = 0;
        setProgress(0);
        setPlaybackPlaying(true);
      }
    } else if (
      currentRepeatMode === 'none'
      && !isShuffleRef.current
      && currentQueueIndex === currentQueue.length - 1
      && isIntentionalPlaylistQueue()
    ) {
      cancelPreparedCrossfade();
      logDebug('player', 'Queue ended and repeatMode is NONE. Stopping playback.');
      scrobbleStateRef.current = null;
      setPlaybackPlaying(false);
      progressRef.current = 0;
      setProgress(0);
      if (currentStreamProtocol === 'embed' && isYouTubeTrack(endedTrack) && ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        ytPlayerRef.current.seekTo(0, true);
        ytPlayerRef.current.pauseVideo();
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
    } else {
      logDebug('player', 'Advancing to next track in queue...');
      cancelPreparedCrossfade(false);
      handleNextRef.current();
    }
  };

  const handleAudioError = () => {
    cancelPreparedCrossfade();
    const activeTrack = currentTrackRef.current;
    const activeTrackKey = playbackTrackKey(activeTrack);
    const playbackWasRequested = shouldAutoPlayRef.current || isPlayingRef.current;

    if (!playbackWasRequested) {
      clearPlaybackRetryTimer();
      setStreamUrl(null);
      streamUrlRef.current = null;
      setIsLoadingStream(false);
      isLoadingStreamRef.current = false;
      setPlaybackPlaying(false);
      logDebug('stream', 'Paused audio stream expired or reset. Keeping playback stopped until the user presses play.');
      return;
    }

    if (
      activeTrack.id !== 'placeholder'
      && isYouTubeTrack(activeTrack)
      && streamProtocolRef.current !== 'embed'
      && volumeRef.current <= 100
      && !directEmbedRetryRef.current.has(activeTrackKey)
    ) {
      directEmbedRetryRef.current.add(activeTrackKey);
      setError('Direct audio failed. Falling back to the YouTube embedded player...');
      logDebug('diagnostics', 'Direct audio playback failed after stream resolution. Retrying this track in the YouTube embed transport.');
      setStreamProtocol('embed');
      streamProtocolRef.current = 'embed';
      setStreamUrl('youtube-embed-active');
      streamUrlRef.current = 'youtube-embed-active';
      void playTrackRef.current(activeTrack, queueRef.current, queueIndexRef.current, Boolean(listenTogetherHostSessionIdRef.current), true);
      return;
    }

    if (!schedulePlaybackRetry(activeTrack, queueRef.current, 'Audio element or iframe reported a playback error.')) {
      setError('Failed to play stream. Upstream YouTube Music connection reset.');
    }
  };

  // Keep state refs updated on every state change/render to completely prevent stale closures in callbacks
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { streamProtocolRef.current = streamProtocol; }, [streamProtocol]);
  useEffect(() => { isShuffleRef.current = isShuffle; }, [isShuffle]);
  useEffect(() => { activeProfileRef.current = activeProfile; }, [activeProfile]);
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { streamUrlRef.current = streamUrl; }, [streamUrl]);
  useEffect(() => { isLoadingStreamRef.current = isLoadingStream; }, [isLoadingStream]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => () => {
    if (remoteStateSyncTimeoutRef.current) {
      clearTimeout(remoteStateSyncTimeoutRef.current);
      remoteStateSyncTimeoutRef.current = null;
    }
    if (remoteTargetRefreshTimeoutRef.current) {
      clearTimeout(remoteTargetRefreshTimeoutRef.current);
      remoteTargetRefreshTimeoutRef.current = null;
    }
    clearPendingSpiceConnectHandoffTimers(pendingSpiceConnectHandoffRef.current);
    preparedSpiceConnectHandoffsRef.current.clear();
  }, []);

  async function submitProfileListen(
    type: ProfileListenType,
    listenedAt: number,
    providers: ProfileListenProvider[],
    track: Track,
    durationSeconds: number,
  ): Promise<Partial<Record<ProfileListenProvider, ProfileSyncProviderResult>>> {
    const lastfmSession = lastFmSessionKey.trim();
    const listenbrainzToken = listenBrainzToken.trim();
    const durationMs = track.durationMs || (durationSeconds > 0 ? Math.round(durationSeconds * 1000) : undefined);
    const response = await spiceFetch('cloud', '/profile/listens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cloudToken ? { Authorization: `Bearer ${cloudToken}` } : {}),
      },
      body: JSON.stringify({
        type,
        listenedAt,
        providers: {
          lastfm: providers.includes('lastfm')
            ? {
              sessionKey: lastfmSession || undefined,
            }
            : undefined,
          listenbrainz: providers.includes('listenbrainz')
            ? {
              token: listenbrainzToken || undefined,
            }
            : undefined,
        },
        track: {
          id: track.id,
          title: track.title,
          artist: profileArtistName(track),
          album: track.album?.title,
          durationMs,
          sourceId: track.sourceId,
          permalinkUrl: profileOriginUrl(track),
        },
      }),
    });
    const data = await response.json().catch(() => ({})) as ProfileSyncResponse & { error?: string };
    if (!response.ok) {
      throw new Error(data.error || `Profile sync failed with status ${response.status}.`);
    }

    return Object.fromEntries(providers.map((provider) => [
      provider,
      data.results?.[provider] ?? {
        ok: false,
        error: `${provider === 'lastfm' ? 'Last.fm' : 'ListenBrainz'} did not return a delivery result.`,
      },
    ]));
  }

  function requestProfileListen(
    type: ProfileListenType,
    state: ProfileListenDeliveryState,
    providers: ProfileListenProvider[],
    track: Track = currentTrack,
    durationSeconds: number = duration,
  ) {
    const requestedProviders = beginProfileListenDelivery(
      state,
      type,
      providers,
      currentTimestampMs(),
    );
    if (requestedProviders.length === 0) return;

    void submitProfileListen(type, state.startedAt, requestedProviders, track, durationSeconds)
      .then((results) => {
        finishProfileListenDelivery(
          state,
          type,
          Object.fromEntries(requestedProviders.map((provider) => [provider, results[provider]?.ok === true])),
          currentTimestampMs(),
        );
        const syncedProviders = requestedProviders.filter((provider) => results[provider]?.ok);
        const failedProviders = requestedProviders.filter((provider) => !results[provider]?.ok);
        scheduleProfileListenRetry(type, state, failedProviders, track, durationSeconds);
        if (scrobbleStateRef.current !== state) return;

        if (syncedProviders.length > 0) {
          setProfileSyncStatus(type === 'playing_now' ? 'playing' : 'scrobbled');
          logDebug(
            'profile',
            `${type === 'playing_now' ? 'Now playing' : 'Scrobble'} sent to ${syncedProviders.map(profileProviderLabel).join(', ')} for "${track.title}".`,
          );
        }

        if (failedProviders.length > 0) {
          const failures = failedProviders.map((provider) => (
            `${profileProviderLabel(provider)}: ${results[provider]?.error || 'failed'}`
          ));
          setProfileSyncStatus('error');
          logDebug('error', `Profile sync issue: ${failures.join(' | ')}`);
        }

        const lastFmResult = results.lastfm;
        if (lastFmResult?.ok) {
          setLastFmPlaybackStatus(type === 'playing_now'
            ? `Last.fm received now playing for ${track.title}. The permanent scrobble will be confirmed separately.`
            : `Confirmed by Last.fm: ${track.title} was scrobbled.`);
        } else if (lastFmResult) {
          setLastFmPlaybackStatus(`Last.fm ${type === 'playing_now' ? 'now-playing update' : 'scrobble'} failed: ${lastFmResult.error || 'Unknown provider error'}.`);
        }
      })
      .catch((error) => {
        finishProfileListenDelivery(
          state,
          type,
          Object.fromEntries(requestedProviders.map((provider) => [provider, false])),
          currentTimestampMs(),
        );
        scheduleProfileListenRetry(type, state, requestedProviders, track, durationSeconds);
        if (scrobbleStateRef.current !== state) return;

        const message = error instanceof Error ? error.message : String(error);
        setProfileSyncStatus('error');
        logDebug('error', `Profile sync request failed: ${message}`);
        if (requestedProviders.includes('lastfm')) {
          setLastFmPlaybackStatus(`Last.fm ${type === 'playing_now' ? 'now-playing update' : 'scrobble'} failed: ${message}.`);
        }
      });
  }

  function scheduleProfileListenRetry(
    type: ProfileListenType,
    state: ProfileListenDeliveryState,
    providers: ProfileListenProvider[],
    track: Track,
    durationSeconds: number,
  ) {
    if (providers.length === 0) return;
    if (type === 'playing_now' && scrobbleStateRef.current !== state) return;

    const retryDelay = profileListenRetryDelayMs(state, type, providers, currentTimestampMs());
    if (retryDelay === null) return;

    const timeout = setTimeout(() => {
      profileListenRetryTimeoutsRef.current.delete(timeout);
      if (type === 'playing_now' && scrobbleStateRef.current !== state) return;
      requestProfileListen(type, state, providers, track, durationSeconds);
    }, retryDelay + 25);
    profileListenRetryTimeoutsRef.current.add(timeout);
  }

  function profileProviderLabel(provider: ProfileListenProvider) {
    return provider === 'lastfm' ? 'Last.fm' : 'ListenBrainz';
  }

  async function handleFeedbackSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!feedbackText.trim()) return;

    setIsSubmittingFeedback(true);
    setFeedbackStatus('');

    try {
      const response = await spiceFetch('cloud', '/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cloudToken ? { Authorization: `Bearer ${cloudToken}` } : {}),
        },
        body: JSON.stringify({
          category: feedbackCategory,
          content: feedbackText,
          rating: feedbackRating,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Feedback submission failed.');
      }

      setFeedbackStatus('Feedback submitted successfully! Thank you.');
      setFeedbackText('');
      localStorage.setItem('spice_feedback_submitted', 'true');

      // Clear status after 3 seconds
      setTimeout(() => setFeedbackStatus(''), 3000);
    } catch (err: any) {
      setFeedbackStatus(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  async function handleLinkLastFm() {
    setIsLinkingLastFm(true);
    setLastFmLinkStatus('Opening Last.fm sign-in...');

    try {
      const response = await spiceFetch('cloud', '/lastfm/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cloudToken ? { Authorization: `Bearer ${cloudToken}` } : {}),
        },
        body: JSON.stringify({
          action: 'web_auth',
        }),
      });
      const data = await response.json().catch(() => ({})) as { authUrl?: string; callbackUrl?: string; message?: string };
      if (!response.ok || !data.authUrl) {
        throw new Error(data.message || 'Last.fm sign-in setup failed.');
      }

      const callbackOrigin = trustedLastFmCallbackOrigin(data.callbackUrl);
      if (callbackOrigin) {
        localStorage.setItem(LASTFM_CALLBACK_ORIGIN_STORAGE_KEY, callbackOrigin);
      } else {
        localStorage.removeItem(LASTFM_CALLBACK_ORIGIN_STORAGE_KEY);
      }

      const popup = window.open(
        data.authUrl,
        'spice-lastfm-auth',
        'width=560,height=720,menubar=no,toolbar=no,location=yes,status=no,scrollbars=yes,resizable=yes',
      );
      if (popup) {
        popup.focus();
        setLastFmLinkStatus(cloudToken
          ? 'Finish signing in inside the Last.fm popup. SPICE will save Last.fm to this account automatically.'
          : 'Finish signing in inside the Last.fm popup. Sign in to a SPICE account first if you want this saved in the backend.');
      } else {
        setLastFmLinkStatus('Popup blocked. Allow popups for SPICE and try Set up Last.fm again.');
      }
      logDebug('profile', 'Last.fm authorization page opened for account linking.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Last.fm link failed.';
      setLastFmLinkStatus(message);
      logDebug('error', `Last.fm link failed: ${message}`);
    } finally {
      setIsLinkingLastFm(false);
    }
  }

  useEffect(() => {
    if (currentTrack.id === 'placeholder') {
      scrobbleStateRef.current = null;
      setProfileSyncStatus('idle');
      setLastFmPlaybackStatus(null);
      return;
    }

    if (scrobbleStateRef.current?.trackKey === currentTrackKey) return;
    if (!shouldAutoPlayRef.current && !isPlayingRef.current && !isLoadingStreamRef.current) {
      scrobbleStateRef.current = null;
      setProfileSyncStatus('idle');
      return;
    }
    beginProfileListenCycle(currentTrack);
  }, [currentTrackKey]);

  useEffect(() => {
    if (!profileSyncEnabled || currentTrack.id === 'placeholder' || !isPlaying) return;
    const providers = activeProfileListenProviders();
    if (providers.length === 0) return;

    const evaluateListenDelivery = () => {
      const scrobbleState = scrobbleStateRef.current;
      if (!scrobbleState || scrobbleState.trackKey !== currentTrackKey) return;

      const progressSeconds = Math.max(0, progressRef.current);
      if (progressSeconds >= 2) {
        requestProfileListen('playing_now', scrobbleState, providers);
      }

      const durationSeconds = durationRef.current > 0
        ? durationRef.current
        : currentTrack.durationMs
          ? currentTrack.durationMs / 1000
          : 0;
      const threshold = profileScrobbleThresholdSeconds(durationSeconds);
      if (threshold === null) {
        if (providers.includes('lastfm') && durationSeconds > 0 && durationSeconds <= 30) {
          setLastFmPlaybackStatus('Last.fm requires tracks to be longer than 30 seconds, so this track will not be scrobbled.');
        }
        return;
      }

      const wallClockElapsed = Math.max(
        0,
        Math.floor(currentTimestampMs() / 1000) - scrobbleState.startedAt,
      );
      const secondsRemaining = Math.max(
        0,
        Math.ceil(Math.max(threshold - progressSeconds, threshold - wallClockElapsed)),
      );

      if (providers.includes('lastfm') && !scrobbleState.scrobble.lastfm.sent) {
        const lastFmDelivery = scrobbleState.scrobble.lastfm;
        setLastFmPlaybackStatus(lastFmDelivery.pending
          ? `Sending the permanent Last.fm scrobble for ${currentTrack.title}...`
          : `Last.fm scrobble in ${formatTime(secondsRemaining)} (${formatTime(progressSeconds)} of ${formatTime(durationSeconds)} played).`);
      }

      if (progressSeconds >= threshold && wallClockElapsed >= threshold) {
        requestProfileListen('scrobble', scrobbleState, providers, currentTrack, durationSeconds);
      }
    };

    evaluateListenDelivery();
    const interval = window.setInterval(evaluateListenDelivery, 1000);
    return () => window.clearInterval(interval);
  }, [profileSyncEnabled, cloudToken, lastFmSessionKey, lastFmAccountLinked, listenBrainzToken, listenBrainzAccountLinked, isPlaying, currentTrackKey]);

  useEffect(() => {
    if (!isPlaying || currentTrack.id === 'placeholder' || currentTrack.id === 'spice-connect-placeholder') return;

    const creditMeaningfulListen = () => {
      if (recommendationListenCreditedRef.current) return;
      const listenCycle = scrobbleStateRef.current;
      if (!listenCycle || listenCycle.trackKey !== currentTrackKey) return;

      const durationSeconds = durationRef.current > 0
        ? durationRef.current
        : (currentTrack.durationMs || 0) / 1000;
      const threshold = recommendationListenThresholdSeconds(durationSeconds);
      const listenProgress = recordRecommendationListenProgress(
        recommendationListenProgressRef.current,
        currentTrackKey,
        Math.max(0, progressRef.current),
        currentTimestampMs(),
      );
      recommendationListenProgressRef.current = listenProgress;
      if (
        progressRef.current < threshold
        || listenProgress.forwardSeconds < threshold
      ) return;

      recommendationListenCreditedRef.current = true;
      const profile = activeProfileRef.current;
      const profileHistory = profile.history || [];
      const existing = profileHistory.find((item) => playbackTrackKey(item) === currentTrackKey);
      const qualifiedTrack = {
        ...mergeTrackSnapshots(existing, currentTrack),
        msListened: incrementRecommendationListenMs(existing?.msListened),
      } as Track;
      const nextHistory = [
        qualifiedTrack,
        ...profileHistory.filter((item) => playbackTrackKey(item) !== currentTrackKey),
      ].slice(0, 50);
      const nextSongsPlayed = (profile.songsPlayed || 0) + 1;
      const completedAt = Date.now();
      setListeningEvents((previousEvents) => {
        const nextEvents = appendListeningEvent(previousEvents, {
          trackId: currentTrack.id,
          sourceId: currentTrack.sourceId || 'youtube_music',
          title: currentTrack.title,
          artistNames: currentTrack.artists.map((artist) => artist.name),
          listenedMs: Math.round(Math.max(threshold, progressRef.current) * 1000),
          completedAt,
          discovered: !existing,
        }, completedAt);
        localStorage.setItem(listeningEventsStorageKey(profile.id), JSON.stringify(nextEvents));
        return nextEvents;
      });
      markTasteDirty('events');
      scheduleTasteCloudSync();

      activeProfileRef.current = {
        ...profile,
        history: nextHistory,
        songsPlayed: nextSongsPlayed,
      };
      setHistory(nextHistory);
      updateProfileData(profile.id, {
        history: nextHistory,
        songsPlayed: nextSongsPlayed,
      });
      autoSyncHistory(
        nextHistory,
        profile.id,
        profile.cloudToken ?? (profile.id === activeProfileIdRef.current ? cloudTokenRef.current : null),
      );
      logDebug('recommendations', `Credited a meaningful listen for "${currentTrack.title}" on profile ${profile.id}.`);
    };

    creditMeaningfulListen();
    const interval = window.setInterval(creditMeaningfulListen, 1000);
    return () => window.clearInterval(interval);
  }, [activeProfileId, currentTrackKey, isPlaying]);

  useEffect(() => {
    handleAudioEndedRef.current = handleAudioEnded;
    handleAudioErrorRef.current = handleAudioError;
  });

  useEffect(() => {
    return () => {
      clearPlaybackRetryTimer();
      for (const timeout of profileListenRetryTimeoutsRef.current) clearTimeout(timeout);
      profileListenRetryTimeoutsRef.current.clear();
    };
  }, []);

  // Dynamic Lyrics Fetcher & Karaoke Auto-scroller Effects
  const activeLineIdx = lyricsData?.isSynced
    ? lyricsData.lines.findIndex((line, idx) => {
      const nextLine = lyricsData.lines[idx + 1];
      return progress >= line.time && (!nextLine || progress < nextLine.time);
    })
    : -1;

  useEffect(() => {
    if (!lyricsContainerRef.current) return;
    const activeEl = lyricsContainerRef.current.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLineIdx]);

  useEffect(() => {
    if (!currentTrack || !currentTrack.id || currentTrack.id === 'placeholder') {
      setLyricsData(null);
      return;
    }

    let active = true;
    setLyricsLoading(true);
    logDebug('lyrics', `Initiated lyrics resolution flow for "${currentTrack.title}" (ID: ${currentTrack.id})`);

    const fetchLyrics = async () => {
      try {
        const metadataQuery = lyricsMetadataQuery(currentTrack);
        const fetchUrl = isSoundCloudTrack(currentTrack)
          ? spiceApiUrl('local', `/sc/lyrics/${encodeURIComponent(soundCloudTrackId(currentTrack))}${metadataQuery}`)
          : spiceApiUrl('local', `/yt/lyrics/${encodeURIComponent(currentTrack.id)}${metadataQuery}`);
        logDebug('lyrics', `Fetching lyrics from API endpoint: ${fetchUrl}`);
        const res = await fetch(fetchUrl);
        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        if (!active) {
          logDebug('lyrics', `Skipping state commit for track "${currentTrack.title}" due to fast skip`);
          return;
        }

        logDebug('lyrics', `API Response successfully parsed for "${data.title || currentTrack.title}". Timed lyrics: ${data.isSynced ? 'YES' : 'NO'}`);
        // Duration fallback chain: track metadata → API response → YouTube embed player → default
        const ytEmbedDuration = ytPlayerRef.current?.getDuration?.() || 0;
        const totalSec = currentTrack.durationMs
          ? currentTrack.durationMs / 1000
          : (data.durationMs ? data.durationMs / 1000 : (ytEmbedDuration > 0 ? ytEmbedDuration : 180));

        const parsedLines = data.isSynced
          ? parseLRC(data.syncedLyrics, totalSec)
          : parsePlainLyrics(data.plainLyrics);
        logDebug('lyrics', `Loaded ${parsedLines.length} ${data.isSynced ? 'synchronized' : 'plain'} lyric lines`);
        if (!data.isSynced) setIsKaraokeMode(false);

        if (parsedLines.length > 0) {
          logDebug('lyrics', `Sync sample: [Line 1 Time: ${formatTime(parsedLines[0].time)}] "${parsedLines[0].text}"`);
        }

        setLyricsData({
          lines: parsedLines,
          plainLyrics: data.plainLyrics,
          syncedLyrics: data.syncedLyrics,
          isSynced: !!data.isSynced,
        });
      } catch (err) {
        logDebug('lyrics', `Error during lyrics resolution: ${err instanceof Error ? err.message : String(err)}`);
        if (!active) return;

        setLyricsData(null);
      } finally {
        if (active) {
          setLyricsLoading(false);
        }
      }
    };

    fetchLyrics();

    return () => {
      active = false;
    };
  }, [currentTrack.id, currentTrack.title, currentTrack.artists, currentTrack.durationMs]);

  useEffect(() => {
    if (playedTracksCount > 0 && playedTracksCount % 5 === 0) {
      const hasDismissed = localStorage.getItem('spice_feedback_prompt_dismissed') === 'true';
      const hasSubmitted = localStorage.getItem('spice_feedback_submitted') === 'true';
      const token = localStorage.getItem('spice_cloud_token');
      if (!hasDismissed && !hasSubmitted && token) {
        setShowFeedbackPopup(true);
      }
    }
  }, [playedTracksCount]);

  // Play a track
  const fetchFallbackSourceResults = async (
    query: string,
    source: 'youtube_music' | 'soundcloud',
  ): Promise<Track[]> => {
    const params = new URLSearchParams({ q: query, limit: '8' });
    if (source === 'youtube_music') params.set('kind', 'tracks');
    const res = await spiceFetch('local', source === 'soundcloud' ? '/sc/search' : '/yt/search', undefined, params);
    if (!res.ok) return [];
    const data = await res.json();
    return playableSearchTracks(enrichTrackSnapshots(data.tracks ?? []) as Track[]);
  };

  const tryResolveFallbackSource = async (
    requested: Track,
    requestId: number,
  ): Promise<{ track: Track; streamUrl: string } | null> => {
    const query = fallbackSearchQuery(requested);
    if (!query) return null;

    logDebug(
      'player',
      `Primary source unavailable for "${requested.title}". Searching alternate sources (title/artist match)...`,
    );

    const searchBatches = await Promise.allSettled([
      fetchFallbackSourceResults(query, 'youtube_music'),
      fetchFallbackSourceResults(query, 'soundcloud'),
    ]);
    if (requestId !== playbackRequestRef.current) return null;

    const youTubeResults = searchBatches[0].status === 'fulfilled'
      ? searchBatches[0].value
      : [];
    const soundCloudResults = searchBatches[1].status === 'fulfilled'
      ? searchBatches[1].value
      : [];
    const candidates = rankFallbackCandidates(requested, youTubeResults, soundCloudResults);

    for (const candidate of candidates) {
      if (requestId !== playbackRequestRef.current) return null;
      try {
        const candidateEndpoint = isFallbackSoundCloudTrack(candidate)
          ? spiceApiUrl('local', `/sc/track/${encodeURIComponent(fallbackSoundCloudTrackId(candidate))}`, { quality: audioQuality })
          : spiceApiUrl('local', `/yt/track/${encodeURIComponent(candidate.id)}`);
        const res = await fetch(candidateEndpoint);
        if (!res.ok) continue;
        const payload = await res.json();
        const streams = payload.streams ?? [];
        if (streams.length === 0) continue;
        const resolvedStreamUrl = spiceApiResponseUrl('local', streams[0].url);
        logDebug(
          'player',
          `Recovered playback via ${trackSourceLabel(candidate)} fallback: "${candidate.title}"`,
        );
        return { track: candidate, streamUrl: resolvedStreamUrl };
      } catch {
        // Probe the next alternate candidate.
      }
    }

    logDebug('player', `No alternate source found for "${requested.title}".`);
    return null;
  };

  const playTrack = async (
    track: Track,
    newQueue?: Track[],
    queueIndexHint?: number,
    isSyncLoopCall = false,
    isRetryCall = false,
    preserveCurrentListenCycle = false,
    playlistQueueOriginId?: string,
  ) => {
    if (listenTogetherHostSessionId && !isSyncLoopCall) {
      showSpiceNotice('You cannot change tracks while listening in a Listen Together session.', 'warning');
      return;
    }

    if (!isRetryCall) {
      setPlayedTracksCount(prev => prev + 1);
    }
    cancelPreparedCrossfade();
    clearPlaybackRetryTimer();

    if (!track || track.id === 'placeholder') {
      shouldAutoPlayRef.current = false;
      setIsLoadingStream(false);
      logDebug('player', 'Ready to stream. Select any track from the lists to begin playback.');
      return;
    }

    if (!isRetryCall && !isSyncLoopCall) {
      allowNativePlaybackIntent('SPICE track selection');
    }

    const trackKey = playbackTrackKey(track);
    if (
      personalizedQueueContinuationSuppressedRef.current
      && personalizedQueueContinuationSuppressedRef.current !== trackKey
    ) {
      personalizedQueueContinuationSuppressedRef.current = null;
    }
    const beginsNewListenCycle = shouldBeginProfileListenCycle({
      isRetryCall,
      isSyncLoopCall,
      preserveCurrentCycle: preserveCurrentListenCycle,
    });
    if (beginsNewListenCycle) {
      finishAdaptiveListenCycle(false);
    }
    if (!isRetryCall) {
      playbackRetryCountsRef.current.delete(trackKey);
      directEmbedRetryRef.current.delete(trackKey);
      embedProxyRetryRef.current.delete(trackKey);
      playbackFallbackAttemptedRef.current.delete(trackKey);
      playbackTelemetryRecordedRef.current.delete(trackKey);
    }
    if (beginsNewListenCycle) {
      beginProfileListenCycle(track);
      progressRef.current = 0;
      durationRef.current = (track.durationMs || 0) / 1000;
      setProgress(0);
      setDuration(durationRef.current);
    }

    const requestId = ++playbackRequestRef.current;
    shouldAutoPlayRef.current = true;
    setError(undefined);
    setPlaybackPlaying(false);
    const activeAudio = audioSlotRefs.current[activeAudioSlotRef.current];
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.removeAttribute('src');
      delete activeAudio.dataset.spiceTrackKey;
      activeAudio.load();
      setAudioTransitionGain(activeAudio, 1);
    }
    setStreamUrl(null);
    streamUrlRef.current = null;
    const replacesCurrentQueue = Boolean(
      newQueue
      && newQueue.length > 0
      && (
        newQueue.length !== queueRef.current.length
        || newQueue.some((item, index) => {
          const currentItem = queueRef.current[index];
          return !currentItem || playbackTrackKey(item) !== playbackTrackKey(currentItem);
        })
      )
    );
    if (playlistQueueOriginId) {
      playlistQueueOriginRef.current = playlistQueueOriginId;
    } else if (replacesCurrentQueue) {
      playlistQueueOriginRef.current = null;
    }
    rememberTrackSnapshots([track, ...(newQueue || [])]);
    currentTrackRef.current = track;
    setCurrentTrack(track);
    if (isSoundCloudTrack(track)) {
      setShowVideoPlayer(false);
    }
    setIsLoadingStream(true);
    isLoadingStreamRef.current = true;

    let updatedQueue = [...queue];
    let updatedIndex = queueIndex;

    if (newQueue && newQueue.length > 0) {
      updatedQueue = newQueue;
      updatedIndex = resolvePlaybackQueueIndex(newQueue, track, queueIndexHint);
    } else {
      if (!queue.some(t => t.id === track.id)) {
        updatedQueue = [...queue];
        updatedQueue.splice(queueIndex + 1, 0, track);
        updatedIndex = queueIndex + 1;
      } else {
        const idx = queue.findIndex(t => t.id === track.id);
        updatedIndex = idx >= 0 ? idx : 0;
      }
    }

    queueRef.current = updatedQueue;
    queueIndexRef.current = updatedIndex;
    shuffleHistoryRef.current = isShuffleRef.current
      ? alignShuffleHistory(
        shuffleHistoryRef.current,
        shuffleQueueKeys(updatedQueue),
        updatedIndex,
      )
      : null;
    setQueue(updatedQueue);
    setQueueIndex(updatedIndex);

    try {
      if (boostProtocolHandoffRef.current) {
        boostProtocolHandoffRef.current = false;
        streamProtocolRef.current = 'proxy';
        setStreamProtocol('proxy');
        setShowVideoPlayer(false);
        try {
          localStorage.setItem('spice_stream_protocol', 'proxy');
        } catch {
          // Storage may be unavailable; the in-memory protocol switch still applies.
        }
        logDebug('player', 'Applying the deferred Volume Boost switch to the gain-capable proxy path.');
      }
      const isSoundCloud = isSoundCloudTrack(track);
      const isYouTube = isYouTubeTrack(track);
      const activeStreamProtocol = streamProtocolRef.current;
      logDebug('player', `Initiating ${trackSourceLabel(track)} format resolution for track "${track.title}" (ID: ${track.id})`);

      if (isOfflineTrack(track) && track.permalinkUrl) {
        const shouldStartNow = shouldAutoPlayRef.current;
        const offlineUrl = track.permalinkUrl;
        streamProtocolRef.current = 'proxy';
        setStreamProtocol('proxy');
        setShowVideoPlayer(false);
        setStreamUrl(offlineUrl);
        streamUrlRef.current = offlineUrl;
        const directAudio = audioSlotRefs.current[activeAudioSlotRef.current];
        if (directAudio) {
          directAudio.dataset.spiceTrackKey = trackKey;
          directAudio.src = offlineUrl;
          directAudio.load();
        }
        setPlaybackPlaying(shouldStartNow);
        return;
      }

      if ((activeStreamProtocol === 'embed' || showVideoPlayer) && isYouTube) {
        cancelPreparedCrossfade();
        logDebug('stream', `YouTube Embedded Player active. Loading iframe player for track ID: ${track.id}`);
        const shouldStartNow = requestId === playbackRequestRef.current && shouldAutoPlayRef.current;
        setStreamProtocol('embed');
        streamProtocolRef.current = 'embed';
        setStreamUrl('youtube-embed-active');
        streamUrlRef.current = 'youtube-embed-active';
        setIsLoadingStream(false);
        isLoadingStreamRef.current = false;
        setPlaybackPlaying(shouldStartNow);

        recordPlaybackTelemetry(track);

        if (ytPlayerRef.current && typeof ytPlayerRef.current.loadVideoById === 'function') {
          if (typeof ytPlayerRef.current.stopVideo === 'function') {
            ytPlayerRef.current.stopVideo();
          }
          ytPlayerRef.current.loadVideoById(track.id);
          if (shouldStartNow) {
            ytPlayerRef.current.playVideo();
          } else if (typeof ytPlayerRef.current.pauseVideo === 'function') {
            ytPlayerRef.current.pauseVideo();
          }
        }
        return;
      }

      if (ytPlayerRef.current && typeof ytPlayerRef.current.stopVideo === 'function') {
        // Silence any lingering embed player (e.g. after a deferred Volume
        // Boost protocol handoff) so the iframe cannot overlap direct audio.
        ytPlayerRef.current.stopVideo();
      }

      const trackEndpoint = isSoundCloud
        ? spiceApiUrl('local', `/sc/track/${encodeURIComponent(soundCloudTrackId(track))}`, { quality: audioQuality })
        : spiceApiUrl('local', `/yt/track/${encodeURIComponent(track.id)}`);
      const resTrack = await fetch(trackEndpoint);
      if (requestId !== playbackRequestRef.current) return;
      if (!resTrack.ok) throw new Error('Could not resolve audio streams for this track.');

      const payload = await resTrack.json();
      if (requestId !== playbackRequestRef.current) return;
      const streams = payload.streams ?? [];
      if (streams.length === 0) throw new Error('No compatible stream format discovered.');

      const bestStream = streams[0];
      const streamLabel = bestStream.preset ? `preset ${bestStream.preset}` : `itag ${bestStream.itag}`;
      const shouldStartNow = shouldAutoPlayRef.current;
      logDebug('stream', `Resolved ${streams.length} ${trackSourceLabel(track)} formats. Selected ${streamLabel} (${bestStream.container}, bitrate: ${Math.round(bestStream.bitrate / 1000)}kbps)`);
      const resolvedStreamUrl = spiceApiResponseUrl('local', bestStream.url);
      setStreamUrl(resolvedStreamUrl);
      streamUrlRef.current = resolvedStreamUrl;
      const directAudio = audioSlotRefs.current[activeAudioSlotRef.current];
      if (directAudio) {
        directAudio.dataset.spiceTrackKey = trackKey;
        directAudio.src = resolvedStreamUrl;
        directAudio.load();
      }
      setPlaybackPlaying(shouldStartNow);

      recordPlaybackTelemetry(track);

    } catch (err: any) {
      if (requestId !== playbackRequestRef.current) return;
      console.error(err);
      logDebug('error', `Track streaming failed: ${err.message || err}`);

      if (!isRetryCall && !playbackFallbackAttemptedRef.current.has(trackKey)) {
        playbackFallbackAttemptedRef.current.add(trackKey);
        const fallback = await tryResolveFallbackSource(track, requestId);
        if (requestId !== playbackRequestRef.current) return;
        if (fallback) {
          const fallbackTrack = fallback.track;
          const fallbackKey = playbackTrackKey(fallbackTrack);
          currentTrackRef.current = fallbackTrack;
          setCurrentTrack(fallbackTrack);
          rememberTrackSnapshots([fallbackTrack]);
          const activeQueue = queueRef.current;
          const activeIndex = queueIndexRef.current;
          if (activeQueue[activeIndex] && playbackTrackKey(activeQueue[activeIndex]) === trackKey) {
            const nextQueue = [...activeQueue];
            nextQueue[activeIndex] = fallbackTrack;
            queueRef.current = nextQueue;
            setQueue(nextQueue);
          }
          const directAudio = audioSlotRefs.current[activeAudioSlotRef.current];
          if (directAudio) {
            directAudio.dataset.spiceTrackKey = fallbackKey;
            directAudio.src = fallback.streamUrl;
            directAudio.load();
          }
          setStreamUrl(fallback.streamUrl);
          streamUrlRef.current = fallback.streamUrl;
          setPlaybackPlaying(shouldAutoPlayRef.current);
          recordPlaybackTelemetry(fallbackTrack);
          showSpiceNotice(
            `"${track.title}" was unavailable — playing a ${trackSourceLabel(fallbackTrack)} match instead.`,
            'info',
          );
          return;
        }
      }

      if (
        isYouTubeTrack(track)
        && streamProtocolRef.current !== 'embed'
        && volumeRef.current <= 100
      ) {
        cancelPreparedCrossfade();
        logDebug('diagnostics', `Direct stream resolution failed. Retrying this track in the YouTube Embedded Player...`);
        const shouldStartNow = shouldAutoPlayRef.current;
        setStreamProtocol('embed');
        streamProtocolRef.current = 'embed';

        logDebug('stream', `YouTube Embedded Player active. Loading iframe player for track ID: ${track.id}`);
        setStreamUrl('youtube-embed-active');
        streamUrlRef.current = 'youtube-embed-active';
        setIsLoadingStream(false);
        isLoadingStreamRef.current = false;
        setPlaybackPlaying(shouldStartNow);

        recordPlaybackTelemetry(track);

        if (ytPlayerRef.current && typeof ytPlayerRef.current.loadVideoById === 'function') {
          if (typeof ytPlayerRef.current.stopVideo === 'function') {
            ytPlayerRef.current.stopVideo();
          }
          ytPlayerRef.current.loadVideoById(track.id);
          if (shouldStartNow) {
            ytPlayerRef.current.playVideo();
          } else if (typeof ytPlayerRef.current.pauseVideo === 'function') {
            ytPlayerRef.current.pauseVideo();
          }
        }
        return;
      }

      if (!schedulePlaybackRetry(track, updatedQueue, 'Track stream resolution failed.')) {
        setError('Playback connection failed. Please select a different track.');
      }
    } finally {
      if (requestId === playbackRequestRef.current) {
        setIsLoadingStream(false);
        isLoadingStreamRef.current = false;
      }
    }
  };

  useEffect(() => {
    playTrackRef.current = playTrack;
  });

  const pauseCurrentPlayback = () => {
    shouldAutoPlayRef.current = false;
    clearPlaybackRetryTimer();

    const targetTrack = currentTrackRef.current;
    if (streamProtocolRef.current === 'embed' && isYouTubeTrack(targetTrack) && ytPlayerRef.current) {
      if (typeof ytPlayerRef.current.pauseVideo === 'function') {
        ytPlayerRef.current.pauseVideo();
      }
      if (typeof ytPlayerRef.current.getCurrentTime === 'function') {
        setProgress(Math.max(0, ytPlayerRef.current.getCurrentTime() || 0));
      }
    }

    if (audioRef.current) {
      audioRef.current.pause();
      if (Number.isFinite(audioRef.current.currentTime)) {
        setProgress(Math.max(0, audioRef.current.currentTime));
      }
    }
    const preparedIncoming = preparedCrossfadeRef.current?.started
      ? audioSlotRefs.current[preparedCrossfadeRef.current.slot]
      : null;
    preparedIncoming?.pause();
    if (crossfadeAnimationFrameRef.current !== null) {
      cancelAnimationFrame(crossfadeAnimationFrameRef.current);
      crossfadeAnimationFrameRef.current = null;
    }

    setPlaybackPlaying(false);
  };

  const resumeCurrentPlayback = () => {
    const targetTrack = currentTrackRef.current;
    if (!targetTrack || targetTrack.id === 'placeholder') return;

    allowNativePlaybackIntent('SPICE play control');

    clearPlaybackRetryTimer();
    playbackRetryCountsRef.current.delete(playbackTrackKey(targetTrack));
    shouldAutoPlayRef.current = true;
    setError(undefined);

    if (
      streamUrlRef.current
      && scrobbleStateRef.current?.trackKey !== playbackTrackKey(targetTrack)
    ) {
      beginProfileListenCycle(targetTrack);
    }

    if (streamProtocolRef.current === 'embed' && isYouTubeTrack(targetTrack) && ytPlayerRef.current) {
      if (!streamUrlRef.current) {
        setStreamUrl('youtube-embed-active');
        streamUrlRef.current = 'youtube-embed-active';
        if (typeof ytPlayerRef.current.loadVideoById === 'function') {
          ytPlayerRef.current.loadVideoById(targetTrack.id);
          if (typeof ytPlayerRef.current.playVideo === 'function') {
            ytPlayerRef.current.playVideo();
          }
          setPlaybackPlaying(true);
          return;
        }
      }
      if (typeof ytPlayerRef.current.playVideo === 'function') {
        ytPlayerRef.current.playVideo();
        setPlaybackPlaying(true);
        return;
      }
    }

    if (audioRef.current && streamUrlRef.current) {
      applyAudioElementVolume(audioRef.current, volumeRef.current, { resumeAudioContext: true });
      audioRef.current.play().then(() => {
        setPlaybackPlaying(true);
        const prepared = preparedCrossfadeRef.current;
        const incoming = prepared?.started ? audioSlotRefs.current[prepared.slot] : null;
        if (incoming) {
          void incoming.play()
            .then(() => crossfadeAnimationStarterRef.current())
            .catch(() => cancelPreparedCrossfade());
        }
      }).catch(handleAudioError);
      return;
    }

    if (!isLoadingStreamRef.current) {
      playTrack(targetTrack);
    }
  };

  const togglePlayPause = () => {
    if (isPlayingRef.current) {
      pauseCurrentPlayback();
    } else {
      resumeCurrentPlayback();
    }
  };

  const handleMiniPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

    setIsDraggingMini(true);
    e.currentTarget.setPointerCapture(e.pointerId);

    const rect = e.currentTarget.getBoundingClientRect();
    dragStartRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMiniPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingMini) return;

    const x = e.clientX - dragStartRef.current.x;
    const y = e.clientY - dragStartRef.current.y;

    const rect = e.currentTarget.getBoundingClientRect();
    const maxX = typeof window !== 'undefined' ? window.innerWidth - rect.width - 16 : 800;
    const maxY = typeof window !== 'undefined' ? window.innerHeight - rect.height - 16 : 600;

    setMiniPlayerPos({
      x: Math.max(16, Math.min(x, maxX)),
      y: Math.max(16, Math.min(y, maxY)),
    });
  };

  const handleMiniPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingMini(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handlePrev = (overrideIndex?: any) => {
    const progressTime = streamProtocolRef.current === 'embed' && isYouTubeTrack(currentTrack) && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function'
      ? ytPlayerRef.current.getCurrentTime()
      : progress;

    if (progressTime > 3) {
      const restartedTrack = currentTrackRef.current;
      cancelPreparedCrossfade();
      beginProfileListenCycle(restartedTrack);
      progressRef.current = 0;
      if (streamProtocolRef.current === 'embed' && isYouTubeTrack(currentTrack) && ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        ytPlayerRef.current.seekTo(0, true);
        setProgress(0);
        return;
      }
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        setProgress(0);
      }
      return;
    }

    const currentQueue = queueRef.current;
    if (currentQueue.length === 0) return;

    const currentIndex = (overrideIndex !== undefined && typeof overrideIndex === 'number')
      ? overrideIndex
      : queueIndexRef.current;
    if (isShuffleRef.current) {
      const previous = previousShuffleTrack(
        shuffleHistoryRef.current,
        shuffleQueueKeys(currentQueue),
        currentIndex,
      );
      shuffleHistoryRef.current = previous.state;
      if (previous.index === null) return;
      void playTrackRef.current(currentQueue[previous.index], currentQueue, previous.index);
      return;
    }

    const prevIdx = (currentIndex - 1 + currentQueue.length) % currentQueue.length;
    void playTrackRef.current(currentQueue[prevIdx], currentQueue, prevIdx);
  };

  const stopPlaybackAtQueueBoundary = () => {
    finishAdaptiveListenCycle(false);
    shouldAutoPlayRef.current = false;
    clearPlaybackRetryTimer();
    cancelPreparedCrossfade();

    const targetTrack = currentTrackRef.current;
    if (
      streamProtocolRef.current === 'embed'
      && isYouTubeTrack(targetTrack)
      && typeof ytPlayerRef.current?.pauseVideo === 'function'
    ) {
      ytPlayerRef.current.pauseVideo();
    }
    audioRef.current?.pause();
    setIsLoadingStream(false);
    isLoadingStreamRef.current = false;
    setPlaybackPlaying(false);
  };

  const handleNext = (overrideIndex?: any) => {
    const currentQueue = queueRef.current;
    if (currentQueue.length === 0) return;

    const currentIndex = (overrideIndex !== undefined && typeof overrideIndex === 'number')
      ? overrideIndex
      : queueIndexRef.current;

    const isSelectedPlaylistQueue = isIntentionalPlaylistQueue();
    if (!isShuffleRef.current && isSelectedPlaylistQueue && currentIndex >= currentQueue.length - 1) {
      if (shouldRepeatPlaylistAtQueueTail(true, repeatModeRef.current) && currentQueue[0]) {
        void playTrackRef.current(currentQueue[0], currentQueue, 0);
        return;
      }
      stopPlaybackAtQueueBoundary();
      return;
    }

    if (shouldAwaitPersonalizedContinuation(currentQueue.length, currentIndex, isShuffleRef.current)) {
      const sourceTrack = currentQueue[currentIndex] || currentTrackRef.current;
      const sourceTrackKey = playbackTrackKey(sourceTrack);
      const shouldRepeatPlaylist = shouldRepeatPlaylistAtQueueTail(
        isSelectedPlaylistQueue,
        repeatModeRef.current,
      );
      void ensurePersonalizedUpNextRef.current(sourceTrack).then((additions) => {
        if (
          !shouldAutoPlayRef.current
          || playbackTrackKey(currentTrackRef.current) !== sourceTrackKey
          || personalizedQueueContinuationSuppressedRef.current === sourceTrackKey
        ) return;
        const refreshedQueue = queueRef.current;
        const refreshedIndex = refreshedQueue.findIndex((item) => (
          playbackTrackKey(item) === sourceTrackKey
        ));
        const nextTrack = refreshedIndex >= 0 ? refreshedQueue[refreshedIndex + 1] : additions[0];
        if (isShuffleRef.current && refreshedQueue.length > 1) {
          handleNextRef.current(refreshedIndex >= 0 ? refreshedIndex : undefined);
          return;
        }
        if (nextTrack) {
          void playTrackRef.current(nextTrack, refreshedQueue, refreshedIndex + 1);
          return;
        }
        if (shouldRepeatPlaylist && refreshedQueue[0]) {
          void playTrackRef.current(refreshedQueue[0], refreshedQueue, 0);
          return;
        }
        stopPlaybackAtQueueBoundary();
        showSpiceNotice('SPICE could not find a related next track right now.', 'info');
      });
      return;
    }

    if (isShuffleRef.current) {
      const next = nextShuffleTrack(
        shuffleHistoryRef.current,
        shuffleQueueKeys(currentQueue),
        currentIndex,
        {
          random: getSecureRandom,
          wrap: repeatModeRef.current === 'all',
          weights: adaptiveWeightsForQueue(currentQueue),
        },
      );
      shuffleHistoryRef.current = next.state;
      if (next.index === null) {
        stopPlaybackAtQueueBoundary();
        return;
      }
      void playTrackRef.current(currentQueue[next.index], currentQueue, next.index);
      return;
    }

    const nextIdx = (currentIndex + 1) % currentQueue.length;
    void playTrackRef.current(currentQueue[nextIdx], currentQueue, nextIdx);
  };

  useEffect(() => {
    handleNextRef.current = handleNext;
  });

  const commitTrackLiked = (track: Track, isLiked: boolean, syncToCloud: boolean) => {
    rememberTrackSnapshots([track]);
    const mutation = applySpiceConnectLikeMutation(
      likedTracksRef.current,
      likedTrackDetailsRef.current,
      track.id,
      track,
      isLiked,
    );
    const updated = mutation.likedTracks;
    likedTracksRef.current = updated;
    setLikedTracks(updated);
    logDebug('database', `${isLiked ? 'Liked' : 'Unliked'} track "${track.title}" (ID: ${track.id}) - Synchronized to active profile.`);

    const savedLikedDetails = mutation.likedTrackDetails;
    likedTrackDetailsRef.current = savedLikedDetails;
    setLikedTrackDetails(savedLikedDetails);

    // Sync to profiles list database
    updateActiveProfileData({
      likedTracks: Array.from(updated),
      likedTrackDetails: savedLikedDetails
    });
    if (syncToCloud) autoSyncLikes(Array.from(updated), savedLikedDetails);

    // Discovery-success feedback: liking a track by an artist this profile
    // has not established yet is a win for that artist's future finds.
    if (isLiked) recordTrackDiscoveryWinRef.current(track);
  };

  const setTrackLiked = (track: Track, isLiked: boolean) => {
    commitTrackLiked(track, isLiked, true);
  };

  const applyRemoteTrackLiked = (track: Track, isLiked: boolean) => {
    if (likedTracksRef.current.has(track.id) === isLiked) return;
    // The controller already persisted this exact mutation with PATCH /sync/likes.
    // Applying it locally avoids replacing newer cloud likes with a receiver snapshot.
    commitTrackLiked(track, isLiked, false);
  };

  const toggleLike = (track: Track) => {
    setTrackLiked(track, !likedTracks.has(track.id));
  };

  const seekToPosition = (seekTime: number) => {
    cancelPreparedCrossfade();
    const safeDuration = durationRef.current || duration || 0;
    const safeSeek = Math.max(0, Math.min(seekTime, safeDuration || seekTime));

    const adaptiveCycle = adaptiveListenCycleRef.current;
    if (
      adaptiveCycle
      && adaptiveCycle.trackKey === playbackTrackKey(currentTrackRef.current)
      && shouldTreatAdaptiveSeekAsSkip({
        positionMs: progressRef.current * 1000,
        seekPositionMs: safeSeek * 1000,
        durationMs: safeDuration * 1000,
      })
    ) {
      adaptiveCycle.completionDisqualified = true;
    }

    progressRef.current = safeSeek;
    setProgress(safeSeek);
    const targetTrack = currentTrackRef.current;
    if (streamProtocolRef.current === 'embed' && isYouTubeTrack(targetTrack) && ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
      ytPlayerRef.current.seekTo(safeSeek, true);
    }
    if (audioRef.current) {
      audioRef.current.currentTime = safeSeek;
    }
  };

  const applyLocalShuffleMode = (enabled: boolean) => {
    if (enabled !== isShuffleRef.current) cancelPreparedCrossfade();
    setIsShuffle(enabled);
    isShuffleRef.current = enabled;
    shuffleHistoryRef.current = enabled
      ? resetShuffleHistory(shuffleQueueKeys(queueRef.current), queueIndexRef.current)
      : null;
    localStorage.setItem(PLAYER_SHUFFLE_STORAGE_KEY, String(enabled));
  };

  const applyLocalRepeatMode = (mode: 'none' | 'all' | 'one') => {
    if (mode !== repeatModeRef.current) cancelPreparedCrossfade();
    setRepeatMode(mode);
    repeatModeRef.current = mode;
    localStorage.setItem(PLAYER_REPEAT_STORAGE_KEY, mode);
  };

  const handleRemoteAuthorizationResponse = (response: Response, requestGeneration: number) => {
    if (
      requestGeneration !== remoteRequestGenerationRef.current
      ||
      response.status !== 401
      || !activePairedRemoteCredential
      || remoteAuthToken !== activePairedRemoteCredential.token
    ) return;
    localStorage.removeItem(remotePairingCredentialStorageKey(activeProfileId));
    remoteRequestGenerationRef.current += 1;
    setPairedRemoteCredential(null);
    setRemoteDevices([]);
    setSelectedRemoteDeviceId('');
    setRemoteTransport('unknown');
    setRemoteRedisConfigured(null);
    optimisticRemoteDeviceStateRef.current = null;
    setRemoteControlEnabled(false);
    localStorage.setItem('spice_remote_control_enabled', 'false');
    setRemoteStatus('The paired-device credential expired or was revoked. Pair this device again.');
  };

  function currentSpiceConnectLanDeviceState(): SpiceConnectLanDeviceState {
    const targetTrack = currentTrackRef.current;
    const currentQueue = queueRef.current || [];
    return {
      deviceId: remoteDeviceId,
      displayName: remoteDeviceName,
      currentTrack: targetTrack.id === 'placeholder' || targetTrack.id === 'spice-connect-placeholder'
        ? null
        : targetTrack,
      queue: currentQueue.slice(0, 80),
      queueIndex: queueIndexRef.current,
      isPlaying: isPlayingRef.current,
      shuffleEnabled: isShuffleRef.current,
      repeatMode: repeatModeRef.current,
      progress: progressRef.current,
      duration: durationRef.current,
      volume: volumeRef.current,
      updatedAt: new Date(currentTimestampMs()).toISOString(),
    };
  }

  const handleRemoteLanState = (peerDeviceId: string, state: SpiceConnectLanDeviceState) => {
    if (peerDeviceId !== state.deviceId || forgettingRemoteDeviceIdsRef.current.has(peerDeviceId)) return;
    if (optimisticRemoteDeviceStateRef.current?.deviceId === peerDeviceId) {
      optimisticRemoteDeviceStateRef.current = null;
    }
    const syncedAtMs = currentTimestampMs();
    setRemoteDevices((currentDevices) => {
      const existing = currentDevices.find((device) => device.deviceId === peerDeviceId);
      const directDevice: RemoteDevice = {
        ...existing,
        deviceId: peerDeviceId,
        displayName: state.displayName,
        currentTrack: state.currentTrack ? enrichTrackSnapshot(state.currentTrack as Track) : null,
        queue: Array.isArray(state.queue) ? enrichTrackSnapshots(state.queue as Track[]) : [],
        queueIndex: state.queueIndex,
        isPlaying: state.isPlaying,
        shuffleEnabled: state.shuffleEnabled,
        repeatMode: state.repeatMode,
        progress: state.progress,
        duration: state.duration,
        volume: state.volume,
        updatedAt: state.updatedAt,
        lastSeenSeconds: 0,
        isOnline: true,
        syncedAtMs,
      };
      return existing
        ? currentDevices.map((device) => device.deviceId === peerDeviceId ? directDevice : device)
        : [...currentDevices, directDevice];
    });
  };

  const reportRemoteDeviceState = async () => {
    if (!remoteAuthToken || !remoteControlEnabled) return;
    if (remoteDeviceReportInFlightRef.current) {
      remoteDeviceReportQueuedRef.current = true;
      return;
    }

    const targetTrack = currentTrackRef.current;
    const currentQueue = queueRef.current || [];
    const requestGeneration = remoteRequestGenerationRef.current;
    const requestToken = remoteAuthToken;
    remoteDeviceReportQueuedRef.current = false;
    remoteDeviceReportInFlightRef.current = true;
    try {
      const response = await spiceFetch('cloud', '/remote/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${requestToken}`,
        },
        body: JSON.stringify({
          deviceId: remoteDeviceId,
          displayName: remoteDeviceName,
          currentTrack: targetTrack.id === 'placeholder' ? null : targetTrack,
          queue: currentQueue.slice(0, 80),
          queueIndex: queueIndexRef.current,
          isPlaying: isPlayingRef.current,
          shuffleEnabled: isShuffleRef.current,
          repeatMode: repeatModeRef.current,
          progress: progressRef.current,
          duration: durationRef.current,
          volume: volumeRef.current,
        }),
      });
      if (requestGeneration !== remoteRequestGenerationRef.current) return;
      handleRemoteAuthorizationResponse(response, requestGeneration);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (requestGeneration !== remoteRequestGenerationRef.current) return;
        throw new Error(data.message || `Spice Connect state update failed with status ${response.status}.`);
      }
      const data = await response.json().catch(() => ({}));
      if (data.transport?.state === 'redis' || data.transport?.state === 'postgresql') {
        setRemoteTransport(data.transport.state);
      }
      if (typeof data.transport?.redisConfigured === 'boolean') {
        setRemoteRedisConfigured(data.transport.redisConfigured);
      }
    } catch (error) {
      if (requestGeneration !== remoteRequestGenerationRef.current) return;
      const message = error instanceof Error ? error.message : 'Spice Connect state update failed.';
      setRemoteStatus(message);
      logDebug('error', `Spice Connect device state failed: ${message}`);
    } finally {
      remoteDeviceReportInFlightRef.current = false;
      if (
        remoteDeviceReportQueuedRef.current
        && requestGeneration === remoteRequestGenerationRef.current
      ) {
        remoteDeviceReportQueuedRef.current = false;
        queueMicrotask(() => void reportRemoteDeviceState());
      }
    }
  };

  const loadRemoteDevices = async (showStatus = false) => {
    if (!remoteAuthToken || remoteDeviceLoadInFlightRef.current) return;

    remoteDeviceLoadInFlightRef.current = true;
    const requestGeneration = remoteRequestGenerationRef.current;
    const listRevision = remoteDeviceListRevisionRef.current;
    const requestToken = remoteAuthToken;
    try {
      const response = await spiceFetch('cloud', '/remote/devices', {
        headers: { Authorization: `Bearer ${requestToken}` },
        cache: 'no-store',
      });
      if (requestGeneration !== remoteRequestGenerationRef.current) return;
      handleRemoteAuthorizationResponse(response, requestGeneration);
      const data = await response.json().catch(() => ({}));
      if (requestGeneration !== remoteRequestGenerationRef.current) return;
      if (!response.ok) {
        throw new Error(data.message || `Spice Connect device load failed with status ${response.status}.`);
      }
      if (data.transport?.state === 'redis' || data.transport?.state === 'postgresql') {
        setRemoteTransport(data.transport.state);
      }
      if (typeof data.transport?.redisConfigured === 'boolean') {
        setRemoteRedisConfigured(data.transport.redisConfigured);
      }
      if (listRevision !== remoteDeviceListRevisionRef.current) return;

      const devices = Array.isArray(data.devices)
        ? data.devices.map((device: RemoteDevice) => ({
          ...device,
          currentTrack: device.currentTrack ? enrichTrackSnapshot(device.currentTrack) : null,
          queue: Array.isArray(device.queue) ? enrichTrackSnapshots(device.queue) : [],
          shuffleEnabled: device.shuffleEnabled === true,
          repeatMode: isRepeatMode(device.repeatMode) ? device.repeatMode : 'none',
          lastSeenSeconds: remoteSnapshotAgeSeconds(device.updatedAt, data.serverTime),
          isOnline: device.isOnline !== false,
          syncedAtMs: currentTimestampMs(),
        })).filter((device: RemoteDevice) => !forgettingRemoteDeviceIdsRef.current.has(device.deviceId))
        : [];
      const optimisticState = optimisticRemoteDeviceStateRef.current;
      if (optimisticState && optimisticState.expiresAt <= currentTimestampMs()) {
        optimisticRemoteDeviceStateRef.current = null;
      }
      let activeOptimisticState = optimisticRemoteDeviceStateRef.current;
      if (activeOptimisticState) {
        const receiverSnapshot = devices.find((device: RemoteDevice) => (
          device.deviceId === activeOptimisticState?.deviceId
        ));
        if (receiverSnapshot) {
          const remainingUpdates = reconcileOptimisticRemoteUpdates(
            receiverSnapshot,
            activeOptimisticState.updates,
          );
          activeOptimisticState = remainingUpdates
            ? { ...activeOptimisticState, updates: remainingUpdates }
            : null;
          optimisticRemoteDeviceStateRef.current = activeOptimisticState;
        }
      }
      setRemoteDevices(activeOptimisticState
        ? devices.map((device: RemoteDevice) => (
          device.deviceId === activeOptimisticState.deviceId
            ? { ...device, ...activeOptimisticState.updates }
            : device
        ))
        : devices);

      setSelectedRemoteDeviceId((current) => (
        current && devices.some((device: RemoteDevice) => device.deviceId === current && device.deviceId !== remoteDeviceId)
          ? current
          : ''
      ));
      if (
        selectedRemoteDeviceId
        && !devices.some((device: RemoteDevice) => device.deviceId === selectedRemoteDeviceId)
      ) {
        localStorage.removeItem('spice_connect_receiver_id');
      }

      if (showStatus) {
        setRemoteStatus(`Found ${Math.max(devices.length - 1, 0)} Spice Connect device(s).`);
      }
    } catch (error) {
      if (requestGeneration !== remoteRequestGenerationRef.current) return;
      const message = error instanceof Error ? error.message : 'Spice Connect device load failed.';
      setRemoteStatus(message);
      logDebug('error', `Spice Connect device load failed: ${message}`);
    } finally {
      remoteDeviceLoadInFlightRef.current = false;
    }
  };

  const scheduleRemoteDeviceSync = (delayMs = SPICE_CONNECT_POST_COMMAND_SYNC_DELAY_MS) => {
    if (typeof window === 'undefined') return;
    if (remoteStateSyncTimeoutRef.current) {
      clearTimeout(remoteStateSyncTimeoutRef.current);
    }

    remoteStateSyncTimeoutRef.current = window.setTimeout(() => {
      remoteStateSyncTimeoutRef.current = null;
      if (remoteControlEnabled) {
        void reportRemoteDeviceState();
      }
      void loadRemoteDevices();
    }, delayMs);
  };

  const scheduleRemoteTargetRefresh = (delayMs = SPICE_CONNECT_CONTROLLER_REFRESH_INTERVAL_MS) => {
    if (typeof window === 'undefined') return;
    if (remoteTargetRefreshTimeoutRef.current) {
      clearTimeout(remoteTargetRefreshTimeoutRef.current);
    }

    remoteTargetRefreshTimeoutRef.current = window.setTimeout(() => {
      remoteTargetRefreshTimeoutRef.current = null;
      void loadRemoteDevices();
    }, delayMs);
  };

  const rememberRemoteCommandId = (commandId: string) => {
    const appliedIds = appliedRemoteCommandIdsRef.current;
    if (appliedIds.has(commandId)) return false;

    appliedIds.add(commandId);
    if (appliedIds.size > 160) {
      const oldestId = appliedIds.values().next().value;
      if (oldestId) appliedIds.delete(oldestId);
    }

    return true;
  };

  function patchRemoteDevice(deviceId: string, updates: Partial<RemoteDevice>) {
    if (!deviceId) return;
    const previousOptimisticState = optimisticRemoteDeviceStateRef.current;
    const previousUpdates = previousOptimisticState?.deviceId === deviceId
      && previousOptimisticState.expiresAt > currentTimestampMs()
      ? previousOptimisticState.updates
      : {};
    optimisticRemoteDeviceStateRef.current = {
      deviceId,
      expiresAt: currentTimestampMs() + SPICE_CONNECT_OPTIMISTIC_STATE_WINDOW_MS,
      updates: { ...previousUpdates, ...updates },
    };
    setRemoteDevices((devices) => devices.map((device) => (
      device.deviceId === deviceId
        ? {
          ...device,
          ...updates,
          updatedAt: new Date().toISOString(),
          lastSeenSeconds: 0,
          isOnline: true,
          syncedAtMs: currentTimestampMs(),
        }
        : device
    )));
  }

  const clearPendingSpiceConnectHandoff = () => {
    clearPendingSpiceConnectHandoffTimers(pendingSpiceConnectHandoffRef.current);
    pendingSpiceConnectHandoffRef.current = null;
  };

  const currentSpiceConnectHandoffPayload = (
    transferId: string,
  ): NonNullable<RemoteCommand['payload']> => {
    const sourceTrack = currentTrackRef.current;
    const sourceQueue = queueRef.current.length > 0 ? queueRef.current : [sourceTrack];
    return {
      transferId,
      track: sourceTrack,
      queue: sourceQueue.slice(0, 80),
      queueIndex: queueIndexRef.current,
      progress: progressRef.current,
      volume: Math.min(100, volumeRef.current),
      isPlaying: isPlayingRef.current || isLoadingStreamRef.current,
      shuffleEnabled: isShuffleRef.current,
      repeatMode: repeatModeRef.current,
    };
  };

  const handleSpiceConnectHandoffReady = async (command: RemoteCommand) => {
    const pending = pendingSpiceConnectHandoffRef.current;
    if (!pending) return;

    pending.state = {
      ...pending.state,
      sourceWasPlaying: isPlayingRef.current || isLoadingStreamRef.current,
    };
    const transition = transitionSpiceConnectHandoffSource(pending.state, {
      type: 'ready',
      transferId: command.payload?.transferId || '',
      sourceDeviceId: command.sourceDeviceId,
    });
    if (transition.outbound !== 'commit') return;

    if (pending.acceptTimeoutId !== null) {
      window.clearTimeout(pending.acceptTimeoutId);
      pending.acceptTimeoutId = null;
    }
    pending.state = transition.state;
    if (transition.sourcePlayback === 'pause' && (isPlayingRef.current || isLoadingStreamRef.current)) {
      pauseCurrentPlayback();
    }

    const payload = currentSpiceConnectHandoffPayload(pending.state.transferId);
    payload.isPlaying = pending.state.sourceWasPlaying;
    setRemoteStatus(`${pending.targetName} accepted the transfer. Starting it there now...`);
    const committed = await sendRemoteCommand(
      'handoff_commit',
      payload,
      pending.state.targetDeviceId,
      true,
    );
    if (pendingSpiceConnectHandoffRef.current !== pending) return;

    if (!committed) {
      const failed = transitionSpiceConnectHandoffSource(pending.state, { type: 'commit_failed' });
      clearPendingSpiceConnectHandoff();
      if (failed.sourcePlayback === 'resume' && !isPlayingRef.current) resumeCurrentPlayback();
      void sendRemoteCommand(
        'handoff_cancel',
        { transferId: pending.state.transferId, reason: 'commit_failed' },
        pending.state.targetDeviceId,
        true,
      );
      setRemoteStatus(
        `Transfer delivery to ${pending.targetName} could not be confirmed. This device remains paused to prevent double playback; press Play here to recover.`,
      );
      return;
    }

    const payloadTrack = payload.track;
    patchRemoteDevice(pending.state.targetDeviceId, {
      currentTrack: payloadTrack,
      queue: payload.queue,
      queueIndex: Number(payload.queueIndex) || 0,
      progress: Number(payload.progress) || 0,
      duration: durationRef.current,
      volume: Number(payload.volume) || 0,
      isPlaying: payload.isPlaying !== false,
      shuffleEnabled: payload.shuffleEnabled === true,
      repeatMode: isRepeatMode(payload.repeatMode) ? payload.repeatMode : 'none',
    });

    pending.completeTimeoutId = window.setTimeout(() => {
      if (pendingSpiceConnectHandoffRef.current !== pending) return;
      const incomplete = transitionSpiceConnectHandoffSource(pending.state, { type: 'complete_timeout' });
      pending.state = incomplete.state;
      pending.completeTimeoutId = null;
      setRemoteStatus(
        `${pending.targetName} accepted the transfer but did not confirm playback. This device remains paused to prevent double playback; press Play here to recover.`,
      );
      pendingSpiceConnectHandoffRef.current = null;
    }, SPICE_CONNECT_HANDOFF_COMPLETE_TIMEOUT_MS);
  };

  const handleSpiceConnectHandoffComplete = (command: RemoteCommand) => {
    const pending = pendingSpiceConnectHandoffRef.current;
    if (!pending) return;
    const transition = transitionSpiceConnectHandoffSource(pending.state, {
      type: 'complete',
      transferId: command.payload?.transferId || '',
      sourceDeviceId: command.sourceDeviceId,
    });
    if (transition.state.phase !== 'completed') return;

    clearPendingSpiceConnectHandoff();
    setRemoteStatus(`Playback moved to ${pending.targetName} and was confirmed there.`);
    scheduleRemoteTargetRefresh(SPICE_CONNECT_POST_COMMAND_SYNC_DELAY_MS);
  };

  const applySpiceConnectHandoffCommit = async (command: RemoteCommand) => {
    const transferId = normalizeSpiceConnectTransferId(command.payload?.transferId);
    const payloadTrack = command.payload?.track;
    if (!transferId || !payloadTrack || typeof payloadTrack !== 'object' || !payloadTrack.id) {
      void sendRemoteCommand(
        'handoff_cancel',
        { transferId, reason: 'invalid_commit' },
        command.sourceDeviceId,
        true,
      );
      return;
    }

    const prepared = preparedSpiceConnectHandoffsRef.current.get(transferId);
    const committed = commitSpiceConnectHandoffDestination(
      prepared ?? null,
      transferId,
      command.sourceDeviceId,
      currentTimestampMs(),
    );
    if (!committed.matchesPrepared) {
      preparedSpiceConnectHandoffsRef.current.delete(transferId);
      void sendRemoteCommand(
        'handoff_cancel',
        { transferId, reason: 'transfer_not_prepared' },
        command.sourceDeviceId,
        true,
      );
      return;
    }
    preparedSpiceConnectHandoffsRef.current.delete(transferId);

    const hydratedTrack = enrichTrackSnapshot(payloadTrack as Track);
    const hydratedQueue = Array.isArray(command.payload?.queue)
      ? enrichTrackSnapshots(command.payload.queue)
      : [hydratedTrack];
    const queueIndexHint = Number(command.payload?.queueIndex);
    const targetProgress = Number(command.payload?.progress);
    const targetVolume = Number(command.payload?.volume);

    setSelectedRemoteDeviceId('');
    localStorage.setItem('spice_remote_selected_device', '');
    if (typeof command.payload?.shuffleEnabled === 'boolean') {
      applyLocalShuffleMode(command.payload.shuffleEnabled);
    }
    if (isRepeatMode(command.payload?.repeatMode)) {
      applyLocalRepeatMode(command.payload.repeatMode);
    }
    if (Number.isFinite(targetVolume)) {
      const safeVolume = Math.max(0, Math.min(100, Math.round(targetVolume)));
      volumeRef.current = safeVolume;
      setVolume(safeVolume);
    }

    try {
      await playTrack(
        hydratedTrack,
        hydratedQueue.length > 0 ? hydratedQueue : [hydratedTrack],
        Number.isInteger(queueIndexHint) ? queueIndexHint : undefined,
      );
      if (Number.isFinite(targetProgress) && targetProgress >= 0) seekToPosition(targetProgress);
      if (command.payload?.isPlaying === false) pauseCurrentPlayback();
      else resumeCurrentPlayback();

      const confirmed = await sendRemoteCommand(
        'handoff_complete',
        { transferId },
        command.sourceDeviceId,
        true,
      );
      const sourceName = remoteDevices.find((device) => device.deviceId === command.sourceDeviceId)?.displayName
        || 'the other device';
      setRemoteStatus(
        confirmed
          ? `Playback accepted from ${sourceName}.`
          : `Playback started here, but ${sourceName} could not be sent the confirmation.`,
      );
      scheduleRemoteDeviceSync(1_400);
    } catch (handoffError) {
      const message = handoffError instanceof Error ? handoffError.message : 'Playback could not start.';
      void sendRemoteCommand(
        'handoff_cancel',
        { transferId, reason: 'destination_playback_failed' },
        command.sourceDeviceId,
        true,
      );
      setRemoteStatus(`Transfer failed on this device: ${message}`);
    }
  };

  const shouldIgnoreRemoteCommand = (command: RemoteCommand, now: number) => {
    if (!isSpiceConnectPlaybackCommand(command.command)) return false;
    const createdAt = new Date(command.createdAt).getTime();
    if (!Number.isFinite(createdAt)) return true;
    if (createdAt < clientBootedAtRef.current) return true;
    return now < suppressRemotePlaybackUntilRef.current;
  };

  const recordRemoteTransportDiagnostic = (
    direction: SpiceConnectTransportDiagnostic['direction'],
    transport: SpiceConnectTransportDiagnostic['transport'],
    command: RemoteCommandType,
    peerDeviceId: string,
    latencyMs?: number,
  ) => {
    setRemoteTransportDiagnostic({
      direction,
      transport,
      command,
      peerDeviceId,
      observedAt: currentTimestampMs(),
      latencyMs: Number.isFinite(latencyMs)
        ? Math.max(0, Math.round(latencyMs as number))
        : undefined,
    });
  };

  const applyRemoteCommand = (
    command: RemoteCommand,
    now: number,
    transport: 'cloud' | 'lan' = 'cloud',
  ) => {
    if (command.sourceDeviceId === remoteDeviceId) return;
    if (shouldIgnoreRemoteCommand(command, now)) {
      setRemoteStatus('Ignored a stale Spice Connect playback command after startup.');
      logDebug('remote', `Ignored stale Spice Connect command ${command.command} after startup/update reload.`);
      return;
    }

    if (command.command !== SPICE_CONNECT_LAN_SIGNAL_COMMAND) {
      const commandCreatedAt = new Date(command.createdAt).getTime();
      const observedLatency = transport === 'lan'
        ? remoteLanLatencyMsByDevice[command.sourceDeviceId]
        : Number.isFinite(commandCreatedAt)
          ? now - commandCreatedAt
          : undefined;
      recordRemoteTransportDiagnostic(
        'received',
        transport,
        command.command,
        command.sourceDeviceId,
        observedLatency,
      );
    }

    if (command.command === 'connect' && command.payload?.connected === false) {
      setIncomingRemoteControllerId((controllerId) => (
        controllerId === command.sourceDeviceId ? '' : controllerId
      ));
    } else if (
      command.command !== 'handoff_ready'
      && command.command !== 'handoff_complete'
      && command.command !== 'handoff_cancel'
      && command.command !== SPICE_CONNECT_LAN_SIGNAL_COMMAND
    ) {
      setIncomingRemoteControllerId(command.sourceDeviceId);
    }

    switch (command.command) {
      case 'play':
        if (!isPlayingRef.current) resumeCurrentPlayback();
        break;
      case 'pause':
        if (isPlayingRef.current || isLoadingStreamRef.current) pauseCurrentPlayback();
        break;
      case 'toggle':
        togglePlayPause();
        break;
      case 'next':
        handleNextRef.current();
        break;
      case 'previous':
        handlePrev();
        break;
      case 'seek': {
        const seekTime = Number(command.payload?.progress);
        if (Number.isFinite(seekTime)) seekToPosition(seekTime);
        break;
      }
      case 'volume': {
        const nextVolume = Number(command.payload?.volume);
        if (Number.isFinite(nextVolume)) {
          const safeVolume = Math.max(0, Math.min(100, Math.round(nextVolume)));
          volumeRef.current = safeVolume;
          setVolume(safeVolume);
          applyAudioElementVolume(audioRef.current, safeVolume);
        }
        break;
      }
      case 'shuffle': {
        const enabled = command.payload?.enabled;
        if (typeof enabled === 'boolean') applyLocalShuffleMode(enabled);
        break;
      }
      case 'repeat': {
        const mode = command.payload?.mode;
        if (isRepeatMode(mode)) applyLocalRepeatMode(mode);
        break;
      }
      case 'play_track': {
        const payloadTrack = command.payload?.track;
        if (payloadTrack && typeof payloadTrack === 'object' && payloadTrack.id) {
          const hydratedTrack = enrichTrackSnapshot(payloadTrack as Track);
          const hydratedQueue = Array.isArray(command.payload?.queue)
            ? enrichTrackSnapshots(command.payload.queue)
            : [hydratedTrack];
          const queueIndexHint = Number(command.payload?.queueIndex);
          playTrack(
            hydratedTrack,
            hydratedQueue.length > 0 ? hydratedQueue : [hydratedTrack],
            Number.isInteger(queueIndexHint) ? queueIndexHint : undefined,
          );
        }
        break;
      }
      case 'play_queue_index': {
        const queueIndexHint = Number(command.payload?.queueIndex);
        const currentQueue = queueRef.current;
        if (Number.isInteger(queueIndexHint) && queueIndexHint >= 0 && queueIndexHint < currentQueue.length) {
          void playTrackRef.current(currentQueue[queueIndexHint], currentQueue, queueIndexHint);
        }
        break;
      }
      case 'set_like': {
        const payloadTrack = command.payload?.track;
        const liked = command.payload?.liked;
        if (payloadTrack && typeof payloadTrack === 'object' && payloadTrack.id && typeof liked === 'boolean') {
          const hydratedTrack = enrichTrackSnapshot(payloadTrack as Track);
          applyRemoteTrackLiked(hydratedTrack, liked);
          showSpiceNotice(
            `${liked ? 'Liked' : 'Unliked'} "${hydratedTrack.title}" from Spice Connect.`,
            'success',
          );
        }
        break;
      }
      case 'add_to_playlist': {
        const payloadTrack = command.payload?.track;
        const playlistId = typeof command.payload?.playlistId === 'string'
          ? command.payload.playlistId.trim()
          : '';
        const playlistTitle = typeof command.payload?.playlistTitle === 'string'
          ? command.payload.playlistTitle.trim()
          : '';
        if (payloadTrack && typeof payloadTrack === 'object' && payloadTrack.id && playlistId) {
          const hydratedTrack = enrichTrackSnapshot(payloadTrack as Track);
          const queuedMutation = remotePlaylistMutationChainRef.current.then(() => (
            addTrackToPlaylistRef.current(hydratedTrack, playlistId, playlistTitle)
          ));
          remotePlaylistMutationChainRef.current = queuedMutation.then(() => undefined, () => undefined);
          void queuedMutation.then((added) => {
            showSpiceNotice(
              added
                ? `Added "${hydratedTrack.title}" to the selected playlist from Spice Connect.`
                : `"${hydratedTrack.title}" is already in that playlist, or the playlist is unavailable here.`,
              added ? 'success' : 'warning',
            );
          });
        }
        break;
      }
      case 'download': {
        const payloadTrack = command.payload?.track;
        if (payloadTrack && typeof payloadTrack === 'object' && payloadTrack.id) {
          const hydratedTrack = enrichTrackSnapshot(payloadTrack as Track);
          void downloadTrackToOfflineLibrary(hydratedTrack).catch((error) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logDebug('error', `Spice Connect download failed: ${message}`);
            showSpiceNotice(`Failed to download audio: ${message}`, 'danger');
          });
        }
        break;
      }
      case 'handoff_prepare': {
        const transferId = normalizeSpiceConnectTransferId(command.payload?.transferId);
        if (!transferId) return;
        const preparedHandoffs = preparedSpiceConnectHandoffsRef.current;
        for (const [preparedId, prepared] of preparedHandoffs) {
          if (prepared.expiresAt <= now) preparedHandoffs.delete(preparedId);
        }
        const prepared = prepareSpiceConnectHandoffDestination(
          transferId,
          command.sourceDeviceId,
          now,
        );
        preparedHandoffs.set(transferId, prepared.state);
        setRemoteStatus('Another device is preparing to move playback here. Waiting for its final commit...');
        void sendRemoteCommand(
          'handoff_ready',
          { transferId },
          command.sourceDeviceId,
          true,
        );
        return;
      }
      case 'handoff_ready':
        void handleSpiceConnectHandoffReady(command);
        return;
      case 'handoff_commit':
        void applySpiceConnectHandoffCommit(command);
        return;
      case 'handoff_complete':
        handleSpiceConnectHandoffComplete(command);
        return;
      case 'handoff_cancel': {
        const transferId = normalizeSpiceConnectTransferId(command.payload?.transferId);
        if (transferId) preparedSpiceConnectHandoffsRef.current.delete(transferId);
        const pending = pendingSpiceConnectHandoffRef.current;
        if (
          pending
          && pending.state.transferId === transferId
          && pending.state.targetDeviceId === command.sourceDeviceId
        ) {
          const failed = transitionSpiceConnectHandoffSource(pending.state, { type: 'destination_failed' });
          clearPendingSpiceConnectHandoff();
          if (failed.sourcePlayback === 'resume' && !isPlayingRef.current) resumeCurrentPlayback();
          setRemoteStatus(`${pending.targetName} could not accept the transfer. Playback is available on this device.`);
        }
        return;
      }
      case 'handoff': {
        const payloadTrack = command.payload?.track;
        if (payloadTrack && typeof payloadTrack === 'object' && payloadTrack.id) {
          const hydratedTrack = enrichTrackSnapshot(payloadTrack as Track);
          const hydratedQueue = Array.isArray(command.payload?.queue)
            ? enrichTrackSnapshots(command.payload.queue)
            : [hydratedTrack];
          const queueIndexHint = Number(command.payload?.queueIndex);
          const targetProgress = Number(command.payload?.progress);
          const targetVolume = Number(command.payload?.volume);
          if (typeof command.payload?.shuffleEnabled === 'boolean') {
            applyLocalShuffleMode(command.payload.shuffleEnabled);
          }
          if (isRepeatMode(command.payload?.repeatMode)) {
            applyLocalRepeatMode(command.payload.repeatMode);
          }
          if (Number.isFinite(targetVolume)) {
            const safeVolume = Math.max(0, Math.min(100, Math.round(targetVolume)));
            volumeRef.current = safeVolume;
            setVolume(safeVolume);
          }
          void playTrack(
            hydratedTrack,
            hydratedQueue.length > 0 ? hydratedQueue : [hydratedTrack],
            Number.isInteger(queueIndexHint) ? queueIndexHint : undefined,
          ).then(() => {
            if (Number.isFinite(targetProgress) && targetProgress >= 0) seekToPosition(targetProgress);
            if (command.payload?.isPlaying === false) pauseCurrentPlayback();
            else resumeCurrentPlayback();
          });
        }
        break;
      }
      case 'connect':
        break;
      case 'lan_signal':
        return;
    }

    setRemoteStatus(`Spice Connect command received: ${command.command}.`);
    console.info(`[Spice Connect] applied ${transport} command ${command.id} (${command.command}) from ${command.sourceDeviceId}`);
    const settleDelay = command.command === 'handoff' ? 1400 : command.command === 'play_track' ? 900 : 300;
    if (transport === 'lan') {
      remoteLanTransportRef.current?.broadcastState(currentSpiceConnectLanDeviceState());
      window.setTimeout(() => {
        remoteLanTransportRef.current?.broadcastState(currentSpiceConnectLanDeviceState());
      }, settleDelay);
    } else {
      scheduleRemoteDeviceSync(settleDelay);
    }
  };

  const pollRemoteCommands = async () => {
    if (!remoteAuthToken || !remoteControlEnabled || remoteCommandPollInFlightRef.current) return;

    remoteCommandPollInFlightRef.current = true;
    const requestGeneration = remoteRequestGenerationRef.current;
    const requestToken = remoteAuthToken;
    try {
      const response = await spiceFetch('cloud', '/remote/commands', {
        headers: { Authorization: `Bearer ${requestToken}` },
        cache: 'no-store',
      }, { deviceId: remoteDeviceId });
      if (requestGeneration !== remoteRequestGenerationRef.current) return;
      handleRemoteAuthorizationResponse(response, requestGeneration);
      const data = await response.json().catch(() => ({}));
      if (requestGeneration !== remoteRequestGenerationRef.current) return;
      if (!response.ok) {
        throw new Error(data.message || `Spice Connect command poll failed with status ${response.status}.`);
      }

      const commands = Array.isArray(data.commands) ? data.commands as RemoteCommand[] : [];
      const now = currentTimestampMs();
      const freshCommands = commands.filter((command) => {
        if (!command.id || appliedRemoteCommandIdsRef.current.has(command.id)) return false;
        if (!isSpiceConnectCommandFresh(command.createdAt, now, SPICE_CONNECT_COMMAND_TTL_MS)) {
          logDebug('remote', `Ignored stale Spice Connect command ${command.command}.`);
          return false;
        }
        return true;
      });

      emptyRemoteCommandPollsRef.current = freshCommands.length > 0
        ? 0
        : Math.min(emptyRemoteCommandPollsRef.current + 1, SPICE_CONNECT_COMMAND_IDLE_BACKOFF_POLLS);
      freshCommands.forEach((command) => {
        if (command.command === SPICE_CONNECT_LAN_SIGNAL_COMMAND) {
          const createdAt = new Date(command.createdAt).getTime();
          if (Number.isFinite(createdAt) && createdAt >= clientBootedAtRef.current) {
            void remoteLanTransportRef.current?.handleSignal(command.sourceDeviceId, command.payload);
          }
        } else {
          applyRemoteCommand(command, now);
        }
        rememberRemoteCommandId(command.id);
      });
    } catch (error) {
      if (requestGeneration !== remoteRequestGenerationRef.current) return;
      emptyRemoteCommandPollsRef.current = Math.min(
        emptyRemoteCommandPollsRef.current + 1,
        SPICE_CONNECT_COMMAND_IDLE_BACKOFF_POLLS
      );
      const message = error instanceof Error ? error.message : 'Spice Connect command poll failed.';
      setRemoteStatus(message);
      logDebug('error', `Spice Connect command poll failed: ${message}`);
      console.error(`[Spice Connect] command poll failed for ${remoteDeviceId}: ${message}`);
    } finally {
      remoteCommandPollInFlightRef.current = false;
    }
  };

  async function sendRemoteCommand(
    command: RemoteCommandType,
    payload: RemoteCommand['payload'] = {},
    targetDeviceId = selectedRemoteDeviceId,
    quiet = false,
  ) {
    if (!remoteAuthToken) {
      setRemoteStatus('Sign in or pair this device to use Spice Connect.');
      return false;
    }
    if (!targetDeviceId) {
      setRemoteStatus('Choose another Spice Connect device first.');
      return false;
    }
    const targetRemoteDevice = remoteDevices.find((device) => device.deviceId === targetDeviceId);
    if (command === 'play' && targetRemoteDevice && !targetRemoteDevice.currentTrack) {
      setRemoteStatus(`Choose a track for ${targetRemoteDevice.displayName} before pressing play.`);
      return false;
    }
    if (command !== SPICE_CONNECT_LAN_SIGNAL_COMMAND) {
      const sentDirect = remoteLanTransportRef.current?.sendCommand(
        targetDeviceId,
        command,
        payload,
      ) ?? false;
      if (sentDirect) {
        recordRemoteTransportDiagnostic(
          'sent',
          'lan',
          command,
          targetDeviceId,
          remoteLanLatencyMsByDevice[targetDeviceId],
        );
        if (!quiet) setRemoteStatus(`Sent ${command} over the same-network direct link.`);
        console.info(`[Spice Connect] sent ${command} directly from ${remoteDeviceId} to ${targetDeviceId}`);
        return true;
      }
      void remoteLanTransportRef.current?.ensureConnection(targetDeviceId);
    }
    if (
      targetRemoteDevice?.lastSeenSeconds !== undefined
      && targetRemoteDevice.lastSeenSeconds > SPICE_CONNECT_STALE_DEVICE_SECONDS
    ) {
      setRemoteStatus(`${targetRemoteDevice.displayName} has not checked in recently. Refresh Spice Connect before controlling it.`);
      void loadRemoteDevices(true);
      return false;
    }

    const requestGeneration = remoteRequestGenerationRef.current;
    const requestToken = remoteAuthToken;
    const cloudSendStartedAt = currentTimestampMs();
    try {
      const response = await spiceFetch('cloud', '/remote/commands', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${requestToken}`,
        },
        body: JSON.stringify({
          sourceDeviceId: remoteDeviceId,
          targetDeviceId,
          command,
          payload,
        }),
      });
      if (requestGeneration !== remoteRequestGenerationRef.current) return false;
      handleRemoteAuthorizationResponse(response, requestGeneration);
      const data = await response.json().catch(() => ({}));
      if (requestGeneration !== remoteRequestGenerationRef.current) return false;
      if (!response.ok) {
        throw new Error(data.message || `Spice Connect command failed with status ${response.status}.`);
      }

      if (data.transport === 'redis' || data.transport === 'postgresql') {
        setRemoteTransport(data.transport);
      }
      if (command !== SPICE_CONNECT_LAN_SIGNAL_COMMAND) {
        recordRemoteTransportDiagnostic(
          'sent',
          'cloud',
          command,
          targetDeviceId,
          currentTimestampMs() - cloudSendStartedAt,
        );
      }
      if (!quiet) setRemoteStatus(`Sent ${command} through Spice Connect.`);
      console.info(`[Spice Connect] queued ${command} from ${remoteDeviceId} to ${targetDeviceId}`);
      if (command !== SPICE_CONNECT_LAN_SIGNAL_COMMAND) {
        scheduleRemoteTargetRefresh();
      }
      return true;
    } catch (error) {
      if (requestGeneration !== remoteRequestGenerationRef.current) return false;
      optimisticRemoteDeviceStateRef.current = null;
      const message = error instanceof Error ? error.message : 'Spice Connect command failed.';
      setRemoteStatus(message);
      logDebug('error', `Spice Connect command send failed: ${message}`);
      console.error(`[Spice Connect] command send failed from ${remoteDeviceId} to ${targetDeviceId}: ${message}`);
      void loadRemoteDevices();
      return false;
    }
  }

  useEffect(() => {
    sendRemoteCommandRef.current = sendRemoteCommand;
    applyRemoteCommandRef.current = applyRemoteCommand;
    handleRemoteLanStateRef.current = handleRemoteLanState;
  });

  const handleEmailVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailVerification) return;
    const authProfileId = activeProfileIdRef.current;
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch(spiceApiUrl('cloud', '/auth/spice/verify-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId: emailVerification.registrationId,
          code: emailVerificationCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Email verification failed.');
      await finishCloudAuthentication(data, authProfileId, 'register');
    } catch (err: any) {
      setAuthError(err.message || 'Email verification failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const resendEmailVerification = async () => {
    if (!emailVerification) return;
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch(spiceApiUrl('cloud', '/auth/spice/resend-verification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: emailVerification.registrationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not resend the verification code.');
      setEmailVerificationCode('');
    } catch (err: any) {
      setAuthError(err.message || 'Could not resend the verification code.');
    } finally {
      setAuthLoading(false);
    }
  };

  const createSecurePairingCode = async (): Promise<PairingCodeResult> => {
    if (!cloudToken) throw new Error('Sign in before creating a phone pairing code.');
    if (!remoteControlEnabled) throw new Error('Enable Spice Connect on this device first.');
    const requestToken = cloudToken;
    const requestProfileId = activeProfileIdRef.current;
    const requestGeneration = remoteRequestGenerationRef.current;
    const requestIsCurrent = () => (
      requestGeneration === remoteRequestGenerationRef.current
      && requestProfileId === activeProfileIdRef.current
      && requestToken === cloudTokenRef.current
    );
    const registrationResponse = await spiceFetch('cloud', '/remote/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${requestToken}` },
      body: JSON.stringify({
        deviceId: remoteDeviceId,
        displayName: remoteDeviceName,
        currentTrack: currentTrackRef.current.id === 'placeholder' ? null : currentTrackRef.current,
        queue: queueRef.current.slice(0, 80),
        queueIndex: queueIndexRef.current,
        isPlaying: isPlayingRef.current,
        shuffleEnabled: isShuffleRef.current,
        repeatMode: repeatModeRef.current,
        progress: progressRef.current,
        duration: durationRef.current,
        volume: volumeRef.current,
      }),
    });
    if (!requestIsCurrent()) throw new Error('The active account changed before pairing started.');
    if (!registrationResponse.ok) {
      const registrationError = await registrationResponse.json().catch(() => ({}));
      if (!requestIsCurrent()) throw new Error('The active account changed before pairing started.');
      throw new Error(registrationError.message || 'Could not register this device for pairing.');
    }
    const response = await spiceFetch('cloud', '/remote/pairing/codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${requestToken}` },
      body: JSON.stringify({ issuerDeviceId: remoteDeviceId }),
    });
    if (!requestIsCurrent()) throw new Error('The active account changed before pairing completed.');
    const data = await response.json().catch(() => ({}));
    if (!requestIsCurrent()) throw new Error('The active account changed before pairing completed.');
    if (!response.ok) throw new Error(data.message || 'Could not create a pairing code.');
    return data as PairingCodeResult;
  };

  const cancelSecurePairingCode = async (pairingId: string) => {
    if (!cloudToken) throw new Error('Sign in before cancelling a pairing code.');
    const requestToken = cloudToken;
    const requestProfileId = activeProfileIdRef.current;
    const requestGeneration = remoteRequestGenerationRef.current;
    const response = await spiceFetch('cloud', `/remote/pairing/codes/${encodeURIComponent(pairingId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${requestToken}` },
    });
    if (
      requestGeneration !== remoteRequestGenerationRef.current
      || requestProfileId !== activeProfileIdRef.current
      || requestToken !== cloudTokenRef.current
    ) throw new Error('The active account changed before cancellation completed.');
    const data = await response.json().catch(() => ({}));
    if (
      requestGeneration !== remoteRequestGenerationRef.current
      || requestProfileId !== activeProfileIdRef.current
      || requestToken !== cloudTokenRef.current
    ) throw new Error('The active account changed before cancellation completed.');
    if (!response.ok) throw new Error(data.message || 'Could not cancel the pairing code.');
  };

  const claimSecurePairingCode = async (code: string, displayName: string) => {
    const claimProfileId = activeProfileIdRef.current;
    const requestGeneration = remoteRequestGenerationRef.current;
    const response = await spiceFetch('cloud', '/remote/pairing/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, deviceId: remoteDeviceId, displayName }),
    });
    if (
      requestGeneration !== remoteRequestGenerationRef.current
      || activeProfileIdRef.current !== claimProfileId
    ) throw new Error('The active profile changed before pairing completed.');
    const data = await response.json().catch(() => ({}));
    if (
      requestGeneration !== remoteRequestGenerationRef.current
      || activeProfileIdRef.current !== claimProfileId
    ) throw new Error('The active profile changed before pairing completed.');
    if (
      !response.ok
      || typeof data.accessToken !== 'string'
      || typeof data.authorizationId !== 'string'
      || typeof data.userId !== 'string'
      || typeof data.expiresAt !== 'string'
    ) {
      throw new Error(data.message || 'The pairing code is invalid or expired.');
    }
    const credential: StoredRemotePairingCredential = {
      token: data.accessToken,
      authorizationId: data.authorizationId,
      deviceId: remoteDeviceId,
      ownerUserId: data.userId,
      expiresAt: data.expiresAt,
    };
    localStorage.setItem(remotePairingCredentialStorageKey(claimProfileId), JSON.stringify(credential));
    localStorage.setItem('spice_remote_device_name', displayName);
    localStorage.setItem('spice_remote_control_enabled', 'true');
    remoteRequestGenerationRef.current += 1;
    setPairedRemoteCredential(credential);
    setRemoteDeviceName(displayName);
    setRemoteControlEnabled(true);
    setRemoteTransport('unknown');
    setRemoteRedisConfigured(null);
    setRemoteStatus('Secure pairing completed.');
  };

  const loadSecurePairingAuthorizations = async (): Promise<PairedDeviceAuthorization[]> => {
    if (!cloudToken) return [];
    const requestToken = cloudToken;
    const requestProfileId = activeProfileIdRef.current;
    const requestGeneration = remoteRequestGenerationRef.current;
    const response = await spiceFetch('cloud', '/remote/pairing/authorizations', {
      headers: { Authorization: `Bearer ${requestToken}` },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (
      requestGeneration !== remoteRequestGenerationRef.current
      || requestProfileId !== activeProfileIdRef.current
      || requestToken !== cloudTokenRef.current
    ) throw new Error('The active account changed while loading paired devices.');
    if (!response.ok) throw new Error(data.message || 'Could not load paired devices.');
    return Array.isArray(data.authorizations) ? data.authorizations : [];
  };

  const revokeSecurePairingAuthorization = async (authorizationId: string) => {
    if (!cloudToken) throw new Error('Sign in before revoking a paired device.');
    const requestToken = cloudToken;
    const requestProfileId = activeProfileIdRef.current;
    const requestGeneration = remoteRequestGenerationRef.current;
    const response = await spiceFetch('cloud', `/remote/pairing/authorizations/${encodeURIComponent(authorizationId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${requestToken}` },
    });
    const data = await response.json().catch(() => ({}));
    if (
      requestGeneration !== remoteRequestGenerationRef.current
      || requestProfileId !== activeProfileIdRef.current
      || requestToken !== cloudTokenRef.current
    ) throw new Error('The active account changed before revocation completed.');
    if (!response.ok) throw new Error(data.message || 'Could not revoke the paired device.');
    if (activePairedRemoteCredential?.authorizationId === authorizationId) {
      localStorage.removeItem(remotePairingCredentialStorageKey(activeProfileId));
      remoteRequestGenerationRef.current += 1;
      setPairedRemoteCredential(null);
      setRemoteDevices([]);
      setSelectedRemoteDeviceId('');
      setRemoteTransport('unknown');
      setRemoteRedisConfigured(null);
      optimisticRemoteDeviceStateRef.current = null;
    }
  };

  const forgetLocalPairingCredential = () => {
    localStorage.removeItem(remotePairingCredentialStorageKey(activeProfileId));
    remoteRequestGenerationRef.current += 1;
    optimisticRemoteDeviceStateRef.current = null;
    setPairedRemoteCredential(null);
    setRemoteTransport('unknown');
    setRemoteRedisConfigured(null);
    if (!cloudToken) {
      setRemoteControlEnabled(false);
      localStorage.setItem('spice_remote_control_enabled', 'false');
    }
    setRemoteStatus('Local paired-device credential removed.');
  };

  const remoteCommandPollDelayMs = () => {
    return spiceConnectCommandPollDelay({
      visible: isSpiceDocumentVisible(),
      emptyPolls: emptyRemoteCommandPollsRef.current,
    });
  };

  const remoteDeviceStateFingerprint = [
    currentTrack.id,
    trackListFingerprint(queue),
    queueIndex,
    isPlaying,
    isShuffle,
    repeatMode,
    Math.round(volume),
    Math.round(Math.max(0, duration) * 10),
    Math.floor(Math.max(0, progress) / 60),
  ].join('|');
  const selectedRemoteDeviceUsesLan = Boolean(
    selectedRemoteDeviceId && remoteLanPeerDeviceIds.includes(selectedRemoteDeviceId),
  );
  const remoteCommandRouteLabel = !selectedRemoteDeviceId
    ? 'No receiver selected'
    : selectedRemoteDeviceUsesLan
      ? 'Local network direct'
      : 'Cloud server fallback';
  const remoteCloudPathLabel = remoteTransport === 'redis'
    ? 'Last request used the Redis fast path'
    : remoteTransport === 'postgresql'
      ? remoteRedisConfigured === false
        ? 'Last request used PostgreSQL · Redis is not configured'
        : 'Last request used the PostgreSQL fallback'
      : 'Not checked yet';

  useEffect(() => {
    remoteLanTransportRef.current?.dispose();
    remoteLanTransportRef.current = null;
    setRemoteLanPeerDeviceIds([]);
    setRemoteLanLatencyMsByDevice({});
    if (
      !isMounted
      || !remoteAuthToken
      || !remoteControlEnabled
      || typeof RTCPeerConnection === 'undefined'
    ) return;

    const transport = new SpiceConnectLanTransport({
      localDeviceId: remoteDeviceId,
      sendSignal: async (targetDeviceId: string, signal: SpiceConnectLanSignal) => (
        sendRemoteCommandRef.current(
          SPICE_CONNECT_LAN_SIGNAL_COMMAND,
          signal as unknown as RemoteCommand['payload'],
          targetDeviceId,
          true,
        )
      ),
      onCommand: (command) => {
        const now = currentTimestampMs();
        // A verified data channel can only deliver live session traffic. Use
        // the local receipt time so harmless device clock skew cannot make a
        // direct command look older than this receiver's boot time.
        if (!rememberRemoteCommandId(command.id)) return;
        applyRemoteCommandRef.current({
          ...command,
          payload: command.payload as RemoteCommand['payload'],
          createdAt: new Date(now).toISOString(),
        }, now, 'lan');
      },
      onState: (peerDeviceId, state) => {
        handleRemoteLanStateRef.current(peerDeviceId, state);
      },
      onPeersChanged: setRemoteLanPeerDeviceIds,
      onPeerLatency: (peerDeviceId, roundTripMs) => {
        setRemoteLanLatencyMsByDevice((latencies) => ({
          ...latencies,
          [peerDeviceId]: roundTripMs,
        }));
      },
      onDiagnostic: (message) => logDebug('remote', message),
    });
    remoteLanTransportRef.current = transport;
    transport.broadcastState(currentSpiceConnectLanDeviceState());

    return () => {
      if (remoteLanTransportRef.current === transport) {
        remoteLanTransportRef.current = null;
      }
      transport.dispose();
    };
  }, [isMounted, remoteAuthToken, remoteControlEnabled, remoteDeviceId]);

  useEffect(() => {
    const transport = remoteLanTransportRef.current;
    if (!transport) return;
    transport.broadcastState(currentSpiceConnectLanDeviceState());
    if (selectedRemoteDeviceId) {
      void transport.ensureConnection(selectedRemoteDeviceId);
    }
  }, [
    remoteDeviceName,
    remoteDeviceStateFingerprint,
    selectedRemoteDeviceId,
  ]);

  useEffect(() => {
    if (!isMounted || !remoteAuthToken) return;

    void loadRemoteDevices();
    if (remoteControlEnabled) {
      void reportRemoteDeviceState();
    }

    const syncInterval = remoteControlEnabled
      ? setInterval(() => {
        void reportRemoteDeviceState();
      }, SPICE_CONNECT_DEVICE_SYNC_INTERVAL_MS)
      : null;
    const controllerRefreshInterval = selectedRemoteDeviceId && !selectedRemoteDeviceUsesLan
      ? setInterval(() => {
        void loadRemoteDevices();
      }, remoteRealtimeConnected
        ? SPICE_CONNECT_CONTROLLER_REALTIME_FALLBACK_REFRESH_INTERVAL_MS
        : SPICE_CONNECT_CONTROLLER_REFRESH_INTERVAL_MS)
      : null;

    const timerInterval = setInterval(() => {
      setRemoteDevices((currentDevices) =>
        currentDevices.map((device) => {
          const lastSeenSeconds = (device.lastSeenSeconds ?? 0) + 1;
          return {
            ...device,
            lastSeenSeconds,
            isOnline: device.isOnline !== false && lastSeenSeconds < SPICE_CONNECT_STALE_DEVICE_SECONDS,
          };
        })
      );
    }, 1000);

    return () => {
      if (syncInterval) {
        clearInterval(syncInterval);
      }
      if (controllerRefreshInterval) {
        clearInterval(controllerRefreshInterval);
      }
      clearInterval(timerInterval);
    };
  }, [
    isMounted,
    remoteAuthToken,
    remoteControlEnabled,
    remoteDeviceId,
    remoteDeviceName,
    remoteRealtimeConnected,
    selectedRemoteDeviceId,
    selectedRemoteDeviceUsesLan,
  ]);

  useEffect(() => {
    if (!isMounted || !remoteAuthToken || !remoteControlEnabled) return;

    const timeoutId = window.setTimeout(() => {
      const deliveredDirectly = remoteLanTransportRef.current?.broadcastState(
        currentSpiceConnectLanDeviceState(),
      ) ?? 0;
      if (deliveredDirectly === 0) {
        void reportRemoteDeviceState();
      }
    }, SPICE_CONNECT_STATE_REPORT_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    isMounted,
    remoteAuthToken,
    remoteControlEnabled,
    remoteDeviceId,
    remoteDeviceName,
    remoteDeviceStateFingerprint,
  ]);

  useEffect(() => {
    if (!isMounted || !remoteAuthToken || !remoteControlEnabled) return;

    let cancelled = false;
    let timeoutId: number | null = null;

    const clearScheduledPoll = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const schedulePoll = (delayMs: number) => {
      clearScheduledPoll();
      timeoutId = window.setTimeout(() => {
        void runPoll();
      }, delayMs);
    };

    const runPoll = async () => {
      if (cancelled) return;
      await pollRemoteCommands();
      if (!cancelled) {
        schedulePoll(remoteRealtimeConnected
          ? SPICE_CONNECT_COMMAND_REALTIME_FALLBACK_POLL_INTERVAL_MS
          : remoteCommandPollDelayMs());
      }
    };

    const handleVisibilityChange = () => {
      if (isSpiceDocumentVisible()) {
        void runPoll();
      }
    };

    void runPoll();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      clearScheduledPoll();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isMounted, remoteAuthToken, remoteControlEnabled, remoteDeviceId, remoteRealtimeConnected]);

  useEffect(() => {
    if (!isMounted || !remoteAuthToken || !remoteControlEnabled) return;

    let cancelled = false;
    let reconnectTimer: number | null = null;
    let resolveReconnectWait: (() => void) | null = null;
    let reconnectDelayMs = SPICE_CONNECT_REALTIME_RECONNECT_MIN_MS;
    let fallbackLogged = false;
    let abortController: AbortController | null = null;
    let streamWasReady = false;
    const requestGeneration = remoteRequestGenerationRef.current;
    const requestToken = remoteAuthToken;

    const waitToReconnect = (delayMs: number) => new Promise<void>((resolve) => {
      resolveReconnectWait = resolve;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        resolveReconnectWait = null;
        resolve();
      }, delayMs);
    });

    const listenForCommands = async () => {
      setRemoteRealtimeConnected(false);
      while (!cancelled && requestGeneration === remoteRequestGenerationRef.current) {
        abortController = new AbortController();
        try {
          const response = await spiceFetch('cloud', '/remote/events', {
            headers: {
              Accept: 'text/event-stream',
              Authorization: `Bearer ${requestToken}`,
            },
            cache: 'no-store',
            signal: abortController.signal,
          }, { deviceId: remoteDeviceId });
          if (cancelled || requestGeneration !== remoteRequestGenerationRef.current) return;
          handleRemoteAuthorizationResponse(response, requestGeneration);
          if (!response.ok || !response.body) {
            throw new Error(`Spice Connect realtime stream returned ${response.status}.`);
          }

          fallbackLogged = false;
          reconnectDelayMs = SPICE_CONNECT_REALTIME_RECONNECT_MIN_MS;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let parserState = initialSpiceConnectSseParserState();
          while (!cancelled && requestGeneration === remoteRequestGenerationRef.current) {
            const { done, value } = await reader.read();
            if (done) break;
            const parsed = parseSpiceConnectSseChunk(
              parserState,
              decoder.decode(value, { stream: true }),
            );
            parserState = parsed.state;
            if (parsed.events.includes('ready')) {
              streamWasReady = true;
              setRemoteRealtimeConnected(true);
            }
            if (parsed.events.some((eventName) => eventName === 'ready' || eventName === 'command')) {
              emptyRemoteCommandPollsRef.current = 0;
              void pollRemoteCommands();
            }
            if (parsed.events.includes('state')) {
              void loadRemoteDevices();
            }
          }
        } catch (error) {
          if (
            cancelled
            || requestGeneration !== remoteRequestGenerationRef.current
            || (error instanceof DOMException && error.name === 'AbortError')
          ) return;
          if (!fallbackLogged) {
            fallbackLogged = true;
            logDebug('remote', 'Realtime Spice Connect wakeups unavailable; using command polling fallback.');
          }
        } finally {
          abortController = null;
          if (streamWasReady) {
            streamWasReady = false;
            setRemoteRealtimeConnected(false);
          }
        }

        if (cancelled || requestGeneration !== remoteRequestGenerationRef.current) return;
        await waitToReconnect(reconnectDelayMs);
        reconnectDelayMs = Math.min(
          SPICE_CONNECT_REALTIME_RECONNECT_MAX_MS,
          reconnectDelayMs * 2,
        );
      }
    };

    void listenForCommands();
    return () => {
      cancelled = true;
      setRemoteRealtimeConnected(false);
      abortController?.abort();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      resolveReconnectWait?.();
    };
  }, [isMounted, remoteAuthToken, remoteControlEnabled, remoteDeviceId]);

  const fetchSearchProviderResults = async (query: string, provider: SearchProvider) => {
    type ProviderBatchKey = Exclude<SearchProvider, 'hybrid'> | 'youtube_web';
    const PROVIDER_BATCH_LABELS: Record<ProviderBatchKey, string> = {
      ...SEARCH_PROVIDER_LABELS,
      youtube_web: 'YouTube Video',
    };
    const fetchProvider = async (targetProvider: ProviderBatchKey, limit: number) => {
      const params = new URLSearchParams({
        q: query,
        limit: String(limit),
      });
      const endpoint = {
        youtube_music: '/yt/search',
        youtube_videos: '/yt/search',
        youtube_web: '/yt/search',
        soundcloud: '/sc/search',
      }[targetProvider];

      if (targetProvider === 'youtube_music' || targetProvider === 'youtube_videos') {
        params.set('kind', targetProvider === 'youtube_videos' ? 'videos' : 'tracks');
      } else if (targetProvider === 'youtube_web') {
        params.set('kind', 'web_videos');
      }

      const res = await spiceFetch('local', endpoint, undefined, params);
      if (!res.ok) throw new Error(`${PROVIDER_BATCH_LABELS[targetProvider]} search failed`);
      const data = await res.json();
      return playableSearchTracks(enrichTrackSnapshots(data.tracks ?? []) as Track[]);
    };

    if (provider === 'hybrid') {
      const batches = await Promise.allSettled([
        fetchProvider('youtube_music', 8),
        fetchProvider('youtube_videos', 6),
        fetchProvider('youtube_web', 6),
        fetchProvider('soundcloud', 6),
      ]);
      return dedupeTracks(
        batches.flatMap((batch) => batch.status === 'fulfilled' ? batch.value : []),
      ).slice(0, 30);
    }

    return fetchProvider(provider, 20);
  };

  const ensurePersonalizedUpNext = async (track: Track): Promise<Track[]> => {
    if (
      !track
      || track.id === 'placeholder'
      || track.id === 'spice-connect-placeholder'
      || isOfflineTrack(track)
      || selectedRemoteDeviceId
      || listenTogetherHostSessionIdRef.current
      || personalizedQueueContinuationSuppressedRef.current === playbackTrackKey(track)
      || isIntentionalPlaylistQueue()
    ) return [];

    const profileId = activeProfileIdRef.current;
    const requestKey = `${profileId}:${playbackTrackKey(track)}`;
    const existingRequest = relatedQueueInFlightRef.current.get(requestKey);
    if (existingRequest) return existingRequest;

    const request = (async () => {
      const seed = createRelatedRecommendationSeed(track);
      let relatedTracks = relatedQueueCacheRef.current.get(requestKey) || [];

      if (relatedTracks.length === 0) {
        try {
          if (isYouTubeTrack(track)) {
            const response = await spiceFetch(
              'local',
              `/yt/related/${encodeURIComponent(track.id)}`,
              undefined,
              { limit: 30 },
            );
            if (response.ok) {
              const data = await response.json();
              relatedTracks = playableSearchTracks(
                enrichTrackSnapshots(data.tracks || []) as Track[],
              );
            }
          }

          if (relatedTracks.length < 3) {
            const fallbackProvider: SearchProvider = isSoundCloudTrack(track)
              ? 'soundcloud'
              : 'youtube_music';
            relatedTracks = dedupeTracks([
              ...relatedTracks,
              ...await fetchSearchProviderResults(seed.query, fallbackProvider),
            ]);
          }
        } catch (error) {
          logDebug(
            'recommendations',
            `Related queue lookup failed for "${track.title}": ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        if (relatedTracks.length > 0) {
          if (relatedQueueCacheRef.current.size >= 40) {
            const oldestKey = relatedQueueCacheRef.current.keys().next().value;
            if (oldestKey) relatedQueueCacheRef.current.delete(oldestKey);
          }
          relatedQueueCacheRef.current.set(requestKey, relatedTracks);
        }
      }

      if (activeProfileIdRef.current !== profileId || relatedTracks.length === 0) return [];
      const profile = activeProfileRef.current;
      const taste = buildPrivateTasteProfile({
        history: profile.history || [],
        likedTracks: Object.values(profile.likedTrackDetails || {}),
        playlists: profile.customPlaylists || [],
      });
      const queueSnapshot = queueRef.current;
      const affinityContext: TasteAffinityContext = {
        ...tasteAffinityContext,
        recentTrackKeys: new Set([
          playbackTrackKey(track),
          ...queueSnapshot.slice(-4).map(playbackTrackKey),
        ]),
      };
      let ranked = rankRecommendedTracks([{ seed, tracks: relatedTracks }], taste, {
        exclude: queueSnapshot,
        limit: 16,
        affinity: (candidate) => trackAffinityScore(candidate, affinityContext),
      });
      if (ranked.length === 0) {
        ranked = rankRecommendedTracks([{ seed, tracks: relatedTracks }], taste, {
          exclude: queueSnapshot,
          includeKnown: true,
          limit: 16,
          affinity: (candidate) => trackAffinityScore(candidate, affinityContext),
        });
      }
      if (ranked.length === 0) return [];

      const currentQueue = queueRef.current;
      const currentIndex = currentQueue.findIndex((item) => (
        playbackTrackKey(item) === playbackTrackKey(track)
      ));
      if (
        activeProfileIdRef.current !== profileId
        || currentIndex < 0
        || currentIndex < currentQueue.length - 1
        || personalizedQueueContinuationSuppressedRef.current === playbackTrackKey(track)
      ) return currentIndex >= 0 ? currentQueue.slice(currentIndex + 1) : [];

      const existingKeys = new Set(currentQueue.map(playbackTrackKey));
      const additions = ranked.filter((item) => !existingKeys.has(playbackTrackKey(item)));
      if (additions.length === 0) return [];

      const nextQueue = [...currentQueue, ...additions];
      rememberTrackSnapshots(additions);
      queueRef.current = nextQueue;
      setQueue(nextQueue);
      logDebug(
        'recommendations',
        `Added ${additions.length} taste-ranked related tracks after "${track.title}".`,
      );
      return additions;
    })();

    relatedQueueInFlightRef.current.set(requestKey, request);
    try {
      return await request;
    } finally {
      relatedQueueInFlightRef.current.delete(requestKey);
    }
  };

  useEffect(() => {
    ensurePersonalizedUpNextRef.current = ensurePersonalizedUpNext;
  });

  useEffect(() => {
    if (
      selectedRemoteDeviceId
      || repeatMode === 'one'
      || currentTrack.id === 'placeholder'
      || currentTrack.id === 'spice-connect-placeholder'
    ) return;
    const currentQueue = queueRef.current;
    const currentIndex = currentQueue.findIndex((track) => (
      playbackTrackKey(track) === currentTrackKey
    ));
    if (
      currentIndex < 0
      || currentIndex < currentQueue.length - 1
      || isIntentionalPlaylistQueue()
    ) return;
    void ensurePersonalizedUpNext(currentTrack);
  }, [activeProfileId, currentTrackKey, queueIndex, queue.length, repeatMode, selectedRemoteDeviceId]);

  // Search logic (debounced)
  const queueSearch = (query: string, provider = searchProvider) => {
    const requestId = ++searchRequestRef.current;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setSearchResults([]);
      setSearchResultsSource(null);
      setTopbarUserSearchResults([]);
      setIsSearching(false);
      setIsSearchingTopbarUsers(false);
      return;
    }

    const cachedSearch = getCachedSearch(query, provider);
    if (cachedSearch) {
      setSearchResults(reorderTracksByTaste(playableSearchTracks(cachedSearch.tracks as Track[]), tasteAffinityContext));
      setSearchResultsSource('cache');
      setRecentSearchEntries(getRecentCachedSearches());
    }

    setIsSearching(true);
    setIsSearchingTopbarUsers(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const [tracksRes, usersRes] = await Promise.allSettled([
          fetchSearchProviderResults(query, provider),
          spiceFetch('cloud', '/users/search', {
            headers: cloudToken ? { Authorization: `Bearer ${cloudToken}` } : {},
          }, { q: query.trim() }).then((res) => (res.ok ? res.json() : { users: [] }))
        ]);

        if (requestId !== searchRequestRef.current) return;

        if (tracksRes.status === 'fulfilled') {
          const tracks = reorderTracksByTaste(tracksRes.value, tasteAffinityContext);
          rememberSearchResults(query, tracks, provider);
          setSearchResults(tracks);
          setSearchResultsSource('network');
        } else {
          throw tracksRes.reason;
        }

        if (usersRes.status === 'fulfilled') {
          setTopbarUserSearchResults(usersRes.value.users || []);
        }

        setRecentSearchEntries(getRecentCachedSearches());
        setError(undefined);
      } catch (err: any) {
        console.error(err);
        if (requestId === searchRequestRef.current) {
          setError(`${SEARCH_PROVIDER_LABELS[provider]} search failed: ${err.message || err}`);
        }
      } finally {
        if (requestId === searchRequestRef.current) {
          setIsSearching(false);
          setIsSearchingTopbarUsers(false);
        }
      }
    }, 400);
  };

  const resolvePastedMediaLink = async (query: string) => {
    const mediaLink = parseSupportedMediaLink(query);
    if (!mediaLink) return false;

    const requestId = ++searchRequestRef.current;
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    setIsSearching(true);
    setIsSearchingTopbarUsers(false);
    setTopbarUserSearchResults([]);
    setTopbarSearchTrayOpen(false);
    setSelectedPlaylist(null);
    setSelectedUser(null);
    setSearchTab('tracks');
    setCurrentPage('search');

    try {
      const runtimeBridge = getSpiceDesktopRuntimeBridge();
      if (SPICE_RUNTIME_TARGET === 'vercel' && runtimeBridge && !desktopMediaRuntimeReadyRef.current) {
        const runtime = await runtimeBridge.prepare();
        if (!runtime?.running) throw new Error('The SPICE local media runtime could not be started.');
        desktopMediaRuntimeReadyRef.current = true;
      }

      const response = mediaLink.provider === 'youtube'
        ? mediaLink.kind === 'track'
          ? await spiceFetch('local', `/yt/track/${encodeURIComponent(mediaLink.id)}`)
          : mediaLink.kind === 'album'
            ? await spiceFetch('local', `/yt/album/${encodeURIComponent(mediaLink.id)}`)
            : await spiceFetch('local', `/yt/playlist/${encodeURIComponent(mediaLink.id)}`)
        : await spiceFetch('local', '/sc/resolve', undefined, { url: mediaLink.url });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || `The ${mediaLink.provider === 'youtube' ? 'YouTube' : 'SoundCloud'} link could not be resolved.`);
      }
      if (requestId !== searchRequestRef.current) return true;

      const rawTracks = mediaLink.provider === 'youtube' && mediaLink.kind === 'track'
        ? payload.track ? [payload.track] : []
        : Array.isArray(payload.tracks) ? payload.tracks : [];
      const tracks = playableSearchTracks(enrichTrackSnapshots(rawTracks));
      if (tracks.length === 0) {
        throw new Error('The link resolved, but it did not contain any playable tracks.');
      }

      rememberTrackSnapshots(tracks);
      setSearchQuery(query.trim());
      setTopbarSearchQuery(query.trim());
      setSearchResults(tracks);
      setSearchResultsSource('network');
      setError(undefined);
      showSpiceNotice(
        tracks.length === 1
          ? `Opened "${tracks[0].title}" inside SPICE.`
          : `Opened ${tracks.length} tracks from the pasted link.`,
        'success',
      );
    } catch (error) {
      if (requestId === searchRequestRef.current) {
        const message = error instanceof Error ? error.message : 'The pasted media link could not be opened.';
        setSearchResults([]);
        setSearchResultsSource(null);
        setError(message);
        showSpiceNotice(message, 'warning');
      }
    } finally {
      if (requestId === searchRequestRef.current) {
        setIsSearching(false);
      }
    }
    return true;
  };

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    queueSearch(e.target.value);
  };

  const handleSearchProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!isSearchProvider(e.target.value)) return;
    const provider = e.target.value;
    setSearchProvider(provider);
    localStorage.setItem('spice_search_provider', provider);
    queueSearch(searchQuery, provider);
  };

  const handleTopbarSearchModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!isTopbarSearchMode(e.target.value)) return;
    const mode = e.target.value;

    setTopbarSearchTrayOpen(Boolean(topbarSearchQuery.trim()) || topbarRecentSuggestions.length > 0 || topbarUserSearchResults.length > 0);
    setNotificationTrayOpen(false);

    if (mode === 'users') {
      setQuickSearchTab('users');
      if (topbarSearchQuery.trim()) {
        queueSearch(topbarSearchQuery, searchProvider);
      }
      return;
    }

    setQuickSearchTab('tracks');
    setSearchProvider(mode);
    localStorage.setItem('spice_search_provider', mode);
    const activeQuery = topbarSearchQuery.trim() || searchQuery.trim();
    if (activeQuery) {
      queueSearch(activeQuery, mode);
    }
  };

  const runTopbarSearch = (query: string, provider = searchProvider) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setTopbarSearchTrayOpen(false);
      return;
    }

    setTopbarSearchQuery(trimmedQuery);
    setSelectedPlaylist(null);
    setSelectedUser(null);
    setTopbarSearchTrayOpen(true);
    setNotificationTrayOpen(false);
    setProfileMenuOpen(false);
    setRecentSearchEntries(getRecentCachedSearches());

    if (provider !== searchProvider) {
      setSearchProvider(provider);
      localStorage.setItem('spice_search_provider', provider);
    }

    queueSearch(trimmedQuery, provider);
  };

  const handleTopbarSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickSearchTab === 'users') {
      setTopbarSearchTrayOpen(Boolean(topbarSearchQuery.trim()));
      setNotificationTrayOpen(false);
      setProfileMenuOpen(false);
    }
    void resolvePastedMediaLink(topbarSearchQuery).then((handled) => {
      if (!handled) runTopbarSearch(topbarSearchQuery, searchProvider);
    });
  };

  const handleTopbarSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const recent = getRecentCachedSearches();
    setTopbarSearchQuery(e.target.value);
    setRecentSearchEntries(recent);
    if (!topbarSearchTrayOpen && (e.target.value.trim() || recent.length > 0)) {
      setTopbarSearchTrayOpen(true);
      setNotificationTrayOpen(false);
      setProfileMenuOpen(false);
    }
    // Live results: reuse the debounced, request-sequenced search queue so
    // typing updates the tray without pressing Enter. Pasted links are still
    // resolved with priority on explicit submit.
    queueSearch(e.target.value);
  };

  const runRecentTopbarSearch = (entry: ReturnType<typeof getRecentCachedSearches>[number]) => {
    const cachedProvider = entry.sourceId ?? null;
    const provider = isSearchProvider(cachedProvider) ? cachedProvider : searchProvider;
    runTopbarSearch(entry.query, provider);
  };

  const openAccountFromTopbar = () => {
    setSelectedPlaylist(null);
    setSelectedUser(null);
    setNotificationTrayOpen(false);
    setProfileMenuOpen(false);
    setCurrentPage('account');
  };

  const openSettingsFromTopbar = () => {
    setSelectedPlaylist(null);
    setSelectedUser(null);
    setNotificationTrayOpen(false);
    setProfileMenuOpen(false);
    setTopbarSearchTrayOpen(false);
    setCurrentPage('settings');
  };

  useEffect(() => {
    if (!isMounted || launchIntentHandledRef.current || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const pageIntent = params.get('page');
    const authIntent = params.get('auth');
    const searchIntent = params.get('q') || params.get('search');
    const songIntent = params.get('song');
    const providerIntent = params.get('provider');
    const provider = isSearchProvider(providerIntent) ? providerIntent : searchProvider;
    let consumedIntent = false;

    const listenTogetherIntent = params.get('listenTogether');
    if (listenTogetherIntent) {
      const sessionId = listenTogetherIntent.trim();
      setListenTogetherHostSessionId(sessionId);
      setListenTogetherSession(null);
      setListenTogetherStatus('Connecting to the host now…');
      localStorage.setItem(LISTEN_TOGETHER_STATE_STORAGE_KEY, JSON.stringify({
        role: 'listener',
        sessionId,
        profileId: activeProfileIdRef.current,
      }));
      showSpiceNotice('Connecting to shared Listen Together session...', 'info');
      consumedIntent = true;
    } else if (songIntent) {
      const sharedTrack = decodeSongShareToken(songIntent);
      if (sharedTrack) {
        rememberTrackSnapshots([sharedTrack]);
        setSelectedPlaylist(null);
        setSelectedUser(null);
        setCurrentPage('search');
        setSearchQuery(`${sharedTrack.title} ${profileArtistName(sharedTrack)}`);
        void playTrack(sharedTrack, [sharedTrack]);
        showSpiceNotice(`Opening shared song: "${sharedTrack.title}".`, 'success');
      } else {
        showSpiceNotice('This shared song link could not be opened.', 'warning');
      }
      consumedIntent = true;
    } else if (authIntent === 'register' || authIntent === 'login') {
      setAuthMode(authIntent === 'register' ? 'register' : 'login');
      setSelectedPlaylist(null);
      setSelectedUser(null);
      setCurrentPage('account');
      consumedIntent = true;
    } else if (pageIntent === 'account') {
      setSelectedPlaylist(null);
      setSelectedUser(null);
      setCurrentPage('account');
      consumedIntent = true;
    }

    if (searchIntent?.trim()) {
      const trimmedSearch = searchIntent.trim();
      setSearchQuery(trimmedSearch);
      setSelectedPlaylist(null);
      setSelectedUser(null);
      setCurrentPage('search');
      runTopbarSearch(trimmedSearch, provider);
      consumedIntent = true;
    } else if (pageIntent === 'search') {
      setSelectedPlaylist(null);
      setSelectedUser(null);
      setCurrentPage('search');
      consumedIntent = true;
    }

    if (!consumedIntent) return;

    launchIntentHandledRef.current = true;
    for (const key of ['page', 'auth', 'q', 'search', 'provider', 'song', 'listenTogether']) {
      params.delete(key);
    }

    const nextUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState(null, '', nextUrl);
  }, [isMounted, searchProvider]);

  const updateSidebarHiddenPreference = (hidden: boolean) => {
    setSidebarHidden(hidden);
    localStorage.setItem('spice_sidebar_hidden', String(hidden));
  };

  const updateSidebarSearchPreference = (enabled: boolean) => {
    setSidebarSearchEnabled(enabled);
    localStorage.setItem('spice_sidebar_search_enabled', String(enabled));
    if (!enabled && currentPage === 'search' && !selectedPlaylist) {
      setCurrentPage('library');
    }
  };

  const updateSidebarProfilePreference = (enabled: boolean) => {
    setSidebarProfileEnabled(enabled);
    localStorage.setItem('spice_sidebar_profile_enabled', String(enabled));
    if (!enabled && currentPage === 'account' && !selectedPlaylist) {
      setCurrentPage(sidebarSearchEnabled ? 'search' : 'library');
    }
  };

  const updateSidebarSettingsPreference = (enabled: boolean) => {
    setSidebarSettingsEnabled(enabled);
    localStorage.setItem('spice_sidebar_settings_enabled', String(enabled));
  };

  const persistRecommendationPreferences = (nextValue: RecommendationPreferences) => {
    const normalized = normalizeRecommendationPreferences(nextValue);
    setRecommendationPreferences(normalized);
    localStorage.setItem(
      recommendationPreferencesStorageKey(activeProfileIdRef.current),
      JSON.stringify(normalized),
    );
    markTasteDirty('preferences');
    scheduleTasteCloudSync();
  };

  // Discovery-success feedback: liking a track by an artist this profile has
  // not established yet is a win for that artist's future finds.
  const recordTrackDiscoveryWin = (track: Track) => {
    const established = new Set(
      privateTasteProfile.artists.slice(0, 10).map((signal) => signal.id),
    );
    const discoveryArtist = (track.artists || []).find((artist) => {
      const key = (artist.id || artist.name || '').trim().toLowerCase();
      return key.length > 0 && !established.has(key);
    });
    if (!discoveryArtist) return;
    persistRecommendationPreferences(
      recordDiscoveryWin(recommendationPreferences, discoveryArtist),
    );
  };

  useEffect(() => {
    recordTrackDiscoveryWinRef.current = recordTrackDiscoveryWin;
  });

  const hideRecommendation = (track: Track) => {
    persistRecommendationPreferences(hideRecommendedTrack(recommendationPreferences, track));
    showSpiceNotice(`Hidden “${track.title}” from recommendations for this profile.`, 'success');
  };

  const snoozeRecommendationArtist = (track: Track) => {
    const artist = track.artists[0];
    if (!artist) return;
    persistRecommendationPreferences(snoozeRecommendedArtist(recommendationPreferences, artist));
    showSpiceNotice(`${artist.name} is snoozed from recommendations for 7 days.`, 'success');
  };

  const dislikeRecommendation = (track: Track) => {
    persistRecommendationPreferences(dislikeRecommendedTrack(recommendationPreferences, track));
    showSpiceNotice(`Disliked “${track.title}” — it will not be recommended to this profile again.`, 'success');
  };

  const recommendationFeedbackControls = (track: Track) => (
    <div style={{ display: 'flex', gap: '6px', marginTop: '7px' }}>
      <button
        type="button"
        className="recommendation-feedback-button"
        onClick={(event) => { event.stopPropagation(); dislikeRecommendation(track); }}
        title="Tell SPICE this track is not for you"
      >
        Dislike
      </button>
      <button
        type="button"
        className="recommendation-feedback-button"
        onClick={(event) => { event.stopPropagation(); hideRecommendation(track); }}
        title="Do not recommend this track"
      >
        Hide
      </button>
      <button
        type="button"
        className="recommendation-feedback-button"
        onClick={(event) => { event.stopPropagation(); snoozeRecommendationArtist(track); }}
        title="Pause recommendations from this artist for 7 days"
      >
        Snooze artist
      </button>
    </div>
  );

  useEffect(() => {
    if (currentPage !== 'home' && currentPage !== 'search') {
      setIsLoadingRecommendations(false);
      return;
    }

    const profile = privateTasteProfile;
    const seeds = buildRecommendationSeeds(profile, 4);
    const requestId = ++recommendationRequestRef.current;
    const primarySeed = seeds[0] ?? null;

    setHomeRecommendationSeed(primarySeed);

    if (!primarySeed) {
      setHomeRecommended([]);
      setHomeRecommendationShelves([]);
      setHomeFreshFinds([]);
      setIsLoadingRecommendations(false);
      return;
    }

    const exclude = [currentTrack, ...history.slice(0, 20)];
    const cachedBySeed = new Map(seeds.flatMap((seed) => {
      const cached = getCachedSearch(seed.query, 'hybrid');
      if (!cached) return [];

      return [[seed.id, {
        seed,
        tracks: playableSearchTracks(cached.tracks as Track[]),
        savedAt: cached.savedAt,
      }] as const];
    }));
    const cachedBatches = seeds.flatMap((seed) => {
      const cached = cachedBySeed.get(seed.id);
      return cached ? [{ seed, tracks: cached.tracks }] : [];
    });
    const commitRecommendations = (batches: { seed: import('./recommendations').RecommendationSeed; tracks: Track[] }[]) => {
      const ranked = rankRecommendedTracks(batches, profile, {
        exclude,
        limit: 12,
        preferences: recommendationPreferences,
        affinity: (candidate) => trackAffinityScore(candidate, tasteAffinityContext),
      });
      const shelves = buildRecommendationShelves(batches, profile, {
        exclude: [...exclude, ...ranked],
        limitPerShelf: 8,
        minimumTracks: 3,
        preferences: recommendationPreferences,
      });
      rememberTrackSnapshots([
        ...ranked,
        ...shelves.flatMap((shelf) => shelf.tracks),
      ]);
      setHomeRecommended(ranked);
      setHomeRecommendationShelves(shelves);
      setHomeFreshFinds(
        pickFreshFindTracks(
          batches.flatMap((batch) => batch.tracks),
          profile,
          {
            winningArtistKeys: new Set(
              recommendationPreferences.discoveryWins.map((win) => win.key),
            ),
          },
        ).filter((candidate) => !ranked.some((picked) => playbackTrackKey(picked) === playbackTrackKey(candidate))),
      );
    };

    commitRecommendations(cachedBatches);

    const staleBefore = Date.now() - RECOMMENDATION_CACHE_MAX_AGE_MS;
    const seedsToRefresh = seeds.filter((seed) => (
      (cachedBySeed.get(seed.id)?.savedAt ?? 0) < staleBefore
    ));
    if (seedsToRefresh.length === 0) {
      setIsLoadingRecommendations(false);
      return;
    }

    let cancelled = false;
    setIsLoadingRecommendations(true);
    const timeout = setTimeout(async () => {
      try {
        const batches = await Promise.allSettled(
          seedsToRefresh.map(async (seed) => {
            const tracks = await fetchSearchProviderResults(seed.query, 'hybrid');
            rememberSearchResults(seed.query, tracks, 'hybrid');
            return { seed, tracks };
          }),
        );

        if (cancelled || requestId !== recommendationRequestRef.current) return;

        const refreshedBySeed = new Map(batches.flatMap((batch) => (
          batch.status === 'fulfilled' ? [[batch.value.seed.id, batch.value] as const] : []
        )));
        const combinedBatches = seeds.flatMap((seed) => {
          const refreshed = refreshedBySeed.get(seed.id);
          if (refreshed) return [refreshed];
          const cached = cachedBySeed.get(seed.id);
          return cached ? [{ seed, tracks: cached.tracks }] : [];
        });
        commitRecommendations(combinedBatches);
      } finally {
        if (!cancelled && requestId === recommendationRequestRef.current) {
          setIsLoadingRecommendations(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [currentPage, privateTasteProfile, currentTrackKey, recommendationPreferences]);

  // "Because you listened to X": a radio shelf grown from the most-played
  // track of this profile's strongest artist, ranked by the shared affinity
  // core so it respects likes, skips, and the discovery slider.
  useEffect(() => {
    if (currentPage !== 'home' || !privateTasteProfile.isReady) {
      return;
    }

    const topArtist = privateTasteProfile.artists[0];
    if (!topArtist) return;

    const seedTrack = history
      .slice(0, 50)
      .filter((item) => item.artists?.some((artist) => (
        (artist.id || artist.name || '').trim().toLowerCase() === topArtist.id
        || (artist.name || '').trim().toLowerCase() === topArtist.label.toLowerCase()
      )) && item.msListened && item.msListened > 0)
      .sort((a, b) => (b.msListened ?? 0) - (a.msListened ?? 0))[0];
    if (!seedTrack) return;

    const requestId = ++recommendationRequestRef.current;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const response = await spiceFetch(
          'local',
          `/yt/related/${encodeURIComponent(seedTrack.id)}`,
          undefined,
          { limit: 24 },
        );
        if (cancelled || requestId !== recommendationRequestRef.current || !response.ok) return;
        const data = await response.json();
        const related = playableSearchTracks(enrichTrackSnapshots(data.tracks || []) as Track[]);
        if (related.length === 0) return;

        const includeKnown = recommendationPreferences.discoveryLevel <= 25;
        const candidates = related.filter((item) => (
          includeKnown || !privateTasteProfile.trackIds.has(playbackTrackKey(item))
        ));
        const pool = candidates.length >= 4 ? candidates : related;
        const ranked = reorderTracksByTaste(pool, tasteAffinityContext).slice(0, 10);
        if (cancelled || ranked.length === 0) return;
        rememberTrackSnapshots(ranked);
        setHomeBecauseShelf({
          label: `Because you listened to ${topArtist.label}`,
          reason: `Radio grown from "${seedTrack.title}", balanced by this profile's likes and skips.`,
          tracks: ranked,
        });
      } catch {
        // The shelf is optional; silently keep the previous state.
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [currentPage, privateTasteProfile, history, recommendationPreferences]);

  // Time-aware mix: when this hour of the day is one of the profile's
  // established listening windows, shape a shelf around what that window
  // usually sounds like.
  useEffect(() => {
    if (currentPage !== 'home' || !privateTasteProfile.isReady) return;
    const bucket = listeningTimeProfile.buckets[listeningTimeProfile.current];
    if (!bucket || bucket.eventCount < LISTENING_TIME_MIN_BUCKET_EVENTS) {
      setHomeTimeMix(null);
      return;
    }

    const bucketLabel = LISTENING_TIME_BUCKET_LABELS[listeningTimeProfile.current].toLowerCase();
    const query = bucket.topArtist
      ? `${bucket.topArtist} songs`
      : LISTENING_TIME_BUCKET_QUERIES[listeningTimeProfile.current];
    const requestId = ++recommendationRequestRef.current;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const cached = getCachedSearch(query, 'hybrid');
        let tracks = cached
          ? playableSearchTracks(cached.tracks as Track[])
          : [];
        if (tracks.length < 6) {
          const fetched = await fetchSearchProviderResults(query, 'hybrid');
          if (!cancelled && fetched.length > 0) {
            rememberSearchResults(query, fetched, 'hybrid');
            tracks = fetched;
          }
        }
        if (cancelled || requestId !== recommendationRequestRef.current || tracks.length === 0) return;
        const ranked = reorderTracksByTaste(tracks, tasteAffinityContext).slice(0, 10);
        if (ranked.length === 0) return;
        rememberTrackSnapshots(ranked);
        setHomeTimeMix({
          label: `Your ${bucketLabel} mix`,
          reason: bucket.topArtist
            ? `Built around ${bucket.topArtist} from your ${bucketLabel} listening.`
            : `Shaped by what you usually play in the ${bucketLabel}.`,
          tracks: ranked,
        });
      } catch {
        // The shelf is optional; silently keep the previous state.
      }
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [currentPage, privateTasteProfile, listeningTimeProfile, recommendationPreferences]);

  // "Listeners like you": privacy-safe collaborative favorites aggregated
  // from taste-neighbors on SPICE Cloud (counts + track identities only).
  useEffect(() => {
    if (currentPage !== 'home' || !cloudToken) {
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const res = await spiceFetch('cloud', '/listeners/like-you', {
          headers: { 'Authorization': `Bearer ${cloudToken}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({}));
        const favorites = Array.isArray(data?.tracks) ? data.tracks : [];
        if (cancelled) return;
        if (favorites.length === 0) {
          setListenersLikeYou(null);
          return;
        }
        const tracks = favorites.map((favorite: any) => ({
          id: String(favorite.trackId),
          sourceId: favorite.sourceId || 'youtube_music',
          title: favorite.title,
          artists: Array.isArray(favorite.artists)
            ? favorite.artists.map((artist: any) => ({ id: artist?.id, name: artist?.name || '' })).filter((artist: any) => artist.name)
            : [],
          artworkUrl: favorite.artworkUrl || undefined,
          durationMs: favorite.durationMs || undefined,
        })) as Track[];
        const scores: Record<string, number> = {};
        for (const favorite of favorites) {
          scores[`${favorite.sourceId || 'youtube_music'}:${favorite.trackId}`.toLocaleLowerCase()] = Number(favorite.listenerCount) || 0;
        }
        rememberTrackSnapshots(tracks);
        setListenersLikeYou({ tracks, neighborCount: Number(data.neighborCount) || 0 });
        setCollaborativeTasteScores((previous) => ({ ...previous, ...scores }));
      } catch {
        // Collaborative shelf is optional; local taste keeps working.
      }
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [currentPage, cloudToken]);

  // Playlists Operations
  const persistCustomPlaylists = (updated: Playlist[], syncOwnedPlaylists = true) => {
    customPlaylistsRef.current = updated;
    setCustomPlaylists(updated);
    updateActiveProfileData({ customPlaylists: updated });
    if (syncOwnedPlaylists) {
      autoSyncPlaylists(updated);
    }
  };

  const createPlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlTitle.trim()) return;

    const newPlaylist: Playlist = {
      id: createPlaylistId(),
      title: newPlTitle,
      description: newPlDesc || 'Custom Spice compilation.',
      tracks: newPlaylistSeedTrack ? [newPlaylistSeedTrack] : [],
      gradient: PRESET_GRADIENTS[randomIndex(PRESET_GRADIENTS.length)],
      isPublic: newPlIsPublic,
      createdAt: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    };

    const updated = [...customPlaylists, newPlaylist];
    persistCustomPlaylists(updated);

    setNewPlTitle('');
    setNewPlDesc('');
    setNewPlIsPublic(true);
    if (newPlaylistSeedTrack) {
      showSpiceNotice('Playlist created with the current song.', 'success');
    }
    setNewPlaylistSeedTrack(null);
    setShowCreateDialog(false);
  };

  const deletePlaylist = async (playlistId: string) => {
    const target = customPlaylists.find(pl => pl.id === playlistId);
    if (!target) return;

    if (target.shared) {
      if (cloudToken && isPlaylistUuid(target.id)) {
        try {
          const response = await spiceFetch('cloud', `/playlists/shared/${encodeURIComponent(target.id)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${cloudToken}` },
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.message || 'Failed to leave shared playlist.');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to leave shared playlist.';
          setShareStatus(message);
          logDebug('error', `Leave shared playlist failed: ${message}`);
          return;
        }
      } else if (!cloudToken) {
        setShareStatus('Removed locally. Sign in to leave account-backed shared playlists permanently.');
      }

      const updated = customPlaylists.filter(pl => pl.id !== playlistId);
      if (playlistQueueOriginRef.current === playlistId) playlistQueueOriginRef.current = null;
      persistCustomPlaylists(updated, false);
      setSelectedPlaylist(null);
      return;
    }

    const updated = customPlaylists.filter(pl => pl.id !== playlistId);
    if (playlistQueueOriginRef.current === playlistId) playlistQueueOriginRef.current = null;
    persistCustomPlaylists(updated);
    setSelectedPlaylist(null);
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showSpiceNotice('Image is too large. Please choose an image smaller than 2MB.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setEditPlCoverUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const savePlaylistEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlaylist) return;

    const updatedPl = {
      ...selectedPlaylist,
      title: editPlTitle.trim() || 'Untitled Playlist',
      description: editPlDesc.trim(),
      gradient: editPlGradient,
      coverUrl: editPlCoverUrl.trim() || undefined,
      isPublic: editPlIsPublic,
    };

    // Update in customPlaylists state
    const updatedPlaylists = customPlaylists.map(pl => pl.id === selectedPlaylist.id ? updatedPl : pl);

    if (selectedPlaylist.shared) {
      if (cloudToken && isPlaylistUuid(selectedPlaylist.id)) {
        try {
          const response = await spiceFetch('cloud', `/playlists/shared/${encodeURIComponent(selectedPlaylist.id)}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${cloudToken}`
            },
            body: JSON.stringify({
              title: updatedPl.title,
              description: updatedPl.description,
              gradient: updatedPl.gradient,
              coverUrl: updatedPl.coverUrl || null,
              isPublic: updatedPl.isPublic,
            })
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.message || 'Failed to update shared playlist.');
          }
          if (data.playlist) {
            const normalized = normalizePlaylistSnapshot(data.playlist);
            setCustomPlaylists(customPlaylists.map(pl => pl.id === selectedPlaylist.id ? normalized : pl));
            setSelectedPlaylist(normalized);
          } else {
            setCustomPlaylists(updatedPlaylists);
            setSelectedPlaylist(updatedPl);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update shared playlist.';
          setError(message);
          return;
        }
      } else {
        persistCustomPlaylists(updatedPlaylists, false);
        setSelectedPlaylist(updatedPl);
      }
    } else {
      persistCustomPlaylists(updatedPlaylists);
      setSelectedPlaylist(updatedPl);
    }

    setShowEditPlaylistDialog(false);
  };

  const addTrackToPlaylist = async (track: Track, playlistId: string): Promise<boolean> => {
    const currentPlaylists = customPlaylistsRef.current;
    const target = currentPlaylists.find(pl => pl.id === playlistId);

    // For shared playlists, add via API
    if (target?.shared && cloudToken && isPlaylistUuid(playlistId)) {
      try {
        const response = await spiceFetch('cloud', `/playlists/shared/${encodeURIComponent(playlistId)}/tracks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cloudToken}` },
          body: JSON.stringify({ track: { id: track.id, title: track.title, artists: track.artists, artworkUrl: track.artworkUrl, durationMs: track.durationMs, sourceId: track.sourceId || 'youtube_music' } }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Failed to add track.');

        // Optimistically update the local playlist
        let wasAdded = false;
        const updated = currentPlaylists.map(pl => {
          if (pl.id === playlistId) {
            if (pl.tracks.some(t => t.id === track.id)) return pl;
            wasAdded = true;
            return { ...pl, tracks: [...pl.tracks, { ...track, addedBy: cloudUsername ? { userId: '', username: cloudUsername, displayName: cloudUsername } : undefined }] };
          }
          return pl;
        });
        persistCustomPlaylists(updated, false);
        if (selectedPlaylist && selectedPlaylist.id === playlistId) {
          setSelectedPlaylist(updated.find(p => p.id === playlistId) || null);
        }
        return wasAdded;
      } catch (error) {
        setShareStatus(error instanceof Error ? error.message : 'Failed to add track to shared playlist.');
        return false;
      }
    }

    if (target?.shared) {
      setShareStatus('Sign in to add tracks to shared playlists.');
      return false;
    }

    rememberTrackSnapshots([track]);
    let wasAdded = false;
    const updated = currentPlaylists.map(pl => {
      if (pl.id === playlistId) {
        if (pl.tracks.some(t => t.id === track.id)) return pl;
        wasAdded = true;
        return { ...pl, tracks: [...pl.tracks, track] };
      }
      return pl;
    });
    persistCustomPlaylists(updated);

    if (selectedPlaylist && selectedPlaylist.id === playlistId) {
      setSelectedPlaylist(updated.find(p => p.id === playlistId) || null);
    }
    return wasAdded;
  };

  const addRemoteTrackToPlaylist = async (
    track: Track,
    playlistId: string,
    playlistTitle?: string,
  ): Promise<boolean> => {
    const normalizedTitle = playlistTitle?.trim();
    const currentPlaylists = customPlaylistsRef.current;
    const target = currentPlaylists.find((playlist) => playlist.id === playlistId)
      || (normalizedTitle
        ? currentPlaylists.find((playlist) => (
          !playlist.shared && playlist.title.trim().toLocaleLowerCase() === normalizedTitle.toLocaleLowerCase()
        ))
        : undefined);
    if (target) return addTrackToPlaylist(track, target.id);
    if (!normalizedTitle) return false;

    rememberTrackSnapshots([track]);
    const createdPlaylist: Playlist = {
      id: createPlaylistId(),
      title: normalizedTitle,
      description: 'Created from a paired Spice Connect device.',
      tracks: [track],
      gradient: PRESET_GRADIENTS[randomIndex(PRESET_GRADIENTS.length)],
      isPublic: false,
      createdAt: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    };
    persistCustomPlaylists([...currentPlaylists, createdPlaylist]);
    return true;
  };

  useEffect(() => {
    addTrackToPlaylistRef.current = addRemoteTrackToPlaylist;
  });

  const openPlaylistPicker = (track: Track) => {
    if (!track || track.id === 'placeholder' || track.id === 'spice-connect-placeholder') return;
    setPlaylistPickerSavingId(null);
    setPlaylistPickerTrack(track);
  };

  const savePlaylistPickerSelection = async (playlistId: string) => {
    const track = playlistPickerTrack;
    if (!track || playlistPickerSavingId) return;
    setPlaylistPickerSavingId(playlistId);
    try {
      const added = await addTrackToPlaylist(track, playlistId);
      if (added) {
        showSpiceNotice('Added track to playlist.', 'success');
        setPlaylistPickerTrack(null);
      } else {
        showSpiceNotice('Song already in playlist.', 'info');
      }
    } finally {
      setPlaylistPickerSavingId(null);
    }
  };

  const removeTrackFromPlaylist = async (trackId: string, playlistId: string, position?: number) => {
    const target = customPlaylists.find(pl => pl.id === playlistId);

    // For shared playlists, remove via API
    if (target?.shared && cloudToken && isPlaylistUuid(playlistId) && typeof position === 'number') {
      try {
        const response = await spiceFetch('cloud', `/playlists/shared/${encodeURIComponent(playlistId)}/tracks`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cloudToken}` },
          body: JSON.stringify({ position }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Failed to remove track.');

        const updated = customPlaylists.map(pl => {
          if (pl.id === playlistId) {
            return { ...pl, tracks: pl.tracks.filter(t => t.id !== trackId) };
          }
          return pl;
        });
        persistCustomPlaylists(updated, false);
        if (selectedPlaylist && selectedPlaylist.id === playlistId) {
          setSelectedPlaylist(updated.find(p => p.id === playlistId) || null);
        }
      } catch (error) {
        setShareStatus(error instanceof Error ? error.message : 'Failed to remove track.');
      }
      return;
    }

    if (target?.shared) {
      setShareStatus('Sign in to manage shared playlist tracks.');
      return;
    }

    const updated = customPlaylists.map(pl => {
      if (pl.id === playlistId) {
        return { ...pl, tracks: pl.tracks.filter(t => t.id !== trackId) };
      }
      return pl;
    });
    persistCustomPlaylists(updated);

    if (selectedPlaylist && selectedPlaylist.id === playlistId) {
      setSelectedPlaylist(updated.find(p => p.id === playlistId) || null);
    }
  };

  const sharePlaylist = async (playlist: Playlist) => {
    // Members of a shared playlist they don't own cannot generate invite links
    if (playlist.shared && !isPlaylistOwner) {
      setShareStatus('Only the playlist owner can create invite links.');
      return;
    }

    if (!cloudToken) {
      setShareStatus('Sign in to your SPICE account before creating share links.');
      return;
    }

    setSharingPlaylistId(playlist.id);
    setShareStatus(playlist.shared ? 'Generating a new invite link...' : 'Saving playlist before creating a share link...');

    try {
      let shareablePlaylist = playlist;
      let updatedPlaylists = customPlaylists;

      // For regular (unshared) playlists: ensure a UUID and sync to backend first
      if (!playlist.shared) {
        if (!isPlaylistUuid(playlist.id)) {
          shareablePlaylist = { ...playlist, id: createPlaylistId() };
          updatedPlaylists = customPlaylists.map(pl => pl.id === playlist.id ? shareablePlaylist : pl);
          setSharingPlaylistId(shareablePlaylist.id);
          persistCustomPlaylists(updatedPlaylists);
          if (selectedPlaylist?.id === playlist.id) {
            setSelectedPlaylist(shareablePlaylist);
          }
        }

        const syncResponse = await spiceFetch('cloud', '/sync/playlists', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cloudToken}`,
          },
          body: JSON.stringify({
            playlists: ownedPlaylistsOnly(updatedPlaylists),
            profileId: activeProfileId,
            includeSnapshots: false,
          }),
        });
        const syncData = await syncResponse.json().catch(() => ({}));
        if (!syncResponse.ok) {
          throw new Error(syncData.message || 'Could not save playlist before sharing.');
        }
      }

      const inviteResponse = await spiceFetch('cloud', '/playlists/invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cloudToken}`,
        },
        body: JSON.stringify({ playlistId: shareablePlaylist.id }),
      });
      const inviteData = await inviteResponse.json().catch(() => ({}));
      if (!inviteResponse.ok) {
        throw new Error(inviteData.message || 'Could not create playlist invite.');
      }

      const inviteUrl = inviteData.inviteUrl as string;
      let copied = false;
      if (inviteUrl && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(inviteUrl);
          copied = true;
        } catch { }
      }

      setShareStatus(copied ? 'Invite link copied to clipboard.' : `Invite link ready: ${inviteUrl}`);

      // Mark playlist as shared locally
      const finalPlaylist: Playlist = { ...shareablePlaylist, shared: true, shareRole: 'owner' };
      const finalPlaylists = customPlaylists.map(pl => pl.id === playlist.id ? finalPlaylist : pl);
      persistCustomPlaylists(finalPlaylists, false);
      if (selectedPlaylist?.id === playlist.id) {
        setSelectedPlaylist(finalPlaylist);
      }

      logDebug('database', `Created shared playlist invite for "${shareablePlaylist.title}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to share playlist.';
      setShareStatus(message);
      logDebug('error', `Share playlist failed: ${message}`);
    } finally {
      setSharingPlaylistId(null);
    }
  };

  const acceptSharedPlaylistInvite = async () => {
    if (!invitePreview) return;
    if (!cloudToken) {
      setInviteStatus('Sign in to your SPICE account first, then accept the invite.');
      setSelectedPlaylist(null);
      setSelectedUser(null);
      setCurrentPage('account');
      return;
    }

    setAcceptingInvite(true);
    setInviteStatus('Accepting shared playlist...');
    try {
      const response = await spiceFetch('cloud', `/playlists/invites/${encodeURIComponent(invitePreview.token)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cloudToken}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to accept shared playlist invite.');
      }

      const acceptedPlaylist = normalizePlaylistSnapshot(data.playlist);
      const updated = [
        acceptedPlaylist,
        ...customPlaylists.filter(pl => pl.id !== acceptedPlaylist.id),
      ];
      rememberTrackSnapshots(acceptedPlaylist.tracks);
      persistCustomPlaylists(updated, false);
      setSelectedPlaylist(acceptedPlaylist);
      setSelectedUser(null);
      setCurrentPage('library');
      setInvitePreview(null);
      setInviteStatus(null);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }
      logDebug('database', `Accepted shared playlist "${acceptedPlaylist.title}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept shared playlist.';
      setInviteStatus(message);
      logDebug('error', `Accept shared playlist failed: ${message}`);
    } finally {
      setAcceptingInvite(false);
    }
  };

  const likedTracksList = Object.values(likedTrackDetails);
  const editablePlaylists = customPlaylists.filter((playlist) => !playlist.shared);
  const sharedPlaylists = customPlaylists.filter((playlist) => playlist.shared);
  const allEditablePlaylists = customPlaylists.filter((playlist) => !playlist.shared || playlist.shareRole === 'editor' || playlist.shareRole === 'owner');

  // ── Username Management ──────────────────────────────────────────
  const fetchUsername = useCallback(async (token: string | null = cloudToken, profileId: string = activeProfileId) => {
    if (!token) return;
    try {
      const response = await spiceFetch('cloud', '/account/username', {
        headers: { Authorization: `Bearer ${token}` },
      }, { profileId });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.username) {
        updateProfileData(profileId, { cloudUsername: data.username });
        if (activeProfileIdRef.current === profileId && cloudTokenRef.current === token) {
          setCloudUsername(data.username);
          cloudUsernameRef.current = data.username;
        }
      }
    } catch { /* silent */ }
  }, [cloudToken, activeProfileId]);
  const fetchPendingInvites = useCallback(async () => {
    if (!cloudToken) {
      setPendingInvites([]);
      setPendingInvitesLoading(false);
      return;
    }
    setPendingInvitesLoading(true);
    try {
      const res = await spiceFetch('cloud', '/account/invites', {
        headers: { Authorization: `Bearer ${cloudToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingInvites(data.invites || []);
      }
    } catch (err) {
      logDebug('error', `Failed to fetch pending invites: ${err}`);
    } finally {
      setPendingInvitesLoading(false);
    }
  }, [cloudToken, logDebug]);

  useEffect(() => {
    if (currentPage === 'settings' && cloudToken) {
      void fetchPendingInvites();
    }
  }, [currentPage, cloudToken, fetchPendingInvites]);

  const fetchMyLikesCount = useCallback(async () => {
    if (!cloudToken || !cloudUser?.id) return;
    try {
      const res = await spiceFetch('cloud', '/users/profile', {
        headers: { Authorization: `Bearer ${cloudToken}` },
      }, { userId: cloudUser.id });
      if (res.ok) {
        const data = await res.json();
        setMyLikesCount(data.likesCount || 0);
      }
    } catch { /* silent */ }
  }, [cloudToken, cloudUser]);

  useEffect(() => {
    if (currentPage === 'account' && cloudToken) {
      void fetchMyLikesCount();
    }
  }, [currentPage, cloudToken, activeProfileId, fetchMyLikesCount]);

  useEffect(() => {
    if (!cloudToken) {
      setPendingInvites([]);
      setPendingInvitesLoading(false);
      return;
    }

    void fetchPendingInvites();
    const interval = window.setInterval(() => {
      void fetchPendingInvites();
    }, SHARED_PLAYLIST_INVITE_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [cloudToken, fetchPendingInvites]);

  const openReleaseNotification = useCallback((notification: ReleaseNotification) => {
    setSelectedReleaseNotification(notification);
    setNotificationTrayOpen(false);
    setReadReleaseNotificationIds((prev) => {
      if (prev.includes(notification.id)) return prev;
      const next = [...prev, notification.id];
      if (typeof window !== 'undefined') {
        localStorage.setItem(RELEASE_NOTIFICATION_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, [setNotificationTrayOpen]);

  const markAllReleaseNotificationsAsRead = useCallback(() => {
    const allIds = releaseNotifications.map(n => n.id);
    setReadReleaseNotificationIds(allIds);
    if (typeof window !== 'undefined') {
      localStorage.setItem(RELEASE_NOTIFICATION_STORAGE_KEY, JSON.stringify(allIds));
    }
  }, [releaseNotifications]);

  const handleAcceptInvite = async (playlistId: string) => {
    if (!cloudToken) return;
    setAcceptingInvite(true);
    try {
      const res = await spiceFetch('cloud', `/account/invites/${playlistId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cloudToken}` }
      });
      if (res.ok) {
        setPendingInvites(prev => prev.filter(inv => inv.playlistId !== playlistId));
        showSpiceNotice('Playlist request accepted. The playlist will sync shortly.', 'success');
        // Trigger a sync
        void syncWithCloud();
      } else {
        const err = await res.json();
        showSpiceNotice(err.message || 'Failed to accept invite.', 'danger');
      }
    } catch {
      showSpiceNotice('Failed to accept invite.', 'danger');
    } finally {
      setAcceptingInvite(false);
    }
  };

  const handleRejectInvite = async (playlistId: string) => {
    if (!cloudToken) return;
    setAcceptingInvite(true);
    try {
      const res = await spiceFetch('cloud', `/account/invites/${playlistId}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cloudToken}` }
      });
      if (res.ok) {
        setPendingInvites(prev => prev.filter(inv => inv.playlistId !== playlistId));
        showSpiceNotice('Playlist request rejected.', 'success');
      } else {
        const err = await res.json();
        showSpiceNotice(err.message || 'Failed to reject invite.', 'danger');
      }
    } catch {
      showSpiceNotice('Failed to reject invite.', 'danger');
    } finally {
      setAcceptingInvite(false);
    }
  };

  // ── Listen Together Handlers & Effects ──────────────────────────────
  const fetchPendingListenInvites = useCallback(async () => {
    if (!cloudToken) {
      setPendingListenInvites([]);
      return;
    }
    try {
      const res = await spiceFetch('cloud', '/listen-together/invite', {
        headers: { Authorization: `Bearer ${cloudToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingListenInvites(data.invites || []);
      }
    } catch (err) {
      logDebug('error', `Failed to fetch pending listen invites: ${err}`);
    }
  }, [cloudToken, logDebug]);

  const fetchListenTogetherInvitesList = useCallback(async (sessionId: string) => {
    if (!cloudToken) return;
    try {
      const res = await spiceFetch('cloud', '/listen-together/invite', {
        headers: { Authorization: `Bearer ${cloudToken}` }
      }, { sessionId });
      if (res.ok) {
        const data = await res.json();
        setListenTogetherInvitesList(data.invites || []);
      }
    } catch { /* silent */ }
  }, [cloudToken]);

  const joinListenTogetherSession = (rawSessionId: string) => {
    const sessionId = rawSessionId.trim();
    if (!sessionId) return;
    setListenTogetherSession(null);
    setListenTogetherHostSessionId(sessionId);
    setListenTogetherHostName(null);
    setListenTogetherStatus('Connecting to the host now…');
    setListenTogetherJoinSessionId('');
    localStorage.setItem(LISTEN_TOGETHER_STATE_STORAGE_KEY, JSON.stringify({
      role: 'listener',
      sessionId,
      profileId: activeProfileIdRef.current,
    }));
  };

  const handleStartListenTogetherSession = async () => {
    if (!cloudToken) {
      showSpiceNotice('Please sign in to use Listen Together.', 'warning');
      return;
    }
    setIsCreatingListenTogetherSession(true);
    try {
      const res = await spiceFetch('cloud', '/listen-together/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cloudToken}`
        },
        body: JSON.stringify({ profileId: activeProfileId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.session?.id === 'string') {
        setListenTogetherSession(data.session);
        setListenTogetherHostSessionId(null);
        setListenTogetherHostName(null);
        setListenTogetherStatus('Live — playback and queue are being shared.');
        localStorage.setItem(LISTEN_TOGETHER_STATE_STORAGE_KEY, JSON.stringify({
          role: 'host',
          sessionId: data.session.id,
          profileId: activeProfileIdRef.current,
        }));
        showSpiceNotice('Listen Together session started!', 'success');
        void fetchListenTogetherInvitesList(data.session.id);
      } else {
        const message = listenTogetherApiErrorMessage(data, LISTEN_TOGETHER_START_FAILURE_MESSAGE);
        setListenTogetherStatus(message);
        showSpiceNotice(message, 'danger');
      }
    } catch {
      setListenTogetherStatus(LISTEN_TOGETHER_NETWORK_FAILURE_MESSAGE);
      showSpiceNotice(LISTEN_TOGETHER_NETWORK_FAILURE_MESSAGE, 'danger');
    } finally {
      setIsCreatingListenTogetherSession(false);
    }
  };

  const handleEndListenTogetherSession = async () => {
    if (!cloudToken) return;
    try {
      const res = await spiceFetch('cloud', '/listen-together/session', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${cloudToken}` }
      });
      if (res.ok) {
        setListenTogetherSession(null);
        setListenTogetherInvitesList([]);
        setListenTogetherStatus('Session ended.');
        localStorage.removeItem(LISTEN_TOGETHER_STATE_STORAGE_KEY);
        showSpiceNotice('Listen Together session ended.', 'success');
      }
    } catch {
      showSpiceNotice('Failed to end session.', 'danger');
    }
  };

  const handleSendListenTogetherInvite = async (username = listenTogetherInviteUsername) => {
    if (!cloudToken || !listenTogetherSession || !username) return;
    setIsSendingListenTogetherInvite(true);
    try {
      const res = await spiceFetch('cloud', '/listen-together/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cloudToken}`
        },
        body: JSON.stringify({
          username,
          sessionId: listenTogetherSession.id
        })
      });
      const data = await res.json();
      if (res.ok) {
        showSpiceNotice(`Invite sent to ${username}!`, 'success');
        setListenTogetherInviteUsername('');
        void fetchListenTogetherInvitesList(listenTogetherSession.id);
      } else {
        showSpiceNotice(data.message || 'Failed to send invite.', 'danger');
      }
    } catch {
      showSpiceNotice('Failed to send invite.', 'danger');
    } finally {
      setIsSendingListenTogetherInvite(false);
    }
  };

  const handleRespondToListenTogetherInvite = async (inviteId: string, action: 'accept' | 'reject') => {
    if (!cloudToken) return;
    try {
      const res = await spiceFetch('cloud', '/listen-together/invite', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cloudToken}`
        },
        body: JSON.stringify({ inviteId, action })
      });
      const data = await res.json();
      if (res.ok) {
        setPendingListenInvites(prev => prev.filter(inv => inv.inviteId !== inviteId));
        if (action === 'accept') {
          setListenTogetherHostSessionId(data.sessionId);
          setListenTogetherSession(null);
          setListenTogetherStatus('Connecting to the host now…');
          localStorage.setItem(LISTEN_TOGETHER_STATE_STORAGE_KEY, JSON.stringify({
            role: 'listener',
            sessionId: data.sessionId,
            profileId: activeProfileIdRef.current,
          }));
          showSpiceNotice('Joined Listen Together session!', 'success');
        } else {
          showSpiceNotice('Invitation declined.', 'success');
        }
        void fetchPendingListenInvites();
      } else {
        showSpiceNotice(data.message || 'Failed to respond to invite.', 'danger');
      }
    } catch {
      showSpiceNotice('Failed to respond to invite.', 'danger');
    }
  };

  const handleLeaveListenTogetherSession = async () => {
    if (cloudToken && listenTogetherHostSessionId) {
      try {
        await spiceFetch('cloud', '/listen-together/invite', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${cloudToken}` }
        }, { sessionId: listenTogetherHostSessionId });
      } catch { /* silent */ }
    }
    setListenTogetherHostSessionId(null);
    setListenTogetherHostName(null);
    setListenTogetherStatus('You left the session.');
    localStorage.removeItem(LISTEN_TOGETHER_STATE_STORAGE_KEY);
    showSpiceNotice('Left Listen Together session.', 'success');
  };

  const handleEndOrLeaveListenTogether = () => {
    if (listenTogetherSession) {
      void handleEndListenTogetherSession();
    } else if (listenTogetherHostSessionId) {
      void handleLeaveListenTogetherSession();
    }
  };

  const handleInviteUserProfileToListenTogether = async (username: string) => {
    if (!cloudToken) return;
    if (listenTogetherSession) {
      void handleSendListenTogetherInvite(username);
    } else {
      setIsCreatingListenTogetherSession(true);
      try {
        const res = await spiceFetch('cloud', '/listen-together/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cloudToken}`
          },
          body: JSON.stringify({ profileId: activeProfileId })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && typeof data.session?.id === 'string') {
          setListenTogetherSession(data.session);
          setListenTogetherHostSessionId(null);
          setListenTogetherHostName(null);
          setListenTogetherStatus('Live — playback and queue are being shared.');
          localStorage.setItem(LISTEN_TOGETHER_STATE_STORAGE_KEY, JSON.stringify({
            role: 'host',
            sessionId: data.session.id,
            profileId: activeProfileIdRef.current,
          }));
          showSpiceNotice('Listen Together session started!', 'success');

          const inviteRes = await spiceFetch('cloud', '/listen-together/invite', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${cloudToken}`
            },
            body: JSON.stringify({
              username,
              sessionId: data.session.id
            })
          });
          const inviteData = await inviteRes.json();
          if (inviteRes.ok) {
            showSpiceNotice(`Invite sent to ${username}!`, 'success');
            void fetchListenTogetherInvitesList(data.session.id);
          } else {
            showSpiceNotice(inviteData.message || 'Failed to send invite.', 'danger');
          }
        } else {
          const message = listenTogetherApiErrorMessage(data, LISTEN_TOGETHER_START_FAILURE_MESSAGE);
          setListenTogetherStatus(message);
          showSpiceNotice(message, 'danger');
        }
      } catch {
        setListenTogetherStatus(LISTEN_TOGETHER_NETWORK_FAILURE_MESSAGE);
        showSpiceNotice(LISTEN_TOGETHER_NETWORK_FAILURE_MESSAGE, 'danger');
      } finally {
        setIsCreatingListenTogetherSession(false);
      }
    }
  };

  useEffect(() => {
    if (!isMounted || listenTogetherSession || listenTogetherHostSessionId) return;
    let cancelled = false;
    let storedState: { role?: string; sessionId?: string; profileId?: string } | null = null;
    try {
      storedState = JSON.parse(localStorage.getItem(LISTEN_TOGETHER_STATE_STORAGE_KEY) || 'null');
    } catch {
      localStorage.removeItem(LISTEN_TOGETHER_STATE_STORAGE_KEY);
    }
    if (storedState?.profileId && storedState.profileId !== activeProfileId) return;
    if (storedState?.role === 'listener' && storedState.sessionId) {
      setListenTogetherHostSessionId(storedState.sessionId);
      setListenTogetherStatus('Reconnecting to the host…');
      return;
    }
    if (!cloudToken) return;

    const recoverHostedSession = async () => {
      try {
        const res = await spiceFetch('cloud', '/listen-together/session', {
          headers: { Authorization: `Bearer ${cloudToken}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!data.session?.id || !data.isActive) return;
        setListenTogetherSession(data.session);
        setListenTogetherStatus('Reconnected — playback and queue are being shared.');
        localStorage.setItem(LISTEN_TOGETHER_STATE_STORAGE_KEY, JSON.stringify({
          role: 'host',
          sessionId: data.session.id,
          profileId: activeProfileId,
        }));
      } catch {
        // Recovery is best-effort; the user can still start a new session.
      }
    };
    void recoverHostedSession();
    return () => { cancelled = true; };
  }, [activeProfileId, cloudToken, isMounted, listenTogetherSession, listenTogetherHostSessionId]);

  // Poll for Listen Together Invites
  useEffect(() => {
    if (!cloudToken) {
      setPendingListenInvites([]);
      return;
    }
    void fetchPendingListenInvites();
    const interval = window.setInterval(() => {
      void fetchPendingListenInvites();
    }, LISTEN_TOGETHER_INVITE_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [cloudToken, fetchPendingListenInvites]);

  // Host Sync Loop
  useEffect(() => {
    if (!cloudToken || !listenTogetherSession) return;
    let stopped = false;
    let inviteTimeout: number | null = null;
    let syncTimeout: number | null = null;

    const refreshInvites = async () => {
      await fetchListenTogetherInvitesList(listenTogetherSession.id);
      if (!stopped) {
        inviteTimeout = window.setTimeout(refreshInvites, LISTEN_TOGETHER_HOST_INVITE_POLL_INTERVAL_MS);
      }
    };

    const syncHostPlayback = async () => {
      const targetTrack = currentTrackRef.current;
      const currentQueue = queueRef.current || [];
      try {
        const res = await spiceFetch('cloud', '/listen-together/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cloudToken}`
          },
          body: JSON.stringify({
            sessionId: listenTogetherSession.id,
            currentTrack: targetTrack?.id === 'placeholder' || targetTrack?.id === 'spice-connect-placeholder' ? null : targetTrack,
            queue: currentQueue.slice(0, 80),
            queueIndex: queueIndexRef.current,
            isPlaying: isPlayingRef.current,
            shuffleEnabled: isShuffleRef.current,
            repeatMode: repeatModeRef.current,
            progressMs: progressRef.current * 1000,
            durationMs: durationRef.current * 1000
          })
        });
        if (res.ok) {
          setListenTogetherStatus('Live — playback and queue are being shared.');
        } else if (res.status === 403 || res.status === 404) {
          setListenTogetherSession(null);
          localStorage.removeItem(LISTEN_TOGETHER_STATE_STORAGE_KEY);
          showSpiceNotice('This Listen Together room is no longer available.', 'warning');
          return;
        } else {
          setListenTogetherStatus('Connection interrupted. Retrying automatically…');
        }
      } catch {
        setListenTogetherStatus('Offline. The room will reconnect automatically.');
      } finally {
        if (!stopped) syncTimeout = window.setTimeout(syncHostPlayback, LISTEN_TOGETHER_SYNC_INTERVAL_MS);
      }
    };

    void refreshInvites();
    void syncHostPlayback();

    return () => {
      stopped = true;
      if (inviteTimeout !== null) window.clearTimeout(inviteTimeout);
      if (syncTimeout !== null) window.clearTimeout(syncTimeout);
    };
  }, [cloudToken, listenTogetherSession, fetchListenTogetherInvitesList]);

  const resumeCurrentPlaybackRef = useRef(resumeCurrentPlayback);
  const pauseCurrentPlaybackRef = useRef(pauseCurrentPlayback);
  const seekToPositionRef = useRef(seekToPosition);
  const enrichTrackSnapshotRef = useRef(enrichTrackSnapshot);

  useEffect(() => {
    resumeCurrentPlaybackRef.current = resumeCurrentPlayback;
    pauseCurrentPlaybackRef.current = pauseCurrentPlayback;
    seekToPositionRef.current = seekToPosition;
    enrichTrackSnapshotRef.current = enrichTrackSnapshot;
  });

  useEffect(() => {
    const nativeWindow = window as typeof window & {
      __spiceSeekPlayback?: (seekTime: unknown) => boolean;
    };
    const seekPlayback = (seekTime: unknown) => {
      const target = Number(seekTime);
      if (!Number.isFinite(target) || target < 0) return false;
      seekToPositionRef.current(target);
      return true;
    };

    Object.defineProperty(nativeWindow, '__spiceSeekPlayback', {
      configurable: true,
      value: seekPlayback,
      writable: true,
    });
    return () => {
      if (nativeWindow.__spiceSeekPlayback === seekPlayback) {
        Reflect.deleteProperty(nativeWindow, '__spiceSeekPlayback');
      }
    };
  }, []);

  // Listener Sync Loop
  useEffect(() => {
    if (!listenTogetherHostSessionId) return;
    let stopped = false;
    let syncTimeout: number | null = null;

    const syncWithHost = async () => {
      try {
        const res = await spiceFetch('cloud', '/listen-together/sync', undefined, { sessionId: listenTogetherHostSessionId });
        if (!res.ok) {
          if (res.status === 404) {
            setListenTogetherHostSessionId(null);
            setListenTogetherHostName(null);
            setListenTogetherStatus('The host ended this session.');
            localStorage.removeItem(LISTEN_TOGETHER_STATE_STORAGE_KEY);
            showSpiceNotice('Listen Together session ended by host.', 'info');
            return;
          }
          setListenTogetherStatus('Connection interrupted. Retrying automatically…');
          return;
        }
        const data = await res.json();
        if (!data.isActive) {
          setListenTogetherHostSessionId(null);
          setListenTogetherHostName(null);
          setListenTogetherStatus('The host is no longer active.');
          localStorage.removeItem(LISTEN_TOGETHER_STATE_STORAGE_KEY);
          showSpiceNotice('Listen Together session is inactive.', 'info');
          return;
        }

        setListenTogetherHostName(data.hostName);
        setListenTogetherStatus('In sync with the host.');

        const hostTrack = data.currentTrack;
        const hostIsPlaying = data.isPlaying;
        const hostProgressMs = Number(data.targetProgressMs ?? data.progressMs ?? 0);
        const hostQueue = Array.isArray(data.queue) ? data.queue : [];
        const hydratedQueue = enrichTrackSnapshots(hostQueue.length > 0 ? hostQueue : (hostTrack ? [hostTrack] : []));
        const hostQueueIndex = Math.max(0, Math.min(
          hydratedQueue.length - 1,
          Number.isInteger(data.queueIndex) ? data.queueIndex : 0,
        ));

        const localTrack = currentTrackRef.current;
        const hostTrackChanged = hostTrack && listenTogetherTrackKey(localTrack) !== listenTogetherTrackKey(hostTrack);
        if (hostTrackChanged) {
          await playTrackRef.current(
            enrichTrackSnapshotRef.current(hostTrack),
            hydratedQueue,
            hostQueueIndex,
            true,
          );
          if (stopped) return;
        } else if (hostTrack && trackListFingerprint(queueRef.current) !== trackListFingerprint(hydratedQueue)) {
          queueRef.current = hydratedQueue;
          queueIndexRef.current = hostQueueIndex;
          setQueue(hydratedQueue);
          setQueueIndex(hostQueueIndex);
        }

        if (!hostTrack && localTrack && localTrack.id !== 'placeholder') {
          pauseCurrentPlaybackRef.current();
          return;
        }

        if (!hostTrack) return;

        if (data.shuffleEnabled !== isShuffleRef.current) {
          isShuffleRef.current = Boolean(data.shuffleEnabled);
          setIsShuffle(Boolean(data.shuffleEnabled));
        }
        if (isRepeatMode(data.repeatMode) && data.repeatMode !== repeatModeRef.current) {
          repeatModeRef.current = data.repeatMode;
          setRepeatMode(data.repeatMode);
        }

        if (hostIsPlaying !== isPlayingRef.current) {
          if (hostIsPlaying) {
            resumeCurrentPlaybackRef.current();
          } else {
            pauseCurrentPlaybackRef.current();
          }
        }

        if (hostProgressMs >= 0 && listenTogetherNeedsSeek(progressRef.current, hostProgressMs)) {
          seekToPositionRef.current(hostProgressMs / 1000);
        }
      } catch {
        setListenTogetherStatus('Offline. Reconnecting to the host automatically…');
      } finally {
        if (!stopped) syncTimeout = window.setTimeout(syncWithHost, LISTEN_TOGETHER_SYNC_INTERVAL_MS);
      }
    };

    void syncWithHost();

    return () => {
      stopped = true;
      if (syncTimeout !== null) window.clearTimeout(syncTimeout);
    };
  }, [listenTogetherHostSessionId]);

  useEffect(() => {
    if (cloudToken) {
      void fetchUsername(cloudToken, activeProfileId);
    }
  }, [cloudToken, activeProfileId, fetchUsername]);

  // ── Shared Playlist Member Management ───────────────────────────
  const fetchPlaylistMembers = async (playlistId: string) => {
    if (!cloudToken) {
      if (selectedPlaylist && selectedPlaylist.id === playlistId) {
        setMembersList({
          owner: {
            userId: selectedPlaylist.ownerId || 'unknown',
            username: selectedPlaylist.ownerUsername || null,
            displayName: selectedPlaylist.ownerDisplayName || 'Owner',
            avatarUrl: null,
            role: 'owner',
          },
          members: selectedPlaylist.members || [],
          maxMembers: 4,
        });
      }
      return;
    }
    setMembersLoading(true);
    setMemberActionStatus(null);
    try {
      const response = await spiceFetch('cloud', '/playlists/shared/members', {
        headers: { Authorization: `Bearer ${cloudToken}` },
      }, { playlistId });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Failed to load members.');
      setMembersList({ owner: data.owner, members: data.members || [], maxMembers: data.maxMembers || 4 });
    } catch (error) {
      setMemberActionStatus(error instanceof Error ? error.message : 'Failed to load members.');
    } finally {
      setMembersLoading(false);
    }
  };

  const inviteMember = async (playlistId: string) => {
    if (!cloudToken || !inviteUsername.trim()) return;
    setInvitingMember(true);
    setMemberActionStatus(null);
    try {
      const response = await spiceFetch('cloud', '/playlists/shared/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cloudToken}` },
        body: JSON.stringify({ playlistId, username: inviteUsername.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Failed to invite member.');
      setMemberActionStatus(`Join request sent to ${data.member?.displayName || inviteUsername}.`);
      setInviteUsername('');
      await fetchPlaylistMembers(playlistId);
    } catch (error) {
      setMemberActionStatus(error instanceof Error ? error.message : 'Failed to invite member.');
    } finally {
      setInvitingMember(false);
    }
  };

  const removeMember = async (playlistId: string, userId: string) => {
    if (!cloudToken) return;
    setMemberActionStatus(null);
    try {
      const response = await spiceFetch('cloud', '/playlists/shared/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cloudToken}` },
        body: JSON.stringify({ playlistId, userId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Failed to remove member.');
      setMemberActionStatus('Member removed.');
      await fetchPlaylistMembers(playlistId);
    } catch (error) {
      setMemberActionStatus(error instanceof Error ? error.message : 'Failed to remove member.');
    }
  };

  // ── Shared Playlist Live Refresh ─────────────────────────────────
  // When the user opens a shared UUID-backed playlist, fetch fresh tracks
  // from the backend so collaborator additions appear immediately.
  const refreshSharedPlaylist = useCallback(async (playlist: Playlist) => {
    if (!cloudToken || !isPlaylistUuid(playlist.id)) return;
    try {
      const response = await spiceFetch('cloud', `/playlists/shared/${encodeURIComponent(playlist.id)}/tracks`, {
        headers: { Authorization: `Bearer ${cloudToken}` },
      });
      if (!response.ok) return; // silently ignore — the cached view still works
      const data = await response.json().catch(() => ({}));
      if (!Array.isArray(data.tracks)) return;
      const freshTracks = enrichTrackSnapshots(data.tracks as any[]);
      setCustomPlaylists((prev) => {
        const updated = prev.map((pl) =>
          pl.id === playlist.id ? { ...pl, tracks: freshTracks } : pl,
        );
        setSelectedPlaylist((sel) => (sel?.id === playlist.id ? { ...sel, tracks: freshTracks } : sel));
        return updated;
      });
    } catch {
      // silently fail — cached data is still shown
    }
  }, [cloudToken]);

  useEffect(() => {
    if (!selectedPlaylist?.shared || !isPlaylistUuid(selectedPlaylist.id)) return;
    void refreshSharedPlaylist(selectedPlaylist);
    // Only re-run when we switch to a different shared playlist
  }, [selectedPlaylist?.id]);

  useEffect(() => {
    setShowMembersPanel(false);
  }, [selectedPlaylist?.id]);

  const createSharedPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSharedPlTitle.trim() || !cloudToken) return;

    const localId = createPlaylistId();
    const gradient = PRESET_GRADIENTS[randomIndex(PRESET_GRADIENTS.length)];
    const newPlaylist: Playlist = {
      id: localId,
      title: newSharedPlTitle,
      description: newSharedPlDesc || 'Collaborative Spice playlist.',
      tracks: [],
      gradient,
      createdAt: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
      shared: true,
      shareRole: 'owner',
    };

    setNewSharedPlTitle('');
    setNewSharedPlDesc('');
    setShowCreateSharedDialog(false);

    // Sync to backend first so we have a real UUID, then auto-generate a share link
    try {
      const syncResponse = await spiceFetch('cloud', '/sync/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cloudToken}` },
        body: JSON.stringify({
          playlists: [...ownedPlaylistsOnly(customPlaylists), { ...newPlaylist, shared: false }],
          profileId: activeProfileId,
        }),
      });
      const syncData = await syncResponse.json().catch(() => ({}));
      if (!syncResponse.ok) throw new Error(syncData.message || 'Failed to sync new shared playlist.');

      // Reload playlists from sync to get the server-assigned UUID
      const serverPlaylist = Array.isArray(syncData.playlists)
        ? syncData.playlists.find((p: any) => p.title === newPlaylist.title && p.tracks?.length === 0)
        : null;
      const resolvedId = (serverPlaylist?.id && isPlaylistUuid(serverPlaylist.id)) ? serverPlaylist.id : localId;
      const resolvedPlaylist: Playlist = { ...newPlaylist, id: resolvedId, shared: true, shareRole: 'owner' };

      const updated = [...customPlaylists, resolvedPlaylist];
      persistCustomPlaylists(updated, false);
      setSelectedPlaylist(resolvedPlaylist);
      setSelectedUser(null);
      setCurrentPage('library');

      // Auto-generate invite link
      if (isPlaylistUuid(resolvedId)) {
        const inviteResponse = await spiceFetch('cloud', '/playlists/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cloudToken}` },
          body: JSON.stringify({ playlistId: resolvedId }),
        });
        const inviteData = await inviteResponse.json().catch(() => ({}));
        if (inviteResponse.ok && inviteData.inviteUrl) {
          let copied = false;
          if (navigator.clipboard?.writeText) {
            try { await navigator.clipboard.writeText(inviteData.inviteUrl); copied = true; } catch { }
          }
          setShareStatus(copied
            ? `"${resolvedPlaylist.title}" created! Invite link copied to clipboard.`
            : `"${resolvedPlaylist.title}" created! Invite link: ${inviteData.inviteUrl}`);
        }
      }
    } catch (error) {
      // Fallback: add locally without backend sync
      const updated = [...customPlaylists, newPlaylist];
      persistCustomPlaylists(updated, false);
      setSelectedUser(null);
      setCurrentPage('library');
      setShareStatus(error instanceof Error ? error.message : 'Created locally. Sign in to sync.');
    }
  };

  const remoteTargetDevices = remoteDevices.filter((device) => device.deviceId !== remoteDeviceId);
  const selectedRemoteDevice = remoteTargetDevices.find((device) => device.deviceId === selectedRemoteDeviceId) || null;
  const incomingRemoteController = remoteTargetDevices.find(
    (device) => device.deviceId === incomingRemoteControllerId && device.isOnline !== false,
  ) || null;
  const isControllingRemoteReceiver = Boolean(selectedRemoteDevice);
  useEffect(() => {
    setRemotePlaybackClock(currentTimestampMs());
    if (!selectedRemoteDevice?.isPlaying) return;
    const interval = window.setInterval(() => setRemotePlaybackClock(currentTimestampMs()), 250);
    return () => window.clearInterval(interval);
  }, [selectedRemoteDeviceId, selectedRemoteDevice?.currentTrack?.id, selectedRemoteDevice?.isPlaying]);
  const remoteReceiverPlaceholder: Track = {
    id: 'spice-connect-placeholder',
    title: selectedRemoteDevice ? 'No active track on receiver' : 'Select a track to play',
    artists: [{ id: 'spice-connect', name: selectedRemoteDevice?.displayName || 'Spice Connect' }],
    artworkUrl: '/icon.svg',
  };
  const playerTrack = isControllingRemoteReceiver
    ? (selectedRemoteDevice?.currentTrack || remoteReceiverPlaceholder)
    : currentTrack;
  const playerQueue = isControllingRemoteReceiver
    ? (
      selectedRemoteDevice?.queue && selectedRemoteDevice.queue.length > 0
        ? selectedRemoteDevice.queue
        : (selectedRemoteDevice?.currentTrack ? [selectedRemoteDevice.currentTrack] : [])
    )
    : queue;
  const playerQueueIndex = isControllingRemoteReceiver ? (selectedRemoteDevice?.queueIndex || 0) : queueIndex;
  const playerIsPlaying = isControllingRemoteReceiver ? Boolean(selectedRemoteDevice?.isPlaying) : isPlaying;
  const playerProgress = isControllingRemoteReceiver
    ? projectRemotePlaybackProgress(selectedRemoteDevice, remotePlaybackClock)
    : progress;
  const playerDuration = isControllingRemoteReceiver ? (selectedRemoteDevice?.duration || 0) : duration;
  const playerVolume = isControllingRemoteReceiver ? (selectedRemoteDevice?.volume ?? 70) : volume;
  const playerVolumeMax = isControllingRemoteReceiver ? 100 : (volumeBoosterAccepted ? 1000 : 200);
  const playerShuffleEnabled = isControllingRemoteReceiver ? Boolean(selectedRemoteDevice?.shuffleEnabled) : isShuffle;
  const playerRepeatMode = isControllingRemoteReceiver && isRepeatMode(selectedRemoteDevice?.repeatMode)
    ? selectedRemoteDevice.repeatMode
    : repeatMode;
  const playerIsPlaceholder = playerTrack.id === 'placeholder' || playerTrack.id === 'spice-connect-placeholder';
  const receiverLabel = selectedRemoteDevice?.displayName || 'This device';
  const receiverSelectDisabled = !remoteAuthToken;

  const canControlSelectedRemoteReceiver = (
    command: RemoteCommandType,
    targetDevice: RemoteDevice | null = selectedRemoteDevice,
  ) => {
    if (!targetDevice) return false;
    if (
      targetDevice.isOnline === false
      ||
      targetDevice.lastSeenSeconds !== undefined
      && targetDevice.lastSeenSeconds > SPICE_CONNECT_STALE_DEVICE_SECONDS
    ) {
      setRemoteStatus(`${targetDevice.displayName} has not checked in recently. Refresh Spice Connect before controlling it.`);
      void loadRemoteDevices(true);
      return false;
    }
    if (command === 'play' && !targetDevice.currentTrack) {
      setRemoteStatus(`Choose a track for ${targetDevice.displayName} before pressing play.`);
      return false;
    }

    return true;
  };

  const selectSpiceConnectReceiver = (deviceId: string) => {
    const safeDeviceId = deviceId === remoteDeviceId ? '' : deviceId;
    const receiverChanged = safeDeviceId !== selectedRemoteDeviceId;
    const previousReceiverId = selectedRemoteDeviceId;
    optimisticRemoteDeviceStateRef.current = null;
    setSelectedRemoteDeviceId(safeDeviceId);
    if (receiverChanged && previousReceiverId) {
      void sendRemoteCommand('connect', { connected: false }, previousReceiverId);
    }
    if (safeDeviceId) {
      localStorage.setItem('spice_connect_receiver_id', safeDeviceId);
      const device = remoteTargetDevices.find((entry) => entry.deviceId === safeDeviceId);
      if (receiverChanged) {
        void sendRemoteCommand('connect', { connected: true }, safeDeviceId);
      }
      if (device && receiverChanged && currentTrackRef.current.id !== 'placeholder') {
        if (isOfflineTrack(currentTrackRef.current)) {
          pauseCurrentPlayback();
          setRemoteStatus('Offline downloads stay on the device that stores them. Choose an online track for this receiver.');
        } else {
          void handoffPlaybackToDevice(device);
        }
      } else {
        setRemoteStatus(`Player controls now target ${device?.displayName || 'selected Spice Connect device'}.`);
      }
    } else {
      localStorage.removeItem('spice_connect_receiver_id');
      setRemoteStatus('Player controls now target this device.');
    }
  };

  const patchSelectedRemoteDevice = (updates: Partial<RemoteDevice>) => {
    patchRemoteDevice(selectedRemoteDeviceId, updates);
  };

  const handoffPlaybackToDevice = async (targetDevice: RemoteDevice | null) => {
    if (!targetDevice || currentTrackRef.current.id === 'placeholder') {
      setRemoteStatus('Start a track here, then choose an online device to move playback.');
      return false;
    }
    const sourceTrack = currentTrackRef.current;
    if (isOfflineTrack(sourceTrack)) {
      setRemoteStatus('Offline downloads cannot be handed off because their audio file exists only on this device.');
      return false;
    }
    if (!canControlSelectedRemoteReceiver('handoff', targetDevice)) return false;

    const existingHandoff = pendingSpiceConnectHandoffRef.current;
    if (existingHandoff?.state.phase === 'waiting_for_complete') {
      setRemoteStatus(
        `${existingHandoff.targetName} already accepted a transfer. Wait for its playback confirmation before moving again.`,
      );
      return false;
    }
    if (existingHandoff) {
      clearPendingSpiceConnectHandoff();
      void sendRemoteCommand(
        'handoff_cancel',
        { transferId: existingHandoff.state.transferId, reason: 'superseded' },
        existingHandoff.state.targetDeviceId,
        true,
      );
    }

    const transferId = createSpiceConnectTransferId(
      remoteDeviceId,
      targetDevice.deviceId,
      currentTimestampMs(),
      createRemoteDeviceId(),
    );
    const started = startSpiceConnectHandoffSource(
      transferId,
      targetDevice.deviceId,
      isPlayingRef.current || isLoadingStreamRef.current,
    );
    const pending: PendingSpiceConnectHandoff = {
      state: started.state,
      targetName: targetDevice.displayName,
      acceptTimeoutId: null,
      completeTimeoutId: null,
    };
    pendingSpiceConnectHandoffRef.current = pending;
    pending.acceptTimeoutId = window.setTimeout(() => {
      if (pendingSpiceConnectHandoffRef.current !== pending) return;
      const timedOut = transitionSpiceConnectHandoffSource(pending.state, { type: 'ready_timeout' });
      clearPendingSpiceConnectHandoff();
      if (timedOut.sourcePlayback === 'resume' && !isPlayingRef.current) resumeCurrentPlayback();
      void sendRemoteCommand(
        'handoff_cancel',
        { transferId, reason: 'ready_timeout' },
        targetDevice.deviceId,
        true,
      );
      setRemoteStatus(
        `${targetDevice.displayName} did not accept the transfer in time. Playback stayed on this device.`,
      );
    }, SPICE_CONNECT_HANDOFF_ACCEPT_TIMEOUT_MS);

    setRemoteStatus(`Waiting for ${targetDevice.displayName} to accept the playback transfer...`);
    const prepared = await sendRemoteCommand(
      'handoff_prepare',
      { transferId },
      targetDevice.deviceId,
      true,
    );
    if (pendingSpiceConnectHandoffRef.current !== pending) {
      return pending.state.phase === 'completed' || pending.state.phase === 'waiting_for_complete';
    }
    if (!prepared) {
      const failed = transitionSpiceConnectHandoffSource(pending.state, { type: 'prepare_failed' });
      clearPendingSpiceConnectHandoff();
      if (failed.sourcePlayback === 'resume' && !isPlayingRef.current) resumeCurrentPlayback();
      setRemoteStatus(`Could not ask ${targetDevice.displayName} to accept playback. Playback stayed here.`);
      return false;
    }
    return true;
  };

  const handoffPlaybackToSelectedDevice = async () => {
    await handoffPlaybackToDevice(selectedRemoteDevice);
  };

  const startTrackOnActiveReceiver = (
    track: Track,
    newQueue?: Track[],
    playlistQueueOriginId?: string,
  ) => {
    if (isOfflineTrack(track) && isControllingRemoteReceiver) {
      selectSpiceConnectReceiver('');
      playTrack(
        track,
        newQueue,
        undefined,
        false,
        false,
        false,
        playlistQueueOriginId || 'offline-library',
      );
      setRemoteStatus('Offline downloads play on the desktop that stores them.');
      return;
    }
    if (isControllingRemoteReceiver) {
      if (!canControlSelectedRemoteReceiver('play_track')) return;
      const queuePayload = newQueue && newQueue.length > 0 ? newQueue : [track];
      const queueIndexPayload = Math.max(0, queuePayload.findIndex((entry) => entry.id === track.id));
      rememberTrackSnapshots([track, ...queuePayload]);
      patchSelectedRemoteDevice({
        currentTrack: track,
        queue: queuePayload,
        queueIndex: queueIndexPayload,
        isPlaying: true,
        progress: 0,
        ...(track.durationMs ? { duration: track.durationMs / 1000 } : {}),
      });
      void sendRemoteCommand('play_track', {
        track,
        queue: queuePayload,
        queueIndex: queueIndexPayload,
      });
      setRemoteStatus(`Sent "${track.title}" to ${receiverLabel}.`);
      return;
    }

    playTrack(track, newQueue, undefined, false, false, false, playlistQueueOriginId);
  };

  const playOfflineLibraryEntry = async (entry: DesktopOfflineLibraryEntry) => {
    const bridge = getSpiceDesktopOfflineLibraryBridge();
    if (bridge) {
      try {
        const availability = await bridge.exists(entry.fileName);
        if (!availability.exists) {
          setOfflineLibraryEntries((entries) => entries.filter(
            (candidate) => candidate.fileName !== entry.fileName,
          ));
          await refreshOfflineLibrary();
          showSpiceNotice(
            `"${entry.track.title}" was moved or deleted outside SPICE, so it was removed from Downloads.`,
            'warning',
          );
          return;
        }
      } catch (availabilityError) {
        showSpiceNotice(
          availabilityError instanceof Error
            ? availabilityError.message
            : 'SPICE could not verify that downloaded file.',
          'warning',
        );
        return;
      }
    }

    startTrackOnActiveReceiver(
      entry.track,
      offlineLibraryEntries.map((item) => item.track),
      'offline-library',
    );
  };

  const showOfflineLibraryEntry = async (entry: DesktopOfflineLibraryEntry) => {
    const result = await getSpiceDesktopOfflineLibraryBridge()?.show(entry.fileName);
    if (result?.missing) {
      setOfflineLibraryEntries((entries) => entries.filter(
        (candidate) => candidate.fileName !== entry.fileName,
      ));
      await refreshOfflineLibrary();
      showSpiceNotice(
        `"${entry.track.title}" is no longer in the selected offline folder.`,
        'warning',
      );
    }
  };

  const handleReceiverPrev = () => {
    if (listenTogetherHostSessionId) return;
    if (isControllingRemoteReceiver) {
      if (!canControlSelectedRemoteReceiver('previous')) return;
      // The receiver may restart the current track, traverse shuffle history,
      // or wrap. Wait for its authoritative state instead of guessing here.
      void sendRemoteCommand('previous');
      return;
    }
    handlePrev();
  };

  const handleReceiverNext = () => {
    if (listenTogetherHostSessionId) return;
    if (isControllingRemoteReceiver) {
      if (!canControlSelectedRemoteReceiver('next')) return;
      // Repeat mode, shuffle, and personalized continuation are receiver-owned.
      void sendRemoteCommand('next');
      return;
    }
    handleNext();
  };

  const toggleReceiverPlayPause = () => {
    if (listenTogetherHostSessionId) return;
    if (isControllingRemoteReceiver) {
      const nextCommand: RemoteCommandType = playerIsPlaying ? 'pause' : 'play';
      if (!canControlSelectedRemoteReceiver(nextCommand)) return;
      patchSelectedRemoteDevice({ isPlaying: !playerIsPlaying, progress: playerProgress });
      void sendRemoteCommand(nextCommand);
      return;
    }
    togglePlayPause();
  };

  const toggleReceiverShuffle = () => {
    if (listenTogetherHostSessionId) return;
    const enabled = !playerShuffleEnabled;
    if (isControllingRemoteReceiver) {
      if (!canControlSelectedRemoteReceiver('shuffle')) return;
      patchSelectedRemoteDevice({ shuffleEnabled: enabled });
      void sendRemoteCommand('shuffle', { enabled });
      return;
    }
    applyLocalShuffleMode(enabled);
  };

  const cycleReceiverRepeat = () => {
    if (listenTogetherHostSessionId) return;
    const mode = playerRepeatMode === 'none' ? 'all' : playerRepeatMode === 'all' ? 'one' : 'none';
    if (isControllingRemoteReceiver) {
      if (!canControlSelectedRemoteReceiver('repeat')) return;
      patchSelectedRemoteDevice({ repeatMode: mode });
      void sendRemoteCommand('repeat', { mode });
      return;
    }
    applyLocalRepeatMode(mode);
  };

  const seekActiveReceiverTo = (seekTime: number) => {
    if (listenTogetherHostSessionId) return;
    if (isControllingRemoteReceiver) {
      if (!canControlSelectedRemoteReceiver('seek')) return;
      const safeSeek = Math.max(0, Math.min(seekTime, playerDuration || seekTime));
      patchSelectedRemoteDevice({ progress: safeSeek });
      void sendRemoteCommand('seek', { progress: safeSeek });
      return;
    }
    seekToPosition(seekTime);
  };

  const handleReceiverSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (listenTogetherHostSessionId) return;
    if (playerDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    seekActiveReceiverTo(pct * playerDuration);
  };

  const setReceiverVolume = (nextVolume: number) => {
    const safeVolume = Math.max(0, Math.min(playerVolumeMax, Math.round(nextVolume)));
    if (isControllingRemoteReceiver) {
      if (!canControlSelectedRemoteReceiver('volume')) return;
      patchSelectedRemoteDevice({ volume: safeVolume });
      void sendRemoteCommand('volume', { volume: safeVolume });
      return;
    }

    volumeRef.current = safeVolume;
    setVolume(safeVolume);

    if (safeVolume <= 100) {
      boostProtocolHandoffRef.current = false;
    }

    if (shouldUseProxyForBoost(safeVolume, streamProtocolRef.current)) {
      const activeTrack = currentTrackRef.current;
      const embedIsActive = streamUrlRef.current === 'youtube-embed-active';
      if (isPlayingRef.current && embedIsActive && activeTrack && activeTrack.id !== 'placeholder') {
        // Keep the current embed playing (iframe audio caps at 100%) instead of
        // restarting the track mid-song. The gain-capable proxy path takes over
        // at the next track boundary.
        boostProtocolHandoffRef.current = true;
        logDebug('player', 'Volume Boost requested while the YouTube embed is playing. Deferring the proxy switch to the next track.');
        showSpiceNotice('Volume boost applies from the next track.', 'info');
      } else {
        boostProtocolHandoffRef.current = false;
        streamProtocolRef.current = 'proxy';
        setStreamProtocol('proxy');
        setShowVideoPlayer(false);
        localStorage.setItem('spice_stream_protocol', 'proxy');
        logDebug('player', 'Volume Boost switched playback from YouTube embed to the gain-capable proxy path.');

        if (activeTrack && activeTrack.id !== 'placeholder') {
          if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
            ytPlayerRef.current.pauseVideo();
          }
          setStreamUrl(null);
          streamUrlRef.current = null;
        }
      }
    }
  };

  const adjustReceiverVolumeByWheel = (event: any) => {
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!delta) return;

    event.preventDefault();
    const step = event.shiftKey ? 25 : 5;
    setReceiverVolume(playerVolume + (delta < 0 ? step : -step));
  };

  const refreshSpiceConnectReceiverList = () => {
    if (!remoteAuthToken) return;
    if (remoteControlEnabled) {
      void reportRemoteDeviceState();
    }
    void loadRemoteDevices();
  };

  const receiverStatusLabel = (device: RemoteDevice | null) => {
    if (!device) return 'Local playback';
    if (remoteLanPeerDeviceIds.includes(device.deviceId)) {
      return device.isPlaying ? 'LAN direct · playing now' : 'LAN direct · online';
    }
    const seconds = Math.max(0, device.lastSeenSeconds ?? 0);
    if (device.isOnline === false) {
      if (seconds < 60) return 'Offline · last seen just now';
      if (seconds < 3600) return `Offline · last seen ${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86_400) return `Offline · last seen ${Math.floor(seconds / 3600)}h ago`;
      return `Offline · last seen ${Math.floor(seconds / 86_400)}d ago`;
    }
    if (device.lastSeenSeconds === undefined || seconds <= 5) {
      return device.isPlaying ? 'Playing now' : 'Online now';
    }
    const minutes = Math.floor(seconds / 60);
    return `Last seen ${minutes === 0 ? '<1' : minutes}m ago`;
  };

  const forgetSpiceConnectDevice = async (deviceId: string) => {
    if (
      !remoteAuthToken
      || !deviceId
      || deviceId === remoteDeviceId
      || forgettingRemoteDeviceIdsRef.current.has(deviceId)
    ) return;

    const requestGeneration = remoteRequestGenerationRef.current;
    const requestToken = remoteAuthToken;
    const forgottenDevice = remoteDevices.find((device) => device.deviceId === deviceId) || null;
    forgettingRemoteDeviceIdsRef.current.add(deviceId);
    remoteLanTransportRef.current?.disconnect(deviceId);
    remoteDeviceListRevisionRef.current += 1;
    setForgettingRemoteDeviceIds(new Set(forgettingRemoteDeviceIdsRef.current));
    setRemoteDevices((devices) => devices.filter((device) => device.deviceId !== deviceId));

    try {
      const response = await spiceFetch(
        'cloud',
        `/remote/devices?sourceDeviceId=${encodeURIComponent(remoteDeviceId)}&deviceId=${encodeURIComponent(deviceId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${requestToken}` },
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (requestGeneration !== remoteRequestGenerationRef.current) return;
      if (!response.ok) throw new Error(payload.message || 'The remembered device could not be forgotten.');
      if (selectedRemoteDeviceId === deviceId) selectSpiceConnectReceiver('');
      setRemoteStatus(
        payload.revokedAuthorizations > 0
          ? 'Removed the device everywhere and revoked its Spice Connect authorization.'
          : 'Removed the device from Spice Connect.',
      );
    } catch (error) {
      if (requestGeneration !== remoteRequestGenerationRef.current) return;
      if (forgottenDevice) {
        setRemoteDevices((devices) => (
          devices.some((device) => device.deviceId === deviceId)
            ? devices
            : [...devices, forgottenDevice]
        ));
      }
      setRemoteStatus(error instanceof Error ? error.message : 'The remembered device could not be forgotten.');
    } finally {
      forgettingRemoteDeviceIdsRef.current.delete(deviceId);
      remoteDeviceListRevisionRef.current += 1;
      setForgettingRemoteDeviceIds(new Set(forgettingRemoteDeviceIdsRef.current));
    }
  };

  const renderSpiceConnectReceiverOption = (
    value: string,
    label: string,
    detail: string,
    selected: boolean,
  ) => (
    <div key={value || 'local-device'} className="spice-connect-receiver__option-row">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        className={`spice-connect-receiver__option ${selected ? 'is-selected' : ''}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          selectSpiceConnectReceiver(value);
          setReceiverMenuOpen(null);
        }}
      >
        <span className="spice-connect-receiver__option-icon">{Icons.monitor}</span>
        <span className="spice-connect-receiver__option-copy">
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
        <span className="spice-connect-receiver__option-marker" aria-hidden="true" />
      </button>
      {value && (
        <button
          type="button"
          className="spice-connect-receiver__forget"
          title={`Forget ${label}`}
          aria-label={`Forget ${label}`}
          aria-busy={forgettingRemoteDeviceIds.has(value)}
          disabled={forgettingRemoteDeviceIds.has(value)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            void forgetSpiceConnectDevice(value);
          }}
        >
          {Icons.close}
        </button>
      )}
    </div>
  );

  const renderSpiceConnectReceiverSelect = (variant: ReceiverSelectVariant) => {
    const menuId = `spice-connect-receiver-menu-${variant}`;
    const isMenuOpen = receiverMenuOpen === variant;
    const receiverDetail = receiverSelectDisabled
      ? 'Sign in or pair to choose devices'
      : selectedRemoteDevice
        ? receiverStatusLabel(selectedRemoteDevice)
        : incomingRemoteController
          ? `Controlled by ${incomingRemoteController.displayName}`
          : receiverStatusLabel(null);

    return (
      <div
        className={`spice-connect-receiver spice-connect-receiver--${variant} ${isControllingRemoteReceiver ? 'is-remote' : ''} ${isMenuOpen ? 'is-open' : ''} ${receiverSelectDisabled ? 'is-disabled' : ''}`}
        onBlur={(event) => {
          const nextTarget = event.relatedTarget as Node | null;
          if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
            setReceiverMenuOpen(null);
          }
        }}
      >
        <button
          type="button"
          className="spice-connect-receiver__button"
          onClick={() => {
            if (receiverSelectDisabled) {
              showSpiceNotice('Sign in or pair this device to choose another playback device.', 'warning');
              return;
            }
            refreshSpiceConnectReceiverList();
            setReceiverMenuOpen((openVariant) => (openVariant === variant ? null : variant));
          }}
          onFocus={receiverSelectDisabled ? undefined : refreshSpiceConnectReceiverList}
          aria-haspopup="listbox"
          aria-expanded={isMenuOpen}
          aria-controls={menuId}
          title={receiverSelectDisabled ? 'Sign in or pair to choose another receiver' : `Receiver: ${receiverLabel}`}
        >
          <span className="spice-connect-receiver__icon">{Icons.monitor}</span>
          {variant !== 'bar' && (
            <>
              <span className="spice-connect-receiver__copy">
                <strong>{receiverLabel}</strong>
                <small>{receiverDetail}</small>
              </span>
              <span className="spice-connect-receiver__chevron" aria-hidden="true">{Icons.chevronRight}</span>
            </>
          )}
        </button>

        {isMenuOpen && (
          <div
            id={menuId}
            className="spice-connect-receiver__menu"
            role="listbox"
            aria-label="Choose Spice Connect receiver"
          >
            {renderSpiceConnectReceiverOption('', 'This device', 'Play and control locally', !selectedRemoteDeviceId)}
            {remoteTargetDevices.length > 0 ? (
              remoteTargetDevices.map((device) => renderSpiceConnectReceiverOption(
                device.deviceId,
                device.displayName,
                receiverStatusLabel(device),
                selectedRemoteDeviceId === device.deviceId,
              ))
            ) : (
              <p className="spice-connect-receiver__empty">No other remembered devices.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const getLikedTrackClickHandler = (track: Track) => () => {
    startTrackOnActiveReceiver(track);
  };

  const getLikedTrackToggleHandler = (track: Track) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    toggleLike(track);
  };

  const clearHistory = () => {
    requestSpiceConfirm({
      title: 'Clear Recently Played?',
      message: 'This removes the recent track list for the active profile.',
      confirmLabel: 'Clear History',
      kind: 'warning',
      onConfirm: () => {
        setHistory([]);
        updateActiveProfileData({ history: [] });
        autoSyncHistory([]);
        showSpiceNotice('Recently played tracks cleared.', 'success');
      },
    });
  };

  const shufflePlaylistPlay = (playlist: Playlist) => {
    const tracks = playlist.tracks;
    if (!tracks || tracks.length === 0) return;
    applyLocalShuffleMode(true);
    const shuffled = [...tracks].sort(() => getSecureRandom() - 0.5);
    startTrackOnActiveReceiver(shuffled[0], shuffled, playlist.id);
  };

  const downloadPlaylistToOfflineLibrary = async (playlist: Playlist) => {
    if (playlistDownloadProgress || offlineDownloadTrackId) {
      showSpiceNotice('A download is already in progress.', 'info');
      return;
    }
    if (playlist.tracks.length === 0) return;

    playlistDownloadCancelledRef.current = false;
    setPlaylistDownloadProgress({ playlistId: playlist.id, completed: 0, total: playlist.tracks.length });
    let completed = 0;
    let failed = 0;
    for (const track of playlist.tracks) {
      if (playlistDownloadCancelledRef.current) break;
      setOfflineDownloadTrackId(track.id);
      try {
        await saveTrackDownload(track);
      } catch (error) {
        failed += 1;
        logDebug('error', `Playlist download failed for ${track.title}: ${error instanceof Error ? error.message : error}`);
      } finally {
        completed += 1;
        setPlaylistDownloadProgress({ playlistId: playlist.id, completed, total: playlist.tracks.length });
      }
    }
    setOfflineDownloadTrackId(null);
    setPlaylistDownloadProgress(null);
    const saved = completed - failed;
    if (playlistDownloadCancelledRef.current) {
      showSpiceNotice(`Playlist download stopped after ${saved} saved track${saved === 1 ? '' : 's'}.`, 'info');
    } else if (failed > 0) {
      showSpiceNotice(`Saved ${saved} of ${playlist.tracks.length} playlist tracks; ${failed} could not be downloaded.`, 'warning');
    } else {
      showSpiceNotice(`Saved all ${saved} playlist tracks for offline listening, including duplicates.`, 'success');
    }
  };

  const cancelPlaylistDownload = () => {
    playlistDownloadCancelledRef.current = true;
  };

  // Profile switching, locking and passcode validations
const getMaskedEmail = (email: string) => {
  const parts = email.split('@');
  if (parts.length !== 2) return '••••••••';
  const [username, domain] = parts;
  if (username.length <= 2) {
    return '•'.repeat(username.length) + '@' + domain;
  }
  return username.charAt(0) + '•'.repeat(username.length - 2) + username.charAt(username.length - 1) + '@' + domain;
};

  const switchProfile = (profileId: string, profileOverride?: UserProfile) => {
    if (profileId !== activeProfileIdRef.current) {
      disconnectListenTogetherForIdentityChange();
    }
    remoteRequestGenerationRef.current += 1;
    playbackRequestRef.current += 1;
    setEmailVerification(null);
    setEmailVerificationCode('');
    setLastFmAccountLinked(false);
    setLastFmSessionKey('');
    setListenBrainzAccountLinked(false);
    setListenBrainzToken('');
    localStorage.removeItem('spice_lastfm_session_key');
    pauseCurrentPlayback();
    let latestProfiles = profiles;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('spice_profiles_list');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.length > 0) {
            latestProfiles = parsed;
            setProfiles(parsed);
          }
        } catch { }
      }
    }

    const currentProfileId = activeProfileIdRef.current;
    let capturedCurrentSession = false;
    latestProfiles = latestProfiles.map((profile) => {
      if (profile.id !== currentProfileId) return profile;
      capturedCurrentSession = true;
      return {
        ...profile,
        cloudToken: cloudTokenRef.current,
        cloudUser: cloudUserRef.current,
        cloudUsername: cloudUsernameRef.current,
      };
    });
    if (capturedCurrentSession) {
      setProfiles(latestProfiles);
      saveProfilesToStorage(latestProfiles);
    }

    const target = profileOverride || latestProfiles.find(p => p.id === profileId);
    if (!target) return;

    setActiveProfileId(profileId);
    localStorage.setItem('spice_active_profile_id', profileId);
    const nextPairingCredential = loadRemotePairingCredential(profileId);
    setPairedRemoteCredential(nextPairingCredential);
    if (nextPairingCredential) {
      setRemoteControlEnabled(true);
      localStorage.setItem('spice_remote_control_enabled', 'true');
    }
    setRemoteDevices([]);
    setSelectedRemoteDeviceId('');
    setRemoteTransport('unknown');
    setRemoteRedisConfigured(null);
    optimisticRemoteDeviceStateRef.current = null;

    const nextToken = target.cloudToken || null;
    const nextUser = target.cloudUser || null;
    const nextUsername = target.cloudUsername || null;
    setCloudToken(nextToken);
    setCloudUser(nextUser);
    setCloudUsername(nextUsername);
    activeProfileIdRef.current = profileId;
    cloudTokenRef.current = nextToken;
    cloudUserRef.current = nextUser;
    cloudUsernameRef.current = nextUsername;

    if (nextToken) {
      localStorage.setItem('spice_cloud_token', nextToken);
      localStorage.setItem('spice_cloud_profile_id', profileId);
    } else {
      localStorage.removeItem('spice_cloud_token');
      localStorage.removeItem('spice_cloud_profile_id');
    }
    if (nextUser) {
      localStorage.setItem('spice_cloud_user', JSON.stringify(nextUser));
    } else {
      localStorage.removeItem('spice_cloud_user');
    }
    logDebug('profile', `Switched active profile to "${target.displayName}" (Playlists: ${target.customPlaylists?.length || 0}, Likes: ${target.likedTracks?.length || 0})`);

    // Synchronize states immediately to prevent cascading renders
    const targetHistory = enrichTrackSnapshots(target.history || []);
    const targetLikedEntries = Object.entries(target.likedTrackDetails || {});
    const targetLikedTracks = enrichTrackSnapshots(targetLikedEntries.map(([, track]) => track));
    const targetLikedDetails = Object.fromEntries(
      targetLikedEntries.map(([id], index) => [id, targetLikedTracks[index]]),
    );
    const targetPlaylists = (target.customPlaylists || []).map((playlist) => ({
      ...playlist,
      tracks: enrichTrackSnapshots(playlist.tracks || []),
    }));
    activeProfileRef.current = {
      ...target,
      history: targetHistory,
      likedTrackDetails: targetLikedDetails,
      customPlaylists: targetPlaylists,
    };
    setLikedTracks(new Set(target.likedTracks));
    setLikedTrackDetails(targetLikedDetails);
    setCustomPlaylists(targetPlaylists);
    setHistory(targetHistory);
    setHomeRecommended([]);
    setHomeRecommendationShelves([]);
    setHomeRecommendationSeed(null);
    setEditName(target.displayName);
    setEditBio(target.bio);
    setEditGradient(target.gradient);
    setEditPasscode(target.passcode || '');
    setEditAvatarUrl(target.avatarUrl || '');

    const savedPlayback = getPlaybackState(target.id);
    if (savedPlayback) {
      if (isRepeatMode(savedPlayback.repeatMode)) setRepeatMode(savedPlayback.repeatMode);
      if (typeof savedPlayback.isShuffle === 'boolean') setIsShuffle(savedPlayback.isShuffle);
      const savedPlaybackVolume = normalizePlayerVolume(savedPlayback.volume, volumeBoosterAccepted);
      if (savedPlaybackVolume !== null) {
        volumeRef.current = savedPlaybackVolume;
        setVolume(savedPlaybackVolume);
      }
    }
    // A profile change is also a fresh playback session. Keep preferences and
    // history, but never make a saved track look loaded or currently playing.
    currentTrackRef.current = IDLE_PLAYER_TRACK;
    queueRef.current = [IDLE_PLAYER_TRACK];
    playlistQueueOriginRef.current = null;
    shuffleHistoryRef.current = null;
    queueIndexRef.current = 0;
    progressRef.current = 0;
    durationRef.current = 0;
    scrobbleStateRef.current = null;
    recommendationListenCreditedRef.current = false;
    setCurrentTrack(IDLE_PLAYER_TRACK);
    setQueue([IDLE_PLAYER_TRACK]);
    setQueueIndex(0);
    setProgress(0);
    setDuration(0);
    setStreamUrl(null);
    streamUrlRef.current = null;
    shouldAutoPlayRef.current = false;
    isPlayingRef.current = false;
    setIsPlaying(false);

    // Lock screen trigger if passcode exists
    if (target.passcode) {
      setIsLocked(true);
      setPasscodeInput('');
      setPasscodeError(null);
    } else {
      setIsLocked(false);
      lastUnlockedProfileIdRef.current = target.id;
    }
  };

  const createProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;
    if (profiles.length >= MAX_LOCAL_PROFILES) {
      showSpiceNotice(`You can keep up to ${MAX_LOCAL_PROFILES} local profiles in SPICE Music.`, 'warning');
      setShowCreateProfileDialog(false);
      return;
    }

    const newId = createUserProfileId();
    const sanitizedUrl = sanitizePfpUrl(newProfileAvatarUrl);
    const newProf: UserProfile = {
      id: newId,
      displayName: newProfileName.trim(),
      bio: newProfileBio.trim() || 'A fresh Spice listener.',
      gradient: newProfileGradient,
      songsPlayed: 0,
      joinedAt: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long' }),
      passcode: newProfilePasscode.length === 4 ? newProfilePasscode : undefined,
      likedTracks: [],
      likedTrackDetails: {},
      customPlaylists: [],
      history: [],
      avatarUrl: sanitizedUrl || undefined
    };

    const updatedList = [...profiles, newProf];
    setProfiles(updatedList);
    saveProfilesToStorage(updatedList);
    autoSyncProfiles(updatedList);

    // Reset forms and dialogs
    setNewProfileName('');
    setNewProfileBio('');
    setNewProfilePasscode('');
    setNewProfileAvatarUrl('');
    setShowCreateProfileDialog(false);

    // Switch instantly
    switchProfile(newId, newProf);
  };

  const deleteProfile = (profileId: string) => {
    if (profiles.length <= 1) {
      showSpiceNotice('You must have at least one active profile.', 'warning');
      return;
    }
    requestSpiceConfirm({
      title: 'Delete Profile?',
      message: 'This deletes the profile and all of its playlists and likes. This cannot be undone.',
      confirmLabel: 'Delete Profile',
      kind: 'danger',
      onConfirm: () => {
        syncOutboxRef.current?.cancelProfile(profileId);
        localStorage.removeItem(remotePairingCredentialStorageKey(profileId));
        const updated = profiles.filter(p => p.id !== profileId);
        setProfiles(updated);
        saveProfilesToStorage(updated);
        autoSyncProfiles(updated);

        if (profileId === activeProfileIdRef.current) {
          switchProfile(updated[0].id);
        }
        showSpiceNotice('Profile deleted.', 'success');
      },
    });
  };

  const handlePasscodeKey = (num: string) => {
    setPasscodeError(null);
    if (passcodeInput.length >= 4) return;
    const nextVal = passcodeInput + num;
    setPasscodeInput(nextVal);

    if (nextVal.length === 4) {
      // Validate
      if (nextVal === activeProfile.passcode) {
        setIsLocked(false);
        lastUnlockedProfileIdRef.current = activeProfile.id;
        setPasscodeInput('');
      } else {
        setPasscodeError('Incorrect Passcode. Access Denied.');
        // Vibrate clear trigger after delay
        setTimeout(() => {
          setPasscodeInput('');
        }, 600);
      }
    }
  };

  const clearPasscode = () => {
    setPasscodeInput('');
    setPasscodeError(null);
  };

  const handleCancelPasscode = () => {
    const lastId = lastUnlockedProfileIdRef.current;
    const lastProfile = profiles.find(p => p.id === lastId);
    if (lastProfile && lastId !== activeProfileId) {
      switchProfile(lastId);
    } else {
      const unlocked = profiles.find(p => !p.passcode);
      if (unlocked && unlocked.id !== activeProfileId) {
        switchProfile(unlocked.id);
      } else {
        showSpiceNotice('No other unlocked profiles to revert to.', 'warning');
      }
    }
  };

  const removePasscodeFromActive = () => {
    setEditPasscode('');
    updateActiveProfileData({ passcode: undefined });
    showSpiceNotice('Passcode protection removed successfully.', 'success');
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    // Passcode validation
    const passcodeVal = editPasscode.trim();
    if (passcodeVal && passcodeVal.length !== 4) {
      showSpiceNotice('Passcode must be exactly 4 digits.', 'warning');
      return;
    }

    // Spicer Username validation (if changed and logged in)
    if (cloudToken) {
      const cleanUsername = editUsername.trim().toLowerCase();
      if (!cleanUsername) {
        setUsernameError('Username cannot be empty.');
        return;
      }
      if (cleanUsername !== (cloudUsername || '')) {
        try {
          const res = await spiceFetch('cloud', '/account/username', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${cloudToken}`,
            },
            body: JSON.stringify({ username: cleanUsername, profileId: activeProfileId }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setUsernameError(data.message || 'Failed to update username.');
            return;
          }
          setCloudUsername(cleanUsername);
          cloudUsernameRef.current = cleanUsername;
          updateProfileData(activeProfileId, { cloudUsername: cleanUsername });
          showSpiceNotice('Spicer Username updated successfully!', 'success');
        } catch (err: any) {
          setUsernameError(err.message || 'Failed to update username.');
          return;
        }
      }
    }

    const sanitizedUrl = sanitizePfpUrl(editAvatarUrl);
    updateActiveProfileData({
      displayName: editName.trim() || DEFAULT_PROFILE_DISPLAY_NAME,
      bio: editBio.trim() || 'No bio written yet.',
      gradient: editGradient,
      passcode: passcodeVal ? passcodeVal : undefined,
      avatarUrl: sanitizedUrl || undefined,
    });

    setIsEditingProfile(false);
  };

  // ── Playlist Transfer Tool Implementations ────────────────────────
  const importYouTubePlaylist = async () => {
    setPlaylistImportError(null);
    setPlaylistImportSuccess(null);
    setIsImportingPlaylist(true);

    let parsedId = ytPlaylistLink.trim();
    if (parsedId.includes('list=')) {
      const match = parsedId.match(/list=([^&]+)/);
      if (match) parsedId = match[1];
    }

    if (!parsedId || parsedId.length < 5) {
      setPlaylistImportError('Invalid YouTube Playlist URL or ID format.');
      setIsImportingPlaylist(false);
      return;
    }

    try {
      const res = await spiceFetch('local', `/yt/playlist/${encodeURIComponent(parsedId)}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to fetch playlist details.');
      }

      const playlistData = await res.json();
      const tracks: Track[] = (playlistData.tracks ?? []).map((t: any) => ({
        id: t.id,
        title: t.title,
        artists: t.artists,
        artworkUrl: t.artworkUrl,
        durationMs: t.durationMs
      }));

      if (tracks.length === 0) {
        throw new Error('This public playlist does not contain any playable tracks.');
      }
      rememberTrackSnapshots(tracks);

      // Add as custom playlist
      const newPlaylist: Playlist = {
        id: createPlaylistId(),
        title: playlistData.title || 'YT Import',
        description: playlistData.description || 'Imported YouTube playlist.',
        tracks,
        gradient: PRESET_GRADIENTS[randomIndex(PRESET_GRADIENTS.length)],
        createdAt: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      };

      const updated = [...customPlaylists, newPlaylist];
      persistCustomPlaylists(updated);

      setPlaylistImportSuccess(`Successfully imported "${playlistData.title}" with ${tracks.length} tracks!`);
      setYtPlaylistLink('');

    } catch (err: any) {
      console.error(err);
      setPlaylistImportError(err.message || 'Playlist retrieval failed.');
    } finally {
      setIsImportingPlaylist(false);
    }
  };

  // JSON Database Backups
  const downloadBackupFile = () => {
    const backupData = {
      version: 'spice-v1',
      profile: {
        displayName: activeProfile.displayName,
        bio: activeProfile.bio,
        gradient: activeProfile.gradient,
        joinedAt: activeProfile.joinedAt,
        songsPlayed: activeProfile.songsPlayed
      },
      likedTracks: Array.from(likedTracks),
      likedTrackDetails,
      customPlaylists,
      history
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeProfile.displayName.replace(/\s+/g, '_')}_spice_backup.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyBackupToClipboard = () => {
    const backupData = {
      version: 'spice-v1',
      likedTracks: Array.from(likedTracks),
      likedTrackDetails,
      customPlaylists,
      history
    };
    navigator.clipboard.writeText(JSON.stringify(backupData))
      .then(() => showSpiceNotice('Spice JSON Backup copied to clipboard.', 'success'))
      .catch(err => console.error('Failed to copy JSON:', err));
  };

  const restoreBackupData = () => {
    setJsonBackupStatus(null);
    if (!jsonImportText.trim()) return;

    try {
      const payload = JSON.parse(jsonImportText.trim());
      if (payload.version !== 'spice-v1') {
        throw new Error('Incompatible backup version tag.');
      }

      // Merge Liked tracks
      const newLikesSet = new Set([...likedTracks, ...(payload.likedTracks || [])]);
      setLikedTracks(newLikesSet);

      const mergedDetails = { ...likedTrackDetails, ...(payload.likedTrackDetails || {}) };
      setLikedTrackDetails(mergedDetails);

      // Merge Playlists
      const newPlaylists = [...customPlaylists];
      const parsedPlaylists: Playlist[] = payload.customPlaylists || [];
      for (const pl of parsedPlaylists) {
        if (!newPlaylists.some(p => p.title === pl.title && p.tracks.length === pl.tracks.length)) {
          newPlaylists.push({
            ...pl,
            id: `backup_${createPlaylistId()}`
          });
        }
      }
      setCustomPlaylists(newPlaylists);

      // Merge history
      const newHistory = [...(payload.history || []), ...history].slice(0, 50);
      setHistory(newHistory);

      // Sync to local profiles DB
      updateActiveProfileData({
        likedTracks: Array.from(newLikesSet),
        likedTrackDetails: mergedDetails,
        customPlaylists: newPlaylists,
        history: newHistory
      });

      setJsonBackupStatus('success');
      setJsonImportText('');
      showSpiceNotice('Backup database parsed and merged successfully.', 'success');

    } catch (e: any) {
      console.error(e);
      setJsonBackupStatus('error');
      showSpiceNotice('Error parsing JSON backup: ' + e.message, 'danger');
    }
  };

  const getAccentStyles = () => {
    let base = '';
    switch (accentTheme) {
      case 'blue':
        base = `
          :root {
            --accent-pink: #3b82f6 !important;
            --accent-pink-rgb: 59, 130, 246 !important;
            --accent-purple: #06b6d4 !important;
            --accent-violet: #3b82f6 !important;
            --accent-cyan: #06b6d4 !important;
            --accent-gradient: linear-gradient(135deg, #06b6d4, #3b82f6) !important;
            --text-accent: #93c5fd !important;
          }
        `;
        break;
      case 'orange':
        base = `
          :root {
            --accent-pink: #f97316 !important;
            --accent-pink-rgb: 249, 115, 22 !important;
            --accent-purple: #ef4444 !important;
            --accent-violet: #f97316 !important;
            --accent-cyan: #ef4444 !important;
            --accent-gradient: linear-gradient(135deg, #f97316, #ef4444) !important;
            --text-accent: #fdba74 !important;
          }
        `;
        break;
      case 'green':
        base = `
          :root {
            --accent-pink: #10b981 !important;
            --accent-pink-rgb: 16, 185, 129 !important;
            --accent-purple: #059669 !important;
            --accent-violet: #10b981 !important;
            --accent-cyan: #059669 !important;
            --accent-gradient: linear-gradient(135deg, #10b981, #059669) !important;
            --text-accent: #6ee7b7 !important;
          }
        `;
        break;
      case 'gold':
        base = `
          :root {
            --accent-pink: #f59e0b !important;
            --accent-pink-rgb: 245, 158, 11 !important;
            --accent-purple: #d97706 !important;
            --accent-violet: #f59e0b !important;
            --accent-cyan: #d97706 !important;
            --accent-gradient: linear-gradient(135deg, #f59e0b, #d97706) !important;
            --text-accent: #fcd34d !important;
          }
        `;
        break;
      case 'crimson':
        base = `
          :root {
            --accent-pink: #ff003c !important;
            --accent-pink-rgb: 255, 0, 60 !important;
            --accent-purple: #990011 !important;
            --accent-violet: #ff003c !important;
            --accent-cyan: #ff3366 !important;
            --accent-gradient: linear-gradient(135deg, #ff003c, #990011) !important;
            --text-accent: #ffa3b1 !important;
          }
        `;
        break;
      case 'deeppurple':
        base = `
          :root {
            --accent-pink: #7c3aed !important;
            --accent-pink-rgb: 124, 58, 237 !important;
            --accent-purple: #4c1d95 !important;
            --accent-violet: #7c3aed !important;
            --accent-cyan: #3b0764 !important;
            --accent-gradient: linear-gradient(135deg, #4c1d95, #120024) !important;
            --text-accent: #c084fc !important;
          }
        `;
        break;
      default: // pink
        base = `
          :root {
            --accent-pink: #ec4899 !important;
            --accent-pink-rgb: 236, 72, 153 !important;
            --accent-purple: #a855f7 !important;
            --accent-violet: #a855f7 !important;
            --accent-cyan: #ec4899 !important;
            --accent-gradient: linear-gradient(135deg, #a855f7, #ec4899) !important;
            --text-accent: #f9a8d4 !important;
          }
        `;
        break;
    }

    const surfaceCssByMode: Record<VisualSurface, string> = {
      midnight: `
        --body-bg: #000000;
        --card-bg: rgba(10, 10, 10, 0.92);
        --border-color: rgba(255, 255, 255, 0.08);
        --bg-primary: #000000;
        --bg-surface: #0a0a0a;
        --bg-surface-hover: #151515;
        --bg-glass: rgba(8, 8, 10, 0.9);
        --spice-app-background: #000000;
        --spice-panel-filter: blur(20px);
      `,
      glass: `
        --body-bg: #050507;
        --card-bg: rgba(17, 17, 24, 0.68);
        --border-color: rgba(255, 255, 255, 0.12);
        --bg-primary: #050507;
        --bg-surface: rgba(14, 14, 18, 0.78);
        --bg-surface-hover: rgba(34, 34, 42, 0.82);
        --bg-glass: rgba(12, 12, 18, 0.72);
        --spice-app-background: radial-gradient(circle at 12% 8%, rgba(var(--accent-pink-rgb), 0.16), transparent 32%), #050507;
        --spice-panel-filter: blur(24px);
      `,
      solid: `
        --body-bg: #050505;
        --card-bg: #111113;
        --border-color: rgba(255, 255, 255, 0.1);
        --bg-primary: #050505;
        --bg-surface: #111113;
        --bg-surface-hover: #1b1b1f;
        --bg-glass: #0d0d10;
        --spice-app-background: #050505;
        --spice-panel-filter: none;
      `,
      aurora: `
        --body-bg: #030305;
        --card-bg: rgba(14, 12, 22, 0.78);
        --border-color: rgba(var(--accent-pink-rgb), 0.16);
        --bg-primary: #030305;
        --bg-surface: rgba(12, 10, 18, 0.9);
        --bg-surface-hover: rgba(35, 26, 48, 0.9);
        --bg-glass: rgba(9, 8, 16, 0.78);
        --spice-app-background: radial-gradient(circle at 16% 10%, rgba(var(--accent-pink-rgb), 0.22), transparent 28%), radial-gradient(circle at 86% 20%, rgba(168, 85, 247, 0.16), transparent 34%), #030305;
        --spice-panel-filter: blur(24px);
      `,
      daylight: `
        color-scheme: light;
        --body-bg: #f5f3f8;
        --card-bg: rgba(255, 255, 255, 0.94);
        --border-color: rgba(32, 24, 45, 0.14);
        --bg-primary: #f7f5fa;
        --bg-surface: #ffffff;
        --bg-surface-hover: #ece8f1;
        --bg-surface-active: #e4deea;
        --bg-glass: rgba(255, 255, 255, 0.86);
        --bg-glass-hover: rgba(255, 255, 255, 0.96);
        --text-primary: #19151f;
        --text-secondary: #625b6b;
        --text-muted: #8b8394;
        --border-subtle: rgba(32, 24, 45, 0.11);
        --border-glass: rgba(32, 24, 45, 0.12);
        --spice-app-background: radial-gradient(circle at 16% 8%, rgba(var(--accent-pink-rgb), 0.1), transparent 30%), #f7f5fa;
        --spice-panel-filter: blur(22px);
      `,
    };
    const artRadiusByShape: Record<ArtworkShape, string> = {
      rounded: '10px',
      soft: '18px',
      circle: '9999px',
    };
    const scaleCssByMode: Record<InterfaceScale, string> = {
      compact: '--sidebar-width: 240px; --now-playing-height: 78px; --spice-content-x: 32px; --spice-content-y: 24px;',
      comfortable: '--sidebar-width: 260px; --now-playing-height: 88px; --spice-content-x: 48px; --spice-content-y: 32px;',
      spacious: '--sidebar-width: 290px; --now-playing-height: 104px; --spice-content-x: 64px; --spice-content-y: 44px;',
    };
    const playerBarRootCssByDensity: Record<PlayerBarDensity, string> = {
      standard: '',
      slim: '--now-playing-height: 66px;',
    };
    const playerBarCssByDensity: Record<PlayerBarDensity, string> = {
      standard: '',
      slim: `
        .now-playing {
          min-height: 66px !important;
          padding-left: clamp(10px, 1.6vw, 22px) !important;
          padding-right: clamp(10px, 1.6vw, 22px) !important;
          gap: clamp(6px, 1vw, 14px) !important;
        }
        .now-playing__btn {
          width: 28px !important;
          height: 28px !important;
        }
        .now-playing__btn svg {
          width: 16px !important;
          height: 16px !important;
        }
        .now-playing__btn--play {
          width: 36px !important;
          height: 36px !important;
        }
        .now-playing__btn--play svg {
          width: 18px !important;
          height: 18px !important;
        }
        .now-playing__song {
          gap: 10px !important;
          flex-basis: clamp(140px, 18vw, 220px) !important;
          max-width: clamp(140px, 18vw, 220px) !important;
        }
        .now-playing__art {
          width: 40px !important;
          height: 40px !important;
        }
        .now-playing__title {
          font-size: 0.82rem !important;
        }
        .now-playing__artist {
          font-size: 0.7rem !important;
        }
        .now-playing__seek {
          font-size: 0.7rem !important;
        }
        .now-playing__seek-track {
          height: 3px !important;
        }
        .now-playing__seek-track:hover {
          height: 5px !important;
        }
        .now-playing__waveform {
          height: 12px !important;
        }
        .now-playing__like,
        .now-playing__volume-btn {
          width: 26px !important;
          height: 26px !important;
        }
        @media (max-width: 600px) {
          .now-playing {
            height: 58px !important;
            min-height: 58px !important;
            border-radius: 18px !important;
            grid-template-columns: minmax(0, 1fr) 38px !important;
          }
          .now-playing__art {
            width: 40px !important;
            height: 40px !important;
          }
          .now-playing__mobile-play {
            width: 38px !important;
            height: 38px !important;
          }
        }
      `,
    };
    const motionCssByLevel: Record<MotionLevel, string> = {
      full: '',
      calm: `
        .vinyl-spin { animation-duration: 34s !important; }
        .now-playing__waveform-bar { animation-duration: 1.35s !important; }
        .animate-in { animation-duration: 0.18s !important; }
      `,
      off: `
        html { scroll-behavior: auto !important; }
        *, *::before, *::after {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important;
          scroll-behavior: auto !important;
        }
        .vinyl-spin,
        .now-playing__waveform-bar,
        .animate-in,
        .animate-spin {
          animation: none !important;
        }
      `,
    };

    base += `
      :root {
        ${surfaceCssByMode[visualSurface]}
        ${scaleCssByMode[interfaceScale]}
        ${playerBarRootCssByDensity[playerBarDensity]}
        --spice-art-radius: ${artRadiusByShape[artworkShape]};
      }
      .app {
        background: var(--spice-app-background) !important;
      }
      .sidebar,
      .now-playing,
      .queue-drawer,
      .lyrics-drawer,
      .mini-player,
      .expanded-player {
        backdrop-filter: var(--spice-panel-filter) !important;
        -webkit-backdrop-filter: var(--spice-panel-filter) !important;
      }
      .card__art-wrapper,
      .card__art,
      .quick-card__art,
      .library-item__art,
      .now-playing__art,
      .expanded-player__art-box,
      .mini-player img {
        border-radius: var(--spice-art-radius) !important;
      }
      ${motionCssByLevel[motionLevel]}
      ${playerBarCssByDensity[playerBarDensity]}
    `;

    if (playerPlacement === 'top') {
      base += `
        .app {
          grid-template-rows: var(--now-playing-height) 1fr !important;
        }
        .now-playing {
          grid-row: 1 / 2 !important;
          border-top: none !important;
          border-bottom: 1px solid var(--border-glass) !important;
        }
        .sidebar {
          grid-row: 2 / 3 !important;
        }
        .main {
          grid-row: 2 / 3 !important;
        }
        .now-playing .spice-connect-receiver__menu {
          top: calc(100% + 10px) !important;
          bottom: auto !important;
        }
      `;
    }

    if (playerViewMode === 'mini') {
      base += `
        .app {
          grid-template-rows: 1fr !important;
        }
        .now-playing {
          display: none !important;
        }
      `;
    }

    base += `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .vinyl-spin {
        animation: spin 20s linear infinite;
      }
      .expanded-player__btn:hover {
        transform: scale(1.15);
        color: var(--accent-pink) !important;
      }
      .expanded-player__btn-play:hover {
        transform: scale(1.08);
        box-shadow: 0 12px 32px rgba(var(--accent-pink-rgb), 0.6) !important;
      }
      .mini-player:hover .mini-player__art-hover {
        opacity: 1 !important;
      }
    `;

    return base;
  };

  const normalizedTopbarQuery = topbarSearchQuery.trim().toLocaleLowerCase();
  const topbarRecentSuggestions = recentSearchEntries
    .filter((entry) => entry.query.trim().toLocaleLowerCase() !== normalizedTopbarQuery)
    .slice(0, 6);
  const topbarTrayResults = searchResults.slice(0, 6);
  const topbarSearchMode: TopbarSearchMode = quickSearchTab === 'users' ? 'users' : searchProvider;
  const shouldShowTopbarSearchTray =
    topbarSearchTrayOpen
    && (Boolean(topbarSearchQuery.trim()) || topbarRecentSuggestions.length > 0 || topbarTrayResults.length > 0 || topbarUserSearchResults.length > 0 || isSearching || isSearchingTopbarUsers);
  const unreadReleaseNotifications = releaseNotifications.filter((notification) => !readReleaseNotificationIds.includes(notification.id));
  const notificationCount = unreadReleaseNotifications.length + pendingInvites.length + pendingListenInvites.length;
  const notificationCountLabel = notificationCount > 99 ? '99+' : String(notificationCount);

  const isPlaylistOwner = selectedPlaylist
    ? (
        (selectedPlaylist.shared && (selectedPlaylist.shareRole === 'owner' || selectedPlaylist.ownerId === cloudUser?.id)) ||
        (!selectedPlaylist.shared && (!selectedPlaylist.ownerId || (cloudUser?.id && selectedPlaylist.ownerId === cloudUser.id)))
      )
    : false;

  const openCommandPage = (page: AppPage) => {
    setSelectedPlaylist(null);
    setSelectedUser(null);
    setCurrentPage(page);
  };
  const updatePlaybackProfiles = (nextState: PlaybackProfileState) => {
    const persisted = savePlaybackProfileState(localStorage, nextState);
    setPlaybackProfileState(persisted.state);
    if (!persisted.saved) showSpiceNotice('Playback profile changed, but local storage could not save it.', 'warning');
  };
  const rebuildSmartQueue = () => {
    if (isControllingRemoteReceiver) {
      showSpiceNotice('Switch the receiver to this device before rebuilding its queue.', 'warning');
      return;
    }
    const profile = activePlaybackProfile;
    if (!profile?.smartQueue.enabled) {
      showSpiceNotice('Enable Smart queue rules in the active playback profile first.', 'warning');
      return;
    }
    if (currentTrack.id === 'placeholder') {
      showSpiceNotice('Play a track before building a smart queue.', 'warning');
      return;
    }

    const candidates = mergeTrackLists(
      queue.slice(queueIndex + 1),
      searchResults,
      homeTrending,
      homeRecommended,
      homeRecommendationShelves.flatMap((shelf) => shelf.tracks),
      Object.values(likedTrackDetails),
      history,
    ) as Track[];
    const recentHistory = history.slice(0, profile.smartQueue.recentTrackWindow);
    const recentTrackKeys = new Set(recentHistory.map(smartQueueTrackKey));
    recentTrackKeys.add(smartQueueTrackKey(currentTrack));
    const recentArtistKeys = new Set(
      history
        .slice(0, profile.smartQueue.recentArtistWindow)
        .flatMap(smartQueueArtistKeys),
    );
    const smartTracks = sequenceTracksByMoodFlow(
      buildSmartQueue(candidates, {
        limit: Math.min(200, candidates.length),
        recentTrackKeys,
        recentArtistKeys,
        likedTrackIds: likedTracks,
        likedBoost: profile.smartQueue.likedBoost,
        recentArtistPenalty: profile.smartQueue.recentArtistPenalty,
        sourceDiversityPenalty: profile.smartQueue.sourceDiversityPenalty,
        artistDiversityPenalty: profile.smartQueue.artistDiversityPenalty,
        getBaseScore: (candidate) => smartQueueBaseScore(candidate as Track, tasteAffinityContext),
      }),
      (candidate) => trackTopicKeys(candidate as Track),
    );
    if (smartTracks.length === 0) {
      showSpiceNotice('No eligible tracks were available for the smart queue.', 'info');
      return;
    }
    playlistQueueOriginRef.current = null;
    setQueue([currentTrack, ...smartTracks]);
    setQueueIndex(0);
    showSpiceNotice(`Smart queue rebuilt with ${smartTracks.length} upcoming tracks.`, 'success');
  };
  const commandPaletteCommands: CommandPaletteCommand[] = [
    { id: 'page-home', label: 'Go to Home', description: 'Recommendations and recent listening', keywords: ['browse'], run: () => openCommandPage('home') },
    { id: 'page-search', label: 'Open Search', description: 'Find tracks, videos, and users', keywords: ['music find'], shortcut: '/', run: () => openCommandPage('search') },
    { id: 'page-library', label: 'Open Library', description: 'Playlists, likes, and history', keywords: ['collection'], run: () => openCommandPage('library') },
    { id: 'page-account', label: 'Open Profile', description: 'Account and profile settings', keywords: ['account'], run: () => openCommandPage('account') },
    { id: 'page-settings', label: 'Open Settings', description: 'Theme, playback, remote, and diagnostics', keywords: ['preferences theme'], run: () => openCommandPage('settings') },
    { id: 'player-toggle', label: playerIsPlaying ? 'Pause playback' : 'Resume playback', description: playerTrack.title, keywords: ['player play pause'], shortcut: 'Space', run: toggleReceiverPlayPause },
    { id: 'player-queue', label: 'Show Up Next Queue', description: `${playerQueue.length} track${playerQueue.length === 1 ? '' : 's'}`, keywords: ['playlist next'], run: () => { setShowQueueDrawer(true); setShowBarLyrics(false); } },
    ...(!isControllingRemoteReceiver ? [{ id: 'player-smart-queue', label: 'Rebuild Smart Queue', description: activePlaybackProfile?.name ?? 'Playback profile', keywords: ['mix diversity recommendations'], run: rebuildSmartQueue }] : []),
    { id: 'player-expanded', label: 'Open Expanded Player', description: 'Immersive now-playing view', keywords: ['fullscreen'], run: () => { setPlayerViewMode('expanded'); localStorage.setItem('spice_player_view_mode', 'expanded'); } },
    { id: 'playlist-create', label: 'Create a Playlist', description: 'Start a new local playlist', keywords: ['new library'], run: () => { openCommandPage('library'); setShowCreateDialog(true); } },
    { id: 'remote-connect', label: 'Open Spice Connect', description: 'Pair and control another device', keywords: ['phone remote receiver'], run: () => openCommandPage('settings') },
  ];

  const settingsNavigationGroups = [
    {
      label: 'Personalize',
      items: [
        { id: 'theme-accent', label: 'Theme Accent', icon: Icons.palette },
        { id: 'visual-customization', label: 'Visual Layout', icon: Icons.monitor },
        { id: 'profile-privacy', label: 'Profile Settings', icon: Icons.shield },
        { id: 'sidebar-controls', label: 'Sidebar Panels', icon: Icons.grid },
      ],
    },
    {
      label: 'Desktop',
      items: [
        ...(desktopUpdaterAvailable ? [{ id: 'desktop-updates', label: 'Desktop App', icon: Icons.monitor }] : []),
        ...(nativeShellAvailable ? [
          { id: 'native-shell', label: 'Native Desktop', icon: Icons.monitor },
          { id: 'discord-activity', label: 'Discord Activity', icon: Icons.account },
        ] : []),
      ],
    },
    {
      label: 'Playback',
      items: [
        { id: 'search-sources', label: 'Search Sources', icon: Icons.search },
        { id: 'audio-streaming', label: 'Audio & Quality', icon: Icons.volume },
        { id: 'profile-sync', label: 'Listening Sync', icon: Icons.database },
        { id: 'player-layout', label: 'Player Settings', icon: Icons.play },
        { id: 'playback-profiles', label: 'Smart Behavior', icon: Icons.settings },
      ],
    },
    {
      label: 'Connect',
      items: [
        { id: 'spice-connect', label: 'Spice Connect', icon: Icons.monitor },
      ],
    },
    {
      label: 'Support',
      items: [
        { id: 'offline-library', label: 'Downloads Folder', icon: Icons.folder },
        { id: 'offline-runtime', label: 'Offline Runtime', icon: Icons.download },
        { id: 'feedback-support', label: 'Feedback', icon: Icons.account },
        { id: 'storage-safety', label: 'Storage & Safety', icon: Icons.shield },
        { id: 'system-diagnostics', label: 'Diagnostics', icon: Icons.tool },
      ],
    },
  ].filter((group) => group.items.length > 0);

  const runCommandQuickSearch = (query: string) => {
    if (!query) return;
    setSelectedPlaylist(null);
    setSelectedUser(null);
    setCurrentPage('search');
    setQuickSearchTab('tracks');
    setSearchProvider('hybrid');
    setSearchQuery(query);
    setTopbarSearchQuery(query);
    queueSearch(query, 'hybrid');
  };

  return (
    <div
      className={`app ${sidebarHidden ? 'app--sidebar-hidden' : ''} surface--${visualSurface} topbar-layout--${topbarLayout} player-style--${playerVisualStyle} player-placement--${playerPlacement}`}
      style={customThemeEnabled ? createThemeCssVariables(customThemePalette) as React.CSSProperties : undefined}
    >
      <style dangerouslySetInnerHTML={{ __html: getAccentStyles() }} />
      <CommandPalette
        open={commandPaletteOpen}
        commands={commandPaletteCommands}
        onClose={() => setCommandPaletteOpen(false)}
        onQuickSearch={runCommandQuickSearch}
      />

      {accountBlock && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483646,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: 'var(--bg-base, rgba(5, 5, 8, 0.98))',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            fontFamily: 'Outfit, sans-serif',
          }}
        >
          <div style={{
            width: 'min(460px, 100%)',
            padding: '32px',
            borderRadius: '20px',
            border: `1px solid ${accountBlock.status === 'banned' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
            background: 'var(--card-bg, rgba(20, 18, 26, 0.95))',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.55)',
            textAlign: 'center',
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              margin: '0 auto 18px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.6rem',
              color: accountBlock.status === 'banned' ? '#ef4444' : '#f59e0b',
              background: accountBlock.status === 'banned'
                ? 'rgba(239, 68, 68, 0.12)'
                : 'rgba(245, 158, 11, 0.12)',
            }}>
              {accountBlock.status === 'banned' ? '⛔' : '⏱'}
            </div>
            <h1 style={{ margin: '0 0 10px', fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
              {accountBlock.status === 'banned' ? 'Account Banned' : 'Account Temporarily Timed Out'}
            </h1>
            <p style={{ margin: '0 0 8px', fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--text-secondary, rgba(255,255,255,0.65))' }}>
              {accountBlock.status === 'banned'
                ? 'This account has been banned and can no longer sign in or use SPICE services.'
                : 'This account is temporarily timed out. SPICE services will be restored when the timeout ends.'}
            </p>
            {accountBlock.reason && (
              <p style={{ margin: '0 0 8px', fontSize: '0.9rem', lineHeight: 1.55, color: 'var(--text-secondary, rgba(255,255,255,0.65))', wordBreak: 'break-word' }}>
                <strong style={{ color: 'var(--text-primary, #fff)' }}>Reason:</strong> {accountBlock.reason}
              </p>
            )}
            {accountBlock.expiresAt && (
              <p style={{ margin: '0 0 8px', fontSize: '0.9rem', color: 'var(--text-secondary, rgba(255,255,255,0.65))' }}>
                Access returns <strong style={{ color: 'var(--text-primary, #fff)' }}>{new Date(accountBlock.expiresAt).toLocaleString()}</strong>
              </p>
            )}
            <button
              type="button"
              onClick={handleLogout}
              style={{
                marginTop: '18px',
                padding: '10px 22px',
                borderRadius: '999px',
                border: '1px solid var(--border-color, rgba(255,255,255,0.12))',
                background: 'transparent',
                color: 'var(--text-primary, #fff)',
                fontFamily: 'inherit',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {(listenTogetherSession || listenTogetherHostSessionId) && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(var(--now-playing-height) + 16px)',
          right: '16px',
          background: 'rgba(20, 10, 15, 0.75)',
          border: '1px solid rgba(236, 72, 153, 0.25)',
          padding: '12px 20px',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          fontSize: '0.85rem',
          color: '#fff',
          zIndex: 9999,
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          width: '280px',
          transition: 'all 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="pulse-pink" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-pink)', display: 'inline-block' }} />
            <span style={{ fontWeight: 600, fontFamily: 'Outfit, sans-serif', letterSpacing: '0.5px' }}>
              {listenTogetherSession ? 'Hosting Session' : 'Listening Together'}
            </span>
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
            {listenTogetherSession
              ? `ID: ${listenTogetherSession.id.slice(0, 8)}...`
              : `Host: ${listenTogetherHostName || 'Friend'}`
            }
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
            <button
              onClick={() => setListenTogetherDialogOpen(true)}
              style={{ background: 'none', border: 'none', color: 'var(--accent-pink)', fontWeight: 700, cursor: 'pointer', outline: 'none', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 0' }}
            >
              Manage
            </button>
            <span style={{ opacity: 0.2, alignSelf: 'center' }}>|</span>
            <button
              onClick={handleEndOrLeaveListenTogether}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', outline: 'none', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 0' }}
            >
              {listenTogetherSession ? 'End' : 'Leave'}
            </button>
          </div>
        </div>
      )}

      {spiceNotices.length > 0 && (
        <div className="spice-notices-container">
          {spiceNotices.map((notice) => (
            <div key={notice.id} className={`spice-notice spice-notice--${notice.kind}`} role="status" aria-live="polite">
              <span className="spice-notice__icon">
                {notice.kind === 'success' ? Icons.checkCircle : notice.kind === 'info' ? Icons.musicNote : Icons.alertTriangle}
              </span>
              <span className="spice-notice__message">{notice.message}</span>
              <button type="button" onClick={() => dismissSpiceNotice(notice.id)} aria-label="Dismiss notification" className="spice-notice__close">
                {Icons.close}
              </button>
            </div>
          ))}
        </div>
      )}
      {spiceConfirm && (
        <div className="spice-dialog-backdrop" role="presentation">
          <div
            className={`spice-dialog spice-dialog--${spiceConfirm.kind || 'info'}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="spice-dialog-title"
            aria-describedby="spice-dialog-message"
          >
            <div className="spice-dialog__mark">
              {spiceConfirm.kind === 'success' ? Icons.checkCircle : spiceConfirm.kind === 'info' ? Icons.musicNote : Icons.alertTriangle}
            </div>
            <div className="spice-dialog__body">
              <h2 id="spice-dialog-title">{spiceConfirm.title}</h2>
              <p id="spice-dialog-message">{spiceConfirm.message}</p>
            </div>
            <div className="spice-dialog__actions">
              <button type="button" className="spice-dialog__button spice-dialog__button--ghost" onClick={cancelSpiceConfirm}>
                {spiceConfirm.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                className="spice-dialog__button spice-dialog__button--primary"
                onClick={() => {
                  const onConfirm = spiceConfirm.onConfirm;
                  setSpiceConfirm(null);
                  onConfirm();
                }}
              >
                {spiceConfirm.confirmLabel || 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Song Share Dialog ── */}
      {songShareDialog && (
        <div className="spice-dialog-backdrop" role="presentation" onClick={() => setSongShareDialog(null)}>
          <div
            className="spice-share-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="spice-share-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="spice-share-dialog__header">
              <img
                src={songShareDialog.track.artworkUrl || '/icon.svg'}
                alt=""
                className="spice-share-dialog__art"
              />
              <div className="spice-share-dialog__copy">
                <span className="spice-share-dialog__eyebrow">Share song</span>
                <h2 id="spice-share-title">{songShareDialog.track.title}</h2>
                <p>{profileArtistName(songShareDialog.track)} | {trackSourceLabel(songShareDialog.track)}</p>
              </div>
              <button
                type="button"
                className="spice-share-dialog__close"
                onClick={() => setSongShareDialog(null)}
                aria-label="Close share options"
              >
                {Icons.close}
              </button>
            </div>
            <div className="spice-share-dialog__link" title={songShareDialog.shareUrl}>
              {songShareDialog.shareUrl}
            </div>
            <div className="spice-share-dialog__actions">
              <button type="button" className="spice-share-dialog__button spice-share-dialog__button--primary" onClick={copySongShareLink}>
                {Icons.clipboard} Copy Link
              </button>
              <button
                type="button"
                className="spice-share-dialog__button"
                onClick={downloadSharedSong}
                disabled={offlineDownloadTrackId !== null}
                title="Download audio file"
              >
                {Icons.download} {offlineDownloadTrackId ? 'Downloading…' : 'Download'}
              </button>
              <button type="button" className="spice-share-dialog__button" onClick={openSongSource}>
                {Icons.globe} Source
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Listen Together Dialog ── */}
      {listenTogetherDialogOpen && (
        <div className="spice-dialog-backdrop" role="presentation" onClick={() => setListenTogetherDialogOpen(false)}>
          <div
            className="spice-share-dialog"
            style={{
              padding: '28px',
              maxWidth: '460px',
              background: 'rgba(15, 12, 22, 0.85)',
              border: '1px solid rgba(236, 72, 153, 0.2)',
              borderRadius: '28px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 30px rgba(236, 72, 153, 0.15)',
              backdropFilter: 'blur(30px)'
            }}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--accent-pink)', display: 'inline-flex', transform: 'scale(1.3)' }}>{Icons.listenTogether}</span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, fontFamily: 'Outfit, sans-serif' }}>Listen Together</h2>
              </div>
              <button
                type="button"
                className="spice-share-dialog__close"
                onClick={() => setListenTogetherDialogOpen(false)}
                aria-label="Close"
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
              >
                {Icons.close}
              </button>
            </div>

            <div role="status" style={{ marginBottom: '18px', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-secondary)', background: 'var(--card-bg)', fontSize: '0.78rem' }}>
              {listenTogetherStatus}
            </div>

            {listenTogetherSession ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ background: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.2)', padding: '16px', borderRadius: '16px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--accent-pink)', fontWeight: 700 }}>Session Active</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '4px', wordBreak: 'break-all' }}>{listenTogetherSession.id}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Share session link</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/?listenTogether=${listenTogetherSession.id}`}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '8px 12px', color: '#e4e4e7', fontSize: '0.85rem', outline: 'none' }}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      className="btn"
                      style={{ background: 'var(--accent-pink)', color: '#fff', borderRadius: '10px', padding: '0 16px', fontSize: '0.85rem', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={async () => {
                        const shareUrl = `${window.location.origin}/?listenTogether=${listenTogetherSession.id}`;
                        const copied = await copyTextToClipboard(shareUrl);
                        if (copied) showSpiceNotice('Session link copied to clipboard!', 'success');
                      }}
                    >
                      {Icons.clipboard} Copy
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Invite a Spicer</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="ex @username#00000"
                      value={listenTogetherInviteUsername}
                      onChange={(e) => setListenTogetherInviteUsername(e.target.value)}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '8px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendListenTogetherInvite()}
                    />
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={isSendingListenTogetherInvite || !listenTogetherInviteUsername.trim()}
                      style={{ minHeight: 'auto', padding: '0 16px', borderRadius: '10px', fontSize: '0.85rem' }}
                      onClick={() => handleSendListenTogetherInvite()}
                    >
                      {isSendingListenTogetherInvite ? 'Sending...' : 'Invite'}
                    </button>
                  </div>
                </div>

                {/* Invited user list status */}
                {listenTogetherInvitesList.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', maxHeight: '180px', overflowY: 'auto' }} className="custom-scrollbar">
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invited Listeners</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {listenTogetherInvitesList.map((inv) => (
                        <div key={inv.inviteId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem' }}>
                          <span style={{ fontWeight: 600 }}>{inv.invitedDisplayName} <span style={{ opacity: 0.5 }}>@{inv.invitedUsername}</span></span>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: inv.status === 'accepted' ? '#22c55e' : inv.status === 'rejected' ? '#ef4444' : '#a1a1aa',
                            textTransform: 'uppercase',
                            background: inv.status === 'accepted' ? 'rgba(34,197,94,0.1)' : inv.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(161,161,170,0.1)',
                            padding: '2px 8px',
                            borderRadius: '20px'
                          }}>
                            {inv.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ width: '100%', marginTop: '10px', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
                  onClick={handleEndListenTogetherSession}
                >
                  End Session
                </button>
              </div>
            ) : listenTogetherHostSessionId ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center', padding: '10px 0' }}>
                <div className="pulse-pink" style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(236,72,153,0.1)', border: '1px solid var(--accent-pink)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-pink)', fontSize: '1.8rem' }}>
                  🎧
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.15rem' }}>Listening with {listenTogetherHostName || 'Host'}</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Your player is synchronized with their playback.</p>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ width: '100%', marginTop: '10px', background: 'var(--accent-pink)' }}
                  onClick={handleLeaveListenTogetherSession}
                >
                  Leave Session
                </button>
              </div>
            ) : !cloudToken ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center', padding: '10px 0' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(236,72,153,0.1)', border: '1px solid var(--accent-pink)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-pink)', fontSize: '1.8rem' }}>
                  🔑
                </div>
                <div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem' }}>Join without signing in</h3>
                  <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    Shared room links work without an account. Sign in only when you want to host or send username invites.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                  <input
                    value={listenTogetherJoinSessionId}
                    onChange={(event) => setListenTogetherJoinSessionId(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && joinListenTogetherSession(listenTogetherJoinSessionId)}
                    placeholder="Paste a session ID"
                    style={{ minWidth: 0, flex: 1, padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-primary)', background: 'var(--card-bg)' }}
                  />
                  <button type="button" className="btn btn--ghost" onClick={() => joinListenTogetherSession(listenTogetherJoinSessionId)}>Join</button>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ width: '100%', marginTop: '10px', background: 'linear-gradient(135deg, var(--accent-pink), #ec4899)', border: 'none' }}
                  onClick={() => {
                    setListenTogetherDialogOpen(false);
                    setCurrentPage('account');
                  }}
                >
                  Go to Account Sign In
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center', padding: '10px 0' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '1.8rem' }}>
                  👥
                </div>
                <div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem' }}>Share the Vibe</h3>
                  <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    Start a Listen Together session to broadcast your music to friends in real-time, or join a friend&apos;s active session.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                  <input
                    value={listenTogetherJoinSessionId}
                    onChange={(event) => setListenTogetherJoinSessionId(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && joinListenTogetherSession(listenTogetherJoinSessionId)}
                    placeholder="Paste a session ID to join"
                    style={{ minWidth: 0, flex: 1, padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-primary)', background: 'var(--card-bg)' }}
                  />
                  <button type="button" className="btn btn--ghost" onClick={() => joinListenTogetherSession(listenTogetherJoinSessionId)}>Join</button>
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>or host your own room</span>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ width: '100%', marginTop: '10px', background: 'linear-gradient(135deg, var(--accent-pink), #ec4899)', boxShadow: '0 8px 24px rgba(236,72,153,0.3)', border: 'none' }}
                  disabled={isCreatingListenTogetherSession}
                  onClick={handleStartListenTogetherSession}
                >
                  {isCreatingListenTogetherSession ? 'Starting...' : 'Start a Session'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Release Notification Detail */}
      {selectedReleaseNotification && (
        <div className="spice-dialog-backdrop" role="presentation" onClick={() => setSelectedReleaseNotification(null)}>
          <div
            className="spice-release-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="spice-release-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="spice-release-dialog__header">
              <span>{SPICE_MEDIA_CORE_LABEL}</span>
              <button
                type="button"
                className="spice-share-dialog__close"
                onClick={() => setSelectedReleaseNotification(null)}
                aria-label="Close version details"
              >
                {Icons.close}
              </button>
            </div>
            <h2 id="spice-release-title">{selectedReleaseNotification.version}: {selectedReleaseNotification.title}</h2>
            <p className="spice-release-dialog__summary">{selectedReleaseNotification.summary}</p>
            <div className="spice-release-dialog__body">
              {selectedReleaseNotification.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Security Passcode Lock Overlay */}
      {isLocked && (
        <div className="passcode-overlay animate-in" style={{ position: 'fixed', inset: 0, background: '#000000', zIndex: 120000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(32px)' }}>
          <div style={{ textAlign: 'center', maxWidth: '320px', width: '100%', padding: '24px' }}>
            <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: activeProfile.avatarUrl ? 'none' : activeProfile.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem', fontWeight: 900, color: '#fff', margin: '0 auto 24px auto', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', overflow: 'hidden', border: '3px solid var(--accent-pink)' }}>
              {activeProfile.avatarUrl ? (
                <img src={activeProfile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                activeProfile.displayName.charAt(0).toUpperCase()
              )}
            </div>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.5rem', fontWeight: 700, color: '#fff', margin: '0 0 8px 0' }}>Profile Locked</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '32px' }}>
              Enter passcode to unlock <strong>{activeProfile.displayName}</strong>
            </p>

            {/* Indicator dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '40px' }}>
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  style={{ width: '16px', height: '16px', borderRadius: '50%', background: passcodeInput.length > i ? 'var(--accent-pink)' : '#222', border: '1px solid #444', transition: 'all 0.15s ease', boxShadow: passcodeInput.length > i ? '0 0 12px var(--accent-pink)' : 'none' }}
                />
              ))}
            </div>

            {passcodeError && (
              <div className="loader-glow" style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '24px', fontWeight: 600 }}>
                {passcodeError}
              </div>
            )}

            {/* Custom Premium Virtual Keypad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handlePasscodeKey(num)}
                  style={{ height: '56px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={clearPasscode}
                style={{ height: '56px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handlePasscodeKey('0')}
                style={{ height: '56px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.transform = 'scale(1)'; }}
              >
                0
              </button>
              <button
                type="button"
                onClick={handleCancelPasscode}
                style={{ height: '56px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Audio Player */}
      {([0, 1] as const).map((slot) => (
        <audio
          key={slot}
          ref={slot === 0 ? bindAudioSlotZeroRef : bindAudioSlotOneRef}
          crossOrigin="anonymous"
          preload="auto"
          onCanPlay={(event) => handleAudioCanPlay(slot, event.currentTarget)}
          onPlaying={(event) => handleAudioPlaying(slot, event.currentTarget)}
          onTimeUpdate={(event) => handleTimeUpdate(slot, event.currentTarget)}
          onLoadedMetadata={(event) => handleLoadedMetadata(slot, event.currentTarget)}
          onEnded={(event) => handleAudioEnded(slot, event.currentTarget)}
          onError={() => {
            if (slot === activeAudioSlotRef.current) handleAudioError();
            else if (preparedCrossfadeRef.current?.slot === slot) cancelPreparedCrossfade();
          }}
        />
      ))}

      {/* Stealth YouTube Embed Container — Invisible but functional for audio fallback */}
      <div
        className={`floating-yt-panel ${showVideoPlayer ? 'is-visible' : ''}`}
        aria-hidden={!showVideoPlayer}
      >
        {showVideoPlayer && (
          <div className="floating-yt-panel__header">
            <span className="floating-yt-panel__title">YouTube Video</span>
            <button
              className="floating-yt-panel__close"
              type="button"
              onClick={() => setShowVideoPlayer(false)}
              aria-label="Close video player"
              title="Close video player"
            >
              {Icons.close}
            </button>
          </div>
        )}
        <div
          id="spice-yt-iframe-container"
          className="floating-yt-panel__frame"
        />
      </div>

      {/* ═══ Sidebar Panel ═══ */}
      <aside
        className={`sidebar ${sidebarHidden ? 'sidebar--hidden' : 'sidebar--visible'}`}
        aria-label={sidebarHidden ? 'Collapsed sidebar' : 'Sidebar'}
      >
        <div className="sidebar__logo">
          <button
            type="button"
            className="sidebar__brand"
            onClick={() => { setCurrentPage('home'); setSelectedPlaylist(null); setSelectedUser(null); }}
            aria-label="Go to SPICE Music"
          >
            <div
              className="sidebar__logo-icon"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
            <span className="sidebar__logo-text">
              Spice
            </span>
          </button>
          <button
            type="button"
            className="sidebar__hide-btn"
            onClick={() => updateSidebarHiddenPreference(!sidebarHidden)}
            aria-expanded={!sidebarHidden}
            aria-label={sidebarHidden ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarHidden ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarHidden ? Icons.chevronRight : Icons.chevronLeft}
          </button>
        </div>

        <nav className="sidebar__nav">
          <button
            className={`sidebar__nav-item ${currentPage === 'home' && !selectedPlaylist ? 'active' : ''}`}
            onClick={() => { setCurrentPage('home'); setSelectedPlaylist(null); setSelectedUser(null); }}
            title="Home"
          >
            {Icons.home}
            <span className="sidebar__nav-label">Home</span>
          </button>
          {sidebarSearchEnabled && (
            <button
              className={`sidebar__nav-item ${currentPage === 'search' && !selectedPlaylist ? 'active' : ''}`}
              onClick={() => { setCurrentPage('search'); setSelectedPlaylist(null); setSelectedUser(null); }}
              title="Search"
            >
              {Icons.search}
              <span className="sidebar__nav-label">Search</span>
            </button>
          )}
          <button
            className={`sidebar__nav-item ${currentPage === 'library' && !selectedPlaylist ? 'active' : ''}`}
            onClick={() => { setCurrentPage('library'); setSelectedPlaylist(null); setSelectedUser(null); }}
            title="Library"
          >
            {Icons.library}
            <span className="sidebar__nav-label">Library</span>
          </button>
          {sidebarProfileEnabled && (
            <button
              className={`sidebar__nav-item ${currentPage === 'account' && !selectedPlaylist ? 'active' : ''}`}
              onClick={() => { setCurrentPage('account'); setSelectedPlaylist(null); setSelectedUser(null); }}
              title="Profile"
            >
              {Icons.account}
              <span className="sidebar__nav-label">Profile</span>
            </button>
          )}
          {sidebarSettingsEnabled && (
            <button
              className={`sidebar__nav-item ${currentPage === 'settings' && !selectedPlaylist ? 'active' : ''}`}
              onClick={() => { setCurrentPage('settings'); setSelectedPlaylist(null); setSelectedUser(null); }}
              title="Settings"
            >
              {Icons.settings}
              <span className="sidebar__nav-label">Settings</span>
            </button>
          )}
        </nav>

        <div className="sidebar__divider"></div>
        <div className="sidebar__header-row">
          <div className="sidebar__section-title">Playlists</div>
          <button className="sidebar__add-btn" onClick={() => setShowCreateDialog(true)} title="Create Playlist" aria-label="Create Playlist">
            {Icons.plus}
          </button>
        </div>

        <div className="sidebar__playlists">
          {!isMounted || customPlaylists.length === 0 ? (
            <div className="sidebar__empty">No playlists yet</div>
          ) : (
            customPlaylists.map(pl => (
              <button
                key={pl.id}
                className={`sidebar__playlist-item ${selectedPlaylist?.id === pl.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedPlaylist(pl);
                  setSelectedUser(null);
                  setCurrentPage('library');
                }}
              >
                {Icons.playlist}
                <span className="sidebar__playlist-title">
                  <span className="truncate">{pl.title}</span>
                  {pl.shared && <span className="playlist-shared-pill">Shared</span>}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ═══ Main Content Area ═══ */}
      <main className="main" id="main">
        <div className="main__content">
          <header className="app-topbar" aria-label="SPICE topbar">
            <div className="app-topbar__search-shell" ref={topbarSearchShellRef}>
              <form className="app-topbar__search" onSubmit={handleTopbarSearchSubmit} role="search">
                {Icons.search}
                <input
                  type="search"
                  placeholder={topbarSearchMode === 'users'
                    ? 'Search users...'
                    : `Search ${SEARCH_PROVIDER_LABELS[searchProvider]} or paste a link...`}
                  value={topbarSearchQuery}
                  onChange={handleTopbarSearchInput}
                  onFocus={() => {
                    const recent = getRecentCachedSearches();
                    setRecentSearchEntries(recent);
                    if (topbarSearchQuery.trim() || recent.length > 0 || searchResults.length > 0) {
                      setTopbarSearchTrayOpen(true);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setTopbarSearchTrayOpen(false);
                    }
                  }}
                  autoComplete="off"
                  aria-label="Search SPICE"
                />
                <button type="submit" disabled={!topbarSearchQuery.trim()}>
                  Search
                </button>
              </form>
              <select
                className="app-topbar__provider"
                value={topbarSearchMode}
                onChange={handleTopbarSearchModeChange}
                aria-label="Topbar search mode"
                title="Search source"
              >
                {(Object.entries(TOPBAR_SEARCH_MODE_LABELS) as [TopbarSearchMode, string][]).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>

              {shouldShowTopbarSearchTray && (
                <div className="app-topbar__search-tray" role="region" aria-label="Topbar search results">
                  <div className="app-topbar__search-tray-header">
                    <div>
                      <span>Quick Search</span>
                      <strong>{topbarSearchQuery.trim() ? topbarSearchQuery.trim() : 'Recent searches'}</strong>
                    </div>
                    <button
                      type="button"
                      className="app-topbar__tray-close"
                      onClick={() => setTopbarSearchTrayOpen(false)}
                      aria-label="Close search tray"
                    >
                      {Icons.close}
                    </button>
                  </div>

                  {topbarSearchQuery.trim() && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setQuickSearchTab('tracks')}
                        style={{
                          background: quickSearchTab === 'tracks' ? 'rgba(236, 72, 153, 0.15)' : 'none',
                          border: quickSearchTab === 'tracks' ? '1px solid rgba(236, 72, 153, 0.3)' : '1px solid transparent',
                          borderRadius: '8px',
                          color: quickSearchTab === 'tracks' ? 'var(--accent-pink)' : 'var(--text-secondary)',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          padding: '6px 14px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          outline: 'none'
                        }}
                      >
                        🎵 Songs
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickSearchTab('users')}
                        style={{
                          background: quickSearchTab === 'users' ? 'rgba(236, 72, 153, 0.15)' : 'none',
                          border: quickSearchTab === 'users' ? '1px solid rgba(236, 72, 153, 0.3)' : '1px solid transparent',
                          borderRadius: '8px',
                          color: quickSearchTab === 'users' ? 'var(--accent-pink)' : 'var(--text-secondary)',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          padding: '6px 14px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          outline: 'none'
                        }}
                      >
                        👥 Listeners
                      </button>
                    </div>
                  )}

                  {topbarRecentSuggestions.length > 0 && !topbarSearchQuery.trim() && (
                    <div className="app-topbar__recent-searches">
                      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span>Previous queries</span>
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            clearSearchCache();
                            setRecentSearchEntries([]);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'none'; }}
                          title="Clear search history"
                        >
                          Clear All
                        </button>
                      </span>
                      <div>
                        {topbarRecentSuggestions.map((entry) => (
                          <div
                            key={`${entry.sourceId ?? 'unknown'}:${entry.query}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '2px 8px 2px 10px',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '999px',
                              background: 'rgba(255, 255, 255, 0.045)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => runRecentTopbarSearch(entry)}
                              title={`Search ${entry.query}`}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                fontSize: '0.76rem',
                                fontWeight: 800,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                cursor: 'pointer',
                                padding: 0,
                                outline: 'none'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                            >
                              {entry.query}
                            </button>
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                deleteRecentSearchEntry(entry.query, entry.sourceId);
                                setRecentSearchEntries(getRecentCachedSearches());
                              }}
                              title="Delete query"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'rgba(255,255,255,0.4)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '2px',
                                borderRadius: '50%',
                                outline: 'none'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.color = '#f87171'}
                              onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
                            >
                              {Icons.close}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="app-topbar__tray-results">
                    {/* Songs Tab Results */}
                    {(!topbarSearchQuery.trim() || quickSearchTab === 'tracks') && (
                      <>
                        <div className="app-topbar__tray-section-title">
                          <span>{isSearching ? 'Searching...' : topbarTrayResults.length > 0 ? 'Songs' : 'No songs yet'}</span>
                          {searchResultsSource === 'cache' && <small>saved locally</small>}
                        </div>

                        {topbarTrayResults.length > 0 ? (
                          <div className="app-topbar__result-list">
                            {topbarTrayResults.map((song) => (
                              <div
                                key={`${song.sourceId || 'music'}:${song.id}`}
                                className="app-topbar__result-item"
                              >
                                <button
                                  type="button"
                                  className="app-topbar__result-main"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    startTrackOnActiveReceiver(song, searchResults);
                                    setTopbarSearchTrayOpen(false);
                                  }}
                                >
                                  <img src={song.artworkUrl || '/icon.svg'} alt="" />
                                  <span>
                                    <strong>{song.title}</strong>
                                    <small>
                                      {song.artists.map((artist) => artist.name).join(', ')}
                                      <em>{trackSourceLabel(song)}</em>
                                    </small>
                                  </span>
                                </button>
                                {renderSongShareButton(song, 'app-topbar__result-share')}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="app-topbar__tray-empty">
                            {topbarSearchQuery.trim()
                              ? 'No songs found matching this query.'
                              : 'Pick a previous query or type a new search.'}
                          </p>
                        )}
                      </>
                    )}

                    {/* Users Tab Results */}
                    {topbarSearchQuery.trim() && quickSearchTab === 'users' && (
                      <>
                        <div className="app-topbar__tray-section-title">
                          <span>{isSearchingTopbarUsers ? 'Searching...' : topbarUserSearchResults.length > 0 ? 'Listeners' : 'No listeners yet'}</span>
                        </div>

                        {topbarUserSearchResults.length > 0 ? (
                          <div className="app-topbar__result-list">
                            {topbarUserSearchResults.slice(0, 8).map((user) => {
                              const hasAvatar = !!user.avatarUrl;
                              const isSelf = user.id === cloudUser?.id;
                              return (
                                <div
                                  key={`${user.id}:${user.profileId || user.username}`}
                                  className="app-topbar__result-item"
                                >
                                  <button
                                    type="button"
                                    className="app-topbar__result-main"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                      handleSelectUser(user);
                                      setTopbarSearchTrayOpen(false);
                                    }}
                                  >
                                    {hasAvatar ? (
                                      <img src={user.avatarUrl} alt="" style={{ borderRadius: '50%' }} />
                                    ) : (
                                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: user.gradient || 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: '0.85rem', flexShrink: 0 }}>
                                        {user.displayName.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <span>
                                      <strong>
                                        {user.displayName} {isSelf && <span style={{ fontSize: '0.68rem', background: 'rgba(236, 72, 153, 0.12)', padding: '1px 4px', borderRadius: '3px', marginLeft: '4px', color: 'var(--accent-pink)' }}>You</span>}
                                      </strong>
                                      <small>
                                        @{user.username}
                                      </small>
                                    </span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="app-topbar__tray-empty">
                            {isSearchingTopbarUsers ? 'Finding users...' : 'No users found matching this query.'}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="app-topbar__actions">
              <div className="app-topbar__notification-shell">
                <button
                  className={`app-topbar__notification ${notificationTrayOpen ? 'active' : ''}`}
                  type="button"
                  onClick={() => {
                    setNotificationTrayOpen((open) => !open);
                    setTopbarSearchTrayOpen(false);
                    setProfileMenuOpen(false);
                  }}
                  aria-label={`Open notifications${notificationCount > 0 ? ` (${notificationCount} waiting)` : ''}`}
                  aria-expanded={notificationTrayOpen}
                  title="Notifications"
                >
                  {Icons.bell}
                  {notificationCount > 0 && (
                    <span className="app-topbar__notification-badge">{notificationCountLabel}</span>
                  )}
                </button>

                {notificationTrayOpen && (
                  <div className="app-topbar__notification-tray" role="region" aria-label="SPICE notifications">
                    <div className="app-topbar__notification-header">
                      <div>
                        <span>Notifications</span>
                        <strong>{notificationCount > 0 ? `${notificationCount} waiting` : 'All caught up'}</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {unreadReleaseNotifications.length > 0 && (
                          <button
                            type="button"
                            className="app-topbar__notification-action"
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            onClick={markAllReleaseNotificationsAsRead}
                          >
                            Mark all read
                          </button>
                        )}
                        <button
                          type="button"
                          className="app-topbar__tray-close"
                          onClick={() => setNotificationTrayOpen(false)}
                          aria-label="Close notifications"
                        >
                          {Icons.close}
                        </button>
                      </div>
                    </div>

                    <div className="app-topbar__notification-section">
                      <span className="app-topbar__notification-section-title">Version updates</span>
                      {releaseNotifications.map((notification) => {
                        const isUnread = !readReleaseNotificationIds.includes(notification.id);
                        return (
                          <div key={notification.id} className={`app-topbar__notification-item ${isUnread ? 'is-unread' : ''}`}>
                            <div className="app-topbar__notification-copy">
                              <span>{notification.version}</span>
                              <strong>{notification.title}</strong>
                              <p>{notification.summary}</p>
                            </div>
                            <button
                              type="button"
                              className="app-topbar__notification-action"
                              onClick={() => openReleaseNotification(notification)}
                            >
                              View
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="app-topbar__notification-section">
                      <span className="app-topbar__notification-section-title">Shared playlist requests</span>
                      {pendingInvitesLoading && pendingInvites.length === 0 ? (
                        <p className="app-topbar__notification-empty">Checking for playlist requests...</p>
                      ) : pendingInvites.length > 0 ? (
                        pendingInvites.map((invite) => (
                          <div key={invite.playlistId} className="app-topbar__notification-item app-topbar__notification-item--request">
                            <div className="app-topbar__notification-copy">
                              <span>Join request</span>
                              <strong>{invite.playlistTitle}</strong>
                              <p>{invite.ownerDisplayName} (@{invite.ownerUsername || 'unknown'}) invited you to join.</p>
                            </div>
                            <div className="app-topbar__notification-actions">
                              <button
                                type="button"
                                className="app-topbar__notification-action"
                                onClick={() => handleRejectInvite(invite.playlistId)}
                                disabled={acceptingInvite}
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                className="app-topbar__notification-action app-topbar__notification-action--primary"
                                onClick={() => handleAcceptInvite(invite.playlistId)}
                                disabled={acceptingInvite}
                              >
                                Accept
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="app-topbar__notification-empty">
                          Playlist requests will appear here before anything joins your library.
                        </p>
                      )}
                    </div>

                    <div className="app-topbar__notification-section">
                      <span className="app-topbar__notification-section-title">Listen Together requests</span>
                      {pendingListenInvites.length > 0 ? (
                        pendingListenInvites.map((invite) => (
                          <div key={invite.inviteId} className="app-topbar__notification-item app-topbar__notification-item--request">
                            <div className="app-topbar__notification-copy">
                              <span>Listen together request</span>
                              <strong>Invite from {invite.hostDisplayName || 'User'}</strong>
                              <p>@{invite.hostUsername} invited you to listen together in a real-time session.</p>
                            </div>
                            <div className="app-topbar__notification-actions">
                              <button
                                type="button"
                                className="app-topbar__notification-action"
                                onClick={() => handleRespondToListenTogetherInvite(invite.inviteId, 'reject')}
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                className="app-topbar__notification-action app-topbar__notification-action--primary"
                                onClick={() => {
                                  void handleRespondToListenTogetherInvite(invite.inviteId, 'accept');
                                  setNotificationTrayOpen(false);
                                }}
                              >
                                Accept
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="app-topbar__notification-empty">
                          No pending Listen Together invitations.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                className={`app-topbar__settings ${currentPage === 'settings' && !selectedPlaylist ? 'active' : ''}`}
                type="button"
                onClick={openSettingsFromTopbar}
                aria-label="Open settings"
                title="Settings"
              >
                {Icons.settings}
              </button>
              <div className="app-topbar__profile-shell" ref={topbarProfileShellRef}>
                <button
                  className={`app-topbar__profile ${profileMenuOpen ? 'active' : ''}`}
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen((open) => !open);
                    setNotificationTrayOpen(false);
                    setTopbarSearchTrayOpen(false);
                  }}
                  aria-label={`Open profile menu for ${activeProfile.displayName}`}
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                >
                  <span className="app-topbar__avatar" style={{ background: activeProfile.avatarUrl ? 'transparent' : activeProfile.gradient }}>
                    {activeProfile.avatarUrl ? (
                      <img src={activeProfile.avatarUrl} alt="" />
                    ) : (
                      activeProfile.displayName.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="app-topbar__profile-copy">
                    <strong>{activeProfile.displayName}</strong>
                    <small>{isMounted && cloudUser?.accountRole ? `${cloudUser.accountRole} account` : 'Local profile'}</small>
                  </span>
                </button>
                {profileMenuOpen && (
                  <div className="app-topbar__profile-menu" role="menu" aria-label="Profile actions">
                    <div className="app-topbar__profile-menu-identity">
                      <strong>{activeProfile.displayName}</strong>
                      <span>{cloudUsername ? `@${cloudUsername}` : 'Stored on this device'}</span>
                    </div>
                    <button type="button" role="menuitem" onClick={openAccountFromTopbar}>
                      {Icons.account}
                      <span>Account and profile</span>
                    </button>
                    <button type="button" role="menuitem" onClick={openSettingsFromTopbar}>
                      {Icons.settings}
                      <span>Settings</span>
                    </button>
                    {cloudToken && (
                      <button
                        type="button"
                        role="menuitem"
                        className="app-topbar__profile-menu-signout"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          handleLogout();
                        }}
                      >
                        {Icons.close}
                        <span>Sign out of SPICE Cloud</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </header>

          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px 20px', borderRadius: '8px', marginBottom: '24px', color: '#f87171', display: 'flex', alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>{Icons.alertTriangle} {error}</span>
              <button onClick={() => setError(undefined)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'inline-flex' }} title="Dismiss error">{Icons.close}</button>
            </div>
          )}

          {/* ── Playlist Details View (Intercepts regular screens) ── */}
          {selectedPlaylist ? (
            <div className="animate-in">
              <button
                onClick={() => setSelectedPlaylist(null)}
                className="playlist-back-btn"
              >
                {Icons.back} {selectedUser ? 'Back to Profile' : 'Back to Library'}
              </button>

              {/* Hero banner */}
              <div className="playlist-hero" style={{ '--pl-gradient': selectedPlaylist.gradient } as React.CSSProperties}>
                <div className="playlist-hero__bg" />

                {isPlaylistOwner && (
                  <button
                    className="playlist-hero__edit-btn"
                    onClick={() => {
                      setEditPlTitle(selectedPlaylist.title);
                      setEditPlDesc(selectedPlaylist.description || '');
                      setEditPlGradient(selectedPlaylist.gradient);
                      setEditPlCoverUrl(selectedPlaylist.coverUrl || '');
                      setShowEditPlaylistDialog(true);
                    }}
                    title="Edit Playlist"
                  >
                    {Icons.edit} Edit Playlist
                  </button>
                )}

                <div className="playlist-hero__body">
                  {/* Cover art */}
                  <div className="playlist-hero__cover">
                    <span className="playlist-hero__cover-icon">{Icons.musicNote}</span>
                    <PlaylistCoverImage playlist={selectedPlaylist} alt={selectedPlaylist.title} />
                  </div>

                  {/* Info */}
                  <div className="playlist-hero__info">
                    <span className="playlist-hero__tag">
                      {selectedPlaylist.shared
                        ? (isPlaylistOwner ? '✦ Collaborative playlist' : '✦ Shared with you')
                        : 'Playlist'}
                    </span>
                    <h1 className="playlist-hero__title">{selectedPlaylist.title}</h1>
                    {selectedPlaylist.description && selectedPlaylist.description !== '[object Object]' && (
                      <p className="playlist-hero__desc">{selectedPlaylist.description}</p>
                    )}
                    <p className="playlist-hero__meta">
                      {selectedPlaylist.shared
                        ? (selectedPlaylist.ownerDisplayName ? `by ${selectedPlaylist.ownerDisplayName}` : 'Shared')
                        : `Created ${selectedPlaylist.createdAt}`}
                      {' · '}{selectedPlaylist.tracks.length} {selectedPlaylist.tracks.length === 1 ? 'track' : 'tracks'}
                    </p>
                  </div>
                </div>

                {/* Action bar sits at the bottom of the hero */}
                <div className="playlist-hero__actions">
                  {selectedPlaylist.tracks.length > 0 && (
                    <button
                      className="btn btn--primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => startTrackOnActiveReceiver(
                        selectedPlaylist.tracks[0],
                        selectedPlaylist.tracks,
                        selectedPlaylist.id,
                      )}
                    >
                      {Icons.play} Play all
                    </button>
                  )}
                  {selectedPlaylist.tracks.length > 0 && (
                    <button
                      className="btn btn--ghost playlist-hero__action-btn"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => shufflePlaylistPlay(selectedPlaylist)}
                    >
                      {Icons.shuffle} Shuffle Play
                    </button>
                  )}
                  {selectedPlaylist.tracks.length > 0 && (
                    <button
                      className="btn btn--ghost playlist-hero__action-btn"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => {
                        if (playlistDownloadProgress?.playlistId === selectedPlaylist.id) {
                          cancelPlaylistDownload();
                        } else {
                          void downloadPlaylistToOfflineLibrary(selectedPlaylist);
                        }
                      }}
                      disabled={Boolean(
                        playlistDownloadProgress
                        && playlistDownloadProgress.playlistId !== selectedPlaylist.id
                      )}
                    >
                      {playlistDownloadProgress?.playlistId === selectedPlaylist.id
                        ? <>{Icons.close} Stop {playlistDownloadProgress.completed}/{playlistDownloadProgress.total}</>
                        : <>{Icons.download} Download playlist</>}
                    </button>
                  )}
                  {(!selectedPlaylist.shared || isPlaylistOwner) && (
                    <button
                      className="btn btn--ghost playlist-hero__action-btn"
                      onClick={() => sharePlaylist(selectedPlaylist)}
                      disabled={sharingPlaylistId === selectedPlaylist.id}
                    >
                      {Icons.clipboard}
                      {sharingPlaylistId === selectedPlaylist.id
                        ? 'Preparing…'
                        : selectedPlaylist.shared ? 'New Invite Link' : 'Share Playlist'}
                    </button>
                  )}
                  {selectedPlaylist.shared && isPlaylistUuid(selectedPlaylist.id) && (
                    <button
                      className="btn btn--ghost playlist-hero__action-btn"
                      onClick={() => {
                        setShowMembersPanel(!showMembersPanel);
                        if (!showMembersPanel) fetchPlaylistMembers(selectedPlaylist.id);
                      }}
                    >
                      {Icons.account} Spicers
                    </button>
                  )}
                  {!isPlaylistOwner && (
                    <button
                      className="btn playlist-hero__action-btn playlist-hero__action-btn--danger"
                      onClick={() => {
                        requestSpiceConfirm({
                          title: 'Leave Shared Playlist?',
                          message: 'It will be removed from your library.',
                          confirmLabel: 'Leave Playlist',
                          kind: 'danger',
                          onConfirm: () => deletePlaylist(selectedPlaylist.id),
                        });
                      }}
                    >
                      {Icons.trash} Leave
                    </button>
                  )}
                </div>
              </div>

              {/* Share / invite status toast */}
              {shareStatus && (
                <div className="playlist-status-toast">
                  <span>{shareStatus}</span>
                  <button onClick={() => setShareStatus(null)} aria-label="Dismiss" className="playlist-status-toast__close">{Icons.close}</button>
                </div>
              )}

              {/* Spicers Panel */}
              {showMembersPanel && (
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', margin: '24px auto', maxWidth: '800px' }} className="animate-in">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'Outfit, sans-serif' }}>Playlist Spicers</h3>
                      {selectedPlaylist && (
                        <button
                          className="btn btn--ghost"
                          style={{ padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onClick={() => fetchPlaylistMembers(selectedPlaylist.id)}
                          title="Refresh Spicers"
                          disabled={membersLoading}
                        >
                          <div style={{ display: 'flex', animation: membersLoading ? 'spin 1s linear infinite' : 'none' }}>
                            {Icons.refresh}
                          </div>
                        </button>
                      )}
                    </div>
                    <button className="btn btn--ghost" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => setShowMembersPanel(false)}>
                      Close
                    </button>
                  </div>

                  {membersLoading ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading spicers...</div>
                  ) : (
                    <div>
                      {membersList && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                          {/* Owner */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: membersList.owner.avatarUrl ? 'none' : 'linear-gradient(135deg, #a855f7, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem', color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                              {membersList.owner.avatarUrl ? <img src={membersList.owner.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : membersList.owner.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{membersList.owner.displayName}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Owner</div>
                            </div>
                          </div>

                          {/* Members */}
                          {membersList.members.map((m) => (
                            <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: m.avatarUrl ? 'none' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem', color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                                {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.displayName.charAt(0).toUpperCase()}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.displayName}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  {m.status === 'pending' ? `Join request pending (${m.role})` : `Spicer (${m.role})`}
                                </div>
                              </div>
                              {/* Kick option if caller is owner */}
                              {isPlaylistOwner && (
                                <button
                                  onClick={() => removeMember(selectedPlaylist.id, m.userId)}
                                  style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Invite section if caller is owner */}
                      {isPlaylistOwner && (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Add a Spicer (by Username)</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              placeholder="e.g. @sound_lover"
                              value={inviteUsername}
                              onChange={(e) => setInviteUsername(e.target.value)}
                              style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 12px', fontSize: '0.85rem', color: '#fff' }}
                            />
                            <button
                              className="btn btn--primary"
                              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                              onClick={() => inviteMember(selectedPlaylist.id)}
                              disabled={invitingMember || !inviteUsername.trim()}
                            >
                              {invitingMember ? 'Inviting...' : 'Invite'}
                            </button>
                          </div>
                          {memberActionStatus && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--accent-pink)', marginTop: '6px' }}>
                              {memberActionStatus}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <section className="section" style={{ marginTop: '32px' }}>
                {selectedPlaylist.tracks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <p style={{ fontSize: '1.2rem', marginBottom: '8px', color: '#fff' }}>This playlist is empty</p>
                    <p style={{ fontSize: '0.9rem', marginBottom: '16px' }}>
                      Search and add your favorite tracks
                    </p>
                    <button className="btn btn--primary" onClick={() => { setSelectedPlaylist(null); setSelectedUser(null); setCurrentPage('search'); }}>
                      Search Tracks
                    </button>
                  </div>
                ) : (
                  <VirtualTrackRows
                    tracks={selectedPlaylist.tracks}
                    height={`min(64vh, 720px, ${selectedPlaylist.tracks.length * PLAYLIST_ROW_HEIGHT_PX}px)`}
                    resetKey={selectedPlaylist.id}
                    className="playlist-track-window"
                    ariaLabel={`${selectedPlaylist.title} tracks`}
                    renderRow={(song, i) => {
                      const isLiked = likedTracks.has(song.id);
                      const isPlayingCurrent = playerTrack.id === song.id;
                      return (
                        <div className="library-item">
                          <span className="library-item__index" style={{ width: '24px', color: 'var(--text-secondary)' }}>{i + 1}</span>
                          <button
                            type="button"
                            className="library-item__play"
                            onClick={() => startTrackOnActiveReceiver(
                              song,
                              selectedPlaylist.tracks,
                              selectedPlaylist.id,
                            )}
                            aria-label={`Play ${song.title}`}
                            aria-current={isPlayingCurrent ? 'true' : undefined}
                          >
                            <img
                              className="library-item__art"
                              src={song.artworkUrl || '/icon.svg'}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                              draggable={false}
                            />
                            <span className="library-item__info">
                              <span className="library-item__title" style={isPlayingCurrent ? { color: 'var(--accent-pink)' } : {}}>
                                {song.title}
                              </span>
                              <span className="library-item__subtitle">
                                {song.artists.map(a => a.name).join(', ')}
                                {selectedPlaylist.shared && song.addedBy && (
                                  <span style={{ marginLeft: '8px', fontSize: '0.72rem', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent-pink)', border: '1px solid rgba(255,255,255,0.04)' }}>
                                    Added by {song.addedBy.displayName}
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>

                          {(isPlaylistOwner || (selectedPlaylist.shared && song.addedBy?.userId === cloudUser?.id)) && (
                            <button
                              className="library-item__action"
                              style={{ opacity: 1, color: '#ef4444', marginRight: '8px' }}
                              onClick={() => removeTrackFromPlaylist(song.id, selectedPlaylist.id, i)}
                              title="Remove from playlist"
                            >
                              {Icons.trash}
                            </button>
                          )}

                          <button
                            className="library-item__action"
                            style={{ opacity: 1, color: isLiked ? 'var(--accent-pink)' : 'var(--text-muted)' }}
                            onClick={() => toggleLike(song)}
                            title={isLiked ? `Unlike ${song.title}` : `Like ${song.title}`}
                            aria-label={isLiked ? `Unlike ${song.title}` : `Like ${song.title}`}
                          >
                            {isLiked ? Icons.heartFilled : Icons.heart}
                          </button>
                        </div>
                      );
                    }}
                  />
                )}
              </section>
            </div>
          ) : selectedUser ? (
            <div className="animate-in">
              <button
                onClick={() => setSelectedUser(null)}
                className="playlist-back-btn"
                style={{ marginBottom: '24px' }}
              >
                {Icons.back} Back to Search
              </button>

              {isLoadingUserProfile || !selectedUserProfileData ? (
                <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-secondary)' }}>
                  <div className="loader-glow" style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Loading profile...</div>
                </div>
              ) : (
                <>
                  {/* Premium Profile Header Card */}
                  <div className="playlist-hero" style={{ '--pl-gradient': selectedUserProfileData.profile.gradient || 'linear-gradient(135deg, #a855f7, #ec4899)' } as React.CSSProperties}>
                    <div className="playlist-hero__bg" />

                    {/* Like and Invite buttons in header */}
                    <div style={{ position: 'absolute', top: '24px', right: '24px', zIndex: 10, display: 'flex', gap: '12px' }}>
                      {selectedUser.id !== cloudUser?.id && (
                        <button
                          onClick={() => handleInviteUserProfileToListenTogether(selectedUserProfileData.profile.username)}
                          disabled={!cloudToken || isCreatingListenTogetherSession}
                          className="btn"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'rgba(0, 0, 0, 0.4)',
                            backdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '50px',
                            padding: '8px 16px',
                            color: '#fff',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            transition: 'all 0.2s ease',
                            cursor: 'pointer',
                          }}
                          title="Invite user to Listen Together"
                        >
                          <span style={{ display: 'inline-flex', color: 'var(--accent-pink)' }}>{Icons.listenTogether}</span>
                          <span>Invite to Listen</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleProfileLike(selectedUser.id)}
                        disabled={selectedUser.id === cloudUser?.id}
                        className="btn"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          background: 'rgba(0, 0, 0, 0.4)',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '50px',
                          padding: '8px 16px',
                          color: selectedUserProfileData.isLikedByMe ? '#ef4444' : '#fff',
                          cursor: selectedUser.id === cloudUser?.id ? 'default' : 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {selectedUserProfileData.isLikedByMe ? Icons.heartFilled : Icons.heart}
                        <span>{selectedUserProfileData.likesCount.toLocaleString()} {selectedUserProfileData.likesCount === 1 ? 'Like' : 'Likes'}</span>
                      </button>
                    </div>

                    <div className="playlist-hero__body" style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                      {selectedUserProfileData.profile.avatarUrl ? (
                        <img
                          src={selectedUserProfileData.profile.avatarUrl}
                          alt={selectedUserProfileData.profile.displayName}
                          style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '4px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '120px',
                            height: '120px',
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '3rem',
                            fontWeight: 800,
                            color: '#fff',
                            border: '4px solid rgba(255,255,255,0.1)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                          }}
                        >
                          {selectedUserProfileData.profile.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2.5rem', fontWeight: 800, margin: 0, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>
                          {selectedUserProfileData.profile.displayName}
                        </h1>
                        <p style={{ margin: '4px 0 12px 0', fontSize: '1rem', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                          @{selectedUserProfileData.profile.username}
                        </p>
                        {!selectedUserProfileData.profile.isPrivate && (
                          <p style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#e4e4e7', maxWidth: '500px', lineHeight: '1.4' }}>
                            {selectedUserProfileData.profile.bio}
                          </p>
                        )}
                        <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.12)', padding: '6px 12px', borderRadius: '50px', color: '#fff', fontWeight: 500, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          Listener since {selectedUserProfileData.profile.joinedAt}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Restricted/Private profile message */}
                  {selectedUserProfileData.profile.isPrivate ? (
                    <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', marginTop: '24px' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
                      <h3 style={{ color: '#fff', fontSize: '1.3rem', marginBottom: '8px' }}>This profile is private</h3>
                      <p style={{ fontSize: '0.9rem', maxWidth: '320px', margin: '0 auto' }}>
                        Stats and custom playlists are hidden by this listener.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Stats Cards Section */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '24px' }}>
                        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', textAlign: 'center', transition: 'transform 0.2s ease' }}>
                          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ef4444', marginBottom: '4px', fontFamily: 'Outfit, sans-serif' }}>
                            {selectedUserProfileData.stats?.songsPlayed.toLocaleString() ?? 0}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                            Songs Streamed
                          </div>
                        </div>
                        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', textAlign: 'center', transition: 'transform 0.2s ease' }}>
                          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ef4444', marginBottom: '4px', fontFamily: 'Outfit, sans-serif' }}>
                            {selectedUserProfileData.stats?.likedCount.toLocaleString() ?? 0}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                            Liked Songs
                          </div>
                        </div>
                        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', textAlign: 'center', transition: 'transform 0.2s ease' }}>
                          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f59e0b', marginBottom: '4px', fontFamily: 'Outfit, sans-serif' }}>
                            {selectedUserProfileData.stats?.playlistsCount ?? 0}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                            Playlists
                          </div>
                        </div>
                      </div>

                      {/* Playlists grid */}
                      <section className="section" style={{ marginTop: '36px' }}>
                        <div className="section__header">
                          <h2 className="section__title">Playlists</h2>
                        </div>
                        {selectedUserProfileData.playlists.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                            <p>No public playlists created by this listener yet.</p>
                          </div>
                        ) : (
                          <div className="genre-grid">
                            {selectedUserProfileData.playlists.map((pl: Playlist) => (
                              <div
                                key={pl.id}
                                className="genre-card animate-in"
                                style={{ background: pl.gradient || 'var(--accent-gradient)', cursor: 'pointer' }}
                                onClick={() => setSelectedPlaylist(pl)}
                              >
                                <span className="genre-card__title" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{pl.title}</span>
                                <span className="genre-card__icon" style={{ fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '4px' }}>
                                  {pl.tracks.length} tracks
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              {/* ── Home Page ── */}
              {currentPage === 'home' && (
                <>
                  {/* cover greetings header */}
                  <section style={{ marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '14px 18px', borderRadius: '12px', backdropFilter: 'blur(10px)' }} className="home-greeting animate-in">
                    <div className="home-greeting__copy">
                      <h1 style={{
                        fontFamily: 'Outfit, sans-serif',
                        fontSize: '1.55rem',
                        fontWeight: 800,
                        margin: '0 0 2px 0',
                        display: 'inline-block',
                        background: 'var(--accent-gradient)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        color: '#fff'
                      }}>
                        Welcome back, {activeProfile.displayName}!
                      </h1>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0 }}>
                        Discover, stream, and sync your favorite music across all your devices.
                      </p>
                    </div>
                    <div className="home-greeting__avatar" style={{ width: '54px', height: '54px', borderRadius: '50%', background: activeProfile.avatarUrl ? 'none' : activeProfile.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem', fontWeight: 900, color: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,0.34)', textShadow: activeProfile.avatarUrl ? 'none' : '0 2px 8px rgba(0,0,0,0.3)', flexShrink: 0, overflow: 'hidden', border: '2px solid rgba(255, 255, 255, 0.1)' }}>
                      {activeProfile.avatarUrl ? (
                        <img src={activeProfile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        activeProfile.displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                  </section>

                  {weeklyListeningRecap.eventCount > 0 && (
                    <section className="section weekly-recap animate-in" aria-label="Your listening week">
                      <div className="section__header">
                        <div>
                          <h2 className="section__title">Your Listening Week</h2>
                          <p className="taste-section-reason">
                            Private, on-device recap for {activeProfile.displayName}. Nothing extra is uploaded.
                          </p>
                        </div>
                        {weeklyListeningRecap.topArtists[0] && (
                          <span className="taste-profile-badge">
                            Top artist: {weeklyListeningRecap.topArtists[0].name}
                          </span>
                        )}
                      </div>
                      <div className="weekly-recap__grid">
                        <div className="weekly-recap__metric"><strong>{weeklyListeningRecap.creditedMinutes}</strong><span>minutes</span></div>
                        <div className="weekly-recap__metric"><strong>{weeklyListeningRecap.uniqueTrackCount}</strong><span>unique tracks</span></div>
                        <div className="weekly-recap__metric"><strong>{weeklyListeningRecap.discoveryPercent}%</strong><span>discoveries</span></div>
                        <div className="weekly-recap__metric"><strong>{weeklyListeningRecap.longestSessionMinutes}</strong><span>longest session, min</span></div>
                      </div>
                    </section>
                  )}

                  {/* Your Playlists Carousel */}
                  {customPlaylists.length > 0 && (
                    <section className="section animate-in">
                      <div className="section__header">
                        <h2 className="section__title">Your Playlists</h2>
                        <button onClick={() => { setCurrentPage('library'); setSelectedPlaylist(null); setSelectedUser(null); }} style={{ background: 'none', border: 'none', color: 'var(--accent-pink)', fontSize: '0.85rem', cursor: 'pointer' }}>View All</button>
                      </div>
                      <div className="carousel-wrapper">
                        <div className="carousel">
                          {customPlaylists.map((pl) => (
                            <div key={pl.id} className="card animate-in" onClick={() => setSelectedPlaylist(pl)}>
                              <div className="card__art-wrapper" style={{ background: pl.gradient || PRESET_GRADIENTS[0], display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ fontSize: '3rem', textShadow: '0 4px 12px rgba(0,0,0,0.3)', color: '#fff', position: 'relative', zIndex: 1 }}>{Icons.musicFolder}</div>
                                <PlaylistCoverImage
                                  playlist={pl}
                                  alt={pl.title}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, zIndex: 2 }}
                                />
                                <div className="card__play-overlay">{Icons.play}</div>
                              </div>
                              <div className="card__title truncate" style={{ marginTop: '8px', fontWeight: 600 }}>{pl.title}</div>
                              <div className="card__subtitle truncate">
                                {pl.tracks.length} tracks{pl.shared ? ' | Shared' : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Recently Played */}
                  {homeHistoryShelves.recentlyPlayed.length > 0 && (
                    <section className="section animate-in">
                      <div className="section__header">
                        <h2 className="section__title">Recently Played</h2>
                        <button onClick={clearHistory} style={{ background: 'none', border: 'none', color: 'var(--accent-pink)', fontSize: '0.85rem', cursor: 'pointer' }}>Clear</button>
                      </div>
                      <div className="carousel-wrapper">
                        <div className="carousel">
                          {homeHistoryShelves.recentlyPlayed.map((song) => (
                            <div key={playbackTrackKey(song)} className="card card--round animate-in" onClick={() => startTrackOnActiveReceiver(song, homeHistoryShelves.recentlyPlayed)}>
                              <div className="card__art-wrapper">
                                <img className="card__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} />
                                <div className="card__play-overlay">{Icons.play}</div>
                              </div>
                              <div className="card__title truncate">{song.title}</div>
                              <div className="card__subtitle truncate">{song.artists.map(a => a.name).join(', ')}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Forgotten Favorites */}
                  {homeHistoryShelves.forgottenFavorites.length > 0 && (
                    <section className="section animate-in">
                      <div className="section__header">
                        <h2 className="section__title">Forgotten Favorites</h2>
                      </div>
                      <div className="carousel-wrapper">
                        <div className="carousel">
                          {homeHistoryShelves.forgottenFavorites.map((song) => (
                            <div key={playbackTrackKey(song)} className="card animate-in" onClick={() => startTrackOnActiveReceiver(song, homeHistoryShelves.forgottenFavorites)}>
                              <div className="card__art-wrapper">
                                <img className="card__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} />
                                <div className="card__play-overlay">{Icons.play}</div>
                              </div>
                              <div className="card__title truncate">{song.title}</div>
                              <div className="card__subtitle truncate">{song.artists.map(a => a.name).join(', ')}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Profile-scoped recommendations */}
                  {!privateTasteProfile.isReady ? (
                    <section className="section animate-in">
                      <div className="section__header">
                        <div>
                          <h2 className="section__title">Recommended Next</h2>
                          <p className="taste-learning__eyebrow">Learns separately for {activeProfile.displayName}</p>
                        </div>
                      </div>
                      <div className="taste-learning">
                        <div className="taste-learning__icon" aria-hidden="true">{Icons.musicFolder}</div>
                        <div className="taste-learning__copy">
                          <h3>Your taste is still warming up</h3>
                          <p>
                            Listen through or like {Math.max(1, privateTasteProfile.signalsNeeded)} more
                            {' '}song{privateTasteProfile.signalsNeeded === 1 ? '' : 's'} so SPICE can find patterns that last.
                            Quick skips barely count, and one song will not reshape this profile.
                          </p>
                          <div className="taste-learning__progress" aria-label="Taste profile learning progress">
                            <span style={{ width: `${Math.min(100, Math.round((privateTasteProfile.evidenceUnits / 6) * 100))}%` }} />
                          </div>
                          <span className="taste-learning__status">
                            {privateTasteProfile.evidenceTrackCount} meaningful track{privateTasteProfile.evidenceTrackCount === 1 ? '' : 's'} learned
                          </span>
                        </div>
                      </div>
                    </section>
                  ) : (
                    <section className="section animate-in">
                      <div className="section__header">
                        <div>
                          <h2 className="section__title">
                            Recommended Next
                            <span className="taste-profile-badge">
                              {activeProfile.displayName}&apos;s mix
                            </span>
                          </h2>
                          <p className="taste-section-reason">
                            Balanced from this profile&apos;s meaningful plays, likes, artists, albums, and playlist themes.
                          </p>
                          <div className="recommendation-discovery-control">
                            <span>Familiar</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={recommendationPreferences.discoveryLevel}
                              aria-label="Recommendation discovery level"
                              onChange={(event) => persistRecommendationPreferences({
                                ...recommendationPreferences,
                                discoveryLevel: Number(event.target.value),
                              })}
                            />
                            <span>Discover</span>
                            <button
                              type="button"
                              className="recommendation-feedback-button"
                              onClick={() => persistRecommendationPreferences(DEFAULT_RECOMMENDATION_PREFERENCES)}
                            >
                              Reset feedback
                            </button>
                          </div>
                        </div>
                        {homeRecommendationSeed && (
                          <button
                            onClick={() => {
                              setCurrentPage('search');
                              setSelectedPlaylist(null);
                              setSelectedUser(null);
                              setSearchQuery(homeRecommendationSeed.query);
                              queueSearch(homeRecommendationSeed.query);
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-pink)', fontSize: '0.85rem', cursor: 'pointer' }}
                          >
                            Open Search
                          </button>
                        )}
                      </div>
                      <div className="carousel-wrapper">
                        <div className="carousel">
                          {isLoadingRecommendations && homeRecommended.length === 0 ? (
                            [...Array(4)].map((_, i) => (
                              <div key={i} style={{ width: '180px', height: '220px', background: 'var(--card-bg)', borderRadius: '12px', flexShrink: 0 }} />
                            ))
                          ) : (
                            homeRecommended.map((song) => (
                              <div key={`${song.sourceId || 'youtube_music'}:${song.id}`} className="card animate-in" onClick={() => startTrackOnActiveReceiver(song, homeRecommended)}>
                                <div className="card__art-wrapper">
                                  <img className="card__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} />
                                  <div className="card__play-overlay">{Icons.play}</div>
                                </div>
                                <div className="card__title truncate">{song.title}</div>
                                <div className="card__subtitle truncate">{song.artists.map(a => a.name).join(', ')}</div>
                                {recommendationFeedbackControls(song)}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </section>
                  )}

                  {privateTasteProfile.isReady && homeBecauseShelf && homeBecauseShelf.tracks.length > 0 && (
                    <section className="section animate-in">
                      <div className="section__header">
                        <div>
                          <h2 className="section__title">{homeBecauseShelf.label}</h2>
                          <p className="taste-section-reason">{homeBecauseShelf.reason}</p>
                        </div>
                      </div>
                      <div className="carousel-wrapper">
                        <div className="carousel">
                          {homeBecauseShelf.tracks.map((song) => (
                            <div
                              key={`because:${song.sourceId || 'youtube_music'}:${song.id}`}
                              className="card animate-in"
                              onClick={() => startTrackOnActiveReceiver(song, homeBecauseShelf.tracks)}
                            >
                              <div className="card__art-wrapper">
                                <img className="card__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} />
                                <div className="card__play-overlay">{Icons.play}</div>
                              </div>
                              <div className="card__title truncate">{song.title}</div>
                              <div className="card__subtitle truncate">{song.artists.map(a => a.name).join(', ')}</div>
                              {recommendationFeedbackControls(song)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  {listenersLikeYou && listenersLikeYou.tracks.length > 0 && (
                    <section className="section animate-in">
                      <div className="section__header">
                        <div>
                          <h2 className="section__title">Listeners like you</h2>
                          <p className="taste-section-reason">
                            {listenersLikeYou.neighborCount > 0
                              ? `Community favorites from ${listenersLikeYou.neighborCount} listener${listenersLikeYou.neighborCount === 1 ? '' : 's'} whose taste overlaps yours. Counts only — no one's library is exposed.`
                              : 'Community favorites from listeners whose taste overlaps yours.'}
                          </p>
                        </div>
                      </div>
                      <div className="carousel-wrapper">
                        <div className="carousel">
                          {listenersLikeYou.tracks.map((song) => (
                            <div
                              key={`listeners:${song.sourceId || 'youtube_music'}:${song.id}`}
                              className="card animate-in"
                              onClick={() => startTrackOnActiveReceiver(song, listenersLikeYou.tracks)}
                            >
                              <div className="card__art-wrapper">
                                <img className="card__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} />
                                <div className="card__play-overlay">{Icons.play}</div>
                              </div>
                              <div className="card__title truncate">{song.title}</div>
                              <div className="card__subtitle truncate">{song.artists.map(a => a.name).join(', ')}</div>
                              {recommendationFeedbackControls(song)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  {privateTasteProfile.isReady && homeTimeMix && homeTimeMix.tracks.length > 0 && (
                    <section className="section animate-in">
                      <div className="section__header">
                        <div>
                          <h2 className="section__title">{homeTimeMix.label}</h2>
                          <p className="taste-section-reason">{homeTimeMix.reason}</p>
                        </div>
                      </div>
                      <div className="carousel-wrapper">
                        <div className="carousel">
                          {homeTimeMix.tracks.map((song) => (
                            <div
                              key={`timemix:${song.sourceId || 'youtube_music'}:${song.id}`}
                              className="card animate-in"
                              onClick={() => startTrackOnActiveReceiver(song, homeTimeMix.tracks)}
                            >
                              <div className="card__art-wrapper">
                                <img className="card__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} />
                                <div className="card__play-overlay">{Icons.play}</div>
                              </div>
                              <div className="card__title truncate">{song.title}</div>
                              <div className="card__subtitle truncate">{song.artists.map(a => a.name).join(', ')}</div>
                              {recommendationFeedbackControls(song)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  {privateTasteProfile.isReady && homeFreshFinds.length >= 3 && (
                    <section className="section animate-in">
                      <div className="section__header">
                        <div>
                          <h2 className="section__title">Fresh finds</h2>
                          <p className="taste-section-reason">Artists you have not played yet, picked near this profile&apos;s taste and rotated daily.</p>
                        </div>
                      </div>
                      <div className="carousel-wrapper">
                        <div className="carousel">
                          {homeFreshFinds.map((song) => (
                            <div
                              key={`fresh:${song.sourceId || 'youtube_music'}:${song.id}`}
                              className="card animate-in"
                              onClick={() => startTrackOnActiveReceiver(song, homeFreshFinds)}
                            >
                              <div className="card__art-wrapper">
                                <img className="card__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} />
                                <div className="card__play-overlay">{Icons.play}</div>
                              </div>
                              <div className="card__title truncate">{song.title}</div>
                              <div className="card__subtitle truncate">{song.artists.map(a => a.name).join(', ')}</div>
                              {recommendationFeedbackControls(song)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  {onRepeatShelf && onRepeatShelf.tracks.length > 0 && (
                    <section className="section animate-in">
                      <div className="section__header">
                        <div>
                          <h2 className="section__title">{onRepeatShelf.label}</h2>
                          <p className="taste-section-reason">{onRepeatShelf.reason}</p>
                        </div>
                      </div>
                      <div className="carousel-wrapper">
                        <div className="carousel">
                          {onRepeatShelf.tracks.map((song) => (
                            <div
                              key={`onrepeat:${song.sourceId || 'youtube_music'}:${song.id}`}
                              className="card animate-in"
                              onClick={() => startTrackOnActiveReceiver(song, onRepeatShelf.tracks)}
                            >
                              <div className="card__art-wrapper">
                                <img className="card__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} />
                                <div className="card__play-overlay">{Icons.play}</div>
                              </div>
                              <div className="card__title truncate">{song.title}</div>
                              <div className="card__subtitle truncate">{song.artists.map(a => a.name).join(', ')}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  {privateTasteProfile.isReady && homeRecommendationShelves.map((shelf) => (
                    <section key={shelf.seed.id} className="section animate-in">
                      <div className="section__header">
                        <div>
                          <h2 className="section__title">{shelf.seed.label}</h2>
                          <p className="taste-section-reason">{shelf.seed.reason}</p>
                        </div>
                      </div>
                      <div className="carousel-wrapper">
                        <div className="carousel">
                          {shelf.tracks.map((song) => (
                            <div
                              key={`${shelf.seed.id}:${song.sourceId || 'youtube_music'}:${song.id}`}
                              className="card animate-in"
                              onClick={() => startTrackOnActiveReceiver(song, shelf.tracks)}
                            >
                              <div className="card__art-wrapper">
                                <img className="card__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} />
                                <div className="card__play-overlay">{Icons.play}</div>
                              </div>
                              <div className="card__title truncate">{song.title}</div>
                              <div className="card__subtitle truncate">{song.artists.map(a => a.name).join(', ')}</div>
                              {recommendationFeedbackControls(song)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  ))}

                  {/* Quick Picks (dynamic charts) */}
                  <section className="section">
                    <div className="section__header">
                      <h2 className="section__title">Quick Picks</h2>
                    </div>
                    {isLoadingHome ? (
                      <div className="quick-grid quick-grid--skeleton">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="quick-card-skeleton"></div>
                        ))}
                      </div>
                    ) : (
                      <div className="quick-grid">
                        {homeTrending.slice(1, 7).map((song) => (
                          <div key={song.id} className="quick-card animate-in" onClick={() => startTrackOnActiveReceiver(song, homeTrending)}>
                            <img className="quick-card__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} />
                            <span className="quick-card__title truncate">{song.title}</span>
                            <div className="quick-card__play">{Icons.play}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                </>
              )}

              {/* ── Search Page ── */}
              {currentPage === 'search' && (
                <>
                  <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2rem', fontWeight: 800, marginBottom: '24px' }}>Search</h1>

                  {/* Sub-tabs for Tracks vs Users */}
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <button
                      onClick={() => setSearchTab('tracks')}
                      style={{ background: 'none', border: 'none', color: searchTab === 'tracks' ? 'var(--accent-pink)' : 'var(--text-secondary)', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', paddingBottom: '4px', borderBottom: searchTab === 'tracks' ? '2px solid var(--accent-pink)' : '2px solid transparent', transition: 'all 0.15s ease', outline: 'none' }}
                    >
                      Tracks
                    </button>
                    <button
                      onClick={() => setSearchTab('users')}
                      style={{ background: 'none', border: 'none', color: searchTab === 'users' ? 'var(--accent-pink)' : 'var(--text-secondary)', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', paddingBottom: '4px', borderBottom: searchTab === 'users' ? '2px solid var(--accent-pink)' : '2px solid transparent', transition: 'all 0.15s ease', outline: 'none' }}
                    >
                      Users
                    </button>
                  </div>

                  {searchTab === 'tracks' ? (
                    <>
                      <div className="search-container">
                        <div className="search-bar">
                          {Icons.search}
                          <input
                            type="text"
                            placeholder={`Search ${SEARCH_PROVIDER_LABELS[searchProvider]} or paste a media link...`}
                            value={searchQuery}
                            onChange={handleSearchInput}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              const query = event.currentTarget.value;
                              void resolvePastedMediaLink(query).then((handled) => {
                                if (!handled) queueSearch(query, searchProvider);
                              });
                            }}
                            autoComplete="off"
                            autoFocus
                          />
                          {isSearching && <span className="loader-glow" style={{ fontSize: '0.85rem' }}>Searching...</span>}
                          <select
                            className="search-provider-select"
                            value={searchProvider}
                            onChange={handleSearchProviderChange}
                            aria-label="Search provider"
                          >
                            <option value="hybrid">Hybrid</option>
                            <option value="youtube_music">YouTube Music</option>
                            <option value="youtube_videos">YouTube Videos</option>
                            <option value="soundcloud">SoundCloud</option>
                          </select>
                          {privateTasteProfile.isReady && (
                            <button
                              type="button"
                              className="recommendation-feedback-button"
                              style={searchForYouOnly ? { color: 'var(--accent-pink)', borderColor: 'var(--accent-pink)' } : undefined}
                              onClick={() => {
                                const next = !searchForYouOnly;
                                setSearchForYouOnly(next);
                                try {
                                  localStorage.setItem('spice_search_for_you', String(next));
                                } catch {
                                  // Persistence is best-effort; the toggle still applies for this session.
                                }
                              }}
                              aria-pressed={searchForYouOnly}
                              title="Show only results that match this profile's taste"
                            >
                              For you
                            </button>
                          )}
                        </div>
                      </div>

                      {(() => {
                        const visibleSearchResults = searchForYouOnly
                          ? filterTracksForYou(searchResults, tasteAffinityContext)
                          : searchResults;
                        return visibleSearchResults.length > 0 ? (
                        <section className="section animate-in">
                          <div className="section__header">
                            <h2 className="section__title">
                              {searchForYouOnly ? 'Results For You' : 'Search Results'}
                              {searchResultsSource === 'cache' ? ' (saved locally)' : ''}
                            </h2>
                          </div>
                          <div className="library-list">
                            {visibleSearchResults.map((song) => {
                              const isLiked = likedTracks.has(song.id);
                              const isPlayingCurrent = playerTrack.id === song.id;
                              return (
                                <div key={song.id} className="library-item animate-in">
                                  <img className="library-item__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} onClick={() => startTrackOnActiveReceiver(song, searchResults)} />
                                  <div className="library-item__info" onClick={() => startTrackOnActiveReceiver(song, searchResults)}>
                                    <span className="library-item__title" style={isPlayingCurrent ? { color: 'var(--accent-pink)' } : {}}>
                                      {song.title}
                                    </span>
                                    <span className="library-item__subtitle">
                                      {song.artists.map(a => a.name).join(', ')} {song.durationMs ? `· ${formatTime(song.durationMs / 1000)}` : ''}
                                      <span className="track-source-badge">{trackSourceLabel(song)}</span>
                                    </span>
                                  </div>

                                  {/* Custom Playlist Selector */}
                                  {allEditablePlaylists.length > 0 && (
                                    <select
                                      onChange={async (e) => {
                                        if (e.target.value) {
                                          const added = await addTrackToPlaylist(song, e.target.value);
                                          e.target.value = '';
                                          if (added) {
                                            showSpiceNotice('Added track to playlist.', 'success');
                                          } else {
                                            showSpiceNotice('Song already in playlist.', 'info');
                                          }
                                        }
                                      }}
                                      style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.8rem', padding: '6px 10px', cursor: 'pointer', outline: 'none', marginRight: '8px' }}
                                    >
                                      <option value="">+ Add Playlist</option>
                                      {allEditablePlaylists.map(pl => (
                                        <option key={pl.id} value={pl.id}>{pl.title}</option>
                                      ))}
                                    </select>
                                  )}

                                  <button
                                    className="library-item__action"
                                    style={{ opacity: 1, color: isLiked ? 'var(--accent-pink)' : 'var(--text-muted)' }}
                                    onClick={() => toggleLike(song)}
                                  >
                                    {isLiked ? Icons.heartFilled : Icons.heart}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                        ) : searchForYouOnly ? (
                          <section className="section animate-in">
                            <div className="section__header">
                              <h2 className="section__title">Results For You</h2>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                              Nothing in these results strongly matches this profile yet. Turn off the For you filter to see everything.
                            </p>
                          </section>
                        ) : (
                        <>
                          {!searchQuery.trim() && (isLoadingRecommendations || homeRecommended.length > 0) && (
                            <section className="section animate-in">
                              <div className="section__header">
                                <div>
                                  <h2 className="section__title">Recommended Searches</h2>
                                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '6px 0 0' }}>
                                    {homeRecommendationSeed?.reason || 'Suggestions are scored on this device from your local profile.'}
                                  </p>
                                </div>
                              </div>
                              {isLoadingRecommendations && homeRecommended.length === 0 ? (
                                <div className="library-list">
                                  {[...Array(3)].map((_, i) => (
                                    <div key={i} className="library-item animate-in">
                                      <div className="library-item__art" style={{ background: 'var(--card-bg)' }} />
                                      <div className="library-item__info">
                                        <span className="library-item__title">Finding private picks...</span>
                                        <span className="library-item__subtitle">Local taste profile, no raw history upload</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="library-list">
                                  {homeRecommended.slice(0, 8).map((song) => {
                                    const isLiked = likedTracks.has(song.id);
                                    const isPlayingCurrent = playerTrack.id === song.id;
                                    return (
                                      <div key={`${song.sourceId || 'youtube_music'}:${song.id}`} className="library-item animate-in">
                                        <img className="library-item__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} onClick={() => startTrackOnActiveReceiver(song, homeRecommended)} />
                                        <div className="library-item__info" onClick={() => startTrackOnActiveReceiver(song, homeRecommended)}>
                                          <span className="library-item__title" style={isPlayingCurrent ? { color: 'var(--accent-pink)' } : {}}>
                                            {song.title}
                                          </span>
                                          <span className="library-item__subtitle">
                                            {song.artists.map(a => a.name).join(', ')} {song.durationMs ? `| ${formatTime(song.durationMs / 1000)}` : ''}
                                            <span className="track-source-badge">{trackSourceLabel(song)}</span>
                                          </span>
                                        </div>
                                        <button
                                          className="library-item__action"
                                          style={{ opacity: 1, color: isLiked ? 'var(--accent-pink)' : 'var(--text-muted)' }}
                                          onClick={() => toggleLike(song)}
                                        >
                                          {isLiked ? Icons.heartFilled : Icons.heart}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </section>
                          )}

                          <section className="section animate-in">
                            <div className="section__header">
                              <h2 className="section__title">Browse All Categories</h2>
                            </div>
                            <div className="genre-grid">
                              {genres.map((g, i) => (
                                <div key={i} className="genre-card animate-in" style={{ background: g.gradient }} onClick={() => {
                                  setSearchQuery(g.name);
                                  handleSearchInput({ target: { value: g.name } } as any);
                                }}>
                                  <span className="genre-card__title">{g.name}</span>
                                  <span className="genre-card__icon">{g.icon}</span>
                                </div>
                              ))}
                            </div>
                          </section>
                        </>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      <div className="search-container animate-in">
                        <div className="search-bar">
                          {Icons.search}
                          <input
                            type="text"
                            placeholder="Search users by username or display name..."
                            value={userSearchQuery}
                            onChange={(e) => handleUserSearch(e.target.value)}
                            autoComplete="off"
                            autoFocus
                          />
                          {isSearchingUsers && <span className="loader-glow" style={{ fontSize: '0.85rem' }}>Searching...</span>}
                        </div>
                      </div>

                      {userSearchResults.length > 0 ? (
                        <section className="section animate-in" style={{ marginTop: '24px' }}>
                          <div className="section__header">
                            <h2 className="section__title">User Results</h2>
                          </div>
                          <div className="library-list">
                            {userSearchResults.map((user) => {
                              const hasAvatar = !!user.avatarUrl;
                              const isSelf = user.id === cloudUser?.id;
                              return (
                                <div key={`${user.id}:${user.profileId || user.username}`} className="library-item animate-in" onClick={() => handleSelectUser(user)}>
                                  {hasAvatar ? (
                                    <img className="library-item__art library-item__art--round" src={user.avatarUrl} alt={user.displayName} />
                                  ) : (
                                    <div className="library-item__art library-item__art--round" style={{ background: user.gradient || 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: '#fff', fontSize: '1.2rem' }}>
                                      {user.displayName.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="library-item__info">
                                    <span className="library-item__title">
                                      {user.displayName} {isSelf && <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', color: 'var(--accent-pink)' }}>You</span>}
                                    </span>
                                    <span className="library-item__subtitle">
                                      @{user.username} {user.isPrivate ? '· 🔒 Private Profile' : `· 🎵 ${user.songsPlayed.toLocaleString()} songs`}
                                    </span>
                                  </div>
                                  <button className="btn btn--ghost" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                                    View Profile
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      ) : userSearchQuery.trim() && !isSearchingUsers ? (
                        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                          <p>No users found matching &quot;{userSearchQuery}&quot;</p>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-secondary)' }}>
                          <div style={{ fontSize: '2.5rem', marginBottom: '16px', opacity: 0.5 }}>👥</div>
                          <p style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '8px' }}>Find other Spice Listeners</p>
                          <p style={{ fontSize: '0.9rem', maxWidth: '360px', margin: '0 auto' }}>
                            Search up your friends by their username or display name to check out their profiles and playlists.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* ── Library Page ── */}
              {currentPage === 'library' && (
                <>
                  <div className="library-header animate-in">
                    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2rem', fontWeight: 800 }}>Your Library</h1>
                    <div className="library-header__actions">
                      <button
                        className="btn btn--secondary"
                        style={{ padding: '8px 16px', fontSize: '0.8rem', marginRight: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: '#fff', cursor: 'pointer', borderRadius: '6px' }}
                        onClick={() => {
                          if (!cloudToken) {
                            setSelectedPlaylist(null);
                            setSelectedUser(null);
                            setCurrentPage('account');
                            setShareStatus('Sign in to your SPICE account to create shared playlists.');
                          } else {
                            setShowCreateSharedDialog(true);
                          }
                        }}
                      >
                        + Create Shared Playlist
                      </button>
                      <button className="btn btn--primary" style={{ padding: '8px 16px', fontSize: '0.8rem' }} onClick={() => setShowCreateDialog(true)}>
                        + Create Playlist
                      </button>
                      <button className={`library-view-btn ${libraryView === 'list' ? 'active' : ''}`} onClick={() => setLibraryView('list')}>
                        {Icons.list}
                      </button>
                      <button className={`library-view-btn ${libraryView === 'grid' ? 'active' : ''}`} onClick={() => setLibraryView('grid')}>
                        {Icons.grid}
                      </button>
                    </div>
                  </div>

                  <div className="chips animate-in">
                    <button className={`chip ${libraryFilter === 'playlists' ? 'active' : ''}`} onClick={() => setLibraryFilter('playlists')}>
                      Playlists
                    </button>
                    {cloudToken && (
                      <button className={`chip ${libraryFilter === 'shared' ? 'active' : ''}`} onClick={() => setLibraryFilter('shared')}>
                        Shared
                      </button>
                    )}
                    <button className={`chip ${libraryFilter === 'liked' ? 'active' : ''}`} onClick={() => setLibraryFilter('liked')}>
                      Liked Songs
                    </button>
                    <button className={`chip ${libraryFilter === 'history' ? 'active' : ''}`} onClick={() => setLibraryFilter('history')}>
                      History
                    </button>
                    <button className={`chip ${libraryFilter === 'downloads' ? 'active' : ''}`} onClick={() => {
                      setLibraryFilter('downloads');
                      void refreshOfflineLibrary();
                    }}>
                      Downloads
                    </button>
                  </div>

                  {/* Playlists view */}
                  {libraryFilter === 'playlists' && (
                    <div className="playlist-grid animate-in">
                      {editablePlaylists.length === 0 ? (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '64px 0', color: 'var(--text-secondary)' }}>
                          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', transform: 'scale(1.8)' }}>{Icons.folder}</div>
                          <p style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Create your first custom playlist</p>
                          <p style={{ marginBottom: '16px' }}>Build custom compilations from YouTube Music streams</p>
                          <button className="btn btn--primary" onClick={() => setShowCreateDialog(true)}>Create Playlist</button>
                        </div>
                      ) : (
                        editablePlaylists.map((pl) => (
                          <div key={pl.id} className="playlist-card animate-in" onClick={() => setSelectedPlaylist(pl)}>
                            <div className="playlist-card__bg" style={{ background: pl.gradient }}></div>
                            <PlaylistCoverImage playlist={pl} alt={pl.title} className="playlist-card__img" />
                            <div className="playlist-card__overlay"></div>
                            <div className="playlist-card__info">
                              <h3 className="playlist-card__title truncate">{pl.title}</h3>
                              <p className="playlist-card__desc">{pl.tracks.length} songs</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Shared Playlists view */}
                  {libraryFilter === 'shared' && (
                    <div className="playlist-grid animate-in">
                      {sharedPlaylists.length === 0 ? (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '64px 0', color: 'var(--text-secondary)' }}>
                          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', transform: 'scale(1.8)' }}>{Icons.folder}</div>
                          <p style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>No shared playlists yet</p>
                          <p style={{ marginBottom: '16px' }}>Collaborate with other SPICE users on shared compilations</p>
                          <button className="btn btn--primary" onClick={() => setShowCreateSharedDialog(true)}>+ Create Shared Playlist</button>
                        </div>
                      ) : (
                        sharedPlaylists.map((pl) => (
                          <div key={pl.id} className="playlist-card animate-in" style={{ position: 'relative' }} onClick={() => setSelectedPlaylist(pl)}>
                            <div className="playlist-card__bg" style={{ background: pl.gradient }}></div>
                            <PlaylistCoverImage playlist={pl} alt={pl.title} className="playlist-card__img" />
                            <div className="playlist-card__overlay"></div>
                            {/* Shared badge chip */}
                            <span className="playlist-card__shared-badge">
                              {pl.shareRole === 'owner' ? '✦ Yours' : '✦ Shared'}
                            </span>
                            <div className="playlist-card__info">
                              <h3 className="playlist-card__title truncate">{pl.title}</h3>
                              <p className="playlist-card__desc">
                                {pl.tracks.length} {pl.tracks.length === 1 ? 'song' : 'songs'}
                                {pl.ownerDisplayName && pl.shareRole !== 'owner' ? ` · by ${pl.ownerDisplayName}` : ''}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Liked songs view */}
                  {libraryFilter === 'liked' && (
                    <div className="library-list animate-in">
                      {likedTracksList.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-secondary)' }}>
                          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', transform: 'scale(1.8)', color: 'var(--accent-pink)' }}>{Icons.heartFilled}</div>
                          <p style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Songs you like will appear here</p>
                          <p>Tap the heart icon next to any search results to save tracks</p>
                        </div>
                      ) : (
                        likedTracksList.map((song) => {
                          const isPlayingCurrent = playerTrack.id === song.id;
                          return (
                            <div
                              key={song.id}
                              className="library-item animate-in"
                              onClick={getLikedTrackClickHandler(song)}
                            >
                              <img className="library-item__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} />
                              <div className="library-item__info">
                                <span className="library-item__title" style={isPlayingCurrent ? { color: 'var(--accent-pink)' } : {}}>
                                  {song.title}
                                </span>
                                <span className="library-item__subtitle">
                                  {song.artists.map(a => a.name).join(', ')}
                                </span>
                              </div>
                              <button
                                className="library-item__action"
                                style={{ opacity: 1, color: 'var(--accent-pink)' }}
                                onClick={getLikedTrackToggleHandler(song)}
                              >
                                {Icons.heartFilled}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Playback History view */}
                  {libraryFilter === 'history' && (
                    <div className="library-list animate-in">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Recently Played Tracks</span>
                        {history.length > 0 && (
                          <button className="btn btn--ghost" onClick={clearHistory} style={{ fontSize: '0.8rem', padding: '6px 12px', border: '1px solid var(--border-color)' }}>
                            Clear History
                          </button>
                        )}
                      </div>

                      {history.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-secondary)' }}>
                          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', transform: 'scale(1.8)' }}>{Icons.clock}</div>
                          <p style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>No playback history yet</p>
                          <p>Tracks you listen to will be preserved locally in chronological order</p>
                        </div>
                      ) : (
                        history.map((song) => {
                          const isPlayingCurrent = playerTrack.id === song.id;
                          return (
                            <div key={song.id} className="library-item animate-in" onClick={() => startTrackOnActiveReceiver(song, history)}>
                              <img className="library-item__art" src={song.artworkUrl || '/icon.svg'} alt={song.title} />
                              <div className="library-item__info">
                                <span className="library-item__title" style={isPlayingCurrent ? { color: 'var(--accent-pink)' } : {}}>
                                  {song.title}
                                </span>
                                <span className="library-item__subtitle">
                                  {song.artists.map(a => a.name).join(', ')}
                                </span>
                              </div>
                              {allEditablePlaylists.length > 0 && (
                                <select
                                  onChange={async (e) => {
                                    if (e.target.value) {
                                      const added = await addTrackToPlaylist(song, e.target.value);
                                      e.target.value = '';
                                      if (added) {
                                        showSpiceNotice('Added track to playlist.', 'success');
                                      } else {
                                        showSpiceNotice('Song already in playlist.', 'info');
                                      }
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.8rem', padding: '6px 10px', cursor: 'pointer', outline: 'none', marginRight: '8px' }}
                                >
                                  <option value="">+ Add Playlist</option>
                                  {allEditablePlaylists.map(pl => (
                                    <option key={pl.id} value={pl.id}>{pl.title}</option>
                                  ))}
                                </select>
                              )}
                              <button
                                className="library-item__action"
                                style={{ opacity: 1, color: likedTracks.has(song.id) ? 'var(--accent-pink)' : 'var(--text-muted)' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleLike(song);
                                }}
                              >
                                {likedTracks.has(song.id) ? Icons.heartFilled : Icons.heart}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Desktop offline library */}
                  {libraryFilter === 'downloads' && (
                    <div className="library-list animate-in">
                      <div className="offline-library-summary">
                        <div className="offline-library-summary__copy">
                          <strong>Offline Music</strong>
                          <div className="offline-library-summary__metrics">
                            <span>{offlineLibraryEntries.length} downloaded {offlineLibraryEntries.length === 1 ? 'track' : 'tracks'}</span>
                            <span>{formatOfflineLibrarySize(offlineLibraryTotalBytes)} stored</span>
                          </div>
                          <div className="offline-library-summary__folder" title={offlineLibraryDirectory}>
                            {offlineLibraryDirectory
                              || (offlineLibraryBridgeState === 'checking'
                                ? 'Detecting the Spice desktop library…'
                                : 'Desktop library is unavailable in this browser.')}
                          </div>
                        </div>
                        {offlineLibraryBridgeState === 'available' && (
                          <div className="offline-library-summary__actions">
                            <button className="btn btn--ghost" onClick={() => void refreshOfflineLibrary()}>
                              {Icons.refresh} Refresh
                            </button>
                            <button
                              className="btn btn--ghost"
                              onClick={() => void getSpiceDesktopOfflineLibraryBridge()?.chooseDirectory().then((result) => {
                                if (!result.canceled) setOfflineLibraryDirectory(result.directory);
                                return refreshOfflineLibrary();
                              })}
                            >
                              Change folder
                            </button>
                            <button className="btn btn--secondary" onClick={() => void getSpiceDesktopOfflineLibraryBridge()?.show()}>
                              {Icons.folder} Open folder
                            </button>
                          </div>
                        )}
                      </div>

                      {offlineLibraryEntries.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-secondary)' }}>
                          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', transform: 'scale(1.8)' }}>{Icons.download}</div>
                          <p style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>No offline songs yet</p>
                          <p>Download a song or playlist, or copy supported audio files into the folder above.</p>
                        </div>
                      ) : (
                        offlineLibraryEntries.map((entry) => (
                          <div
                            key={entry.fileName}
                            className="library-item animate-in"
                            onClick={() => void playOfflineLibraryEntry(entry)}
                          >
                            <img className="library-item__art" src={entry.track.artworkUrl || '/icon.svg'} alt={entry.track.title} />
                            <div className="library-item__info">
                              <span className="library-item__title">{entry.track.title}</span>
                              <span className="library-item__subtitle">
                                {entry.track.artists.map((artist) => artist.name).join(', ')} · {(entry.bytes / 1024 / 1024).toFixed(1)} MB
                              </span>
                            </div>
                            <button
                              className="library-item__action"
                              style={{ opacity: 1 }}
                              onClick={(event) => {
                                event.stopPropagation();
                                void showOfflineLibraryEntry(entry);
                              }}
                              title="Show audio file in folder"
                            >
                              {Icons.folder}
                            </button>
                            <button
                              className="library-item__action"
                              style={{ opacity: 1 }}
                              onClick={(event) => {
                                event.stopPropagation();
                                requestSpiceConfirm({
                                  title: 'Remove Offline Song?',
                                  message: `This deletes ${entry.fileName} from your chosen offline music folder.`,
                                  confirmLabel: 'Delete File',
                                  kind: 'danger',
                                  onConfirm: () => {
                                    void getSpiceDesktopOfflineLibraryBridge()?.remove(entry.fileName)
                                      .then(() => refreshOfflineLibrary());
                                  },
                                });
                              }}
                              title="Delete offline audio file"
                            >
                              {Icons.trash}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ── Account/Profile & Playlist Transfer Page ── */}
              {currentPage === 'account' && (
                <div className="animate-in" style={{ maxWidth: '720px', margin: '0 auto' }}>
                  <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2rem', fontWeight: 800, marginBottom: '24px' }}>Account Settings</h1>

                  {/* Profile view */}
                  <div className="profile-card animate-in" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div
                      style={{ width: '120px', height: '120px', borderRadius: '50%', background: activeProfile.avatarUrl ? 'none' : activeProfile.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem', fontWeight: 900, color: '#fff', textShadow: activeProfile.avatarUrl ? 'none' : '0 4px 12px rgba(0,0,0,0.3)', flexShrink: 0, overflow: 'hidden', border: '4px solid rgba(255, 255, 255, 0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
                    >
                      {activeProfile.avatarUrl ? (
                        <img src={activeProfile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        activeProfile.displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 6px 0', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="truncate">{activeProfile.displayName}</span>
                        {activeProfile.passcode && <span title="Profile locked" style={{ color: 'var(--accent-pink)', display: 'inline-flex' }}>{Icons.lock}</span>}
                      </h2>
                      {cloudUsername && (
                        <p style={{ margin: '-2px 0 8px 0', fontSize: '0.95rem', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                          @{cloudUsername}
                        </p>
                      )}
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 12px 0' }}>{activeProfile.bio}</p>
                      <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: '12px' }}>
                        Listener since {activeProfile.joinedAt}
                      </span>
                    </div>

                    {cloudToken && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          padding: '8px 16px',
                          borderRadius: '30px',
                          fontSize: '0.85rem',
                          color: '#fff',
                          fontWeight: 600,
                          backdropFilter: 'blur(8px)',
                          alignSelf: 'center',
                          marginLeft: 'auto',
                        }}
                      >
                        <span style={{ color: '#ef4444', display: 'inline-flex' }}>{Icons.heartFilled}</span>
                        <span>{myLikesCount} {myLikesCount === 1 ? 'Profile Like' : 'Profile Likes'}</span>
                      </div>
                    )}
                  </div>

                  {/* Stats Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
                    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent-pink)', marginBottom: '4px' }}>
                        {activeProfile.songsPlayed}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Songs Streamed</div>
                    </div>
                    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent-purple)', marginBottom: '4px' }}>
                        {likedTracks.size}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Liked Songs</div>
                    </div>
                    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b', marginBottom: '4px' }}>
                        {customPlaylists.length}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Playlists</div>
                    </div>
                  </div>

                  {/* Profiles Switching drawer */}
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '24px 0 16px 0', fontFamily: 'Outfit, sans-serif' }}>Local Profile Management</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                    {profiles.map(p => {
                      const isActive = p.id === activeProfileId;
                      return (
                        <div
                          key={p.id}
                          onClick={() => switchProfile(p.id)}
                          style={{ position: 'relative', background: 'var(--card-bg)', border: isActive ? '2px solid var(--accent-pink)' : '1px solid var(--border-color)', padding: '16px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', minWidth: '180px', transition: 'all 0.15s ease' }}
                        >
                          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: p.avatarUrl ? 'none' : p.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800, color: '#fff', overflow: 'hidden', flexShrink: 0, border: isActive ? '2px solid var(--accent-pink)' : '2px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                            {p.avatarUrl ? (
                              <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              p.displayName.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }} className="truncate">
                              {p.displayName}
                              {p.passcode && <span style={{ color: 'var(--accent-pink)', display: 'inline-flex' }}>{Icons.lock}</span>}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{p.songsPlayed} streams</span>
                          </div>
                          {profiles.length > 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteProfile(p.id); }}
                              style={{ marginLeft: 'auto', color: '#f87171', padding: '4px', opacity: 0.6 }}
                              title="Delete Profile"
                            >
                              {Icons.close}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={() => setShowCreateProfileDialog(true)}
                      disabled={profiles.length >= MAX_LOCAL_PROFILES}
                      title={profiles.length >= MAX_LOCAL_PROFILES ? `Maximum of ${MAX_LOCAL_PROFILES} profiles reached` : 'Create Profile'}
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '16px', minWidth: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: profiles.length >= MAX_LOCAL_PROFILES ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', opacity: profiles.length >= MAX_LOCAL_PROFILES ? 0.5 : 1 }}
                    >
                      <span>{profiles.length >= MAX_LOCAL_PROFILES ? `${MAX_LOCAL_PROFILES} Profile Max` : '+ Create Profile'}</span>
                    </button>
                  </div>

                  {/* ── Server Accounts & Cloud Sync ── */}
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '32px 0 16px 0', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {Icons.globe} Cloud Sync & Server Accounts
                    {cloudUser && <span style={{ fontSize: '0.75rem', background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(52, 211, 153, 0.2)' }}>Connected</span>}
                  </h3>

                  <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
                    {cloudUser ? (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                          <div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Logged in as</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                              <span>{showSyncEmail ? cloudUser.email : getMaskedEmail(cloudUser.email)}</span>
                              <button
                                type="button"
                                onClick={() => setShowSyncEmail(!showSyncEmail)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--text-secondary)',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  outline: 'none',
                                  transition: 'color 0.15s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                                title={showSyncEmail ? "Hide email" : "Show email"}
                              >
                                {showSyncEmail ? Icons.eyeOff : Icons.eye}
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.72rem', background: cloudUser.isAdmin ? 'rgba(250, 204, 21, 0.12)' : 'rgba(255,255,255,0.06)', color: cloudUser.isAdmin ? '#facc15' : 'var(--text-secondary)', padding: '3px 8px', borderRadius: '999px', border: cloudUser.isAdmin ? '1px solid rgba(250, 204, 21, 0.25)' : '1px solid rgba(255,255,255,0.08)', textTransform: 'capitalize' }}>
                                {cloudUser.accountRole || 'user'} account
                              </span>
                              <span style={{ fontSize: '0.72rem', background: cloudUser.subscription?.isActive ? 'rgba(52, 211, 153, 0.1)' : 'rgba(255,255,255,0.06)', color: cloudUser.subscription?.isActive ? '#34d399' : 'var(--text-secondary)', padding: '3px 8px', borderRadius: '999px', border: cloudUser.subscription?.isActive ? '1px solid rgba(52, 211, 153, 0.2)' : '1px solid rgba(255,255,255,0.08)', textTransform: 'capitalize' }}>
                                {cloudUser.subscription?.tier || 'free'} subscription
                              </span>
                            </div>
                          </div>
                          <button className="btn btn--ghost" onClick={handleLogout} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            Sign Out
                          </button>
                        </div>

                        {isLocalDbFallback && (
                          <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '12px', borderRadius: '8px', color: '#60a5fa', fontSize: '0.85rem', marginBottom: '16px', lineHeight: 1.4 }}>
                            <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '6px' }}>{Icons.database}</span><strong>Local File Account:</strong> Signed in using backend local fallback storage. Syncing works locally; configure the cloud database connection on Vercel for hosted backup.
                          </div>
                        )}

                        {dbError && (
                          <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '8px', color: '#f87171', fontSize: '0.85rem', marginBottom: '16px' }}>
                            <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '6px' }}>{Icons.alertTriangle}</span>{dbError} Configure the backend cloud database connection and run migrations to enable full cloud backup.
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          {(cloudUser.isAdmin || cloudUser.accountRole === 'admin') && (
                            <a
                              className="btn btn--ghost"
                              href="/admin-dashboard"
                              style={{
                                padding: '10px 20px',
                                fontSize: '0.85rem',
                                color: 'var(--accent-pink)',
                                borderColor: 'var(--accent-pink)',
                                textDecoration: 'none',
                              }}
                            >
                              {Icons.shield} Admin Dashboard
                            </a>
                          )}
                          <button
                            className="btn btn--primary"
                            onClick={() => syncWithCloud()}
                            disabled={syncingStatus === 'syncing'}
                            style={{ padding: '10px 20px', fontSize: '0.85rem' }}
                          >
                            {syncingStatus === 'syncing' ? 'Syncing...' : 'Sync Data Now'}
                          </button>

                          {syncingStatus === 'success' && (
                            <span style={{ color: '#34d399', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {Icons.checkCircle} Synchronized successfully with the database!
                            </span>
                          )}
                          {syncingStatus === 'partial' && (
                            <span style={{ color: '#fbbf24', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              {Icons.alertTriangle} Some data could not sync. Retry to finish safely.
                            </span>
                          )}
                          {syncingStatus === 'error' && !dbError && (
                            <span style={{ color: '#f87171', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              {Icons.alertTriangle} Sync failed. Please check server logs.
                            </span>
                          )}
                        </div>


                        {/* Pending Playlist Requests */}
                        {cloudUsername && pendingInvites.length > 0 && (
                          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '20px' }}>
                            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {Icons.plus} Playlist Requests ({pendingInvites.length})
                            </h4>
                            {pendingInvitesLoading ? (
                              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading requests...</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {pendingInvites.map((invite) => (
                                  <div key={invite.playlistId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                    <div>
                                      <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{invite.playlistTitle}</div>
                                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Requested by <strong style={{ color: '#fff' }}>{invite.ownerDisplayName}</strong> (@{invite.ownerUsername})</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                      <button
                                        className="btn btn--primary"
                                        style={{ padding: '6px 12px', fontSize: '0.8rem', minHeight: 'auto', background: 'var(--accent-pink)' }}
                                        onClick={() => handleAcceptInvite(invite.playlistId)}
                                        disabled={acceptingInvite}
                                      >
                                        Accept
                                      </button>
                                      <button
                                        className="btn btn--secondary"
                                        style={{ padding: '6px 12px', fontSize: '0.8rem', minHeight: 'auto' }}
                                        onClick={() => handleRejectInvite(invite.playlistId)}
                                        disabled={acceptingInvite}
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.5 }}>
                          Connect your Spice account to synchronize your custom playlists, liked tracks, and listening history with a secure backend database.
                        </p>

                        {!dbError && (
                          <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '12px', borderRadius: '8px', color: '#60a5fa', fontSize: '0.85rem', marginBottom: '16px', lineHeight: 1.4 }}>
                            <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '6px' }}>{Icons.database}</span><strong>Cloud Account Service:</strong> New registrations require the six-digit code delivered to the account email before sync and account features are enabled.
                          </div>
                        )}

                        {dbError && (
                          <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '12px', borderRadius: '8px', color: '#fbbf24', fontSize: '0.85rem', marginBottom: '16px', lineHeight: 1.4 }}>
                            <strong>Database Configuration Pending:</strong><br />
                            Configure the backend cloud database connection and run migrations to unlock cloud accounts on your machine.
                          </div>
                        )}

                        {authError && (
                          <div style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>{Icons.alertTriangle} {authError}</div>
                        )}

                        {emailVerification ? (
                          <form onSubmit={handleEmailVerificationSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '500px', marginBottom: '16px' }}>
                            <div style={{ gridColumn: 'span 2', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                              We sent a six-digit code to <strong style={{ color: '#fff' }}>{emailVerification.email}</strong>. The code expires after 10 minutes.
                            </div>
                            <input
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              pattern="[0-9]{6}"
                              maxLength={6}
                              aria-label="Six-digit email verification code"
                              placeholder="Six-digit verification code"
                              value={emailVerificationCode}
                              onChange={(e) => setEmailVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                              style={{ gridColumn: 'span 2', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '1rem', letterSpacing: '0.18em', textAlign: 'center' }}
                              required
                            />
                            <button
                              type="submit"
                              className="btn btn--primary"
                              disabled={authLoading || emailVerificationCode.length !== 6}
                              style={{ padding: '10px', fontSize: '0.85rem' }}
                            >
                              {authLoading ? 'Please wait...' : 'Verify and Sign In'}
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost"
                              disabled={authLoading}
                              onClick={() => void resendEmailVerification()}
                              style={{ padding: '10px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)' }}
                            >
                              Resend Code
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost"
                              disabled={authLoading}
                              onClick={() => {
                                setEmailVerification(null);
                                setEmailVerificationCode('');
                                setAuthError(null);
                              }}
                              style={{ gridColumn: 'span 2', padding: '8px', fontSize: '0.8rem', background: 'transparent' }}
                            >
                              Start Registration Again
                            </button>
                          </form>
                        ) : (
                        <form onSubmit={handleAuthSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '500px', marginBottom: '16px' }}>
                          <input
                            type="email"
                            placeholder="Email address"
                            value={authEmail}
                            onChange={(e) => setAuthEmail(e.target.value)}
                            style={{ gridColumn: 'span 2', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }}
                            required
                          />
                          {authMode === 'register' && (
                            <input
                              type="text"
                              placeholder="Spicer Username (3-20 chars, letters/numbers/underscores)"
                              value={authUsername}
                              onChange={(e) => setAuthUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                              style={{ gridColumn: 'span 2', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }}
                              required
                            />
                          )}
                          <input
                            type="password"
                            placeholder="Password (min 6 chars)"
                            value={authPassword}
                            onChange={(e) => setAuthPassword(e.target.value)}
                            style={{ gridColumn: 'span 2', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }}
                            required
                          />

                          <button
                            type="submit"
                            className="btn btn--primary"
                            disabled={authLoading}
                            style={{ padding: '10px', fontSize: '0.85rem' }}
                          >
                            {authLoading ? 'Please wait...' : authMode === 'login' ? 'Sign In' : 'Register Account'}
                          </button>

                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => {
                              setAuthMode(authMode === 'login' ? 'register' : 'login');
                              setAuthError(null);
                              setEmailVerification(null);
                            }}
                            style={{ padding: '10px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)' }}
                          >
                            Switch to {authMode === 'login' ? 'Register' : 'Login'}
                          </button>
                        </form>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Playlist Transfer dashboard */}
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '40px 0 16px 0', fontFamily: 'Outfit, sans-serif' }}>Playlist Transfer Dashboard</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>

                    {/* YouTube/YouTube Music Import */}
                    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px' }}>
                      <h4 style={{ margin: '0 0 8px 0', color: '#fff' }}>YouTube / YT Music Importer</h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                        Transfer any public YouTube or YouTube Music playlist directly. Spice will query tracks and import them dynamically.
                      </p>

                      <input
                        type="text"
                        placeholder="https://music.youtube.com/playlist?list=PL..."
                        value={ytPlaylistLink}
                        onChange={(e) => setYtPlaylistLink(e.target.value)}
                        style={{ width: '100%', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem', marginBottom: '12px' }}
                      />

                      {playlistImportError && (
                        <div style={{ color: '#f87171', fontSize: '0.75rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>{Icons.alertTriangle} {playlistImportError}</div>
                      )}
                      {playlistImportSuccess && (
                        <div style={{ color: '#34d399', fontSize: '0.75rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>{Icons.checkCircle} {playlistImportSuccess}</div>
                      )}

                      <button
                        className="btn btn--primary"
                        onClick={importYouTubePlaylist}
                        disabled={isImportingPlaylist}
                        style={{ width: '100%', padding: '8px 16px', fontSize: '0.85rem' }}
                      >
                        {isImportingPlaylist ? 'Importing Playlist...' : 'Fetch & Import Playlist'}
                      </button>
                    </div>

                    {/* JSON backups */}
                    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px' }}>
                      <h4 style={{ margin: '0 0 8px 0', color: '#fff' }}>Universal JSON Sync</h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                        Backup all playlists, likes, and history as a secure JSON payload to manually synchronize databases across devices.
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <button className="btn btn--ghost" onClick={downloadBackupFile} style={{ width: '100%', padding: '8px 16px', fontSize: '0.85rem' }}>
                          {Icons.download} Download Backup File (.json)
                        </button>
                        <button className="btn btn--ghost" onClick={copyBackupToClipboard} style={{ width: '100%', padding: '8px 16px', fontSize: '0.85rem' }}>
                          {Icons.clipboard} Copy Backup to Clipboard
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Restore from JSON backup */}
                  <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px', marginBottom: '40px' }}>
                    <h4 style={{ margin: '0 0 8px 0', color: '#fff' }}>Restore / Merge Profile Backup</h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 12px 0' }}>
                      Paste a JSON database payload below and select Merge to restore your playlists, favorite tracks, and playback history.
                    </p>
                    <textarea
                      placeholder="Paste backup JSON code..."
                      value={jsonImportText}
                      onChange={(e) => setJsonImportText(e.target.value)}
                      style={{ width: '100%', height: '80px', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', resize: 'none', fontFamily: 'monospace', fontSize: '0.75rem', marginBottom: '16px' }}
                    />
                    <button className="btn btn--primary" onClick={restoreBackupData} style={{ padding: '8px 24px', fontSize: '0.85rem' }}>
                      Restore Profile Backup
                    </button>
                  </div>

                  {/* Profile Customizations */}
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '24px 0 16px 0', fontFamily: 'Outfit, sans-serif' }}>Profile Settings & Passcode</h3>
                  {isEditingProfile ? (
                    <form onSubmit={saveProfile} style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '24px', borderRadius: '16px' }}>
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '20px', color: '#fff' }}>Edit profile: {activeProfile.displayName}</h4>

                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Display Name</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="DisplayName..."
                          style={{ width: '100%', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none' }}
                          required
                        />
                      </div>

                      {cloudToken && (
                        <div style={{ marginBottom: '16px' }}>
                          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Spicer Username</label>
                          <input
                            type="text"
                            value={editUsername}
                            onChange={(e) => {
                              setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                              setUsernameError(null);
                            }}
                            placeholder="e.g. sound_lover"
                            style={{ width: '100%', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none' }}
                            required
                          />
                          {usernameError && (
                            <div style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '6px' }}>
                              {usernameError}
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Passcode Protection (4 digits - optional)</label>
                        <input
                          type="password"
                          maxLength={4}
                          value={editPasscode}
                          onChange={(e) => setEditPasscode(e.target.value.replace(/\D/g, ''))}
                          placeholder="e.g. 1234"
                          style={{ width: '100%', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', letterSpacing: '0.2em' }}
                        />
                        {activeProfile.passcode && (
                          <button type="button" onClick={removePasscodeFromActive} style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '6px', cursor: 'pointer' }}>
                            Clear Passcode
                          </button>
                        )}
                      </div>

                      <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Short Biography</label>
                        <textarea
                          value={editBio}
                          onChange={(e) => setEditBio(e.target.value)}
                          placeholder="About you..."
                          style={{ width: '100%', height: '80px', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', resize: 'none' }}
                        />
                      </div>

                      <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>Avatar Color Accent</label>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          {PRESET_GRADIENTS.map((g, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setEditGradient(g)}
                              style={{ width: '32px', height: '32px', borderRadius: '50%', background: g, border: editGradient === g ? '2px solid #fff' : 'none', cursor: 'pointer', outline: 'none', boxShadow: editGradient === g ? '0 0 10px rgba(255,255,255,0.4)' : 'none' }}
                            />
                          ))}
                        </div>
                      </div>

                      <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Profile Picture (PFP)</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                          <input
                            type="text"
                            value={editAvatarUrl}
                            onChange={(e) => setEditAvatarUrl(e.target.value)}
                            placeholder="Paste custom image URL or select below..."
                            style={{ flex: 1, padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none' }}
                          />
                          <label
                            style={{
                              padding: '10px 14px',
                              background: 'rgba(236, 72, 153, 0.15)',
                              border: '1px solid rgba(236, 72, 153, 0.3)',
                              borderRadius: '8px',
                              color: 'var(--accent-pink)',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              transition: 'all 0.15s ease'
                            }}
                            title="Upload image from device"
                          >
                            {Icons.camera} Upload
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (file.size > 2 * 1024 * 1024) {
                                    showSpiceNotice('Image must be under 2MB.', 'warning');
                                    return;
                                  }
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    if (typeof reader.result === 'string') {
                                      setEditAvatarUrl(reader.result);
                                      logDebug('system', `PFP uploaded from device: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {editAvatarUrl && (
                            <button
                              type="button"
                              onClick={() => setEditAvatarUrl('')}
                              style={{
                                padding: '10px 14px',
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '8px',
                                color: '#ef4444',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s ease'
                              }}
                              title="Remove avatar"
                            >
                              {Icons.close} Remove
                            </button>
                          )}
                        </div>
                        {editAvatarUrl && (
                          <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--accent-pink)', flexShrink: 0 }}>
                              <img src={editAvatarUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Preview</span>
                          </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                          {PRESET_AVATARS.map((avatar, idx) => {
                            const isSelected = editAvatarUrl === avatar.url;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setEditAvatarUrl(isSelected ? '' : avatar.url)}
                                style={{
                                  position: 'relative',
                                  width: '100%',
                                  aspectRatio: '1',
                                  borderRadius: '10px',
                                  overflow: 'hidden',
                                  border: isSelected ? '2px solid var(--accent-pink)' : '1px solid rgba(255,255,255,0.1)',
                                  padding: 0,
                                  cursor: 'pointer',
                                  boxShadow: isSelected ? '0 0 12px var(--accent-pink)' : 'none',
                                  transition: 'all 0.2s ease',
                                  transform: isSelected ? 'scale(1.05)' : 'scale(1)'
                                }}
                                title={avatar.name}
                              >
                                <img src={avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn--ghost" onClick={() => setIsEditingProfile(false)}>Cancel</button>
                        <button type="submit" className="btn btn--primary">Save Changes</button>
                      </div>
                    </form>
                  ) : (
                    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '24px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Configure profile credentials, avatar colors, or password locks.</p>
                      <button className="btn btn--primary" onClick={() => {
                        setEditName(activeProfile.displayName);
                        setEditBio(activeProfile.bio);
                        setEditGradient(activeProfile.gradient);
                        setEditPasscode(activeProfile.passcode || '');
                        setEditAvatarUrl(activeProfile.avatarUrl || '');
                        setEditUsername(cloudUsername || '');
                        setUsernameError(null);
                        setIsEditingProfile(true);
                      }}>
                        Edit Profile Details
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Settings Tab Page ── */}
              {currentPage === 'settings' && (
                <div className="animate-in settings-page-layout">
                  
                  {/* Left Navigation Sidebar */}
                  <nav className="settings-page-nav" aria-label="Application settings sections">
                    <div className="settings-page-nav__header">
                      Sections
                    </div>
                    {settingsNavigationGroups.map((group) => (
                      <div className="settings-page-nav__group" key={group.label}>
                        <div className="settings-page-nav__group-title">{group.label}</div>
                        {group.items.map((section) => {
                          const isCurrent = activeSettingsSection === section.id;
                          return (
                            <button
                              key={section.id}
                              className={`settings-page-nav__item ${isCurrent ? 'is-current' : ''}`}
                              onClick={() => scrollToSettingsSection(section.id)}
                              type="button"
                              aria-current={isCurrent ? 'location' : undefined}
                            >
                              <span className="settings-page-nav__item-icon">{section.icon}</span>
                              <span>{section.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </nav>

                  {/* Right Content Column */}
                  <div className="settings-page-content">
                    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2rem', fontWeight: 800, marginBottom: '24px' }}>Application Settings</h1>

                    {/* Theme Accent Settings */}
                    <div id="theme-accent" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icons.palette} Global Accent Colors</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.4 }}>
                      Select a dynamic accent theme color to instantly paint application highlights, glow animations, button hovers, and dividers.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                      {[
                        { id: 'pink', name: 'Neon Spice (Pink)', color: '#ec4899', gradient: 'linear-gradient(135deg, #a855f7, #ec4899)' },
                        { id: 'blue', name: 'Ocean Breeze (Blue)', color: '#3b82f6', gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)' },
                        { id: 'orange', name: 'Solar Fire (Orange)', color: '#f97316', gradient: 'linear-gradient(135deg, #f97316, #ef4444)' },
                        { id: 'green', name: 'Jade Emerald (Green)', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #059669)' },
                        { id: 'gold', name: 'Imperial Gold (Gold)', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
                        { id: 'crimson', name: 'Crimson Moon (Red)', color: '#ff003c', gradient: 'linear-gradient(135deg, #ff003c, #990011)' },
                        { id: 'deeppurple', name: 'Midnight Velvet (Dark Purple)', color: '#7c3aed', gradient: 'linear-gradient(135deg, #4c1d95, #120024)' }
                      ].map((t) => {
                        const isCurrent = !customThemeEnabled && accentTheme === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            aria-pressed={isCurrent}
                            onClick={() => {
                              setAccentTheme(t.id as any);
                              localStorage.setItem('spice_accent_theme', t.id);
                              setCustomThemeEnabled(false);
                              localStorage.setItem('spice_custom_theme_enabled', 'false');
                            }}
                            style={{ background: 'var(--body-bg)', border: isCurrent ? `2px solid ${t.color}` : '1px solid var(--border-color)', padding: '16px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', minWidth: '180px', flex: '1 1 auto', transition: 'all 0.15s ease', font: 'inherit', textAlign: 'left' }}
                          >
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: t.gradient, flexShrink: 0, boxShadow: isCurrent ? `0 0 10px ${t.color}` : 'none' }}></div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isCurrent ? t.color : 'var(--text-primary)' }}>{t.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    <ThemeEditor
                      key={JSON.stringify(customThemePalette)}
                      palette={customThemePalette}
                      enabled={customThemeEnabled}
                      onApply={setCustomThemePalette}
                      onEnabledChange={(enabled) => {
                        setCustomThemeEnabled(enabled);
                        localStorage.setItem('spice_custom_theme_enabled', String(enabled));
                      }}
                    />
                  </div>

                  {/* Visual Customization */}
                  <div id="visual-customization" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icons.palette} Visual Customization</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.4 }}>
                      Tune the header, app surface, cover shape, motion level, and layout density. These preferences save locally and apply instantly.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(220px, 0.75fr)', gap: '20px', alignItems: 'stretch' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Header Layout</label>
                          <select
                            aria-label="Header layout"
                            value={topbarLayout}
                            onChange={(e) => {
                              if (!isTopbarLayout(e.target.value)) return;
                              setTopbarLayout(e.target.value);
                              localStorage.setItem('spice_topbar_layout', e.target.value);
                            }}
                            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                          >
                            {(Object.entries(TOPBAR_LAYOUT_LABELS) as [TopbarLayout, string][]).map(([id, label]) => (
                              <option key={id} value={id}>{label}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Surface Style</label>
                          <select
                            aria-label="Surface style"
                            value={visualSurface}
                            onChange={(e) => {
                              if (!isVisualSurface(e.target.value)) return;
                              setVisualSurface(e.target.value);
                              localStorage.setItem('spice_visual_surface', e.target.value);
                            }}
                            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                          >
                            {(Object.entries(VISUAL_SURFACE_LABELS) as [VisualSurface, string][]).map(([id, label]) => (
                              <option key={id} value={id}>{label}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Artwork Shape</label>
                          <select
                            aria-label="Artwork shape"
                            value={artworkShape}
                            onChange={(e) => {
                              if (!isArtworkShape(e.target.value)) return;
                              setArtworkShape(e.target.value);
                              localStorage.setItem('spice_artwork_shape', e.target.value);
                            }}
                            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                          >
                            {(Object.entries(ARTWORK_SHAPE_LABELS) as [ArtworkShape, string][]).map(([id, label]) => (
                              <option key={id} value={id}>{label}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Motion Level</label>
                          <select
                            value={motionLevel}
                            onChange={(e) => {
                              if (!isMotionLevel(e.target.value)) return;
                              setMotionLevel(e.target.value);
                              localStorage.setItem('spice_motion_level', e.target.value);
                            }}
                            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                          >
                            {(Object.entries(MOTION_LEVEL_LABELS) as [MotionLevel, string][]).map(([id, label]) => (
                              <option key={id} value={id}>{label}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Interface Density</label>
                          <select
                            value={interfaceScale}
                            onChange={(e) => {
                              if (!isInterfaceScale(e.target.value)) return;
                              setInterfaceScale(e.target.value);
                              localStorage.setItem('spice_interface_scale', e.target.value);
                            }}
                            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                          >
                            {(Object.entries(INTERFACE_SCALE_LABELS) as [InterfaceScale, string][]).map(([id, label]) => (
                              <option key={id} value={id}>{label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div style={{ border: '1px solid var(--border-color)', borderRadius: '14px', padding: '16px', background: 'linear-gradient(135deg, rgba(var(--accent-pink-rgb), 0.12), color-mix(in srgb, var(--text-primary) 3%, transparent))', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '178px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                          <div style={{ width: '52px', height: '52px', borderRadius: 'var(--spice-art-radius)', background: 'var(--accent-gradient)', boxShadow: '0 10px 28px rgba(var(--accent-pink-rgb), 0.28)' }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.95rem' }}>Live Preview</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{TOPBAR_LAYOUT_LABELS[topbarLayout]} / {VISUAL_SURFACE_LABELS[visualSurface]} / {INTERFACE_SCALE_LABELS[interfaceScale]}</div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                          {[0.35, 0.6, 0.9].map((opacity, i) => (
                            <div key={i} style={{ height: i === 1 ? '34px' : '24px', borderRadius: '8px', background: `rgba(var(--accent-pink-rgb), ${opacity})`, alignSelf: 'end' }} />
                          ))}
                        </div>
                        <div style={{ marginTop: '14px', fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                          Motion: {MOTION_LEVEL_LABELS[motionLevel]} · Covers: {ARTWORK_SHAPE_LABELS[artworkShape]}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Profile Privacy Settings */}
                  <div id="profile-privacy" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>👤 Profile Privacy</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.4 }}>
                      Control how other listeners see your SPICE profile. Private profiles hide your bio, streaming counts, liked tracks, and custom playlists from search results and profiles.
                    </p>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px', background: 'var(--bg-surface)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={activeProfile.isPrivate === true}
                        onChange={(e) => {
                          updateActiveProfileData({ isPrivate: e.target.checked });
                        }}
                        style={{ accentColor: 'var(--accent-pink)', marginTop: '3px' }}
                      />
                      <span>
                        <span style={{ display: 'block', color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.9rem' }}>Private Profile</span>
                        <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.4, marginTop: '4px' }}>
                          When enabled, other users can only see your avatar, username, and join date. Your bio, stats, and playlists will be hidden.
                        </span>
                      </span>
                    </label>
                  </div>

                  {/* Sidebar Controls */}
                  <div id="sidebar-controls" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icons.library} Sidebar Controls</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.4 }}>
                      Collapse the SPICE Music sidebar into an icon rail or trim optional sidebar tabs. Topbar search and the profile button stay available.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px', background: 'var(--bg-surface)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!sidebarHidden}
                          onChange={(e) => updateSidebarHiddenPreference(!e.target.checked)}
                          style={{ accentColor: 'var(--accent-pink)', marginTop: '3px' }}
                        />
                        <span>
                          <span style={{ display: 'block', color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.9rem' }}>Expanded sidebar</span>
                          <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.4, marginTop: '4px' }}>
                            Turn this off to keep navigation icons visible in a compact rail while widening the player and content area.
                          </span>
                        </span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px', background: 'var(--bg-surface)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={sidebarSearchEnabled}
                          onChange={(e) => updateSidebarSearchPreference(e.target.checked)}
                          style={{ accentColor: 'var(--accent-pink)', marginTop: '3px' }}
                        />
                        <span>
                          <span style={{ display: 'block', color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.9rem' }}>Search tab</span>
                          <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.4, marginTop: '4px' }}>
                            Show Search in the sidebar. Global topbar search remains enabled.
                          </span>
                        </span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px', background: 'var(--bg-surface)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={sidebarProfileEnabled}
                          onChange={(e) => updateSidebarProfilePreference(e.target.checked)}
                          style={{ accentColor: 'var(--accent-pink)', marginTop: '3px' }}
                        />
                        <span>
                          <span style={{ display: 'block', color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.9rem' }}>Profile tab</span>
                          <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.4, marginTop: '4px' }}>
                            Show Profile in the sidebar. The topbar avatar still opens your account page.
                          </span>
                        </span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px', background: 'var(--bg-surface)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={sidebarSettingsEnabled}
                          onChange={(e) => updateSidebarSettingsPreference(e.target.checked)}
                          style={{ accentColor: 'var(--accent-pink)', marginTop: '3px' }}
                        />
                        <span>
                          <span style={{ display: 'block', color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.9rem' }}>Settings tab</span>
                          <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.4, marginTop: '4px' }}>
                            Show Settings in the sidebar. The topbar settings button always remains available.
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>

                  {desktopUpdaterAvailable && (
                    <div id="desktop-updates" className="native-shell-settings">
                      <div className="native-shell-settings__heading">
                        <div>
                          <h3>{Icons.monitor} SPICE Desktop</h3>
                          <p>{nativeUpdateStatusMessage(nativeUpdateStatus)}</p>
                        </div>
                        <span className={`native-shell-settings__update-state native-shell-settings__update-state--${nativeUpdateStatus?.status || 'idle'}`}>
                          {nativeUpdateStatus?.status === 'downloaded' ? 'Ready' : nativeUpdateStatus?.status === 'error' ? 'Error' : 'Updater'}
                        </span>
                      </div>
                      {desktopStartOnBootMessage && (
                        <div className="native-shell-settings__message" role="status">
                          {desktopStartOnBootMessage}
                        </div>
                      )}
                      {desktopStartOnBoot?.supported && (
                        <div className="native-shell-settings__toggle-grid">
                          <label className="native-shell-settings__toggle">
                            <input
                              type="checkbox"
                              checked={desktopStartOnBoot.enabled}
                              disabled={nativeShellBusy === 'startOnBoot'}
                              onChange={(event) => void updateDesktopStartOnBoot(event.target.checked)}
                            />
                            <span>
                              <strong>Start SPICE on boot</strong>
                              <small>Open SPICE automatically when you sign in to this computer. Off by default.</small>
                            </span>
                          </label>
                        </div>
                      )}
                      <div className="native-shell-settings__actions native-shell-settings__actions--start">
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={nativeShellBusy === 'updates'}
                          onClick={() => void checkDesktopUpdates()}
                        >
                          {nativeShellBusy === 'updates' ? 'Checking...' : 'Check for updates'}
                        </button>
                        {nativeUpdateStatus?.status === 'downloaded' && (
                          <button type="button" className="btn btn--primary" onClick={() => getSpiceDesktopUpdaterBridge()?.installUpdate()}>
                            Restart and install
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {nativeShellAvailable && nativeShellSettings && (
                    <div id="native-shell" className="native-shell-settings">
                      <div className="native-shell-settings__heading">
                        <div>
                          <h3>{Icons.monitor} SPICE Native Desktop</h3>
                          <p>
                            Native shell controls now live here. The standard SPICE wrapper keeps its separate Desktop Settings window.
                          </p>
                        </div>
                        <span className="native-shell-settings__badge">Native only</span>
                      </div>

                      {nativeShellMessage && (
                        <div className="native-shell-settings__message" role="status">
                          {nativeShellMessage}
                        </div>
                      )}

                      <div className="native-shell-settings__toggle-grid">
                        <label className="native-shell-settings__toggle">
                          <input
                            type="checkbox"
                            checked={nativeShellSettings.alwaysOnTop}
                            disabled={nativeShellBusy === 'alwaysOnTop'}
                            onChange={(event) => void updateNativeShellBoolean('alwaysOnTop', event.target.checked)}
                          />
                          <span>
                            <strong>Always on Top</strong>
                            <small>Keep the SPICE Native window above other applications and remember the choice.</small>
                          </span>
                        </label>
                      </div>

                      <div className="native-shell-settings__group">
                        <div className="native-shell-settings__group-heading">
                          <div>
                            <strong>Desktop toolbar controls</strong>
                            <small>Choose the icons shown in the Native title bar. Settings and window controls always remain available.</small>
                          </div>
                        </div>
                        <div className="native-shell-settings__toolbar-grid">
                          {NATIVE_TOOLBAR_CONTROLS.map((control) => (
                            <label key={control.id} className="native-shell-settings__toolbar-option">
                              <input
                                type="checkbox"
                                checked={nativeShellSettings.toolbarButtons[control.id] !== false}
                                onChange={(event) => updateNativeToolbarControl(control.id, event.target.checked)}
                              />
                              <span>
                                <strong>{control.label}</strong>
                                <small>{control.description}</small>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="native-shell-settings__group">
                        <div className="native-shell-settings__group-heading">
                          <div>
                            <strong>Custom desktop CSS</strong>
                            <small>Apply optional CSS to the Electron shell and embedded Native view. SPICE theme settings above remain authoritative.</small>
                          </div>
                        </div>
                        <textarea
                          className="native-shell-settings__css"
                          value={nativeShellCssDraft}
                          onChange={(event) => setNativeShellCssDraft(event.target.value)}
                          spellCheck={false}
                          placeholder=":root { --accent: #ff4d8d; }"
                          aria-label="Custom desktop CSS"
                        />
                        <div className="native-shell-settings__actions">
                          <button type="button" className="btn btn--ghost" onClick={clearNativeShellCss} disabled={!nativeShellCssDraft && !nativeShellSettings.customCss}>
                            Clear
                          </button>
                          <button type="button" className="btn btn--primary" onClick={saveNativeShellCss}>
                            Save CSS
                          </button>
                        </div>
                      </div>

                      <div className="native-shell-settings__group">
                        <div className="native-shell-settings__group-heading">
                          <div>
                            <strong>Mini Player &amp; OBS</strong>
                            <small>Use the local desktop companion surfaces from a browser or OBS Browser Source.</small>
                          </div>
                        </div>
                        <div className="native-shell-settings__link-row">
                          <code>http://localhost:6969/mini-player/</code>
                          <button type="button" onClick={() => void copyNativeUtilityUrl('http://localhost:6969/mini-player/', 'Mini Player')}>Copy</button>
                        </div>
                        <div className="native-shell-settings__link-row">
                          <code>http://localhost:6969/obs/</code>
                          <button type="button" onClick={() => void copyNativeUtilityUrl('http://localhost:6969/obs/', 'OBS')}>Copy</button>
                        </div>
                        <button type="button" className="btn btn--ghost native-shell-settings__console" onClick={() => getSpiceNativeShellBridge()?.openDevTools()}>
                          Open developer console
                        </button>
                      </div>

                      <p className="native-shell-settings__ownership-note">
                        Last.fm and ListenBrainz for SPICE playback remain in Listening Profile Sync below. YouTube Music and SoundCloud desktop scrobbling remains wrapper-only.
                      </p>
                    </div>
                  )}

                  {nativeShellAvailable && nativeShellSettings && (
                    <div id="discord-activity" className="native-shell-settings">
                      <div className="native-shell-settings__heading">
                        <div>
                          <h3>{Icons.account} Discord Activity</h3>
                          <p>
                            Show the current song, artist, live elapsed time, cover artwork, and a public SPICE action on your Discord profile.
                          </p>
                        </div>
                        <span className="native-shell-settings__badge">Native only</span>
                      </div>

                      <label className="native-shell-settings__toggle discord-activity-settings__toggle">
                        <input
                          type="checkbox"
                          checked={nativeShellSettings.discordRpcEnabled}
                          disabled={nativeShellBusy === 'discordRpcEnabled'}
                          onChange={(event) => void updateNativeShellBoolean('discordRpcEnabled', event.target.checked)}
                        />
                        <span>
                          <strong>Enable Discord Rich Presence</strong>
                          <small>SPICE updates Discord on track changes, play/pause, repeats, and seeks while keeping Discord&apos;s activity rate limit.</small>
                        </span>
                      </label>

                      <div className="discord-activity-settings__preview" aria-label="Discord activity preview">
                        <img
                          src={currentTrack.artworkUrl || currentTrack.album?.artworkUrl || '/icon.svg'}
                          alt=""
                        />
                        <div>
                          <strong>{currentTrack.id === 'placeholder' ? 'Nothing playing' : currentTrack.title}</strong>
                          <span>{currentTrack.id === 'placeholder' ? 'SPICE Music' : `by ${profileArtistName(currentTrack)}`}</span>
                          <small>{currentTrack.id === 'placeholder' ? 'Activity appears when playback starts' : 'Listen on SPICE · Live track time'}</small>
                        </div>
                      </div>

                      {nativeShellMessage?.startsWith('Discord Rich Presence') && (
                        <div className="native-shell-settings__message" role="status">{nativeShellMessage}</div>
                      )}
                    </div>
                  )}

                  <div id="offline-library" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {Icons.folder} Downloads Folder
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                      Songs download to your system Downloads folder by default. In SPICE Desktop or Native, choose another folder here whenever you want; supported audio files in it appear in Library → Downloads.
                    </p>
                    {offlineLibraryBridgeState === 'available' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <code className="truncate" style={{ flex: '1 1 320px', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-secondary)', background: 'var(--body-bg)' }}>
                          {offlineLibraryDirectory || 'Loading offline folder…'}
                        </code>
                        <button
                          className="btn btn--secondary"
                          onClick={() => void getSpiceDesktopOfflineLibraryBridge()?.chooseDirectory().then((result) => {
                            setOfflineLibraryDirectory(result.directory);
                            return refreshOfflineLibrary();
                          })}
                        >
                          Choose folder
                        </button>
                        <button className="btn btn--ghost" onClick={() => void getSpiceDesktopOfflineLibraryBridge()?.show()}>
                          {Icons.folder} Open folder
                        </button>
                      </div>
                    ) : (
                      <div style={{ padding: '12px 14px', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-secondary)', background: 'var(--body-bg)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                        {offlineLibraryBridgeState === 'checking'
                          ? 'Checking for SPICE Desktop folder access…'
                          : 'This web browser controls where downloads are saved. Change its Downloads location in the browser settings, or open SPICE Desktop/Native to choose the folder here.'}
                      </div>
                    )}
                  </div>

                  <div id="search-sources" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {Icons.search} Search Sources
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                      Choose whether searches combine YouTube and SoundCloud or stay on one provider. This also updates the selector on the Search page.
                    </p>
                    <label style={{ display: 'block', maxWidth: '420px' }}>
                      <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Default music provider</span>
                      <select
                        value={searchProvider}
                        onChange={(event) => {
                          if (!isSearchProvider(event.target.value)) return;
                          setSearchProvider(event.target.value);
                          localStorage.setItem('spice_search_provider', event.target.value);
                        }}
                        style={{ width: '100%', padding: '10px 14px', background: 'var(--body-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                      >
                        {(Object.entries(SEARCH_PROVIDER_LABELS) as [SearchProvider, string][]).map(([id, label]) => (
                          <option key={id} value={id}>{label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* Audio Settings */}
                  <div id="audio-streaming" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icons.headphones} Audio & Streaming Preferences</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.4 }}>
                      Fine-tune streaming codecs and bitrates to match your current network speed or data constraints.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Audio Playback Quality</label>
                        <select
                          value={audioQuality}
                          onChange={(e) => {
                            setAudioQuality(e.target.value as any);
                            localStorage.setItem('spice_audio_quality', e.target.value);
                          }}
                          style={{ width: '100%', padding: '10px 14px', background: 'var(--body-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                        >
                          <option value="high">High Definition (Best Available AAC)</option>
                          <option value="standard">Standard Balanced (Browser Compatible)</option>
                          <option value="low">Data Saver (Lowest Available Stream)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Stream Endpoint Transport</label>
                        <select
                          value={streamProtocol}
                          onChange={(e) => {
                            const nextProtocol = isStreamProtocol(e.target.value) ? e.target.value : 'proxy';
                            setStreamProtocol(nextProtocol);
                            streamProtocolRef.current = nextProtocol;
                            localStorage.setItem('spice_stream_protocol', nextProtocol);
                            if (nextProtocol === 'embed') {
                              localStorage.setItem('spice_stream_embed_migration_v1034', 'true');
                            }
                          }}
                          style={{ width: '100%', padding: '10px 14px', background: 'var(--body-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                        >
                          <option value="proxy">Signed Direct Audio Proxy (Recommended)</option>
                          <option value="web">YouTube InnerTube Web Stream (Attestation)</option>
                          <option value="embed">YouTube Embedded Player (Fallback)</option>
                        </select>
                      </div>
                    </div>

                  </div>

                  {/* Listening Profile Sync */}
                  <div id="profile-sync" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '18px' }}>
                      <div>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icons.database} Listening Profile Sync</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, lineHeight: 1.4 }}>
                          Update your Last.fm and ListenBrainz profiles from playback. Search stays focused on playable providers.
                        </p>
                      </div>
                      <span style={{
                        fontSize: '0.72rem',
                        color: profileSyncStatus === 'error' ? '#f87171' : 'var(--text-secondary)',
                        border: profileSyncStatus === 'error' ? '1px solid rgba(248, 113, 113, 0.35)' : '1px solid var(--border-color)',
                        borderRadius: '999px',
                        padding: '5px 10px',
                        whiteSpace: 'nowrap',
                      }}>
                        {PROFILE_SYNC_STATUS_LABELS[profileSyncStatus]}
                      </span>
                    </div>

                    <div className={`sync-outbox-status ${syncOutboxItems.some((item) => item.status === 'attention') ? 'sync-outbox-status--attention' : ''}`}>
                      <div>
                        <strong>Cloud change outbox</strong>
                        <span>
                          {syncOutboxItems.length === 0
                            ? 'All local changes delivered'
                            : `${syncOutboxItems.length} latest change${syncOutboxItems.length === 1 ? '' : 's'} queued across profiles`}
                        </span>
                        {syncOutboxItems.filter((item) => item.status === 'attention').slice(0, 3).map((item) => (
                          <small key={`${item.profileId}:${item.kind}`}>
                            {item.kind} · {item.error || 'Cloud rejected this change.'}
                          </small>
                        ))}
                      </div>
                      {syncOutboxItems.some((item) => item.status === 'attention') && (
                        <button type="button" className="btn btn--ghost" onClick={() => syncOutboxRef.current?.retryAttentionItems()}>
                          Retry attention items
                        </button>
                      )}
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', color: '#fff', fontSize: '0.9rem', fontWeight: 700 }}>
                      <input
                        type="checkbox"
                        checked={profileSyncEnabled}
                        onChange={(e) => {
                          setProfileSyncEnabled(e.target.checked);
                          localStorage.setItem('spice_profile_sync_enabled', String(e.target.checked));
                        }}
                        style={{ accentColor: 'var(--accent-pink)' }}
                      />
                      Enable now-playing and scrobble updates
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(240px, 0.65fr)', gap: '18px', alignItems: 'start' }}>
                      <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: '#070707' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                          <div>
                            <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.92rem' }}>Last.fm Account</div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.4, margin: '4px 0 0 0' }}>
                              Uses backend Last.fm API credentials. Signed-in SPICE accounts store the approved session in the backend.
                              Callback route: {spiceApiUrl('cloud', '/lastfm/callback')}.
                            </p>
                          </div>
                          {lastFmLinkedUser && (
                            <span style={{ color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.35)', borderRadius: '999px', padding: '4px 9px', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                              Linked: {lastFmLinkedUser}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                          <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px', background: '#0a0a0a' }}>
                            <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.86rem', marginBottom: '4px' }}>
                              {(lastFmSessionKey || lastFmAccountLinked) ? (lastFmLinkedUser || 'Last.fm connected') : 'No Last.fm account linked'}
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.73rem', lineHeight: 1.4, margin: 0 }}>
                              {lastFmAccountLinked
                                ? 'Saved to your SPICE account, so it can be restored after clearing browser storage.'
                                : lastFmSessionKey
                                  ? 'Saved locally. Sign in to SPICE before setup to keep it backed up on the account.'
                                  : 'Click setup, sign in through Last.fm, and the callback will finish the link automatically.'}
                            </p>
                          </div>

                          <button
                            type="button"
                            className="btn btn--primary"
                            onClick={handleLinkLastFm}
                            disabled={isLinkingLastFm}
                            style={{ padding: '10px 16px', fontSize: '0.84rem', whiteSpace: 'nowrap' }}
                          >
                            {isLinkingLastFm ? 'Opening...' : 'Set up Last.fm'}
                          </button>
                        </div>

                        <p style={{ color: lastFmLinkStatus?.includes('failed') || lastFmLinkStatus?.includes('required') || lastFmLinkStatus?.includes('blocked') ? '#f87171' : 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.4, margin: 0 }}>
                          {lastFmLinkStatus || 'Click Set up Last.fm, approve the popup, and SPICE will finish the account link.'}
                        </p>
                        {profileSyncEnabled && (lastFmSessionKey || lastFmAccountLinked) && currentTrack.id !== 'placeholder' && lastFmPlaybackStatus && (
                          <p
                            role="status"
                            style={{
                              margin: '12px 0 0',
                              padding: '10px 12px',
                              border: '1px solid rgba(var(--accent-pink-rgb, 124, 58, 237), 0.3)',
                              borderRadius: '10px',
                              color: profileSyncStatus === 'error' ? '#f87171' : 'var(--text-primary)',
                              background: 'rgba(var(--accent-pink-rgb, 124, 58, 237), 0.08)',
                              fontSize: '0.74rem',
                              lineHeight: 1.45,
                            }}
                          >
                            {lastFmPlaybackStatus}
                          </p>
                        )}
                      </div>

                      <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: '#070707' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>ListenBrainz User Token</label>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.73rem', lineHeight: 1.4, margin: 0 }}>
                              Sends temporary playing-now updates and permanent listens after the scrobble threshold.
                            </p>
                          </div>
                          {listenBrainzAccountLinked && (
                            <span style={{ color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.35)', borderRadius: '999px', padding: '4px 9px', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                              Linked
                            </span>
                          )}
                        </div>

                        <input
                          type="password"
                          value={listenBrainzToken}
                          onChange={(e) => {
                            setListenBrainzToken(e.target.value);
                            queueListenBrainzTokenSave(e.target.value);
                          }}
                          onBlur={() => {
                            if (listenBrainzSaveTimeoutRef.current) {
                              clearTimeout(listenBrainzSaveTimeoutRef.current);
                              listenBrainzSaveTimeoutRef.current = null;
                            }
                            void saveListenBrainzToken(listenBrainzToken);
                          }}
                          placeholder={listenBrainzAccountLinked ? 'Token saved on your SPICE account' : 'Paste user token'}
                          autoComplete="off"
                          style={{ width: '100%', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none' }}
                        />
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.73rem', lineHeight: 1.4, margin: '8px 0 0 0' }}>
                          {listenBrainzAccountLinked
                            ? 'Saved to your SPICE account, so it can be restored after clearing browser storage.'
                            : cloudToken
                              ? 'Paste your token and SPICE will save it to your account automatically.'
                              : 'Sign in to SPICE before pasting a token so it is backed up on your account.'}
                        </p>
                        {listenBrainzLinkStatus && (
                          <p style={{ color: listenBrainzLinkStatus.includes('failed') || listenBrainzLinkStatus.includes('Sign in') ? '#f87171' : 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.4, margin: '8px 0 0 0' }}>
                            {listenBrainzLinkStatus}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Player View & Position Settings */}
                  <div id="player-layout" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icons.monitor} Player Layout & Viewing Options</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.4 }}>
                      Customize the now-playing bar placement, open the immersive full-screen player, or collapse it into a floating picture-in-picture widget.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Player Visual Style</label>
                        <select
                          value={playerVisualStyle}
                          onChange={(e) => {
                            if (!isPlayerVisualStyle(e.target.value)) return;
                            setPlayerVisualStyle(e.target.value);
                            localStorage.setItem('spice_player_visual_style', e.target.value);
                          }}
                          style={{ width: '100%', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', cursor: 'pointer' }}
                        >
                          {(Object.entries(PLAYER_VISUAL_STYLE_LABELS) as [PlayerVisualStyle, string][]).map(([id, label]) => (
                            <option key={id} value={id}>{label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Player Placement</label>
                        <select
                          value={playerPlacement}
                          onChange={(e) => {
                            setPlayerPlacement(e.target.value as any);
                            localStorage.setItem('spice_player_placement', e.target.value);
                          }}
                          style={{ width: '100%', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', cursor: 'pointer' }}
                        >
                          <option value="bottom">Bottom Docked (Default)</option>
                          <option value="top">Top Header Docked</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Player View Mode</label>
                        <select
                          value={playerViewMode}
                          onChange={(e) => {
                            setPlayerViewMode(e.target.value as any);
                            localStorage.setItem('spice_player_view_mode', e.target.value);
                          }}
                          style={{ width: '100%', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', cursor: 'pointer' }}
                        >
                          <option value="bar">Classic Now-Playing Bar</option>
                          <option value="expanded">Immersive Full-Screen Player</option>
                          <option value="mini">Floating Mini Player Widget</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Player Bar Density</label>
                        <select
                          value={playerBarDensity}
                          onChange={(e) => {
                            if (!isPlayerBarDensity(e.target.value)) return;
                            setPlayerBarDensity(e.target.value);
                            localStorage.setItem('spice_player_bar_density', e.target.value);
                          }}
                          style={{ width: '100%', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', cursor: 'pointer' }}
                        >
                          {(Object.entries(PLAYER_BAR_DENSITY_LABELS) as [PlayerBarDensity, string][]).map(([id, label]) => (
                            <option key={id} value={id}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div id="playback-profiles" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}>Playback Profiles & Smart Queue</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.4 }}>
                      Save multiple listening behaviors, smooth direct-audio transitions, and rebuild the queue with repeat-avoidance and artist/source diversity.
                    </p>
                    <PlaybackProfilePanel
                      state={playbackProfileState}
                      onChange={updatePlaybackProfiles}
                      onBuildSmartQueue={rebuildSmartQueue}
                      smartQueueActionDisabled={isControllingRemoteReceiver}
                    />
                  </div>

                  {/* Spice Connect Settings */}
                  <div id="spice-connect" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icons.monitor} Spice Connect Setup</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.4 }}>
                      Spice Connect is off by default. When two desktop or web devices enable it on the same network, controls automatically prefer an encrypted peer-to-peer link and fall back to the cloud if direct negotiation is unavailable.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.85fr) minmax(0, 1.15fr)', gap: '20px', alignItems: 'start' }}>
                      <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--body-bg)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 700, marginBottom: '14px' }}>
                          <input
                            type="checkbox"
                            checked={remoteControlEnabled}
                            onChange={(e) => {
                              setRemoteControlEnabled(e.target.checked);
                              localStorage.setItem('spice_remote_control_enabled', String(e.target.checked));
                              setRemoteStatus(e.target.checked ? 'Spice Connect enabled on this device.' : 'Spice Connect disabled on this device.');
                            }}
                            style={{ accentColor: 'var(--accent-pink)' }}
                          />
                          Keep this device available for Spice Connect
                        </label>

                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>This Spice Connect Device</label>
                        <input
                          type="text"
                          value={remoteDeviceName}
                          onChange={(e) => {
                            setRemoteDeviceName(e.target.value);
                            localStorage.setItem('spice_remote_device_name', e.target.value);
                          }}
                          placeholder="Living room speaker"
                          style={{ width: '100%', padding: '10px 14px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', marginBottom: '12px' }}
                        />

                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.4, margin: 0 }}>
                          Connect ID: {remoteDeviceId.slice(0, 8)}. Sign in on another device with the same account, keep SPICE open, then choose it here.
                        </p>
                        <div
                          role="status"
                          aria-live="polite"
                          style={{
                            marginTop: '12px',
                            padding: '10px 11px',
                            border: '1px solid var(--border-color)',
                            borderRadius: '9px',
                            color: 'var(--text-primary)',
                            background: 'var(--body-bg)',
                            fontSize: '0.74rem',
                          }}
                        >
                          <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>
                              Playback command route
                            </span>
                            <strong
                              style={{
                                display: 'block',
                                color: selectedRemoteDeviceId ? 'var(--accent-pink)' : 'var(--text-secondary)',
                                marginTop: '2px',
                              }}
                            >
                              {remoteCommandRouteLabel}
                            </strong>
                          </div>
                          <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '8px', paddingTop: '8px' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>
                              Cloud signaling and fallback
                            </span>
                            <span style={{ display: 'block', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {remoteCloudPathLabel}
                            </span>
                          </div>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: 1.4, margin: '9px 0 0 0' }}>
                          The direct path uses local-only WebRTC host candidates; cloud signaling authenticates the peer and remains the fallback. The playback route above updates only after the direct data channel is verified, so a command can use cloud while that link is still negotiating. The Android app uses the same direct protocol.
                        </p>
                      </div>

                      <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--body-bg)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                          <div>
                            <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.92rem' }}>Player Receiver</div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.4, margin: '4px 0 0 0' }}>
                              {remoteAuthToken ? `${remoteTargetDevices.length} other Spice Connect device(s) visible. The player uses this same receiver.` : 'Sign in or pair this device to see Spice Connect devices.'}
                            </p>
                          </div>
                          <button
                            className="btn btn--ghost"
                            onClick={() => {
                              if (remoteControlEnabled) {
                                void reportRemoteDeviceState();
                              }
                              void loadRemoteDevices(true);
                            }}
                            disabled={!remoteAuthToken}
                            style={{ padding: '8px 12px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                          >
                            Refresh
                          </button>
                        </div>

                        <select
                          value={selectedRemoteDeviceId}
                          onChange={(e) => selectSpiceConnectReceiver(e.target.value)}
                          disabled={!remoteAuthToken}
                          style={{ width: '100%', padding: '10px 14px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', marginBottom: '14px' }}
                        >
                          <option value="">This device (current browser)</option>
                          {remoteTargetDevices.map((device) => (
                            <option key={device.deviceId} value={device.deviceId}>
                              {device.displayName} - {device.isOnline === false ? 'Offline' : device.isPlaying ? 'Playing' : 'Online'}
                            </option>
                          ))}
                        </select>

                        {remoteTargetDevices.length > 0 && (
                          <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
                            {remoteTargetDevices.map((device) => (
                              <div key={`remembered-${device.deviceId}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid var(--border-color)', background: 'var(--body-bg)', borderRadius: '10px', padding: '9px 10px' }}>
                                <span style={{ color: device.isOnline === false ? 'var(--text-muted)' : 'var(--accent-pink)', display: 'inline-flex' }}>{Icons.monitor}</span>
                                <span style={{ minWidth: 0, flex: 1 }}>
                                  <strong className="truncate" style={{ display: 'block', color: 'var(--text-primary)', fontSize: '0.8rem' }}>{device.displayName}</strong>
                                  <small style={{ color: 'var(--text-secondary)' }}>
                                    {device.deviceId === selectedRemoteDeviceId
                                      ? `Currently connected - ${receiverStatusLabel(device)}`
                                      : receiverStatusLabel(device)}
                                  </small>
                                </span>
                                <button className="btn btn--ghost" style={{ padding: '6px 9px' }} onClick={() => void forgetSpiceConnectDevice(device.deviceId)} title={`Forget ${device.displayName}`} aria-label={`Forget ${device.displayName}`}>
                                  {Icons.close}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {selectedRemoteDevice && (
                          <div style={{ display: 'grid', gap: '14px' }}>
                            <button
                              type="button"
                              className="btn btn--primary"
                              onClick={() => void handoffPlaybackToSelectedDevice()}
                              disabled={currentTrack.id === 'placeholder' || selectedRemoteDevice.isOnline === false}
                              title="Transfer the current track, queue, position, volume, shuffle, and repeat state"
                            >
                              Move this playback to {selectedRemoteDevice.displayName}
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
                              <img
                                src={selectedRemoteDevice.currentTrack?.artworkUrl || '/icon.svg'}
                                alt=""
                                style={{ width: '48px', height: '48px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }}
                              />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div className="truncate" style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.86rem' }}>
                                  {selectedRemoteDevice.currentTrack?.title || 'No active track'}
                                </div>
                                <div className="truncate" style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', marginTop: '2px' }}>
                                  {selectedRemoteDevice.currentTrack?.artists?.map((artist) => artist.name).join(', ') || selectedRemoteDevice.displayName}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: '4px' }}>
                                  Last seen {Math.floor((selectedRemoteDevice.lastSeenSeconds ?? 0) / 60) === 0 ? '<1' : Math.floor((selectedRemoteDevice.lastSeenSeconds ?? 0) / 60)}m ago
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                              <button className="btn btn--ghost" onClick={handleReceiverPrev} style={{ padding: '8px 12px' }}>{Icons.prev} Previous</button>
                              <button className="btn btn--primary" onClick={toggleReceiverPlayPause} style={{ padding: '8px 14px' }}>
                                {selectedRemoteDevice.isPlaying ? Icons.pause : Icons.play} {selectedRemoteDevice.isPlaying ? 'Pause' : 'Play'}
                              </button>
                              <button className="btn btn--ghost" onClick={handleReceiverNext} style={{ padding: '8px 12px' }}>{Icons.next} Next</button>
                              <button className="btn btn--ghost" onClick={() => sendRemoteCommand('seek', { progress: Math.max(0, selectedRemoteDevice.progress - 15) })} style={{ padding: '8px 12px' }}>-15s</button>
                              <button className="btn btn--ghost" onClick={() => sendRemoteCommand('seek', { progress: Math.min(selectedRemoteDevice.duration || selectedRemoteDevice.progress + 15, selectedRemoteDevice.progress + 15) })} style={{ padding: '8px 12px' }}>+15s</button>
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                              Connected Device Volume
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={selectedRemoteDevice.volume}
                                onChange={(event) => setReceiverVolume(Number(event.target.value))}
                                onWheel={(event) => {
                                  const input = event.currentTarget;
                                  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
                                  if (!delta) return;
                                  event.preventDefault();
                                  const maxAllowed = 100;
                                  const step = event.shiftKey ? 25 : 5;
                                  const nextVolume = Math.max(0, Math.min(maxAllowed, Number(input.value) + (delta < 0 ? step : -step)));
                                  setReceiverVolume(nextVolume);
                                }}
                                style={{ flex: 1, accentColor: 'var(--accent-pink)' }}
                              />
                            </label>
                          </div>
                        )}

                        {remoteStatus && (
                          <p style={{ color: remoteStatus.includes('failed') || remoteStatus.includes('Sign in') ? '#f87171' : 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.4, margin: '12px 0 0 0' }}>
                            {remoteStatus}
                          </p>
                        )}
                      </div>
                    </div>
                    <SecurePairingPanel
                      key={`${activeProfileId}:${cloudUser?.id ?? 'paired'}`}
                      accountAvailable={Boolean(cloudToken)}
                      pairedCredentialActive={Boolean(activePairedRemoteCredential)}
                      deviceName={remoteDeviceName}
                      onCreateCode={createSecurePairingCode}
                      onCancelCode={cancelSecurePairingCode}
                      onClaimCode={claimSecurePairingCode}
                      onLoadAuthorizations={loadSecurePairingAuthorizations}
                      onRevokeAuthorization={revokeSecurePairingAuthorization}
                      onForgetCredential={forgetLocalPairingCredential}
                    />
                  </div>

                  <div id="offline-runtime" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}>Offline Shell & Runtime Diagnostics</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.4 }}>
                      Keep the application shell available without a connection, inspect the local runtime, and rebuild stale caches safely.
                    </p>
                    <RuntimeDiagnosticsPanel />
                  </div>

                  {/* User Feedback & Suggestions */}
                  <div id="feedback-support" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      Share Your Feedback
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.4 }}>
                      Help us make SPICE crazier and better! Submit bug reports, feature suggestions, or general feedback directly to the developers.
                    </p>

                    {!cloudToken ? (
                      <div style={{
                        padding: '16px',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                        textAlign: 'center',
                      }}>
                        A signed-in SPICE account is required to submit feedback. Please log in or register.
                      </div>
                    ) : (
                      <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Category</label>
                            <select
                              value={feedbackCategory}
                              onChange={(e) => setFeedbackCategory(e.target.value)}
                              style={{ width: '100%', padding: '10px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', cursor: 'pointer' }}
                            >
                              <option value="general">General Feedback</option>
                              <option value="bug">Bug Report</option>
                              <option value="suggestion">Feature Suggestion</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Rate Your Experience</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', height: '42px' }}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setFeedbackRating(star)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '1.5rem',
                                    padding: 0,
                                    color: feedbackRating >= star ? 'var(--accent-pink)' : '#4b5563',
                                    transition: 'color 0.15s ease'
                                  }}
                                >
                                  ★
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Your Message</label>
                          <textarea
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            placeholder="What would you like to share with the developers?..."
                            rows={4}
                            maxLength={1000}
                            required
                            style={{ width: '100%', padding: '12px 14px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.4 }}
                          />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                          {feedbackStatus && (
                            <span style={{ fontSize: '0.85rem', color: feedbackStatus.includes('successfully') ? '#34d399' : '#f87171' }}>
                              {feedbackStatus}
                            </span>
                          )}
                          <button
                            type="submit"
                            className="btn btn--primary"
                            disabled={isSubmittingFeedback || !feedbackText.trim()}
                            style={{ padding: '10px 24px', fontSize: '0.9rem' }}
                          >
                            {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* Cache & Safety Controls */}
                  <div id="storage-safety" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icons.shield} Caches & System Integrity</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.4 }}>
                      Reset local session states, clear playback history logs, or completely purge LocalStorage profile registries with a single command.
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                      <button
                        className="btn btn--ghost"
                        onClick={() => {
                          requestSpiceConfirm({
                            title: 'Reset Local Database?',
                            message: 'All custom settings will revert to default and the app will reload.',
                            confirmLabel: 'Reset Registry',
                            kind: 'danger',
                            onConfirm: () => {
                              localStorage.clear();
                              showSpiceNotice('Local database caches cleared. Reloading...', 'success');
                              window.setTimeout(() => window.location.reload(), 650);
                            },
                          });
                        }}
                        style={{ padding: '8px 16px', fontSize: '0.85rem', borderColor: '#f87171', color: '#f87171' }}
                      >
                        Reset Local Database Registry
                      </button>
                      <button
                        className="btn btn--ghost"
                        onClick={() => {
                          requestSpiceConfirm({
                            title: 'Purge Playback History?',
                            message: 'This clears the active profile listening history logs.',
                            confirmLabel: 'Purge Logs',
                            kind: 'warning',
                            onConfirm: () => {
                              setHistory([]);
                              updateActiveProfileData({ history: [] });
                              showSpiceNotice('Active history logs cleared.', 'success');
                            },
                          });
                        }}
                        style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                      >
                        Purge Playback History Logs
                      </button>
                    </div>
                  </div>

                  {/* System diagnostics & Monospace Live Log Terminal */}
                  <div id="system-diagnostics" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '40px', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                      <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {Icons.tool} System Diagnostics & Live Terminal
                      </h3>
                      <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        {SPICE_MEDIA_CORE_LABEL}
                      </span>
                    </div>

                    {/* Diagnostics Status Cards Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                      {/* InnerTube API Card */}
                      <div style={{ background: '#070707', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>InnerTube API</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: selfTestRunning ? '#fb923c' : (selfTestResults.api === 'passed' ? '#4ade80' : (selfTestResults.api === 'failed' ? '#f87171' : '#52525b')),
                            boxShadow: selfTestRunning ? '0 0 8px #fb923c' : (selfTestResults.api === 'passed' ? '0 0 8px #4ade80' : (selfTestResults.api === 'failed' ? '0 0 8px #f87171' : 'none')),
                            animation: selfTestRunning ? 'blink 0.8s ease infinite alternate' : 'none'
                          }}></div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: selfTestRunning ? '#fb923c' : (selfTestResults.api === 'passed' ? '#4ade80' : (selfTestResults.api === 'failed' ? '#f87171' : '#a1a1aa')) }}>
                            {selfTestRunning ? 'ATTUNING' : (selfTestResults.api === 'passed' ? 'ONLINE (200)' : (selfTestResults.api === 'failed' ? 'ERROR / BAN' : 'UNTESTED'))}
                          </span>
                        </div>
                      </div>

                      {/* Neon DB Sync Card */}
                      <div style={{ background: '#070707', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Neon Cloud Sync</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: selfTestRunning ? '#fb923c' : (selfTestResults.db === 'passed' ? '#4ade80' : (selfTestResults.db === 'disabled' ? '#fb923c' : (selfTestResults.db === 'failed' ? '#f87171' : '#52525b'))),
                            boxShadow: selfTestRunning ? '0 0 8px #fb923c' : (selfTestResults.db === 'passed' ? '0 0 8px #4ade80' : (selfTestResults.db === 'disabled' ? '0 0 8px #fb923c' : (selfTestResults.db === 'failed' ? '0 0 8px #f87171' : 'none'))),
                            animation: selfTestRunning ? 'blink 0.8s ease infinite alternate' : 'none'
                          }}></div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: selfTestRunning ? '#fb923c' : (selfTestResults.db === 'passed' ? '#4ade80' : (selfTestResults.db === 'disabled' ? '#fb923c' : (selfTestResults.db === 'failed' ? '#f87171' : '#a1a1aa'))) }}>
                            {selfTestRunning ? 'CONNECTING' : (selfTestResults.db === 'passed' ? 'CONNECTED' : (selfTestResults.db === 'disabled' ? 'LOCAL PWA' : (selfTestResults.db === 'failed' ? 'SYNC ERROR' : 'UNTESTED')))}
                          </span>
                        </div>
                      </div>

                      {/* Latency Meter Card */}
                      <div style={{ background: '#070707', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Diagnostic Ping</span>
                        <span style={{
                          fontSize: '0.9rem',
                          fontWeight: 800,
                          color: !selfTestResults.latency ? '#a1a1aa' : (selfTestResults.latency < 250 ? '#4ade80' : (selfTestResults.latency < 600 ? '#fb923c' : '#f87171'))
                        }}>
                          {selfTestResults.latency ? `${selfTestResults.latency} ms` : '-- ms'}
                        </span>
                      </div>

                      {/* Stream Protocol Context Card */}
                      <div style={{ background: '#070707', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Active Transport</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#22d3ee' }}>
                          {streamProtocol === 'proxy' ? 'PROXY' : (streamProtocol === 'web' ? 'ATTESTATION' : 'EMBED')}
                        </span>
                      </div>

                      {/* YouTube Embed Player API Card */}
                      <div style={{ background: '#070707', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Embed Player API</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: selfTestRunning ? '#fb923c' : (selfTestResults.embed === 'passed' ? '#4ade80' : (selfTestResults.embed === 'failed' ? '#f87171' : '#52525b')),
                            boxShadow: selfTestRunning ? '0 0 8px #fb923c' : (selfTestResults.embed === 'passed' ? '0 0 8px #4ade80' : (selfTestResults.embed === 'failed' ? '0 0 8px #f87171' : 'none')),
                            animation: selfTestRunning ? 'blink 0.8s ease infinite alternate' : 'none'
                          }}></div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: selfTestRunning ? '#fb923c' : (selfTestResults.embed === 'passed' ? '#4ade80' : (selfTestResults.embed === 'failed' ? '#f87171' : '#a1a1aa')) }}>
                            {selfTestRunning ? 'LOADING' : (selfTestResults.embed === 'passed' ? 'READY' : (selfTestResults.embed === 'failed' ? 'BLOCKED' : 'UNTESTED'))}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Terminal controls row */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn--primary"
                          onClick={runSelfTest}
                          disabled={selfTestRunning}
                          style={{
                            padding: '8px 16px',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            borderColor: selfTestRunning ? '#52525b' : 'var(--accent-pink)',
                            background: selfTestRunning ? 'rgba(255,255,255,0.02)' : 'var(--accent-gradient)',
                            opacity: selfTestRunning ? 0.7 : 1,
                            cursor: selfTestRunning ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {selfTestRunning ? (
                            <>
                              <svg className="animate-spin" style={{ width: '14px', height: '14px', marginRight: '4px', fill: 'none', stroke: '#fff', strokeWidth: 2 }} viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)"></circle>
                                <path d="M4 12a8 8 0 018-8v8H4z" fill="#fff"></path>
                              </svg>
                              Running Attestation...
                            </>
                          ) : 'Run Full Diagnostics'}
                        </button>

                        <button
                          className="btn btn--ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(debugLogs.join('\n'));
                            setLogsCopied(true);
                            setTimeout(() => setLogsCopied(false), 2000);
                          }}
                          style={{ padding: '8px 16px', fontSize: '0.85rem', color: logsCopied ? '#4ade80' : '#fff', borderColor: logsCopied ? '#4ade80' : 'var(--border-color)' }}
                        >
                          {logsCopied ? 'Copied Logs' : 'Copy Logs'}
                        </button>

                        <button
                          className="btn btn--ghost"
                          onClick={() => setDebugLogs([])}
                          style={{ padding: '8px 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}
                        >
                          Clear
                        </button>

                        {streamProtocol === 'embed' && (
                          <button
                            className="btn btn--ghost"
                            onClick={() => {
                              setStreamProtocol('proxy');
                              streamProtocolRef.current = 'proxy';
                              localStorage.setItem('spice_stream_protocol', 'proxy');
                              logDebug('system', 'Switched stream endpoint back to direct proxy from diagnostics panel.');
                            }}
                            style={{ padding: '8px 16px', fontSize: '0.85rem', color: '#22d3ee', borderColor: 'rgba(34, 211, 238, 0.3)' }}
                          >
                            Force Proxy Mode
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Auto scroll toggle checkbox */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <input
                            type="checkbox"
                            checked={terminalAutoScroll}
                            onChange={(e) => setTerminalAutoScroll(e.target.checked)}
                            style={{ cursor: 'pointer', accentColor: 'var(--accent-pink)' }}
                          />
                          Auto-Scroll
                        </label>

                        {/* Search / Filter input */}
                        <input
                          type="text"
                          placeholder="Filter logs..."
                          value={terminalFilter}
                          onChange={(e) => setTerminalFilter(e.target.value)}
                          style={{
                            padding: '8px 12px',
                            background: '#0a0a0a',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            color: '#fff',
                            outline: 'none',
                            width: '160px',
                            transition: 'all 0.15s ease'
                          }}
                        />
                      </div>
                    </div>

                    {/* Cyber Terminal Window */}
                    <div style={{
                      background: '#030303',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '16px',
                      height: '240px',
                      overflowY: 'auto',
                      fontFamily: 'Consolas, Menlo, Monaco, "Courier New", monospace',
                      fontSize: '0.75rem',
                      lineHeight: 1.5,
                      boxShadow: 'inset 0 4px 20px rgba(0, 0, 0, 0.8)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      {/* Filter logic */}
                      {(() => {
                        const logs = debugLogs.filter(log =>
                          log.toLowerCase().includes(terminalFilter.toLowerCase())
                        );

                        if (logs.length === 0) {
                          return (
                            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                              -- No matching trace logs. Console active and waiting. --
                            </div>
                          );
                        }

                        return logs.map((log, index) => {
                          // Extract timestamp, category, and message
                          // e.g. [12:04:12 PM] [SYSTEM] Loaded active profile
                          const timestampMatch = log.match(/^\[(.*?)\]/);
                          const categoryMatch = log.match(/\]\s*\[(SYSTEM|PLAYER|STREAM|DATABASE|AUTH|DIAGNOSTICS|ERROR)\]/i);

                          let timestamp = '';
                          let category = 'SYSTEM';
                          let message = log;

                          if (timestampMatch) {
                            timestamp = timestampMatch[0];
                            message = message.substring(timestampMatch[0].length).trim();
                          }

                          if (categoryMatch) {
                            category = categoryMatch[1].toUpperCase();
                            // remove the [CATEGORY] part from message
                            message = message.replace(`[${categoryMatch[1]}]`, '').trim();
                          }

                          // Get category colors
                          let categoryColor = '#cbd5e1'; // slate/white
                          let glowStyle = {};
                          if (category === 'PLAYER') {
                            categoryColor = '#22d3ee'; // cyan
                          } else if (category === 'STREAM') {
                            categoryColor = '#e879f9'; // purple/pink
                          } else if (category === 'DATABASE') {
                            categoryColor = '#fb923c'; // orange
                          } else if (category === 'AUTH') {
                            categoryColor = '#34d399'; // emerald
                          } else if (category === 'DIAGNOSTICS') {
                            categoryColor = '#4ade80'; // lime
                            glowStyle = { textShadow: '0 0 4px rgba(74, 222, 128, 0.4)' };
                          } else if (category === 'ERROR') {
                            categoryColor = '#f87171'; // red
                            glowStyle = { textShadow: '0 0 6px rgba(248, 113, 113, 0.6)', animation: 'blink 1.5s infinite alternate' };
                          }

                          return (
                            <div key={index} style={{ display: 'flex', gap: '8px', wordBreak: 'break-all', alignItems: 'flex-start' }}>
                              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{timestamp}</span>
                              <span style={{ color: categoryColor, fontWeight: 700, flexShrink: 0, ...glowStyle }}>
                                [{category}]
                              </span>
                              <span style={{ color: category === 'ERROR' ? '#f87171' : 'var(--text-primary)', ...glowStyle }}>
                                {message}
                              </span>
                            </div>
                          );
                        });
                      })()}

                      {/* Anchor element for scrolling + blinking cursor */}
                      <div ref={terminalEndRef} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <span style={{ color: '#4ade80', fontWeight: 700 }}>spice-core@diagnostics ~ %</span>
                        <div style={{
                          width: '6px',
                          height: '12px',
                          background: '#4ade80',
                          animation: 'blink 1s step-end infinite',
                          boxShadow: '0 0 6px #4ade80'
                        }}></div>
                      </div>
                    </div>
                  </div>
                  
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </main>

      {invitePreview && (
        <div className="dialog-overlay" onClick={() => setInvitePreview(null)}>
          <div className="dialog-box dialog-box--wide" onClick={(e) => e.stopPropagation()}>
            <div className="playlist-invite-dialog__header">
              <div className="playlist-invite-dialog__icon">{Icons.playlist}</div>
              <div>
                <h2>Shared playlist invite</h2>
                <p>{invitePreview.playlist.tracks.length} tracks available from this shared playlist.</p>
              </div>
            </div>

            <div className="playlist-invite-dialog__preview">
              <div className="playlist-invite-dialog__cover" style={{ background: invitePreview.playlist.gradient }}>
                {invitePreview.playlist.tracks[0]?.artworkUrl ? (
                  <img src={invitePreview.playlist.tracks[0].artworkUrl} alt="" />
                ) : (
                  Icons.musicFolder
                )}
              </div>
              <div>
                <h3>{invitePreview.playlist.title}</h3>
                <p>{invitePreview.playlist.description || 'A shared SPICE playlist.'}</p>
                {invitePreview.expiresAt && (
                  <span>Invite expires {new Date(invitePreview.expiresAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>

            {invitePreview.playlist.tracks.length > 0 && (
              <div className="playlist-invite-dialog__tracks">
                {invitePreview.playlist.tracks.slice(0, 3).map((track) => (
                  <div key={`${track.sourceId ?? 'youtube_music'}:${track.id}`}>
                    <span>{track.title}</span>
                    <small>{track.artists.map((artist) => artist.name).join(', ') || 'Unknown artist'}</small>
                  </div>
                ))}
              </div>
            )}

            {inviteStatus && (
              <p className="playlist-invite-dialog__status">{inviteStatus}</p>
            )}

            <div className="dialog-box__actions">
              <button type="button" className="btn btn--ghost" style={{ padding: '8px 16px' }} onClick={() => setInvitePreview(null)}>
                Dismiss
              </button>
              <button
                type="button"
                className="btn btn--primary"
                style={{ padding: '8px 16px' }}
                onClick={cloudToken ? acceptSharedPlaylistInvite : () => { setSelectedPlaylist(null); setSelectedUser(null); setCurrentPage('account'); setInviteStatus('Sign in to SPICE, then accept this playlist invite.'); }}
                disabled={acceptingInvite}
              >
                {acceptingInvite ? 'Accepting' : cloudToken ? 'Accept Playlist' : 'Sign In First'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Edit Custom Playlist Dialog ═══ */}
      {showEditPlaylistDialog && selectedPlaylist && (
        <div className="dialog-overlay" onClick={() => setShowEditPlaylistDialog(false)}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <h2>Edit Playlist Details</h2>
            <form onSubmit={savePlaylistEdits}>
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Playlist Name</label>
              <input
                type="text"
                value={editPlTitle}
                onChange={(e) => setEditPlTitle(e.target.value)}
                placeholder="Spicy compile title..."
                required
                autoFocus
              />

              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', marginTop: '12px', display: 'block' }}>Description (optional)</label>
              <input
                type="text"
                value={editPlDesc}
                onChange={(e) => setEditPlDesc(e.target.value)}
                placeholder="Description details..."
              />

              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', marginTop: '12px', display: 'block' }}>Select Accent Color Banner</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', marginTop: '6px' }}>
                {PRESET_GRADIENTS.map((g, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setEditPlGradient(g)}
                    style={{ width: '28px', height: '28px', borderRadius: '50%', background: g, border: editPlGradient === g ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', outline: 'none', transition: 'all 0.15s ease' }}
                  />
                ))}
              </div>

              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '6px' }}>Playlist Cover Image URL</label>
              <input
                type="text"
                value={editPlCoverUrl}
                onChange={(e) => setEditPlCoverUrl(e.target.value)}
                placeholder="Paste custom image URL..."
              />

              <div style={{ marginTop: '12px', marginBottom: '16px' }}>
                <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '6px' }}>Or Upload Local Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  style={{ display: 'none' }}
                  id="playlist-cover-upload"
                />
                <label
                  htmlFor="playlist-cover-upload"
                  className="btn btn--ghost"
                  style={{ display: 'inline-flex', padding: '8px 16px', fontSize: '0.8rem', cursor: 'pointer', gap: '6px', alignItems: 'center' }}
                >
                  {Icons.camera} Choose Image
                </label>

                {editPlCoverUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', background: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '8px' }}>
                    <img src={editPlCoverUrl} alt="Cover Preview" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }} />
                    <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Cover image set</span>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ marginLeft: 'auto', padding: '4px 8px', fontSize: '0.75rem', color: '#f87171' }}
                      onClick={() => setEditPlCoverUrl('')}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '6px', marginTop: '12px' }}>Visibility</label>
              <select
                value={editPlIsPublic ? 'public' : 'private'}
                onChange={(e) => setEditPlIsPublic(e.target.value === 'public')}
                style={{ width: '100%', background: 'var(--card-bg)', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', outline: 'none', cursor: 'pointer' }}
              >
                <option value="public">Public (visible to everyone via search)</option>
                <option value="private">Private (only visible to you)</option>
              </select>

              <div className="dialog-box__actions" style={{ justifyContent: 'space-between', marginTop: '24px' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: '8px 16px', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  {Icons.trash} Delete
                </button>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn btn--ghost" style={{ padding: '8px 16px' }} onClick={() => setShowEditPlaylistDialog(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn--primary" style={{ padding: '8px 16px' }}>
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Delete Confirmation Dialog ═══ */}
      {showDeleteConfirm && selectedPlaylist && (
        <div className="dialog-overlay" onClick={() => setShowDeleteConfirm(false)} style={{ zIndex: 110000 }}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px', textAlign: 'center' }}>
            <div style={{ color: '#f87171', marginBottom: '16px', transform: 'scale(1.5)', display: 'inline-block' }}>{Icons.alertTriangle}</div>
            <h2>Delete Playlist?</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px', lineHeight: 1.4 }}>
              Are you sure you want to delete this playlist? This action cannot be undone.
            </p>
            <div className="dialog-box__actions" style={{ justifyContent: 'center', gap: '12px' }}>
              <button
                type="button"
                className="btn btn--ghost"
                style={{ padding: '8px 16px' }}
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                style={{ padding: '8px 16px', backgroundColor: '#ef4444' }}
                onClick={() => {
                  deletePlaylist(selectedPlaylist.id);
                  setShowDeleteConfirm(false);
                  setShowEditPlaylistDialog(false);
                }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Save Current Track to Playlist Dialog ═══ */}
      {playlistPickerTrack && (
        <div className="dialog-overlay playlist-picker-overlay" onClick={() => setPlaylistPickerTrack(null)}>
          <div className="dialog-box playlist-picker" onClick={(event) => event.stopPropagation()}>
            <div className="playlist-picker__header">
              <div>
                <span className="playlist-picker__eyebrow">Now playing</span>
                <h2>Save to playlist</h2>
              </div>
              <button
                type="button"
                className="playlist-picker__close"
                onClick={() => setPlaylistPickerTrack(null)}
                aria-label="Close playlist picker"
              >
                {Icons.close}
              </button>
            </div>

            <div className="playlist-picker__track">
              <img src={playlistPickerTrack.artworkUrl || '/icon.svg'} alt="" />
              <span>
                <strong className="truncate">{playlistPickerTrack.title}</strong>
                <small className="truncate">{playlistPickerTrack.artists.map((artist) => artist.name).join(', ')}</small>
              </span>
              {Icons.bookmark}
            </div>

            {allEditablePlaylists.length > 0 ? (
              <div className="playlist-picker__list" role="list" aria-label="Playlists">
                {allEditablePlaylists.map((playlist) => {
                  const alreadySaved = playlist.tracks.some((track) => track.id === playlistPickerTrack.id);
                  const isSaving = playlistPickerSavingId === playlist.id;
                  return (
                    <button
                      key={playlist.id}
                      type="button"
                      className="playlist-picker__option"
                      onClick={() => void savePlaylistPickerSelection(playlist.id)}
                      disabled={alreadySaved || playlistPickerSavingId !== null}
                    >
                      <span
                        className="playlist-picker__cover"
                        style={{ background: playlist.coverUrl ? 'var(--bg-surface)' : playlist.gradient }}
                      >
                        {playlist.coverUrl ? <img src={playlist.coverUrl} alt="" /> : Icons.playlist}
                      </span>
                      <span className="playlist-picker__copy">
                        <strong className="truncate">{playlist.title}</strong>
                        <small>{playlist.shared ? 'Shared playlist' : `${playlist.tracks.length} ${playlist.tracks.length === 1 ? 'song' : 'songs'}`}</small>
                      </span>
                      <span className={`playlist-picker__status ${alreadySaved ? 'is-saved' : ''}`}>
                        {alreadySaved ? 'Saved' : isSaving ? 'Saving…' : 'Add'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="playlist-picker__empty">Create your first playlist, then this song will be one tap away from it.</p>
            )}

            <button
              type="button"
              className="playlist-picker__create"
              onClick={() => {
                setNewPlaylistSeedTrack(playlistPickerTrack);
                setPlaylistPickerTrack(null);
                setShowCreateDialog(true);
              }}
            >
              <span>+</span> Create a new playlist
            </button>
          </div>
        </div>
      )}

      {/* ═══ Create Custom Playlist Dialog ═══ */}
      {showCreateDialog && (
        <div className="dialog-overlay" onClick={() => { setShowCreateDialog(false); setNewPlaylistSeedTrack(null); }}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            <h2>Create Playlist</h2>
            {newPlaylistSeedTrack && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '-6px 0 16px' }}>
                “{newPlaylistSeedTrack.title}” will be added automatically.
              </p>
            )}
            <form onSubmit={createPlaylist}>
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Playlist Name</label>
              <input
                type="text"
                value={newPlTitle}
                onChange={(e) => setNewPlTitle(e.target.value)}
                placeholder="Spicy selection..."
                required
                autoFocus
              />
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Description (optional)</label>
              <input
                type="text"
                value={newPlDesc}
                onChange={(e) => setNewPlDesc(e.target.value)}
                placeholder="Late night vibe compiles..."
              />
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', marginTop: '12px', display: 'block' }}>Visibility</label>
              <select
                value={newPlIsPublic ? 'public' : 'private'}
                onChange={(e) => setNewPlIsPublic(e.target.value === 'public')}
                style={{ width: '100%', background: 'var(--card-bg)', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', marginTop: '4px', outline: 'none', cursor: 'pointer' }}
              >
                <option value="public">Public (visible to everyone via search)</option>
                <option value="private">Private (only visible to you)</option>
              </select>
              <div className="dialog-box__actions" style={{ marginTop: '16px' }}>
                <button type="button" className="btn btn--ghost" style={{ padding: '8px 16px' }} onClick={() => { setShowCreateDialog(false); setNewPlaylistSeedTrack(null); }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" style={{ padding: '8px 16px' }}>
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Periodic User Feedback Popup Dialog ═══ */}
      {showFeedbackPopup && (
        <div className="dialog-overlay" onClick={() => setShowFeedbackPopup(false)}>
          <div className="dialog-box dialog-box--wide" onClick={(e) => e.stopPropagation()} style={{
            background: 'rgba(8, 7, 18, 0.95)',
            border: '1px solid var(--border-color)',
            borderRadius: '24px',
            padding: '32px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 20px rgba(236, 72, 153, 0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="24" height="24" style={{ color: 'var(--accent-pink)' }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, fontFamily: 'Outfit, sans-serif' }}>Enjoying SPICE?</h2>
              </div>
              <button
                onClick={() => setShowFeedbackPopup(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              We&apos;d love to hear your thoughts! Help us improve SPICE by sharing a quick review or suggesting features.
            </p>

            <form onSubmit={(e) => {
              handleFeedbackSubmit(e).then(() => {
                setTimeout(() => setShowFeedbackPopup(false), 2000);
              });
            }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Category</label>
                  <select
                    value={feedbackCategory}
                    onChange={(e) => setFeedbackCategory(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    <option value="general">General Feedback</option>
                    <option value="bug">Bug Report</option>
                    <option value="suggestion">Feature Suggestion</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Rating</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', height: '36px' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFeedbackRating(star)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '1.4rem',
                          padding: 0,
                          color: feedbackRating >= star ? 'var(--accent-pink)' : '#4b5563',
                          transition: 'color 0.15s ease'
                        }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Your Message</label>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="What would you like to share?..."
                  rows={3}
                  maxLength={1000}
                  required
                  style={{ width: '100%', padding: '10px 12px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', outline: 'none', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.4 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    localStorage.setItem('spice_feedback_prompt_dismissed', 'true');
                    setShowFeedbackPopup(false);
                  }}
                  style={{ padding: '8px 14px', fontSize: '0.8rem', border: '1px solid rgba(248, 113, 113, 0.2)', color: '#f87171' }}
                >
                  Don&apos;t Ask Again
                </button>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {feedbackStatus && (
                    <span style={{ fontSize: '0.8rem', color: feedbackStatus.includes('successfully') ? '#34d399' : '#f87171' }}>
                      {feedbackStatus}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setShowFeedbackPopup(false)}
                    style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                  >
                    Maybe Later
                  </button>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={isSubmittingFeedback || !feedbackText.trim()}
                    style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                  >
                    {isSubmittingFeedback ? 'Sending...' : 'Submit'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Create Shared Playlist Dialog ═══ */}
      {showCreateSharedDialog && (
        <div className="dialog-overlay" onClick={() => setShowCreateSharedDialog(false)}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            <h2>Create Shared Playlist</h2>
            <form onSubmit={createSharedPlaylist}>
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Playlist Name</label>
              <input
                type="text"
                value={newSharedPlTitle}
                onChange={(e) => setNewSharedPlTitle(e.target.value)}
                placeholder="Collaborative selection..."
                required
                autoFocus
              />
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Description (optional)</label>
              <input
                type="text"
                value={newSharedPlDesc}
                onChange={(e) => setNewSharedPlDesc(e.target.value)}
                placeholder="Let's build a vibe together..."
              />
              <div className="dialog-box__actions">
                <button type="button" className="btn btn--ghost" style={{ padding: '8px 16px' }} onClick={() => setShowCreateSharedDialog(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" style={{ padding: '8px 16px' }}>
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Create Profile Dialog ═══ */}
      {showCreateProfileDialog && (
        <div className="dialog-overlay" onClick={() => setShowCreateProfileDialog(false)}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            <h2>Create Spice Profile</h2>
            <form onSubmit={createProfile}>
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Profile Name</label>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="e.g. Study, Razvan"
                required
                autoFocus
              />
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Short Bio (optional)</label>
              <input
                type="text"
                value={newProfileBio}
                onChange={(e) => setNewProfileBio(e.target.value)}
                placeholder="Study sessions..."
              />
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Optional 4-Digit Passcode Protection</label>
              <input
                type="password"
                maxLength={4}
                value={newProfilePasscode}
                onChange={(e) => setNewProfilePasscode(e.target.value.replace(/\D/g, ''))}
                placeholder="Leave blank for no password"
                style={{ letterSpacing: '0.2em' }}
              />

              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', marginTop: '12px', display: 'block' }}>Select Accent Color</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {PRESET_GRADIENTS.map((g, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setNewProfileGradient(g)}
                    style={{ width: '28px', height: '28px', borderRadius: '50%', background: g, border: newProfileGradient === g ? '2px solid #fff' : 'none', cursor: 'pointer', outline: 'none' }}
                  />
                ))}
              </div>

              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '6px' }}>Profile Picture (PFP) URL</label>
              <input
                type="text"
                value={newProfileAvatarUrl}
                onChange={(e) => setNewProfileAvatarUrl(e.target.value)}
                placeholder="Paste custom image URL or select a preset below..."
                style={{ marginBottom: '10px' }}
              />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {PRESET_AVATARS.map((avatar, idx) => {
                  const isSelected = newProfileAvatarUrl === avatar.url;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNewProfileAvatarUrl(isSelected ? '' : avatar.url)}
                      style={{
                        position: 'relative',
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: isSelected ? '2px solid var(--accent-pink)' : '1px solid rgba(255,255,255,0.1)',
                        padding: 0,
                        cursor: 'pointer',
                        boxShadow: isSelected ? '0 0 8px var(--accent-pink)' : 'none'
                      }}
                      title={avatar.name}
                    >
                      <img src={avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  );
                })}
              </div>

              <div className="dialog-box__actions">
                <button type="button" className="btn btn--ghost" style={{ padding: '8px 16px' }} onClick={() => setShowCreateProfileDialog(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" style={{ padding: '8px 16px' }}>
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* ═══ Queue Drawer ═══ */}
      {showQueueDrawer && (
        <div className="queue-drawer animate-in" style={{ position: 'fixed', right: '24px', bottom: '96px', width: '320px', maxHeight: '420px', background: 'rgba(10, 10, 10, 0.95)', border: '1px solid var(--border-color)', borderRadius: '16px', backdropFilter: 'blur(20px)', zIndex: 99, padding: '20px', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>Play Queue</h4>
            <button onClick={() => setShowQueueDrawer(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex' }} title="Close queue">{Icons.close}</button>
          </div>
          {playerQueue.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '12px', textAlign: 'center' }}>
              {isControllingRemoteReceiver ? `${receiverLabel} has no visible queue yet.` : 'Queue is empty.'}
            </div>
          ) : (
            <VirtualTrackRows
              tracks={playerQueue}
              height={280}
              rowHeight={62}
              resetKey={`${isControllingRemoteReceiver ? selectedRemoteDeviceId : activeProfileId}:queue-drawer:${trackListFingerprint(playerQueue)}`}
              focusIndex={playerQueueIndex}
              ariaLabel="Play queue"
              renderRow={(song, idx) => {
              const isActive = idx === playerQueueIndex;
              return (
                <div
                  role="button"
                  tabIndex={0}
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={`Play ${song.title}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '100%', boxSizing: 'border-box', padding: '8px', borderRadius: '8px', background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent', border: isActive ? '1px solid var(--accent-pink)' : '1px solid transparent', cursor: 'pointer', transition: 'all 0.15s ease' }}
                  onClick={() => startTrackOnActiveReceiver(song, playerQueue)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      startTrackOnActiveReceiver(song, playerQueue);
                    }
                  }}
                >
                  <img src={song.artworkUrl || '/icon.svg'} alt="" loading="lazy" decoding="async" fetchPriority="low" draggable={false} style={{ width: '36px', height: '36px', borderRadius: '4px', objectFit: 'cover' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isActive ? 'var(--accent-pink)' : '#fff' }} className="truncate">{song.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }} className="truncate">{song.artists.map(a => a.name).join(', ')}</div>
                  </div>
                  {!isControllingRemoteReceiver && queue.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const newQ = [...queue];
                        newQ.splice(idx, 1);
                        if (idx === queueIndex) {
                          const nextIndex = Math.min(idx, newQ.length - 1);
                          startTrackOnActiveReceiver(
                            newQ[nextIndex],
                            newQ,
                            playlistQueueOriginRef.current ?? undefined,
                          );
                        } else {
                          setQueue(newQ);
                          if (idx < queueIndex) {
                            setQueueIndex(queueIndex - 1);
                          }
                        }
                      }}
                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', opacity: 0.6, fontSize: '0.8rem' }}
                      title="Remove from queue"
                    >
                      {Icons.close}
                    </button>
                  )}
                </div>
              );
              }}
            />
          )}
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
            <button className="btn btn--ghost" style={{ padding: '4px 8px', fontSize: '0.75rem' }} disabled={isControllingRemoteReceiver || !activePlaybackProfile?.smartQueue.enabled} onClick={rebuildSmartQueue}>
              Smart mix
            </button>
            <button className="btn btn--ghost" style={{ padding: '4px 8px', fontSize: '0.75rem' }} disabled={isControllingRemoteReceiver} onClick={() => {
              personalizedQueueContinuationSuppressedRef.current = playbackTrackKey(currentTrack);
              playlistQueueOriginRef.current = null;
              setQueue([currentTrack]);
              setQueueIndex(0);
            }}>
              {isControllingRemoteReceiver ? 'Remote Queue' : 'Clear Queue'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ Floating Bar Lyrics Drawer ═══ */}
      {showBarLyrics && (
        <div className="lyrics-drawer animate-in" style={{ position: 'fixed', right: '24px', bottom: '96px', width: '320px', height: '420px', background: 'rgba(10, 10, 10, 0.95)', border: '1px solid var(--border-color)', borderRadius: '16px', backdropFilter: 'blur(20px)', zIndex: 99, padding: '20px', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#fff' }}>Lyrics</h4>
              {lyricsData && !lyricsData.isSynced && lyricsData.lines.length > 0 && (
                <span style={{ fontSize: '0.58rem', background: 'rgba(236, 72, 153, 0.15)', color: 'var(--accent-pink)', padding: '2px 6px', borderRadius: '20px', fontWeight: 700 }}>UNSYNCED</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => lyricsData?.isSynced && setIsKaraokeMode(!isKaraokeMode)}
                style={{ background: 'none', border: 'none', color: isKaraokeMode ? 'var(--accent-pink)' : 'rgba(255,255,255,0.4)', cursor: lyricsData?.isSynced ? 'pointer' : 'not-allowed', fontSize: '0.9rem', outline: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                title="Toggle Karaoke Mode"
              >
                {Icons.microphone} {isKaraokeMode ? 'ON' : 'OFF'}
              </button>
              <button onClick={() => setShowBarLyrics(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', outline: 'none', display: 'inline-flex' }} title="Close lyrics">{Icons.close}</button>
            </div>
          </div>

          {/* Body content (same interactive parser view!) */}
          <div
            ref={lyricsContainerRef}
            style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px', textAlign: 'center', padding: '10px 0', scrollBehavior: 'smooth' }}
            className="custom-scrollbar"
          >
            {lyricsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-pink)', animation: 'spin 1s linear infinite' }} />
                <span>Tuning...</span>
              </div>
            ) : !lyricsData || lyricsData.lines.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                No lyrics found.
              </div>
            ) : (
              lyricsData.lines.map((line, idx) => {
                const isActive = idx === activeLineIdx;
                const isPast = idx < activeLineIdx;
                const isChorus = line.text.includes('[Chorus]');
                const isHeader = line.text.startsWith('[') && line.text.endsWith(']');

                return (
                  <div
                    key={idx}
                    data-active={isActive}
                    onClick={() => {
                      if (!lyricsData.isSynced) return;
                      seekToPosition(line.time);
                    }}
                    style={{
                      fontSize: isChorus ? '1rem' : '0.88rem',
                      fontWeight: (isChorus || isHeader) ? 800 : (isActive ? 700 : 500),
                      color: isHeader ? 'var(--accent-pink)' : isChorus ? '#fff' : (isActive ? '#fff' : 'rgba(255,255,255,0.4)'),
                      fontFamily: 'Outfit, sans-serif',
                      lineHeight: 1.3,
                      textShadow: isActive ? (isHeader ? '0 0 10px rgba(236,72,153,0.4)' : '0 0 12px rgba(255,255,255,0.3)') : 'none',
                      cursor: lyricsData.isSynced ? 'pointer' : 'default',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      transform: isActive ? 'scale(1.03)' : 'scale(1)',
                      background: isActive ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      opacity: isActive ? 1 : (isPast ? 0.35 : 0.6)
                    }}
                  >
                    {lyricsData.isSynced && isKaraokeMode && line.words.length > 0 && !isHeader ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {line.words.map((w, wIdx) => {
                          const isWordActive = progress >= w.start && progress < (w.start + w.duration);
                          const isWordPassed = progress >= (w.start + w.duration);

                          let wColor = isActive ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.3)';
                          let wGlow = 'none';
                          let wWeight = isActive ? 700 : 500;

                          if (isWordPassed) {
                            wColor = '#fff';
                            wWeight = 800;
                            wGlow = '0 0 6px rgba(255,255,255,0.4)';
                          } else if (isWordActive) {
                            wColor = 'var(--accent-pink)';
                            wWeight = 800;
                            wGlow = '0 0 10px var(--accent-pink)';
                          }

                          return (
                            <span
                              key={wIdx}
                              style={{
                                color: wColor,
                                fontWeight: wWeight,
                                textShadow: wGlow,
                                transition: 'all 0.1s linear',
                                whiteSpace: 'pre',
                                display: 'inline-block'
                              }}
                            >
                              {w.word}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      line.text
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ═══ Now Playing Bar Panel ═══ */}
      <footer className="now-playing">
        {/* Left: playback controls */}
        <div className="now-playing__left-controls" style={{ opacity: listenTogetherHostSessionId ? 0.5 : 1 }}>
          <button
            className={`now-playing__btn now-playing__btn--wide-only ${playerShuffleEnabled ? 'active' : ''}`}
            onClick={toggleReceiverShuffle}
            disabled={!!listenTogetherHostSessionId}
            style={{ cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer' }}
            title={listenTogetherHostSessionId ? "Playback controlled by host" : "Shuffle"}
            aria-label="Shuffle"
          >
            {Icons.shuffle}
          </button>

          <button
            className="now-playing__btn"
            onClick={handleReceiverPrev}
            disabled={!!listenTogetherHostSessionId}
            style={{ cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer' }}
            title={listenTogetherHostSessionId ? "Playback controlled by host" : "Previous"}
            aria-label="Previous"
          >
            {Icons.prev}
          </button>

          <button
            className="now-playing__btn now-playing__btn--play"
            onClick={toggleReceiverPlayPause}
            disabled={!!listenTogetherHostSessionId}
            style={{ cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer' }}
            title={listenTogetherHostSessionId ? "Playback controlled by host" : (playerIsPlaying ? 'Pause' : 'Play')}
            aria-label={playerIsPlaying ? 'Pause' : 'Play'}
          >
            {playerIsPlaying ? Icons.pause : Icons.play}
          </button>

          <button
            className="now-playing__btn"
            onClick={handleReceiverNext}
            disabled={!!listenTogetherHostSessionId}
            style={{ cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer' }}
            title={listenTogetherHostSessionId ? "Playback controlled by host" : "Next"}
            aria-label="Next"
          >
            {Icons.next}
          </button>

          <button
            className={`now-playing__btn now-playing__btn--wide-only ${playerRepeatMode !== 'none' ? 'active' : ''}`}
            onClick={cycleReceiverRepeat}
            disabled={!!listenTogetherHostSessionId}
            style={{ cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer' }}
            title={listenTogetherHostSessionId ? "Playback controlled by host" : `Repeat Mode: ${playerRepeatMode === 'none' ? 'Off' : playerRepeatMode === 'all' ? 'Repeat All' : 'Repeat One'}`}
          >
            {playerRepeatMode === 'one' ? Icons.repeatOne : Icons.repeat}
          </button>

          <button
            className={`now-playing__like ${likedTracks.has(playerTrack.id) ? 'liked' : ''}`}
            onClick={() => !playerIsPlaceholder && toggleLike(playerTrack)}
            disabled={playerIsPlaceholder}
            aria-label="Like"
          >
            {likedTracks.has(playerTrack.id) ? Icons.heartFilled : Icons.heart}
          </button>

          <button
            className={`now-playing__btn now-playing__save ${playlistPickerTrack && playbackTrackKey(playlistPickerTrack) === playbackTrackKey(playerTrack) ? 'active' : ''}`}
            onClick={() => openPlaylistPicker(playerTrack)}
            disabled={playerIsPlaceholder}
            title="Save to playlist"
            aria-label={`Save ${playerTrack.title} to a playlist`}
          >
            {Icons.bookmark}
          </button>
        </div>

        {/* Center: song info & seek slider */}
        <div className="now-playing__center">
          <div className="now-playing__song" onClick={() => { setPlayerViewMode('expanded'); localStorage.setItem('spice_player_view_mode', 'expanded'); }} style={{ cursor: 'pointer' }} title="Expand Player View">
            <img className="now-playing__art" src={playerTrack.artworkUrl || '/icon.svg'} alt={playerTrack.title} />
            <div className="now-playing__info">
              <span className="now-playing__title truncate">{playerTrack.title}</span>
              <span className="now-playing__artist truncate">
                {isControllingRemoteReceiver ? `${receiverLabel} - ` : ''}{playerTrack.artists.map(a => a.name).join(', ')}
              </span>
            </div>

            {/* Animative waveform */}
            <div className={`now-playing__waveform ${!playerIsPlaying ? 'paused' : ''}`}>
              <div className="now-playing__waveform-bar"></div>
              <div className="now-playing__waveform-bar"></div>
              <div className="now-playing__waveform-bar"></div>
              <div className="now-playing__waveform-bar"></div>
              <div className="now-playing__waveform-bar"></div>
            </div>
          </div>

          {renderSongShareButton(playerTrack, 'now-playing__btn now-playing__share')}

          <button
            onClick={() => setListenTogetherDialogOpen(true)}
            className="now-playing__btn"
            title="Listen Together"
            aria-label="Listen Together"
            style={listenTogetherSession || listenTogetherHostSessionId ? { color: 'var(--accent-pink)', borderColor: 'var(--accent-pink)', background: 'rgba(236,72,153,0.1)' } : {}}
          >
            {Icons.listenTogether}
          </button>

          <div className="now-playing__seek" style={{ opacity: listenTogetherHostSessionId ? 0.7 : 1 }}>
            <span>{formatTime(playerProgress)}</span>
            <div
              className="now-playing__seek-track"
              onClick={listenTogetherHostSessionId ? undefined : handleReceiverSeek}
              style={{ cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer' }}
            >
              <div
                className="now-playing__progress-fill"
                style={{ width: `${playerDuration > 0 ? (playerProgress / playerDuration) * 100 : 0}%` }}
              ></div>
            </div>
            <span>{formatTime(playerDuration)}</span>
            {!isControllingRemoteReceiver && isLoadingStream && <span className="loader-glow">Resolving stream...</span>}
          </div>
        </div>

        {/* Right: volume & queue controls */}
        <div className="now-playing__right-controls">
          {renderSpiceConnectReceiverSelect('bar')}

          <button
            className={`now-playing__btn ${showBarLyrics ? 'active' : ''}`}
            onClick={() => {
              if (isControllingRemoteReceiver) return;
              setShowBarLyrics(!showBarLyrics);
              setShowQueueDrawer(false);
            }}
            disabled={isControllingRemoteReceiver}
            title={isControllingRemoteReceiver ? 'Lyrics open on this browser only. Switch receiver to this device first.' : 'Real-time Synced Lyrics'}
            aria-label="Real-time Synced Lyrics"
          >
            {Icons.microphone}
          </button>

          <button
            className={`now-playing__btn ${showQueueDrawer ? 'active' : ''}`}
            onClick={() => {
              setShowQueueDrawer(!showQueueDrawer);
              setShowBarLyrics(false);
            }}
            title="Up Next Queue"
            aria-label="Up Next Queue"
          >
            {Icons.list}
          </button>

          <button
            className="now-playing__btn"
            onClick={() => {
              setPlayerViewMode('mini');
              localStorage.setItem('spice_player_view_mode', 'mini');
              setShowBarLyrics(false);
              setShowQueueDrawer(false);
            }}
            title="Switch to Floating Mini Player"
            aria-label="Switch to Floating Mini Player"
          >
            {Icons.miniPlayer}
          </button>

          <div
            className="now-playing__volume"
            onMouseEnter={() => setIsVolumeHovered(true)}
            onMouseLeave={() => setIsVolumeHovered(false)}
            onWheel={adjustReceiverVolumeByWheel}
            style={{ position: 'relative' }}
          >
            <button
              className="now-playing__volume-btn"
              onClick={() => {
                if (isControllingRemoteReceiver) {
                  showSpiceNotice(`Volume Boost stays on ${receiverLabel}; remote volume is limited to 100%.`, 'info');
                  return;
                }
                const newState = !volumeBoosterAccepted;
                setVolumeBoosterAccepted(newState);
                localStorage.setItem('spice_volume_booster_accepted', String(newState));
                if (!newState && playerVolume > 200) {
                  setReceiverVolume(200);
                }
              }}
              style={{
                fontSize: '0.65rem',
                fontWeight: 'bold',
                width: 'auto',
                padding: '0 6px',
                color: !isControllingRemoteReceiver && volumeBoosterAccepted ? 'var(--accent-pink)' : 'var(--text-secondary)'
              }}
              title={isControllingRemoteReceiver ? `Volume Boost is managed on ${receiverLabel}` : 'Toggle Volume Booster'}
            >
              BOOST
            </button>




            <button className="now-playing__volume-btn" onClick={() => setReceiverVolume(playerVolume === 0 ? 70 : 0)}>
              {playerVolume === 0 ? Icons.volumeMuted : Icons.volume}
            </button>
            {isVolumeHovered && (
              <div
                style={{
                  position: 'absolute',
                  top: '-24px',
                  right: '0',
                  background: 'rgba(0, 0, 0, 0.8)',
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                  transform: 'translateX(-50%)'
                }}
              >
                {playerVolume}%
              </div>
            )}
            <input
              type="range"
              className="now-playing__volume-slider"
              min="0"
              max={playerVolumeMax}
              value={playerVolume}
              onChange={(e) => {
                const newVol = Number(e.target.value);
                setReceiverVolume(newVol);
              }}
              style={{
                background: `linear-gradient(to right, var(--accent-pink) 0%, var(--accent-pink) ${(Math.min(playerVolume, playerVolumeMax) / playerVolumeMax) * 100}%, hsla(270, 10%, 25%, 0.5) ${(Math.min(playerVolume, playerVolumeMax) / playerVolumeMax) * 100}%, hsla(270, 10%, 25%, 0.5) 100%)`
              }}
            />

          </div>
        </div>

        {/* Mobile-only Play/Pause button */}
        <button
          className="now-playing__mobile-play"
          onClick={(e) => { e.stopPropagation(); toggleReceiverPlayPause(); }}
          style={{ display: 'none' }}
        >
          {playerIsPlaying ? Icons.pause : Icons.play}
        </button>
      </footer>

      {/* ═══ Expanded Player Immersive Full-Screen Overlay ═══ */}
      {playerViewMode === 'expanded' && (
        <div className="expanded-player animate-in" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(6, 6, 6, 0.9)',
          backgroundImage: `radial-gradient(circle at 50% 30%, rgba(var(--accent-pink-rgb, 236, 72, 153), 0.18), transparent 60%)`,
          backdropFilter: 'blur(50px)',
          WebkitBackdropFilter: 'blur(50px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '40px 24px',
          color: '#fff',
          fontFamily: 'Outfit, sans-serif'
        }}>
          {/* Header */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1000px' }}>
            <button
              onClick={() => {
                setPlayerViewMode('mini');
                localStorage.setItem('spice_player_view_mode', 'mini');
              }}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Mini Player"
            >
              {Icons.miniPlayer} Floating Mini Player
            </button>
            <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.2em', opacity: 0.5, fontWeight: 700 }}>Now Playing</div>
            <button
              onClick={() => {
                setPlayerViewMode('bar');
                localStorage.setItem('spice_player_view_mode', 'bar');
              }}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '1.75rem', padding: '4px 10px', outline: 'none' }}
              title="Close"
            >
              {Icons.close}
            </button>
          </div>

          {/* Central content layout: Grid with artwork + controls, and Optional Playlist Queue/Lyrics */}
          {/* Central content layout: Grid with artwork + controls, and Optional Playlist Queue/Lyrics */}
          <div className="expanded-player__grid">

            {/* Column 1: Massive Spinning Artwork & Titles */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div
                className={`expanded-player__art-box ${playerIsPlaying ? 'vinyl-spin' : ''}`}
                style={{
                  boxShadow: `0 24px 64px rgba(0,0,0,0.8), 0 0 40px rgba(var(--accent-pink-rgb, 236, 72, 153), 0.25)`
                }}
              >
                <img
                  src={playerTrack.artworkUrl || '/icon.svg'}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>

              <h2 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 8px 0', width: '100%', fontFamily: 'Outfit, sans-serif' }} className="truncate">
                {playerTrack.title}
              </h2>
              <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', margin: 0, width: '100%' }} className="truncate">
                {isControllingRemoteReceiver ? `${receiverLabel} - ` : ''}{playerTrack.artists.map(a => a.name).join(', ')}
              </p>
              <div style={{ marginTop: '18px', width: 'min(100%, 320px)' }}>
                {renderSpiceConnectReceiverSelect('expanded')}
              </div>
            </div>

            {/* Column 2: Immersive Tabbed Controller (Controls / Up Next / Lyrics) */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '420px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '24px', padding: '24px', backdropFilter: 'blur(30px)', width: '100%', minWidth: 0 }}>

              {/* Tab headers */}
              <div style={{ display: 'flex', gap: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', marginBottom: '20px' }}>
                {[
                  { id: 'controls', label: 'Player Controls', icon: Icons.headphones },
                  { id: 'queue', label: 'Up Next Queue', icon: Icons.shuffle },
                  { id: 'lyrics', label: 'Active Lyrics', icon: Icons.microphone }
                ].map(t => {
                  const isActive = expandedTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setExpandedTab(t.id as any)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: isActive ? 'var(--accent-pink)' : 'var(--text-secondary)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        cursor: 'pointer',
                        paddingBottom: '8px',
                        borderBottom: isActive ? '2px solid var(--accent-pink)' : '2px solid transparent',
                        transition: 'all 0.15s ease',
                        outline: 'none'
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>{t.icon} {t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Content Panels */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {expandedTab === 'controls' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Audio visualization mock */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '60px', width: '100%', padding: '12px 24px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      {[...Array(24)].map((_, i) => {
                        const baseVal = 20 + Math.abs(Math.sin((i + playerProgress) * 0.5)) * 60;
                        const randHeight = playerIsPlaying ? baseVal + Math.abs(Math.sin(i * 12.9898 + playerProgress)) * 20 : 15;
                        return (
                          <div
                            key={i}
                            style={{
                              width: '3%',
                              height: `${Math.min(100, Math.max(5, randHeight))}%`,
                              background: 'var(--accent-pink)',
                              borderRadius: '4px',
                              transition: 'height 0.1s ease',
                              boxShadow: '0 0 8px var(--accent-pink)'
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Progress seeker */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: listenTogetherHostSessionId ? 0.7 : 1 }}>
                      <div
                        style={{ position: 'relative', height: '8px', width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer' }}
                        onClick={listenTogetherHostSessionId ? undefined : handleReceiverSeek}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${playerDuration > 0 ? (playerProgress / playerDuration) * 100 : 0}%`,
                            background: 'var(--accent-pink)',
                            borderRadius: '4px',
                            boxShadow: '0 0 10px var(--accent-pink)'
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <span>{formatTime(playerProgress)}</span>
                        <span>{formatTime(playerDuration)}</span>
                      </div>
                    </div>

                    {/* Huge transport buttons */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '32px', opacity: listenTogetherHostSessionId ? 0.5 : 1 }}>
                      <button
                        onClick={toggleReceiverShuffle}
                        disabled={!!listenTogetherHostSessionId}
                        style={{ background: 'none', border: 'none', color: playerShuffleEnabled ? 'var(--accent-pink)' : '#fff', opacity: playerShuffleEnabled ? 1 : 0.4, cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer', outline: 'none', transition: 'all 0.15s ease' }}
                        className="expanded-player__btn"
                        title={listenTogetherHostSessionId ? "Playback controlled by host" : "Shuffle"}
                      >
                        <span style={{ transform: 'scale(1.4)', display: 'inline-block' }}>{Icons.shuffle}</span>
                      </button>

                      <button
                        onClick={handleReceiverPrev}
                        disabled={!!listenTogetherHostSessionId}
                        style={{ background: 'none', border: 'none', color: '#fff', cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer', outline: 'none', transition: 'all 0.15s ease' }}
                        className="expanded-player__btn"
                        title={listenTogetherHostSessionId ? "Playback controlled by host" : "Previous"}
                      >
                        <span style={{ transform: 'scale(1.5)', display: 'inline-block' }}>{Icons.prev}</span>
                      </button>

                      <button
                        onClick={toggleReceiverPlayPause}
                        disabled={!!listenTogetherHostSessionId}
                        style={{
                          width: '80px',
                          height: '80px',
                          borderRadius: '50%',
                          background: 'var(--accent-pink)',
                          border: 'none',
                          color: '#fff',
                          cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer',
                          outline: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 8px 24px rgba(var(--accent-pink-rgb, 236, 72, 153), 0.4)',
                          transition: 'all 0.15s ease',
                          opacity: listenTogetherHostSessionId ? 0.5 : 1
                        }}
                        className="expanded-player__btn-play"
                        title={listenTogetherHostSessionId ? "Playback controlled by host" : (playerIsPlaying ? 'Pause' : 'Play')}
                      >
                        <span style={{ transform: 'scale(2.0)', display: 'inline-block' }}>
                          {playerIsPlaying ? Icons.pause : Icons.play}
                        </span>
                      </button>

                      <button
                        onClick={handleReceiverNext}
                        disabled={!!listenTogetherHostSessionId}
                        style={{ background: 'none', border: 'none', color: '#fff', cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer', outline: 'none', transition: 'all 0.15s ease' }}
                        className="expanded-player__btn"
                        title={listenTogetherHostSessionId ? "Playback controlled by host" : "Next"}
                      >
                        <span style={{ transform: 'scale(1.5)', display: 'inline-block' }}>{Icons.next}</span>
                      </button>

                      <button
                        onClick={cycleReceiverRepeat}
                        disabled={!!listenTogetherHostSessionId}
                        style={{ background: 'none', border: 'none', color: playerRepeatMode !== 'none' ? 'var(--accent-pink)' : '#fff', opacity: playerRepeatMode !== 'none' ? 1 : 0.4, cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer', outline: 'none', transition: 'all 0.15s ease' }}
                        className="expanded-player__btn"
                        title={listenTogetherHostSessionId ? "Playback controlled by host" : `Repeat Mode: ${playerRepeatMode === 'none' ? 'Off' : playerRepeatMode === 'all' ? 'Repeat All' : 'Repeat One'}`}
                      >
                        <span style={{ transform: 'scale(1.4)', display: 'inline-block' }}>{playerRepeatMode === 'one' ? Icons.repeatOne : Icons.repeat}</span>
                      </button>
                    </div>

                    {/* Volume and info footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                          className={`now-playing__like ${likedTracks.has(playerTrack.id) ? 'liked' : ''}`}
                          onClick={() => !playerIsPlaceholder && toggleLike(playerTrack)}
                          disabled={playerIsPlaceholder}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', borderRadius: '50%', cursor: playerIsPlaceholder ? 'not-allowed' : 'pointer' }}
                        >
                          <span style={{ display: 'inline-flex', transform: 'scale(1.2)' }}>
                            {likedTracks.has(playerTrack.id) ? Icons.heartFilled : Icons.heart}
                          </span>
                        </button>

                        <button
                          className="expanded-player__round-action"
                          onClick={() => openPlaylistPicker(playerTrack)}
                          disabled={playerIsPlaceholder}
                          title="Save to playlist"
                          aria-label={`Save ${playerTrack.title} to a playlist`}
                        >
                          {Icons.bookmark}
                        </button>

                        <button
                          className="expanded-player__round-action"
                          onClick={(event) => shareSongLink(playerTrack, event)}
                          disabled={playerIsPlaceholder}
                          title={`Share "${playerTrack.title}"`}
                          aria-label={`Share ${playerTrack.title}`}
                        >
                          {Icons.share}
                        </button>

                        <button
                          className="expanded-player__round-action"
                          onClick={() => setListenTogetherDialogOpen(true)}
                          title="Listen Together"
                          aria-label="Listen Together"
                          style={listenTogetherSession || listenTogetherHostSessionId ? { color: 'var(--accent-pink)', borderColor: 'var(--accent-pink)', background: 'rgba(236,72,153,0.1)' } : {}}
                        >
                          {Icons.listenTogether}
                        </button>

                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '180px' }}>
                        <span style={{ opacity: 0.6 }}>{Icons.volume}</span>
                        <input
                          type="range"
                          min="0"
                          max={volumeBoosterAccepted ? 1000 : 200}
                          value={playerVolume}
                          onChange={(e) => setReceiverVolume(Number(e.target.value))}
                          onWheel={adjustReceiverVolumeByWheel}
                          style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent-pink)' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {expandedTab === 'queue' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {playerQueue.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', padding: '12px', textAlign: 'center' }}>
                          {isControllingRemoteReceiver ? `${receiverLabel} has no visible queue yet.` : 'Queue is empty.'}
                        </div>
                    ) : (
                      <VirtualTrackRows
                        tracks={playerQueue}
                        height={310}
                        rowHeight={66}
                        resetKey={`${isControllingRemoteReceiver ? selectedRemoteDeviceId : activeProfileId}:expanded-queue:${trackListFingerprint(playerQueue)}`}
                        focusIndex={playerQueueIndex}
                        ariaLabel="Expanded play queue"
                        renderRow={(song, idx) => {
                        const isActive = idx === playerQueueIndex;
                        return (
                          <div
                            role="button"
                            tabIndex={0}
                            aria-current={isActive ? 'true' : undefined}
                            aria-label={`Play ${song.title}`}
                            onClick={() => startTrackOnActiveReceiver(song, playerQueue)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                startTrackOnActiveReceiver(song, playerQueue);
                              }
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '12px', background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent', border: isActive ? '1px solid var(--accent-pink)' : '1px solid transparent', cursor: 'pointer', transition: 'all 0.15s ease' }}
                          >
                            <img src={song.artworkUrl || '/icon.svg'} alt="" loading="lazy" decoding="async" fetchPriority="low" draggable={false} style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isActive ? 'var(--accent-pink)' : '#fff' }} className="truncate">{song.title}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }} className="truncate">{song.artists.map(a => a.name).join(', ')}</div>
                            </div>
                          </div>
                        );
                        }}
                      />
                    )}
                  </div>
                )}

                {expandedTab === 'lyrics' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
                    {/* Karaoke Controls Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '12px',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      backdropFilter: 'blur(10px)',
                      marginBottom: '4px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                        <span style={{ display: 'inline-flex' }}>{Icons.microphone}</span>
                        <span style={{ letterSpacing: '1px', fontFamily: 'Outfit, sans-serif' }}>KARAOKE MODE</span>
                        {lyricsData && !lyricsData.isSynced && lyricsData.lines.length > 0 && (
                          <span style={{
                            fontSize: '0.6rem',
                            background: 'rgba(236, 72, 153, 0.15)',
                            color: 'var(--accent-pink)',
                            padding: '2px 6px',
                            borderRadius: '20px',
                            fontWeight: 700,
                            letterSpacing: '0.5px'
                          }}>
                            UNSYNCED
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => lyricsData?.isSynced && setIsKaraokeMode(!isKaraokeMode)}
                        style={{
                          background: isKaraokeMode ? 'linear-gradient(135deg, var(--accent-pink), #ec4899)' : 'rgba(255,255,255,0.08)',
                          border: 'none',
                          color: '#fff',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: lyricsData?.isSynced ? 'pointer' : 'not-allowed',
                          boxShadow: isKaraokeMode ? '0 0 10px rgba(236, 72, 153, 0.4)' : 'none',
                          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      >
                        {isKaraokeMode ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    {/* Scrollable Lyric container */}
                    <div
                      ref={lyricsContainerRef}
                      style={{
                        overflowY: 'auto',
                        flex: 1,
                        maxHeight: '265px',
                        paddingRight: '6px',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '20px',
                        padding: '12px 0',
                        scrollBehavior: 'smooth'
                      }}
                      className="custom-scrollbar"
                    >
                      {lyricsLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '150px', gap: '12px', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            border: '2px solid rgba(255,255,255,0.1)',
                            borderTopColor: 'var(--accent-pink)',
                            animation: 'spin 1s linear infinite'
                          }} />
                          <span style={{ fontFamily: 'Outfit, sans-serif' }}>Tuning sync wavelengths...</span>
                        </div>
                      ) : !lyricsData || lyricsData.lines.length === 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '150px', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', fontFamily: 'Outfit, sans-serif' }}>
                          No lyrics found for this track.
                        </div>
                      ) : (
                        lyricsData.lines.map((line, idx) => {
                          const isActive = idx === activeLineIdx;
                          const isPast = idx < activeLineIdx;
                          const isChorus = line.text.includes('[Chorus]');
                          const isHeader = line.text.startsWith('[') && line.text.endsWith(']');

                          return (
                            <div
                              key={idx}
                              data-active={isActive}
                              onClick={() => {
                                if (!lyricsData.isSynced) return;
                                seekToPosition(line.time);
                              }}
                              style={{
                                fontSize: isChorus ? '1.15rem' : '1rem',
                                fontWeight: (isChorus || isHeader) ? 800 : (isActive ? 700 : 500),
                                color: isHeader ? 'var(--accent-pink)' : isChorus ? '#fff' : (isActive ? '#fff' : 'rgba(255,255,255,0.4)'),
                                fontFamily: 'Outfit, sans-serif',
                                lineHeight: 1.4,
                                textShadow: isActive
                                  ? (isHeader ? '0 0 10px rgba(236,72,153,0.4)' : '0 0 12px rgba(255,255,255,0.3)')
                                  : 'none',
                                cursor: lyricsData.isSynced ? 'pointer' : 'default',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                transform: isActive ? 'scale(1.04)' : 'scale(1)',
                                background: isActive ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                                border: isActive ? '1px solid rgba(255,255,255,0.03)' : '1px solid transparent',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                opacity: isActive ? 1 : (isPast ? 0.35 : 0.6)
                              }}
                            >
                              {lyricsData.isSynced && isKaraokeMode && line.words.length > 0 && !isHeader ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
                                  {line.words.map((w, wIdx) => {
                                    const isWordActive = progress >= w.start && progress < (w.start + w.duration);
                                    const isWordPassed = progress >= (w.start + w.duration);

                                    let wColor = isActive ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.3)';
                                    let wGlow = 'none';
                                    let wWeight = isActive ? 700 : 500;

                                    if (isWordPassed) {
                                      wColor = '#fff';
                                      wWeight = 800;
                                      wGlow = '0 0 8px rgba(255,255,255,0.4)';
                                    } else if (isWordActive) {
                                      wColor = 'var(--accent-pink)';
                                      wWeight = 800;
                                      wGlow = '0 0 12px var(--accent-pink)';
                                    }

                                    return (
                                      <span
                                        key={wIdx}
                                        style={{
                                          color: wColor,
                                          fontWeight: wWeight,
                                          textShadow: wGlow,
                                          transition: 'all 0.1s linear',
                                          whiteSpace: 'pre',
                                          display: 'inline-block'
                                        }}
                                      >
                                        {w.word}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                line.text
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>

          </div>

          {/* Footer branding */}
          <div style={{ opacity: 0.3, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Spice Premium Audio Resolution Engine</span>
            <span>•</span>
            <span>PWA v1.0.87</span>
          </div>

        </div>
      )}

      {/* ═══ Floating Mini Player Widget ═══ */}
      {playerViewMode === 'mini' && (
        <div
          className="mini-player animate-in"
          onPointerDown={handleMiniPointerDown}
          onPointerMove={handleMiniPointerMove}
          onPointerUp={handleMiniPointerUp}
          style={{
            position: 'fixed',
            left: miniPlayerPos ? `${miniPlayerPos.x}px` : 'auto',
            top: miniPlayerPos ? `${miniPlayerPos.y}px` : 'auto',
            right: miniPlayerPos ? 'auto' : '24px',
            bottom: miniPlayerPos ? 'auto' : '24px',
            width: '360px',
            minHeight: '140px',
            height: 'auto',
            maxHeight: 'calc(100vh - 32px)',
            background: 'rgba(10, 10, 10, 0.88)',
            backgroundImage: `radial-gradient(circle at 10% 10%, rgba(var(--accent-pink-rgb, 236, 72, 153), 0.12), transparent 70%)`,
            border: '1px solid var(--border-color)',
            borderRadius: '24px',
            backdropFilter: 'blur(30px)',
            WebkitBackdropFilter: 'blur(30px)',
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.7), 0 0 20px rgba(var(--accent-pink-rgb, 236, 72, 153), 0.2)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '14px',
            gap: '8px',
            fontFamily: 'Outfit, sans-serif',
            color: '#fff',
            cursor: isDraggingMini ? 'grabbing' : 'grab',
            userSelect: 'none',
            touchAction: 'none',
            overflowY: 'auto'
          }}
        >
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            {/* Artwork */}
            <div
              style={{
                position: 'relative',
                width: '60px',
                height: '60px',
                borderRadius: '12px',
                overflow: 'hidden',
                flexShrink: 0,
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                cursor: 'pointer'
              }}
              onClick={toggleReceiverPlayPause}
              title={playerIsPlaying ? 'Pause' : 'Play'}
            >
              <img
                src={playerTrack.artworkUrl || '/icon.svg'}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {/* Dynamic Hover Play/Pause overlay */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0,
                transition: 'opacity 0.2s ease',
              }}
                className="mini-player__art-hover"
              >
                <span style={{ display: 'inline-flex' }}>
                  {playerIsPlaying ? Icons.pause : Icons.play}
                </span>
              </div>
            </div>

            {/* Details */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fff', lineHeight: 1.2 }} className="truncate">
                {playerTrack.title}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }} className="truncate">
                {isControllingRemoteReceiver ? `${receiverLabel} - ` : ''}{playerTrack.artists.map(a => a.name).join(', ')}
              </div>
              {renderSpiceConnectReceiverSelect('mini')}
            </div>

            {/* Playback Controls (compact) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <button
                onClick={handleReceiverPrev}
                disabled={!!listenTogetherHostSessionId}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.6)',
                  cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  padding: '4px',
                  outline: 'none',
                  transition: 'color 0.15s',
                  opacity: listenTogetherHostSessionId ? 0.35 : 1
                }}
                title="Previous"
              >
                {Icons.prev}
              </button>

              <button
                onClick={toggleReceiverPlayPause}
                disabled={!!listenTogetherHostSessionId}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--accent-pink)',
                  border: 'none',
                  color: '#fff',
                  cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer',
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 10px rgba(var(--accent-pink-rgb, 236, 72, 153), 0.3)',
                  transition: 'transform 0.15s ease',
                  opacity: listenTogetherHostSessionId ? 0.5 : 1
                }}
                onMouseEnter={(e) => !listenTogetherHostSessionId && (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={(e) => !listenTogetherHostSessionId && (e.currentTarget.style.transform = 'scale(1)')}
              >
                <span style={{ display: 'inline-flex', transform: 'scale(0.85)' }}>
                  {playerIsPlaying ? Icons.pause : Icons.play}
                </span>
              </button>

              <button
                onClick={handleReceiverNext}
                disabled={!!listenTogetherHostSessionId}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.6)',
                  cursor: listenTogetherHostSessionId ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  padding: '4px',
                  outline: 'none',
                  transition: 'color 0.15s',
                  opacity: listenTogetherHostSessionId ? 0.35 : 1
                }}
                title="Next"
              >
                {Icons.next}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '8px', marginTop: '2px' }}>
            {/* Custom Volume Slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0 }}>
              <button
                onClick={() => setReceiverVolume(playerVolume === 0 ? 70 : 0)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  outline: 'none',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '0.85rem',
                  transition: 'all 0.15s ease'
                }}
                title={playerVolume === 0 ? 'Unmute' : 'Mute'}
              >
                {playerVolume === 0 ? Icons.volumeMuted : Icons.volume}
              </button>
              <input
                type="range"
                className="mini-player__volume-slider"
                min="0"
                max={volumeBoosterAccepted ? 1000 : 200}
                value={playerVolume}
                onChange={(e) => {
                  const newVol = Number(e.target.value);
                  setReceiverVolume(newVol);
                }}
                onWheel={adjustReceiverVolumeByWheel}
                style={{
                  width: '64px',
                  height: '4px',
                  borderRadius: '2px',
                  outline: 'none',
                  cursor: 'pointer',
                  WebkitAppearance: 'none',
                  background: `linear-gradient(to right, var(--accent-pink) 0%, var(--accent-pink) ${Math.min(playerVolume, volumeBoosterAccepted ? 1000 : 200) / (volumeBoosterAccepted ? 10 : 2)}%, rgba(255,255,255,0.1) ${Math.min(playerVolume, volumeBoosterAccepted ? 1000 : 200) / (volumeBoosterAccepted ? 10 : 2)}%, rgba(255,255,255,0.1) 100%)`
                }}
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', width: '22px', textAlign: 'right', display: 'inline-block', flexShrink: 0 }}>
                {playerVolume}%
              </span>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => !playerIsPlaceholder && toggleLike(playerTrack)}
                disabled={playerIsPlaceholder}
                style={{
                  background: 'none',
                  border: 'none',
                  color: likedTracks.has(playerTrack.id) ? 'var(--accent-pink)' : 'rgba(255,255,255,0.4)',
                  cursor: playerIsPlaceholder ? 'not-allowed' : 'pointer',
                  outline: 'none',
                  padding: '4px',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.15s ease'
                }}
                title={likedTracks.has(playerTrack.id) ? 'Unlike' : 'Like'}
              >
                {likedTracks.has(playerTrack.id) ? Icons.heartFilled : Icons.heart}
              </button>

              <button
                onClick={() => openPlaylistPicker(playerTrack)}
                disabled={playerIsPlaceholder}
                className="mini-player__action-btn"
                title="Save to playlist"
                aria-label={`Save ${playerTrack.title} to a playlist`}
                style={{ width: '26px', height: '26px' }}
              >
                <span style={{ transform: 'scale(0.85)', display: 'inline-flex' }}>{Icons.bookmark}</span>
              </button>

              <button
                onClick={(event) => shareSongLink(playerTrack, event)}
                disabled={playerIsPlaceholder}
                className="mini-player__action-btn"
                title={`Share "${playerTrack.title}"`}
                aria-label={`Share ${playerTrack.title}`}
                style={{ width: '26px', height: '26px' }}
              >
                <span style={{ transform: 'scale(0.85)', display: 'inline-flex' }}>{Icons.share}</span>
              </button>

              <button
                onClick={() => setListenTogetherDialogOpen(true)}
                className="mini-player__action-btn"
                title="Listen Together"
                aria-label="Listen Together"
                style={{
                  width: '26px',
                  height: '26px',
                  ...(listenTogetherSession || listenTogetherHostSessionId ? { color: 'var(--accent-pink)', borderColor: 'var(--accent-pink)', background: 'rgba(236,72,153,0.1)', cursor: 'pointer' } : { cursor: 'pointer' })
                }}
              >
                <span style={{ transform: 'scale(0.85)', display: 'inline-flex' }}>{Icons.listenTogether}</span>
              </button>

              {/* Mini Queue Toggle */}
              <button
                onClick={() => setShowMiniQueue(!showMiniQueue)}
                style={{
                  background: showMiniQueue ? 'var(--accent-pink)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  width: '26px',
                  height: '26px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                  boxShadow: showMiniQueue ? '0 0 8px rgba(236, 72, 153, 0.4)' : 'none'
                }}
                title="Toggle Mini Queue"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
              </button>

              {/* Lyrics Toggle */}
              <button
                onClick={() => !isControllingRemoteReceiver && setShowMiniLyrics(!showMiniLyrics)}
                disabled={isControllingRemoteReceiver}
                style={{
                  background: showMiniLyrics ? 'var(--accent-pink)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  width: '26px',
                  height: '26px',
                  borderRadius: '8px',
                  cursor: isControllingRemoteReceiver ? 'not-allowed' : 'pointer',
                  opacity: isControllingRemoteReceiver ? 0.35 : 1,
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                  boxShadow: showMiniLyrics ? '0 0 8px rgba(236, 72, 153, 0.4)' : 'none'
                }}
                title="Toggle Lyrics View"
              >
                <span style={{ transform: 'scale(0.85)', display: 'inline-flex' }}>{Icons.microphone}</span>
              </button>

              <button
                onClick={() => {
                  setPlayerViewMode('expanded');
                  localStorage.setItem('spice_player_view_mode', 'expanded');
                }}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.7)',
                  width: '26px',
                  height: '26px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
                title="Expand Player"
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
              >
                <span style={{ transform: 'scale(0.85)', display: 'inline-flex' }}>{Icons.expand}</span>
              </button>

              <button
                onClick={() => {
                  setPlayerViewMode('bar');
                  localStorage.setItem('spice_player_view_mode', 'bar');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  padding: '4px',
                  outline: 'none',
                  transition: 'color 0.15s',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Minimize to Bar"
                onMouseEnter={(e) => e.currentTarget.style.color = '#f87171'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
              >
                {Icons.close}
              </button>
            </div>
          </div>

          {/* Mini Player Synced Lyrics Strip */}
          {showMiniLyrics && (
            <div style={{
              width: '100%',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: '8px',
              marginTop: '4px',
              textAlign: 'center',
              minHeight: '38px',
              maxHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Outfit, sans-serif',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--accent-pink)',
              textShadow: '0 0 8px rgba(236,72,153,0.3)',
              overflowY: 'auto',
              whiteSpace: 'normal',
              paddingLeft: '4px',
              paddingRight: '4px',
              zIndex: 1,
              userSelect: 'text',
              cursor: 'default',
              lineHeight: 1.3
            }} className="custom-scrollbar">
              {lyricsLoading ? (
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>Tuning...</span>
              ) : activeLineIdx >= 0 && lyricsData ? (
                <span className="animate-in" key={activeLineIdx} style={{ animationDuration: '0.3s' }}>
                  {lyricsData.lines[activeLineIdx].text}
                </span>
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {lyricsData && !lyricsData.isSynced && lyricsData.lines.length > 0 ? 'Lyrics are not time-synced' : '(Instrumental)'}
                </span>
              )}
            </div>
          )}

          {/* Mini Player Queue List */}
          {showMiniQueue && (
            <div style={{
              width: '100%',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: '8px',
              marginTop: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '120px',
              overflowY: 'auto',
              textAlign: 'left'
            }} className="custom-scrollbar">
              {playerQueue.slice(playerQueueIndex + 1, playerQueueIndex + 6).map((song, idx) => {
                const actualIdx = playerQueueIndex + 1 + idx;
                return (
                  <div
                    key={`${song.id}-${actualIdx}`}
                    onClick={() => startTrackOnActiveReceiver(song, playerQueue)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '4px 8px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid transparent',
                      transition: 'all 0.15s ease',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; e.currentTarget.style.borderColor = 'transparent'; }}
                  >
                    <img src={song.artworkUrl || '/icon.svg'} alt="" style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff' }} className="truncate">{song.title}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }} className="truncate">{song.artists.map(a => a.name).join(', ')}</div>
                    </div>
                  </div>
                );
              })}
              {playerQueue.length <= playerQueueIndex + 1 && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '10px 0' }}>
                  No upcoming tracks in queue
                </div>
              )}
            </div>
          )}

          {/* Interactive Seek Progress strip at the very bottom */}
          <div
            onClick={handleReceiverSeek}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: 'rgba(255,255,255,0.1)',
              borderBottomLeftRadius: '24px',
              borderBottomRightRadius: '24px',
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'height 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.height = '6px'}
            onMouseLeave={(e) => e.currentTarget.style.height = '4px'}
            title="Seek track"
          >
            <div
              style={{
                height: '100%',
                width: `${playerDuration > 0 ? (playerProgress / playerDuration) * 100 : 0}%`,
                background: 'var(--accent-pink)',
                transition: 'width 0.1s linear'
              }}
            />
          </div>

        </div>
      )}
      {remoteTransportDiagnosticsEnabled && (
        <aside
          aria-label="Spice Connect transport diagnostics"
          style={{
            position: 'fixed',
            right: '18px',
            top: '76px',
            zIndex: 10020,
            width: 'min(330px, calc(100vw - 36px))',
            padding: '12px 14px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            background: 'var(--card-bg)',
            color: 'var(--text-primary)',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
            fontFamily: 'Outfit, sans-serif',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <strong style={{ flex: 1, fontSize: '0.78rem', letterSpacing: '0.08em' }}>
              SPICE CONNECT TRACE
            </strong>
            <button
              type="button"
              aria-label="Hide Spice Connect transport diagnostics"
              title="Hide diagnostics (Ctrl+Shift+Alt+L)"
              onClick={() => {
                setRemoteTransportDiagnosticsEnabled(false);
                localStorage.setItem(SPICE_CONNECT_TRANSPORT_DIAGNOSTICS_STORAGE_KEY, 'false');
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'inline-flex',
                padding: '2px',
              }}
            >
              {Icons.close}
            </button>
          </div>
          <div style={{ marginTop: '8px', fontSize: '0.76rem', lineHeight: 1.55 }}>
            <div>
              Route:{' '}
              <strong style={{ color: 'var(--accent-pink)' }}>
                {selectedRemoteDeviceId
                  ? selectedRemoteDeviceUsesLan
                    ? 'LOCAL NETWORK DIRECT'
                    : 'CLOUD SERVER FALLBACK'
                  : 'NO RECEIVER SELECTED'}
              </strong>
            </div>
            {selectedRemoteDeviceId && remoteLanLatencyMsByDevice[selectedRemoteDeviceId] !== undefined && (
              <div>LAN round trip: {remoteLanLatencyMsByDevice[selectedRemoteDeviceId]} ms</div>
            )}
            <div style={{ marginTop: '5px', color: 'var(--text-secondary)' }}>
              {remoteTransportDiagnostic
                ? `${remoteTransportDiagnostic.direction === 'sent' ? 'Sent' : 'Received'} ${remoteTransportDiagnostic.command} via ${remoteTransportDiagnostic.transport === 'lan' ? 'local network' : 'cloud server'}${remoteTransportDiagnostic.latencyMs !== undefined ? ` (${remoteTransportDiagnostic.latencyMs} ms)` : ''}`
                : 'No playback command observed yet.'}
            </div>
            {remoteTransportDiagnostic && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>
                Peer {remoteTransportDiagnostic.peerDeviceId.slice(0, 18)} · {new Date(remoteTransportDiagnostic.observedAt).toLocaleTimeString()}
              </div>
            )}
          </div>
        </aside>
      )}
      {/* Mobile Bottom Navigation Bar (Visible only on screens <= 600px via media query) */}
      <div
        className="mobile-nav-bar"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '64px',
          background: 'rgba(5, 5, 5, 0.92)',
          borderTop: '1px solid var(--border-color)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          zIndex: 9999,
          display: 'none', // Managed by mobile media queries in globals.css
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '0 8px',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.6)'
        }}
      >
        {[
          { id: 'search', label: 'Search', icon: Icons.search },
          { id: 'library', label: 'Library', icon: Icons.library },
          { id: 'settings', label: 'Settings', icon: Icons.settings }
        ].map((tab) => {
          const isActive = currentPage === tab.id && !selectedPlaylist;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setCurrentPage(tab.id as any);
                setSelectedPlaylist(null);
                setSelectedUser(null);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                color: isActive ? 'var(--accent-pink)' : 'var(--text-secondary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                flex: 1,
                height: '100%',
                transition: 'all 0.15s ease'
              }}
            >
              <span style={{ fontSize: '1.25rem', transition: 'transform 0.15s ease', transform: isActive ? 'scale(1.1)' : 'scale(1)', filter: isActive ? 'drop-shadow(0 0 6px var(--accent-pink))' : 'none' }}>
                {tab.icon}
              </span>
              <span style={{ fontSize: '0.65rem', fontWeight: isActive ? 800 : 500, letterSpacing: '0.02em' }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
