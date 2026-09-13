# Music player rebuild — domain map + slices (lab)

The original player (`app/spice-app.tsx`, ~20k lines, 243 useState, 99
useEffect in one component) is orchestrated from ~40 helper modules that
v2 reuses unchanged. Only orchestration + presentation are rewritten.

## Capability inventory (original)

| # | Capability | Helpers reused | Slice |
|---|---|---|---|
| 1 | Search YT Music / SoundCloud | `/api/local/yt|sc/search` | 1 done |
| 2 | Resolve + play signed streams | `/api/local/yt|sc/track`, stream-signing | 1 done |
| 3 | Queue + auto-advance + transport | `spice-client-runtime` (queue index) | 1 done (single-slot; crossfade later) |
| 4 | Playlists CRUD + sync | `lib/playlist-sync`, `/api/sync/playlists` | 2 |
| 5 | Likes + history + stats | `/api/sync/likes|history|library`, `home-history` | 2 |
| 6 | Lyrics (lrclib + YT/SC) | `/api/local/yt|sc/lyrics` | 3 |
| 7 | Profiles + cloud session | `lib/profile-*`, `/api/sync/profiles` | 3 |
| 8 | Playback profiles, crossfade, boost | `lib/player-audio`, `app/crossfade`, `playback-profiles` | 4 |
| 9 | Themes + accent system | `lib/theme-palette`, theme islands | 4 |
| 10 | Command palette | `command-palette-core` | 5 |
| 11 | Listen together / Spice Connect | `listen-together-core`, `lib/spice-connect*` | 5 |
| 12 | Scrobbling (Last.fm, ListenBrainz) | `lib/lastfm`, `lib/listenbrainz` | 5 |
| 13 | Downloads + offline | `lib/audio-download`, history-sync-queue | 6 |
| 14 | Recommendations / taste | `recommendations`, `taste-affinity`, listeners-* | 6 |
| 15 | Diagnostics, updates, bridge | runtime-diagnostics, local-updates, desktop bridge | 6 |

## Slice 1 — shipped (`/v2/music`)

Search both sources, resolve to signed streams, AAC-first variant pick
with capped-stream warning, single-slot `<audio>` engine, queue with
auto-advance + prev/next, seek, volume. No auth required.

## Slice 2 — shipped (`/v2/music` library section)

Account library behind a Picker: likes (heart on rows + player bar),
history (auto-recorded per play, capped at 50), playlists (create, open,
add now playing, remove, delete). Every mutation follows the
replacement contract — read, modify, POST the full array with profileId,
owned playlists only. Shared playlists render read-only.

## Slice 3 — shipped (`/v2/music` lyrics + profiles)

Lyrics: same lrclib-backed endpoints (`/api/local/yt|sc/lyrics`) with the
same metadata query, synced-LRC parsing with word-level karaoke
(character-proportional timing, sung words light in the accent),
plain fallback, per-track refetch with fast-skip guards.
Profiles: list, switch (same `spice_cloud_profile_id` key the account
reads), and create via the same profiles endpoint + replacement
contract. Per-profile likes/history/playlists already scope by profileId
from slice 2.

## Slice 4 — shipped (`/v2/music` playback + theme)

Dual-slot engine with planned crossfades (same plan/state/gain math,
equal-power or linear, up to 12s, prefetch lead) — natural endings ride
the fade, manual skips and seeks cut it. Volume boost past 100% through
the gain-node path with explicit consent, same volume model and storage
key. Playback profiles (create, switch, delete, crossfade per profile)
persist under the same storage key; smart-queue values ride along for a
later slice. Theme accents share the palette storage key and variable
map, so they repaint the old player too — and the kit follows live.

Also fixed en route: the slice-1 volume slider divided by 100 before
the 0–200 model, collapsing to mute/max. The slider now speaks 0–200
directly.

## Slice 5 — shipped (`/v2/music` palette + scrobble)

Command palette on Ctrl/Cmd+K with the original matching, scoring, and
shortcut: v2 navigation, transport, and lyrics toggle. Scrobble cycle
per track — playing_now on start, scrobble at half duration or four
minutes via `/api/profile/listens`, wrapped in the delivery state
machine (attempts + backoff), with a ✓ scrobbled marker in the bar.

Deferred to its own turn: listen-together hosting/sync and Spice
Connect remote (LAN transport, pairing, realtime) — realtime
multi-device behavior I will not reconstruct untested.

## Slice 6 — shipped (`/v2/music` downloads, taste, diagnostics)
Downloads: best-stream resolve → bytes → browser save, same naming and
web path as the original (the desktop offline-library bridge stays a
desktop-shell concern). Taste: a related-to-now-playing rail plus a
most-liked-artist rail — small honest slices of recommendations; full
affinity graphs stay future work. Diagnostics: lane reachability probe
on the player's own search path, media-core version, and persisted-key
inventory.

## Slice 7 — shipped (queue panel, repeat/shuffle, release bell)

The engine's queue is now visible: effective play order with tap-to-play,
per-track remove, clear, shuffle (same storage key, current stays
pinned), and repeat none/all/one (same key) — auto-advance honors all
three, manual skips still wrap. Release bell in every sidebar foot:
cloud release feed, unread badge, mark-read/all-read under the same
storage key.

## Slice 8 — shipped (word karaoke + listeners-like-you)

Synced lyrics now light word by word in the accent (same
character-proportional timing as the original). New listeners-like-you
rail from the collaborative endpoint — neighbor-kept tracks excluding
anything known, with the locked-state message when taste is thin.

## Slice 9 — shipped (listen together)

Host a session (publishes playback state every 10s, invite by username,
end any time) or join one (polls every 15s, mirrors track + queue +
position with the 1.5s drift rule and play/pause). Same
session/invite/sync endpoints and state shapes. Spice Connect remote
(LAN transport, pairing codes, realtime SSE) stays out — it needs two
devices and a pairing ceremony to verify honestly.

## Deliberate gaps (slice 1)

Single audio slot (no crossfade/gapless), no retry/backoff on resolve
failure, no embed fallback for gated tracks, no persistence across
reloads, no scrobble/sync. Each gap maps to the slice above — nothing
is dropped silently.
