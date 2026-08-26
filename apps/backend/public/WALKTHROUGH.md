# SPICE Walkthrough

## v1.0.172

- [Spice.Music main] Restore full-track playback on YouTube Music: YouTube's new PO-token enforcement was truncating songs to their first megabyte before playback failed. The local runtime now runs the same attestation flow as the YouTube web player (BotGuard → integrity token → per-video PO token) and tags every resolved stream URL with a token, lifting the cap — full-length direct streaming works again without any player-side changes.

## v1.0.171

- [Spice.Music main] Improve failure handling for songs that fail after three retries: YouTube now rejects SPICE's direct stream URLs past the first megabyte, so such tracks now get one last chance in the embedded player before surfacing an error; embed-blocked songs fail fast with a clear diagnostic instead of silently looping transports. Full direct YouTube recovery needs PO token support and lands separately.

## v1.0.170

- [Spice.Music main] Make Volume Boost apply to the current song immediately instead of waiting for the next track: boosting while a YouTube track plays through the embedded player now switches that song to the gain-capable proxy stream on the spot and resumes right where playback was, silently.
- [Spice.Desktop main] Stop the desktop volume slider from overwriting YouTube Music's own volume slider: on YouTube Music the two sliders now work independently (the site keeps its element volume while the desktop slider multiplies loudness separately); SoundCloud and all other embedded services keep their previous combined behavior.

## v1.0.169

- [Spice.Music main] Add the collaborative layer: a privacy-safe "Listeners like you" home shelf aggregates community favorites from taste-neighbors on SPICE Cloud (overlap in likes and plays; only track identities and listener counts are returned, never anyone's library), and those community counts give a small bounded boost across search ordering, radio, and home ranking.
- [Spice.Music main] Add a Dislike button next to Hide and Snooze on every recommendation: disliked tracks are hard-rejected from this profile's recommendations entirely, and the choice syncs with the rest of the taste preferences.
- [Spice.Music main] Smart Mix now sequences for mood flow: after the diversity-aware build, the queue is re-ordered so consecutive tracks stay in related moods and genres instead of whiplashing between them.
- [Spice.Music main] Discovery now learns from success: liking a track by an artist you had not established boosts that artist's future Fresh Finds and gives their tracks a small lasting affinity lift.
- [Spice.Mobile main] The Android home feed gains the same "Listeners like you" community shelf when signed in.

## v1.0.168

- [Spice.Music main] Make the skip signal match Android everywhere on desktop: abandoning a track before 30 seconds or halfway counts double against it, natural completions count double for it, and the learned range and shuffle weighting now use the same scale as the phone.
- [Spice.Music main] Add time-aware mixes: Home grows a "Your morning/afternoon/evening/late-night mix" shelf whenever this hour is one of the profile's established listening windows, shaped by the artists you usually play in that window.
- [Spice.Music main] Add "On repeat" (your most-replayed tracks of the week, straight from the on-device listening log) and "Fresh finds" (unfamiliar artists near your taste, rotated daily) home shelves.
- [Spice.Music main] Sync taste across devices: adaptive skip/completion learning, recommendation preferences, and the listening-event log now follow your SPICE account (last-writer-wins per kind, listening events merge by id), so desktop and phone share one taste profile. Nothing is new to opt into — it uses the existing SPICE Cloud sign-in and stores only the same on-device learning.
- [Spice.Connect main] The Android client pushes its adaptive priorities after feedback and adopts newer cloud copies during account sync.

## v1.0.167

- [Spice.Music main] Introduce the shared taste affinity core: one on-device score per track combining the private taste profile, likes, the adaptive skip/completion learning, and the discovery slider, now driving every surface so recommendations feel coherent across the app.
- [Spice.Music main] Let skips shape taste: repeatedly skipped tracks contribute far less to the private profile (heavily skipped ones count against it), while longer-lived listening events (90-day, on-device) deepen artist signals beyond the recent-play window.
- [Spice.Music main] Personalize search: results keep their relevance order but tracks with genuine affinity can rise a few positions, and a new "For you" filter shows only strong matches for the active profile.
- [Spice.Music main] Upgrade Home: a new "Because you listened to X" radio shelf grown from the strongest artist's most-played track, and Quick Picks now seed from the profile's top genre or artist instead of a hardcoded chart query.
- [Spice.Music main] Smart Mix finally uses taste: candidate tracks are base-scored by the affinity core (likes and diversity rules still shape the final order), and the personalized auto-queue ranks related tracks with the same affinity signals.
- [Spice.Mobile main] Mirror the affinity core on Android: home recommendations and search results re-rank with artist familiarity, likes, and the adaptive skip/completion priorities, using the same bounded re-ranking semantics as the web app.

## v1.0.166

- [Spice.Desktop main] Fix random brief audio dropouts in the YouTube Music and SoundCloud wrappers: the wrapper volume injector no longer routes audio through a Web Audio context unless a volume boost above 100% is actually active, so Chromium suspending that context can no longer silence playback for a second at random; the context also resumes itself immediately on suspension while a boost is in use.
- [Spice.Desktop main] Add hysteresis to the ad blocker's ad muting in both the wrapper interval and the preload observer, so flickering ad indicators can no longer cause audible mute/unmute cycles, while still restoring audio quickly and only undoing SPICE's own mutes.
- [Spice.Desktop main] Add an Audio Output Device setting: Settings now lists the system's audio outputs and routes the embedded player (Spice Music, YouTube Music, SoundCloud) to the chosen device immediately, remembering the choice across restarts and re-applying it whenever the embedded view loads.

- [Spice.Music main] Recover playback automatically when a track's primary source is unavailable: if stream resolution fails, SPICE now searches YouTube Music and SoundCloud for a title/artist match (duration-checked, preview-filtered, up to three candidates per source) and plays the first that resolves, replacing the queue entry and showing a notice instead of dead-ending after retries.
- [Spice.Music main] Make hybrid search surface real YouTube videos alongside YouTube Music songs, YouTube Music videos, and SoundCloud tracks via a new general youtube.com search lane.
- [Spice.Music main] Update the topbar quick search live while typing using the same debounced, request-sequenced search pipeline as the Search page; pressing Enter still resolves pasted links with priority.
- [Spice.Music main] Stop Volume Boost changes from restarting the current track: crossing above 100% while the YouTube embed is playing now defers the proxy switch to the next track boundary with a notice, and direct playback always silences a lingering embed player so the two transports cannot overlap.
- [Spice.Music main] Clamp the YouTube embed volume to the player's supported range so boosted volume values cannot push the iframe player into an invalid state.
- [Spice.Desktop main] Keep desktop and in-app volume sliders from fighting: the preload bridge now binds every volume slider (including the floating mini player), reads the slider the user is actually moving, skips payload pushes during an active drag, and skips redundant synthetic events when values already match; volume persistence to disk is debounced while dragging.
- [Spice.Desktop main] Restore audio reliably after ad muting: ad-blocker mutes are now tagged on the video element and only un-muted when SPICE applied them, so content after an ad no longer stays silent and user-chosen mutes are respected.
- [Spice.Music main] Reset the cached InnerTube session when every stream client fails for a track, so a wedged or throttled session cannot keep failing until the next runtime restart.

## v1.0.165

- [Spice.Admin main] Add per-account moderation controls to the Developer Operations dashboard: temporary timeouts (1 hour, 24 hours, 3 days, or 7 days) and permanent bans, each with an optional reason, plus an Unblock action. Only admin accounts can change moderation state, and admin accounts themselves cannot be blocked.
- [Spice.Auth main] Enforce account moderation server-side on every authenticated request: `verifySession` now reloads the account from the database, so a timeout or ban kills existing sessions immediately instead of waiting for the 30-day JWT to expire. Sign-in and session checks reject blocked accounts with `account_timed_out` or `account_banned` including the reason and, for timeouts, the expiry.
- [Spice.Music main] Show a full-screen blocked-account screen (banned or timed out, with reason and restoration time) as the only usable surface for a blocked account, on the web app, the desktop standard and Native shells, and the native Android client. Auto-login can no longer bypass the block, and signing back in stays blocked until an admin lifts it.
- [Spice.Connect main] Keep Spice Connect device pairings intact during a temporary timeout so paired devices reconnect automatically when the timeout expires; a permanent ban still revokes pairings, pairing codes, and cached authorizations.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.165`.

## v1.0.164

- [Spice.Connect main] Preserve receiver-owned queues when selecting duplicate or long-queue entries, serialize receiver library mutations, and keep downloads and library actions safe across command batches and startup reloads.
- [Spice.Connect main] Match or create private playlists by portable title for pairing-only devices, refresh open mobile lyrics when the receiver advances, and clear highlighting during timed instrumental gaps.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.164`.

## v1.0.163

- [Spice.Connect main] Keep LAN transport cleanup, optimistic receiver updates, and playlist command handlers ordered for the React compiler, and refresh callback refs after render so the receiver always uses the latest committed state.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.163`.

## v1.0.162

- [Spice.Connect main] Sync explicit Like, add-to-playlist, and download actions from the Android controller to the selected desktop or mobile receiver over the same LAN-first transport with cloud fallback.
- [Spice.Mobile main] Add a themed, accessible queue sheet for the active phone or receiver queue and let any queued track become the receiver-authoritative selection.
- [Spice.Mobile main] Follow the active receiver's playback position in the lyrics sheet, highlight timed LRC lines, and automatically keep the current line in view while retaining plain-lyrics fallback.
- [Spice.Mobile main] Ask whether a remote track download belongs on the phone or the selected receiver instead of silently choosing a device.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.162`.

## v1.0.161

- [Spice.Connect main] Prefer a verified, host-only WebRTC data channel for same-network desktop, web, and Android playback commands and receiver state while retaining authenticated cloud discovery, signaling, and fallback.
- [Spice.Connect main] Keep next and previous transitions receiver-authoritative so restart, shuffle history, repeat boundaries, and personalized queue continuation cannot be overwritten by an invented controller-side queue step.
- [Spice.Connect main] Add a hidden desktop transport trace (`Ctrl+Shift+Alt+L`) that reports whether the last playback command used the local network or cloud server, including measured LAN round-trip or cloud request/queue latency when available, and keep that command route separate from the last cloud signaling/fallback request in Settings.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.161`.

## v1.0.160

- [Spice.Desktop main] Start the shared Windows and macOS Electron shell at a roomier `1350x800` default size, including SPICE Native.
- [Spice.Music main] Remove the page-name block and visible command-palette key from the topbar, align search and its source selector to the left, and retain `Ctrl+K` keyboard access.
- [Spice.Mobile main] No matching Android UI change is needed because the native Android client does not use Electron window bounds or the desktop SPICE Music topbar.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.160`.

## v1.0.159

- [Spice.Runtime main] Keep the local update-manifest test synchronized with the authoritative Media Core version so routine version bumps do not break Backend CI.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.159`.

## v1.0.158

- [Spice.Desktop main] Replace the Native launcher homepage with a focused sign-in and registration gate, then skip that gate after account or local-only onboarding so repeat launches open SPICE directly.
- [Spice.Music main] Route the Native title-bar Home action to the SPICE home view instead of returning to the desktop authentication gate.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.158`.

## v1.0.157

- [Spice.Downloads main] Expose Native Downloads Folder controls through Electron context isolation and transfer downloaded audio as bridge-safe bytes so choosing, opening, and saving to a custom folder work in the packaged app.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.157`.

## v1.0.156

- [Spice.Downloads main] Keep Downloads Folder visible under Settings → Support even before desktop folder access is detected, retain the Desktop/Native folder picker, and explain the browser-managed download location on web.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.156`.

## v1.0.155

- [Spice.Desktop main] Render the actual dark-purple SPICE application icon in the standard and Native Windows installer artwork instead of a generic reconstructed music-note badge.
- [Spice.Downloads main] Put a discoverable Downloads Folder control in Settings, save songs to the operating system Downloads directory by default, and preserve user-selected folders for later downloads.
- [Spice.Mobile main] Keep Android downloads in its MediaStore-backed Music/Spice collection because Android scoped storage does not expose a portable desktop-style folder path picker.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.155`.

## v1.0.154

- [Spice.Connect main] Complete acknowledged playback handoff across desktop and Android so the source pauses only after the receiver is ready, the full queue and playback state move together, and ambiguous completion can never create two active players.
- [Spice.Connect main] Make forgotten devices disappear immediately, revoke their exact authorization generation, clear queued and live state, and block delayed Redis heartbeats from restoring stale pairings.
- [Spice.Connect main] Move expiring presence, command delivery, wakeups, handoff coordination, and short-lived authorization lookups through Upstash Redis while retaining bounded PostgreSQL checkpoints and explicit outage diagnostics.
- [Spice.Downloads main] Repair desktop detection, persisted folder controls, missing-file cleanup, storage totals, folder opening, and strictly local downloaded-only playback queues.
- [Spice.Desktop main] Prepare universal Intel and Apple Silicon macOS local runtimes with executable permissions, quarantine recovery, readiness checks, and actionable launch failures while preserving Windows behavior.
- [Spice.Search main] Resolve pasted YouTube, YouTube Music, and SoundCloud track, playlist, and album variants inside SPICE, including shortened and redirected links with hostile redirect rejection.
- [Spice.Mobile main] Serialize Android Like mutations with optimistic rollback and stale-response protection so the Liked library remains deduplicated and synchronized across devices.
- [Spice.Mobile main] Download Android music from pre-resolved direct audio streams instead of YouTube pages, bound network retries and total runtime, publish clean stage progress, and fail with an actionable recovery message instead of hanging on JavaScript challenges.
- [Spice.Mobile main] Preserve every GitHub release-note character and present the complete Android update changelog inside a clearly labeled, bounded scroll area.
- [Spice.Desktop main] Replace the generic Windows setup artwork with deterministic SPICE-branded purple wizard and uninstaller surfaces for both standard and Native packages.
- [Spice.Music main] Finish the reference-video embedded header, retain the floating layout, add responsive account controls and a real profile menu, and verify both layouts in dark and daylight themes.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.154`.

## v1.0.153

- [Spice.Connect main] Put live device presence and successful remote-command queues fully on Upstash Redis, with bounded expiry and automatic PostgreSQL recovery when Redis is unavailable.
- [Spice.Connect main] Show whether the Redis fast path is active, report receiver last-seen times, move playback automatically when a receiver is selected, and revoke paired access when a device is forgotten.
- [Spice.Music main] Add the edge-integrated header shown in the reference video as the new default while keeping the rounded floating header as a selectable layout.
- [Spice.Music main] Open pasted YouTube, YouTube Music, and SoundCloud track or playlist links directly inside search.
- [Spice.Downloads main] Add a reliable desktop offline-library summary, folder controls, local-only queue playback, and managed local media runtime support for universal macOS builds.
- [Spice.Mobile main] Save Like changes immediately to the signed-in account, repair out-of-order taps safely, and keep Android Spice Connect handoff and controller presence aligned with desktop.
- [Spice.Desktop main] Publish universal Intel and Apple Silicon Native apps with a universal bundled FFmpeg runtime, update manifests, and startup diagnostics.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.153`.

## v1.0.152

- [Spice.Connect main] Move connected-device wakeups, presence snapshots, and short-lived paired-access lookups onto Upstash Redis so normal remote control avoids constant Neon polling.
- [Spice.Connect main] Keep the durable PostgreSQL command queue and device checkpoint fallback for cold starts, Redis outages, and long-term recovery.
- [Spice.Mobile main] Teach Android receivers and controllers to use realtime command and state wakeups with slower polling as a backup.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.152`.

## v1.0.151

- [Spice.Downloads main] Prepare and start the managed local media runtime automatically when a listener downloads from the regular desktop app, while reusing it across whole-playlist downloads.
- [Spice.Downloads main] Replace opaque browser `Failed to fetch` errors with clear runtime, converter, and interrupted-transfer recovery messages.
- [Spice.Desktop main] Keep the automatic managed-runtime path on Windows and Linux; classic macOS remains limited to hosted playback because its local runtime package is not currently supported.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.151`.

## v1.0.150

- [Spice.Connect main] Make remembered-device Forget actions update immediately, reject stale receiver refreshes that could restore a removed device, and roll back cleanly when the server rejects removal.
- [Spice.Player main] Replace the oversized receiver-row outline on Forget controls with a compact, theme-aware circular hover and keyboard-focus treatment.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.150`.

## v1.0.149

- [Spice.Player main] Let the floating mini player size itself around the receiver selector and action row so controls remain fully visible at compact window heights and non-default zoom levels.
- [Spice.Playlists main] Recover playlist covers from custom, track, album, or derived YouTube artwork, retry alternate candidates when an image fails, and keep the themed fallback visible instead of broken-image text.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.149`.

## v1.0.148

- [Spice.Connect main] Deliver remote-control wakeups through an authenticated Server-Sent Events stream backed by PostgreSQL `LISTEN`/`NOTIFY`, while preserving the durable command queue as the source of truth and reconnecting automatically.
- [Spice.Connect main] Add the realtime receiver path to both desktop and Android, including bounded stream lifetimes, heartbeats, cancellation-safe cleanup, tenant/device filtering, and automatic polling fallback.
- [Spice.Connect main] Reduce desktop fallback polling to 350 ms during active control and at most 750 ms while idle or minimized, instead of allowing hidden receivers to wait up to three seconds.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.148`.

## v1.0.147

- [Spice.Connect main] Keep paired desktop receivers available on demand, remember offline devices for one month with explicit Forget controls, synchronize Android hardware and in-app volume controls, and shorten adaptive command polling for more responsive remote playback.
- [All players main] Add provider-specific search settings for YouTube, SoundCloud, or both, with matching results on desktop and Android.
- [Spice.Downloads main] Fix Android song downloads, publish mobile music in the device's `Music/Spice` folder, add a user-selectable desktop offline-music folder, and play downloaded or manually copied songs inside SPICE without a network connection.
- [Spice.Playlists main] Add duplicate-preserving whole-playlist downloads and keep the exact imported track count and order when syncing playlists to Android.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.147`.

## v1.0.146

- [Spice.Music main] Make the custom theme palette explicitly opt-in so fresh profiles use the selected built-in accent until the listener enables or applies a custom palette.
- [Spice.Desktop main] Add an off-by-default Start SPICE on boot control to both SPICE Music and the Electron settings window, backed by Windows and macOS login-item state.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.146`.

## v1.0.145

- [All players main] Remove Sleep Timer from Electron, SPICE Music, and Android, including its settings, playback-boundary logic, persistence, IPC, and tests.
- [Spice.Player main] Add persistent profile-scoped adaptive queue priority: natural completions and repeats raise future shuffle frequency, manual skips lower it, weighted choices never immediately repeat the same song, and Previous/forward navigation follows exact listening history.
- [Spice.Player main] Harden crossfade and playback transitions against stale media events, seeks, lyric jumps, profile changes, exhausted queues, and shell-controlled seeking while preserving the active audio slot.
- [Spice.Mobile main] Replace the expanded-player timer control with Save to playlist, including local and editable shared playlist selection, duplicate-safe saves, and stable track snapshots while the picker is open.
- [Spice.Mobile main] Add real dual-ExoPlayer crossfade, service-owned queue continuation after task removal, notification/headset queue navigation, persistent adaptive history, and cancellation-safe background resolution.
- [Spice.Mobile main] Keep settings tabs, audio-quality choices, now-playing titles, and update notes readable on narrow screens, with bounded scrolling and plain release-note formatting.
- [Spice.Desktop main] Ship the standard macOS app as a universal Intel/Apple Silicon package, preserve playback across normal macOS window closure, and use hosted SPICE Music when the Windows/Linux-only local runtime is unavailable.
- [Spice.Playlists main] Make shared playlist saves idempotent under concurrent taps without removing valid repeated songs from private or imported playlists.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.145`.

## v1.0.144

- [Spice.Mobile main] Build Recommended Next and Because you played shelves from synced likes and recent listening, label the familiar history shelf Recently Played, and continue finished queues with a locally ranked smart queue.
- [Spice.Mobile main] Pull desktop taste on launch and debounce mobile history uploads through dataset-scoped bundled sync so cross-device recommendations stay current without playlist reads, redundant Vercel invocations, or unchanged Neon writes.
- [Spice.Mobile main] Add mobile Playback settings for stream quality, smart queue, smooth crossfade transitions, and duration, end-of-track, or end-of-queue sleep timers.
- [Spice.Mobile main] Keep complete Android release notes inside a bounded scrollable update panel and reduce the music-note mark and Library navigation icon proportions.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.144`.

## v1.0.143

- [Spice.Account main] Keep local-only profiles out of listener search and cloud profile hydration, and bind Native account sessions to the exact local profile that owns them.
- [Spice.Player main] Add a bookmark-style Save to playlist action to the standard, expanded, and mini players, including one-step playlist creation with the current song already added.
- [Spice.Player main] Preserve shuffle playback history so Previous returns to songs already heard, Next walks forward through that history, and fresh shuffle picks avoid repeats until the queue is exhausted.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.143`.

## v1.0.142

- [Spice.Music main] Restore authenticated Listen Together session creation by applying and verifying the missing production uniqueness migration used by the host-session upsert.
- [Spice.Music main] Classify database schema drift as a retryable service error, emit privacy-safe request diagnostics, and keep direct session-route preflights and responses origin-aware.
- [Spice.Music main] Show actionable session-start failures in both the Listen Together status panel and toast, including when a profile invite needs to create the room first.
- [Spice.Music main] Normalize blank profile identifiers to the default profile and keep malformed or oversized API error payloads out of the player UI.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.142`.

## v1.0.141

- [Spice.Connect main] Add one-click playback handoff between desktop, browser, and Android receivers, carrying the exact track, queue, position, play state, volume, shuffle, and repeat mode before pausing the source device.
- [Spice.Music main] Rebuild Listen Together around immediate serialized polling, provider-aware track identity, server-projected progress, queue index and playback-mode synchronization, anonymous share-link joins, persisted reconnect state, host recovery, visible connection status, and database-enforced single rooms and invites.
- [Spice.Lyrics main] Cache lyrics per track and provider for seven days, add per-track ±0.5-second timing calibration and refresh controls, and repaint the floating lyrics window immediately with every built-in or custom desktop theme.
- [Spice.Home main] Add profile-scoped familiar-to-discovery control, exact-track hiding, seven-day artist snoozing, private weekly listening recaps, Recently Played, and Forgotten Favorites without mixing one profile's feedback into another.
- [Spice.Music main] Replace fire-and-forget history, likes, playlists, and profile writes with a durable profile-aware outbox that coalesces current snapshots, survives reloads and offline periods, retries transient failures, and surfaces permanent conflicts.
- [Spice.Player main] Add persistent duration, end-of-track, and end-of-queue sleep timers to the web player and Android app, plus a shared Electron sleep-timer controller for embedded desktop services.
- [Spice.Mobile main] Receive and send full Spice Connect handoffs, keep receiver selection separate from transfer, and expose native sleep-timer controls with duration and playback-boundary modes.
- [Spice.Home main] Extract reusable Listen Together, recommendation-feedback, listening-insight, sleep-timer, sync-outbox, home-history, and desktop timer logic into independently tested modules.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.141`.

## v1.0.140

- [Spice.Home main] Replace fixed Lofi and workout rows with a private, per-profile Recommended Next shelf that learns stable artists, producers, genres, moods, languages, and listening contexts without letting one song rewrite a feed.
- [Spice.Home main] Show a clear cold-start card until a profile has enough distinct meaningful listens, including progress and an explanation that quick skips and one-off plays barely affect recommendations.
- [Spice.Player main] Build related, taste-ranked Up Next continuations for standalone songs and the end of non-playlist queues, while preserving an intentional playlist's order and repeat behavior.
- [Spice.Music main] Keep recommendation evidence inside each profile's history, serialize history syncs, and make cache, write, and queue refresh paths cost-conscious so routine listening avoids broad profile writes and stale cloud snapshots.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.140`.

## v1.0.139

- [Spice.Music main] Drive local and connected-device progress from authoritative playback clocks so the duration slider, elapsed time, native mini player, and crossfade transitions keep moving together.
- [Spice.Music main] Schedule Last.fm scrobbles independently of React rendering, follow the official longer-than-30-seconds and half-or-four-minute rules, retry provider delivery, and show a separate permanent-scrobble countdown and confirmation.
- [Spice.Native main] Publish first-class Media Session playback snapshots so the shell always reads the active crossfade slot, track duration, cover artwork, and public song link instead of scraping a stale hidden audio element.
- [Spice.Native main] Rate-limit and deduplicate Discord Rich Presence updates while preserving track changes, repeats, seeks, pause state, live timestamps, song artwork, and Listen on SPICE or Download SPICE actions.
- [Spice.Settings main] Group settings into Personalize, Desktop, Playback, Connect, and Support, add navigation for previously unsectioned tools, expose Discord Activity as a dedicated Native section, and keep the Admin Dashboard shortcut only in Account.
- [Spice.Music main] Rename the fresh idle player state to `Nothing playing` and add privacy-safe server delivery diagnostics for Last.fm and ListenBrainz requests.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.139`.

## v1.0.138

- [Spice.Music main] Restore desktop update checks inside SPICE Settings for both wrapper and Native shells, including live download state and restart-to-install handling.
- [Spice.Music main] Start fresh launches and profile changes on an explicit `Start playing something` state instead of reviving saved local or remote track snapshots.
- [Spice.Music main] Give every real playback start and repeat its own Last.fm/ListenBrainz delivery cycle, retry transient provider failures, and keep SPICE playback timers responsive while the desktop is minimized.
- [Spice.Connect main] Make `XXXX-XXXX` pairing entry stable across desktop and Android, normalize pasted Unicode input, atomically consume one-time codes, and allow signed-in desktops to claim a friend's pairing code without replacing their account session.
- [Spice.Connect main] Bind device presence to the exact paired credential generation so revoke is idempotent and race-safe, retry short command deliveries, delete terminal commands after their TTL, and prevent late heartbeats from resurrecting access.
- [Spice.Connect main] Reconcile controller optimism with receiver-confirmed track, queue, duration, and progress state, use server time across skewed PCs, and keep projected playback monotonic until a receiver becomes stale.
- [Spice.Music main] Resolve the packaged FFmpeg executable at runtime so M4A streams convert to real MP3 downloads without leaking a build-machine path into Native packages.
- [Spice.Mobile main] Check the official stable GitHub release on startup, validate the exact signed APK asset, size, digest, version, package, and signing certificate, and hand verified downloads to Android's package installer.
- [Spice.Mobile main] Republish receiver presence after credential fallback, persist bounded command deduplication, and refresh remote track metadata and progress promptly after connected-device playback changes.
- [Shared CI] Require a stable Android release key for published tag assets while retaining explicit ephemeral signing only for non-publishing release-build checks.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.138`.

## v1.0.137

- [Spice.Music main] Mark Last.fm scrobbles as delivered only after an explicit accepted response, surface filtered HTTP-200 responses as errors, and retry transient provider failures independently with bounded backoff.
- [Spice.Music main] Convert browser song downloads to MP3 inside the local runtime with a packaged FFmpeg binary while keeping Vercel builds free of the native binary.
- [Spice.Mobile main] Route direct and provider downloads through the embedded yt-dlp/FFmpeg pipeline so Android saves MP3 files with metadata consistently.
- [Spice.Admin main] Add an admin-authorized feedback inbox that loads the newest persisted submissions and refreshes automatically while the operations dashboard is open.
- [Spice.Music main] Show a theme-aware Admin Dashboard shortcut only for authenticated SPICE admin accounts, with the dashboard authorization check remaining authoritative.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.137`.

## v1.0.136

- [Spice.Connect main] Cut receiver command latency from tens of seconds to responsive active, idle, and background polling cadences, with event-driven state reports and short controller refreshes.
- [Spice.Connect main] Preserve optimistic play, pause, seek, queue, shuffle, repeat, and volume updates until receivers publish their confirmed state instead of snapping controls back to stale snapshots.
- [Spice.Mobile main] Let a securely paired phone discover and select its authorized playback devices without also signing into a Spice account.
- [Spice.Mobile main] Format pairing codes as `XXXX-XXXX`, apply remote volume commands, and publish real player volume and playback changes promptly.
- [Spice.Home main] Remove the wrapper Settings gear from SPICE Native while keeping it available in the standard desktop wrapper.
- [Spice.Music main] Keep remote volume controls within the receiver's supported 0-100% range and improve Spice Connect command diagnostics.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.136`.

## v1.0.135

- [Spice.Music main] Collapse the desktop sidebar into a usable icon rail instead of hiding navigation, with accessible labels and an immediate expand control.
- [Spice.Music main] Dismiss the topbar search results when the listener clicks anywhere outside the search surface.
- [Spice.Music main] Release the Native startup playback guard as soon as an explicit track selection or play command is received, including while desktop audio settings are still synchronizing.
- [Spice.Home main] Move Native-only desktop controls into SPICE Music Settings while preserving the separate Desktop Settings window and Discord Rich Presence control for the standard wrapper.
- [Spice.Home main] Keep Desktop Settings sidebar clicks locked to their requested section through smooth scrolling and hide links whose Native-only legacy sections are unavailable.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.135`.

## v1.0.134

- [Spice.Home main] Cache public runtime, version, release, update, and download GET responses at Vercel's edge, cache their preflights in browsers, and keep them outside the Neon-backed emergency proxy path.
- [Spice.Home main] Pin hosted functions beside the Frankfurt Neon database and split the cloud portal from the local player so Vercel serves a substantially smaller root bundle.
- [Spice.Music main] Make profile, history, favorites, and private-playlist sync idempotent or differential so unchanged cloud snapshots no longer churn Neon rows.
- [Spice.Connect main] Consolidate paired-device authorization, atomically claim indexed commands, prune expired commands, and update Listen Together host state without wide pre-reads.
- [Spice.Mobile main] Keep five-second remote-command responsiveness while reducing Android device presence and discovery traffic to a two-minute heartbeat plus event-driven refreshes.
- [Spice.Home main] Remove retired anime, movie, music-tester, and player component assets from hosted deployment output.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.134`.

## v1.0.133

- [Spice.Home main] Rebuild the Native first-launch screen with a richer palette-aware visual system and contain long runtime, account, and launch values inside responsive summary cards.
- [Spice.Music main] Move the compact `K` command-palette key from the now-playing controls into the topbar search-mode context.
- [Spice.Music main] Replace raw custom-theme color strings with graphical saturation/brightness pickers, hue gradients, opacity sliders, keyboard controls, and live swatches.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.133`.

## v1.0.132

- [Spice.Home main] Keep Desktop Settings inside one bounded responsive scroller, prevent selector-wheel value changes without stealing focus elsewhere, and paint every settings surface from the active built-in or custom theme.
- [Spice.Home main] Let electron-updater finish runtime cleanup and launch its installer before the final window-close event can quit SPICE Native.
- [Spice.Music main] Make the web settings section navigation follow the active theme and stay usable in narrower layouts.
- [Spice.Music main] Restore the compact `K` command-palette shortcut to the now-playing bar.
- [Spice.Home main] Restore the single-note SPICE mark across the Music sidebar, dynamic favicon, and hosted portal, with a larger portal brand treatment.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.132`.

## v1.0.131

- [Spice.Home main] Reorganize Desktop Settings around Electron-only controls, clarify the scope of embedded-service scrobbling, and link directly into SPICE Music Settings for cross-platform preferences.
- [Spice.Home main] Repair desktop update progress delivery, harden restart-based setting validation, avoid no-op restarts, and confirm the YouTube Music VK layout restart before applying it.
- [Spice.Music main] Remove the duplicate Always on Top control so the Electron-only preference has one authoritative home in Desktop Settings.
- [Spice.Music main] Accept a desktop navigation intent that opens the cross-platform settings page directly.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.131`.

## v1.0.130

- [Spice.Music main] Publish the completed palette-aware local player so the sidebar logo, wordmark, topbar glow, search action, menus, and desktop shell follow every built-in or custom theme.
- [Shared CI] Restore local Windows and Linux runtime builds by keeping the Drizzle local-runtime stub aligned with every query operator used by cloud-only routes.
- [Spice.Home main] Reject the retired legacy runtime repository override and ignore stale configured manifest versions when the bundled runtime is newer.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.130`.

## v1.0.129

- [Spice.Home main] Redesign the hosted local-runtime portal around the default SPICE purple palette with a cleaner responsive hero, compact navigation, and a guided three-step setup path.
- [Spice.Home main] Restyle the hosted account panel and technical runtime ledger with consistent purple surfaces, accessible focus states, and phone-friendly layouts while preserving every existing account and runtime action.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.129`.

## v1.0.128

- [Spice.Home main] Consolidate the cloud backend and local web runtime into the unified `spice` repository with npm workspace commands, Node.js 24 requirements, hoisted Next.js CLI resolution, a narrow Docker context, and a root-lockfile image pinned to the hosted runtime target.
- [Spice.Home main] Publish and read `apps/backend/public/WALKTHROUGH.md` from one deterministic cloud path so Docker and Vercel builds do not trace the whole repository, while local runtime packages omit cloud-only release documentation.
- [Spice.Home main] Move Windows and Linux local-runtime download defaults to the unified repository's stable `spice-local-runtime` release assets.
- [Spice.Admin main] Require an explicit `SPICE_TEST_DATABASE_URL` before database integration tests run, and stop tests from loading developer `.env` files or ambient production database URLs.
- [Spice.Admin main] Make both journaled `playlist_members.status` migrations idempotent and add static regression coverage for the duplicate migration history.
- [Spice.Admin main] Retire the profile inspection utility that printed complete user and profile records.
- [Spice.Admin main] Keep ESLint scoped to backend source by excluding generated local-runtime packages and coverage output.
- [Spice.Admin main] Upgrade Electron, Next.js, PostCSS, and Drizzle tooling/runtime dependencies to patched release lines, including the Drizzle identifier-escaping security fix.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.128`.

## v1.0.127

- [Spice.Music main] Coalesce nullable cloud profile usernames through saved local and authenticated account identity instead of treating database `null` as authoritative.
- [Spice.Music main] Limit account-username fallback to the active profile so secondary profiles retain separate identities.
- [Spice.Music main] Preserve derived usernames when persisting merged profiles instead of replacing them with a stale stored `null`.
- [Spice.Music main] Add regression coverage for nullable, active-profile-only, and persistence username resolution.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.127`.

## v1.0.126

- [Spice.Music main] Preserve a meaningful local profile name and avatar when an uninitialized cloud profile still contains `Spice Listener` and no avatar.
- [Spice.Music main] Fall back to the authenticated account username when neither local nor cloud profile has a customized display name.
- [Spice.Music main] Include the account username in authentication snapshots so browser and Native sessions hydrate the same identity immediately.
- [Spice.Music main] Refresh profile editor fields from the merged profile instead of the stale pre-sync profile.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.126`.

## v1.0.125

- [Spice.Music main] Reconcile the monotonic songs-streamed counter across local state, cloud profiles, and synced history so a stale cloud zero cannot erase listener progress.
- [Spice.Music main] Pull and push independent account datasets concurrently, and report partial syncs instead of overwriting a cloud dataset whose pull failed.
- [Spice.Music main] Let background playlist uploads skip rebuilding and returning unused playlist snapshots, reducing Neon work and origin transfer for large imported libraries.
- [Spice.Music main] Clarify that the account-header heart count represents profile likes received, not the listener's liked songs.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.125`.

## v1.0.124

- [Spice.Music main] Defer the Native cloud token and automatic Neon sync until the saved active profile has finished hydrating, preventing startup sync from targeting the temporary default profile.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.124`.

## v1.0.123

- [Spice.Music main] Preserve the Native desktop account session when an existing local profile has no embedded cloud token, restoring Neon-backed sync on Fedora and other fresh Native installs.
- [Spice.Music main] Publish Windows and Linux runtime ZIPs without a synthetic `./` root entry so Windows Native builds and runtime updates can extract them safely.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.123`.

## v1.0.122

- [Spice.Music main] Make `1000%` Boost apply a real `10x` gain and move boosted YouTube embed playback onto the gain-capable local proxy path.
- [Spice.Music main] Add a platform-specific Linux local runtime package with a portable shell launcher and no bundled cloud/database code.
- [Spice.Music main] Add cached cloud manifest and download routes for Linux runtime updates alongside the existing Windows routes.
- [Spice.Music main] Publish Windows and Linux runtime ZIPs and checksums together from CI so Native Linux builds receive platform-correct dependencies.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.122`.

## v1.0.121

- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.121`.

## v1.0.120

- [Spice.Music main] Extend Spice Connect device presence with persisted shuffle and repeat state.
- [Spice.Music main] Add idempotent remote `shuffle` and `repeat` commands so desktop and Android controllers stay synchronized.
- [Spice.Music main] Route the desktop bar and expanded-player shuffle/repeat buttons through the selected Spice Connect receiver.
- [Spice.Music main] Add the `remote_devices` playback-mode migration and protocol normalization coverage.
- [Spice.Music main] Apply saved player volume to the audio element before direct playback starts so startup and track changes do not briefly jump to 100%.
- [Spice.Music main] Keep restored profile playback snapshots paused on first boot and profile switch until the listener explicitly presses play.
- [Spice.Music main] Share platform song links from the share/download dialog while keeping the internal song token as a fallback.
- [Spice.Music main] Expand the VK Compact SPICE player bar closer to the window edges and make Spice Connect open downward when the player bar is placed at the top.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.120`.

## v1.0.119

- [Spice.Music main] Expand the VK compact player bar closer to the window edges so it uses the available desktop width.
- [Spice.Music main] Keep Spice Connect receiver menus opening downward when the player bar is docked to the top of the app.
- [Spice.Music main] Make song share dialogs copy the upstream provider URL first, falling back to a SPICE deep link when a track has no provider URL or only a legacy SoundCloud-prefixed id.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.119`.

## v1.0.118

- [Spice.Music main] Compact the VK player bar, keep its volume slider visible at wrapper-sized desktop widths, and square off the search bar corners.
- [Spice.Music main] Slim down the Home greeting banner so it no longer dominates the first screen.
- [Spice.Music main] Make volume Boost explicitly use the gain-node audio path whenever Boost is enabled.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.118`.

## v1.0.117

- [Spice.Admin main] Keep admin session bootstrap and cloud admin management endpoints reachable during emergency stop so operators can disable the stop from the dashboard.
- [Spice.Admin main] Bump the visible diagnostics version to `Spice Media Core v1.0.117`.

## v1.0.116

- [Spice.Music main] Extend the Spice Connect command freshness and stale-device windows so adaptive and hidden-tab receiver polling has enough slack to accept commands.
- [Spice.Music main] Keep hidden paused Spice Connect receivers on the low-frequency heartbeat so controllers can still wake them remotely.
- [Spice.Admin main] Restore global emergency-stop coverage for non-admin API routes while keeping austerity throttling scoped to sync writes.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.116`.

## v1.0.115

- [Spice.Music main] Reduce Vercel invocation pressure by limiting the emergency/austerity Proxy to `/api/sync/*` instead of every API request.
- [Spice.Music main] Slow Spice Connect command polling, add idle/hidden-tab backoff, and reduce automatic device state sync frequency.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.115`.

## v1.0.114

- [Spice.Music main] Add a topbar Settings button so application settings stay reachable even when the sidebar Settings shortcut is hidden.
- [Spice.Music main] Replace the topbar provider pill with a provider/users dropdown that can switch quick search between Hybrid, YouTube Music, YouTube Videos, SoundCloud, and listener search.
- [Spice.Music main] Add a sidebar Settings shortcut visibility toggle to the Sidebar Controls settings.
- [Spice.Music main] Add a Player Visual Style setting with a new VK Compact SPICE player bar style.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.114`.

## v1.0.113

- [Spice.Music main] Persist the active song queue, queue index, shuffle mode, repeat mode, and player volume together in the per-profile playback snapshot.
- [Spice.Music main] Save shuffle, repeat, and volume through state-driven player preference persistence so all player surfaces restore the same controls after reload.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.113`.

## v1.0.112

- [Spice.Music main] Load saved Spice Connect receiver state for signed-in controller-only browsers without enabling local command receiving.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.112`.

## v1.0.111

- [Spice.Music main] Record playback history and profile play counts only once across retry recovery for a user-requested track.
- [Spice.Music main] Let controller-only Spice Connect browsers discover and control remote receivers without enabling local command receiving.
- [Spice.Music main] Preserve Listen Together sync context when retrying the host-selected track after a local stream failure.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.111`.

## v1.0.110

- [Spice.Music main] Make Spice Connect remote playback opt-in on each device so startup cannot accept cloud playback commands unless the listener explicitly enables it.
- [Spice.Music main] Replace failed-playback self-healing queue skips with bounded same-track retries so SPICE never starts a different song because a stream failed.
- [Spice.Music main] Keep playback recovery retry timers from firing after pause, stop, or fresh user track selection.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.110`.

## v1.0.109

- [Spice.Music main] Keep paused playback stopped when a saved audio stream expires or resets so backend updates do not trigger self-healing skips into autoplay.
- [Spice.Music main] Stop passive Home feed loading from replacing the player placeholder with a trending track before the listener chooses music.
- [Spice.Music main] Ignore stale Spice Connect playback commands created before startup or during a short update-reload suppress window.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.109`.

## v1.0.108

- [Spice.Music main] Reduce Vercel Fluid Compute pressure by slowing always-on version, invite, Listen Together, and Spice Connect polling intervals.
- [Spice.Music main] Route hosted cloud API calls directly to `/api/*` while keeping `/api/cloud/*` as the local-runtime proxy namespace.
- [Spice.Music main] Add edge cache headers to `/api/version` and redirect legacy hosted `/api/cloud/*` requests to their direct cloud API routes.
- [Spice.Music main] Clarify the local-mode feature ledger so hosted Vercel calls, local media calls, and local cloud proxy calls are documented separately.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.108`.

## v1.0.107

- [Spice.Music main] Restore the Home sidebar navigation item and make the Spice sidebar brand return to the Home surface.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.107`.

## v1.0.106

- [Spice.Music main] Preserve the real audio container when downloading shared songs so streams saved as `m4a`, `webm`, or `mp3` match the upstream content instead of forcing a misleading `.mp3` filename.
- [Spice.Music main] Add mouse-wheel volume adjustment to the main player, expanded player, mini player, and connected-device volume sliders.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.106`.

## v1.0.105

- [Spice.Music main] Accept the Last.fm popup completion message from the trusted callback origin returned by `/api/cloud/lastfm/auth` so local-runtime account linking can finish after the cloud callback redirects back from Last.fm.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.105`.

## v1.0.104

- [Spice.Music main] Strip decoded-body-unsafe upstream headers from `/api/cloud/*` proxy responses so local runtime account sign-in can relay hosted Vercel auth JSON without `incorrect header check` fetch failures.
- [Spice.Music main] Keep local media range response payload headers intact while limiting decoded-body header cleanup to cloud proxy responses.
- [Spice.Music main] Restore the actual SPICE icon in the Music sidebar brand mark by using the packaged `/icon.svg` asset instead of the temporary text-only badge.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.104`.

## v1.0.103

- [Spice.Music main] Route local-mode cloud requests through the same-origin `/api/cloud/*` namespace so login, sync, and account calls proxy through the local runtime to Vercel instead of relying on fragile browser cross-origin fetches.
- [Spice.Music main] Keep the `/api/cloud/*` proxy inside the Windows local runtime package while continuing to prune direct DB-backed cloud routes from the client-installable zip.
- [Spice.Music main] Generate a process-local stream signing secret for packaged local runtimes so playback works without asking normal users to configure `STREAM_HMAC_SECRET`.
- [Spice.Music main] Keep auth sign-in and sign-up responses CORS-aware on every success and error path so direct cloud requests return readable JSON instead of browser-level fetch failures.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.103`.

## v1.0.102

- [Spice.Home main] Copy local runtime static assets and public files into `apps/backend/.next/static` and `apps/backend/public` inside the Windows package so the standalone server can load the styled SPICE UI from localhost.
- [Spice.Home main] Add a package-time asset assertion so the local Windows release fails before upload if the standalone static asset folder is missing or empty.
- [Spice.Home main] Bump the visible diagnostics version to `Spice Media Core v1.0.102`.

## v1.0.101

- [Spice.Home main] Validate the local Windows runtime download URL before publishing the update manifest so a typo like `ttps://` falls back to the latest public GitHub release instead of breaking installers.
- [Spice.Home main] Harden the Windows local manager, install script, and portable script to recover from invalid manifest download URLs before calling `Invoke-WebRequest`.
- [Spice.Home main] Bump the visible diagnostics version to `Spice Media Core v1.0.101`.

## v1.0.100

- [Spice.Home main] Add a Desktop app button to the install page that points users to the latest `Anti-Depressants-Dev-Team/spice` release next to the local manager, scripts, ZIP, and account portal.
- [Spice.Home main] Bump the visible diagnostics version to `Spice Media Core v1.0.100`.

## v1.0.99

- [Spice.Home main] Harden the Windows local manager so manifest and localhost URLs are normalized before update checks, runtime checks, or browser launch actions run.
- [Spice.Home main] Fix hosted account sign-in resilience by routing account calls through the cloud API helper and accepting compatible account snapshot response shapes after auth.
- [Spice.Home main] Remove the hosted setup checklist and duplicate portal tab row so normal users see one clear set of local-mode actions.
- [Spice.Home main] Add compact copy buttons for the install-page PowerShell commands.
- [Spice.Home main] Document how the Electron `spice` wrapper can house the local runtime as an install/update/start manager without merging backend source into the desktop UI.
- [Spice.Home main] Bump the visible diagnostics version to `Spice Media Core v1.0.99`.

## v1.0.98

- [Spice.Home main] Clean up the hosted cloud portal so normal users see install, open-local, account, and changelog actions first while runtime maps and feature ledgers move behind a collapsed technical details section.
- [Spice.Home main] Add a lightweight `spice-local-manager.ps1` Windows manager for install, update, start, open-local, and runtime status checks without adding an Electron bundle yet.
- [Spice.Home main] Route the runtime ZIP button through `/api/downloads/local-windows` and default update metadata to the latest public GitHub release URL so the hosted download path is not dependent on a manually configured Vercel URL.
- [Spice.Home main] Add `docs/local-mode-roadmap.md` with ranked local-move candidates and expected performance tradeoffs for the current split, local manager, sync batching, Electron, and more drastic desktop-first options.
- [Spice.Home main] Bump the visible diagnostics version to `Spice Media Core v1.0.98`.

## v1.0.97

- [Spice.Music main] Fix packaged Windows local runtime launchers to start the standalone Next server from `apps/backend/server.js` instead of looking for `server.js` at the ZIP root.
- [Spice.Music main] Materialize the standalone Next/pnpm links and flatten traced runtime dependencies during Windows package creation so extracted ZIPs do not depend on symlinks back to the repo checkout.
- [Spice.Music main] Split the DB-backed proxy settings check behind a local-build stub so the local runtime middleware keeps working without bundling Neon code.
- [Spice.Music main] Let packaged launcher scripts respect an existing `PORT` or `HOSTNAME` override so local smoke tests can run away from the default `127.0.0.1:3939` port.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.97`.

## v1.0.96

- [Spice.Home main] Add hosted portal tabs for Account, Changelog, Install, and Runtime so the walkthrough changelog is reachable again from the Vercel-hosted local-mode page.
- [Spice.Home main] Add a hosted account management panel for cloud sign-in, registration, account status, subscription status, username updates, local runtime launch, changelog access, and admin dashboard entry.
- [Spice.Music main] Add public Windows install and portable PowerShell scripts, expose them from the install page, and keep the manual ZIP fallback available.
- [Spice.Music main] Add a one-command package automation script for building and packaging the local Windows runtime.
- [Spice.Home main] Remove operator-only feedback database setup details from public install and local-mode ledger copy, keeping normal-user setup focused on install, portable mode, runtime launch, and updates.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.96`.

## v1.0.95

- [Spice.Home main] Add a local-mode QoL and integrations ledger to clarify which convenience features stay local-first, opt-in, cost-gated, or removed.
- [Spice.Admin main] Surface the same QoL and integrations posture in the operations dashboard so Last.fm, ListenBrainz, Spice Connect, shared playlists, Listen Together, and Discord RPC have explicit operating rules.
- [Spice.Music main] Document that Last.fm and ListenBrainz remain opt-in profile sync integrations rather than playable search providers.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.95`.

## v1.0.94

- [Spice.Home main] Revamp the Vercel-hosted homepage into a local runtime portal that points users to install, localhost launch, runtime status, update metadata, and the cloud/local/Neon split.
- [Spice.Admin main] Revamp the admin dashboard around local-mode operations, Vercel free-tier guardrails, Neon cloud-only posture, and shelved service visibility.
- [Spice.Admin main] Add a local mode feature ledger documenting the features that moved, froze, or were replaced for the architecture split.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.94`.

## v1.0.93

- [Spice.Music main] Cache the local Windows update manifest at Vercel's edge and remove client-side no-cache headers so update checks do not create unnecessary function invocations.
- [Spice.Music main] Add a 12-hour packaged runtime update-check throttle via `SPICE_LOCAL_UPDATE_CHECK_MIN_HOURS`, keeping repeated launches from repeatedly hitting Vercel.
- [Spice.Admin main] Document low-cost Vercel/Neon operating guidance, including `pg_stat_statements` queries for diagnosing Neon egress.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.93`.

## v1.0.92

- [Spice.Music main] Added the `install.spice-app.xyz` installer surface plus `/install` preview route for local Windows runtime setup, download metadata, and update manifest access.
- [Spice.Admin main] Expanded Neon setup guidance with SQL Editor copy/paste steps for the feedback migration and Vercel-only database environment notes.
- [Shared routing] Allowlisted `https://install.spice-app.xyz` for CORS and linked the cloud portal plus update release notes to the install page.
- [Shared CI] Publish the main-branch Windows local runtime ZIP and SHA-256 file to GitHub Releases so `SPICE_LOCAL_WINDOWS_DOWNLOAD_URL` can use a stable public URL.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.92`.

## v1.0.91

- [Spice.Music main] Added a cloud-hosted local Windows update manifest at `/api/updates/local-windows` plus `/api/local/update` status checks for local installs.
- [Spice.Music main] Included startup update checks and a `check-spice-local-update.ps1 -Download` helper in the Windows local runtime package.
- [Spice.Admin main] Added Neon runtime-split setup notes for Vercel-only database credentials, feedback migration verification, and local package DB isolation.
- [Shared CI] Added SHA-256 output for the Windows local package artifact so published update manifests can advertise a verifiable ZIP.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.91`.

## v1.0.90

- [Spice.Music main] Split runtime targeting with `SPICE_RUNTIME_TARGET=local|vercel`, routing local media search, lyrics, stream extraction, and proxying through `/api/local/*` on `127.0.0.1:3939` while keeping cloud account, sync, metadata, and feedback traffic behind `/api/cloud/*`.
- [Spice.Music main] Move `spice-app.tsx` API access behind one client helper, default the local app to Search, and hide Home, Anime, Movie, and Watch navigation while leaving the shelved source history intact.
- [Spice.Admin main] Replace local feedback file writes with a serverless-safe cloud feedback path backed by Neon when configured, with log-only fallback for non-database environments.
- [Spice.Admin main] Lock CORS to SPICE domains plus localhost and 127.0.0.1, add local runtime package leak scanning, and automate local packaging plus gated Vercel deployment checks in GitHub Actions.
- [Shared CI] Let `pnpm/action-setup` read `pnpm@11.0.9` from the root package manager pin so pull request checks do not fail on duplicate pnpm version declarations.
- [Shared CI] Allow `build:local` and `build:vercel` lifecycle imports to use the existing build-only JWT dummy secret while keeping runtime `JWT_SECRET` enforcement intact.
- [Shared CI] Use `tar.exe` for the Windows local package artifact so the zipped runtime handles the packaged `node_modules` layout reliably.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.90`.

## v1.0.89

- [Spice.Music main] Fixed the profile username merging and sync issue, ensuring unique usernames are preserved correctly when profile syncs run.
- [Spice.Music main] Enabled credential sharing and fallback on profile switching to ensure local profiles stay logged in.
- [Spice.Music main] Made the bottom player bar "Listen Together" and "Device Selector" buttons interactive when logged out, displaying a friendly prompt or notice instead of being disabled.
- [Spice.Music main] Added user/listener search to the topbar quick search tray, complete with a beautiful tab switcher (Songs / Listeners).
- [Spice.Music main] Cleaned up the device button container by removing the duplicate borders and backgrounds in the player bar.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.89`.

## v1.0.88

- [Spice.Music main] Masked cloud account email in Settings panel with a toggleable show/hide eye icon to safeguard privacy.
- [Spice.Music main] Added dynamic theme-based SVG favicon generator in React that automatically updates browser tab icon with the selected accent theme.
- [Spice.Music main] Added a "Cancel" button to passcode lock screen overlay that reverts the profile switch to the last successfully unlocked profile.
- [Spice.Music main] Stopped playback completely before switching profiles (clearing active audio states).
- [Spice.Music main] Enhanced the floating mini player: expanded width to 360px, added range-based custom volume slider, added collapsible mini queue panel, and optimized lyrics wrapping.
- [Spice.Music main] Rephrased welcome greeting subtitle to remove closed-source player reference.
- [Spice.Music main] Added sidebar sliding open/close transition animations using CSS transforms and grid column transitions.
- [Spice.Music main] Reduced size of the playback device selection button inside the player bar.
- [Spice.Music main] Added individual search history query deletion and clear-all capabilities to search suggestions tray.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.88`.

## v1.0.87

- [Spice.Music main] Fixed duplicate Listen Together invites by matching on the host's active profile in the database and deduplicating session invites on the backend.
- [Spice.Music main] Locked down playback controls for Listen Together listeners, styling buttons as grayed out with a `not-allowed` cursor and disabling manual seek, play/pause, prev, next, shuffle, and repeat actions.
- [Spice.Music main] Fixed listener inactivity kick bugs by extending the host inactive threshold to 120 seconds and rewriting the listener sync loop to call playback functions via stable Refs to prevent interval restarts.
- [Spice.Music main] Cleaned up listeners leaving sessions by implementing a DELETE invite endpoint, removing them from the host's invited listeners list.
- [Spice.Music main] Bump the visible diagnostics version to `PWA v1.0.87`.

## v1.0.86

- [Spice.Music main] Fixed duplicate `@username` rendering in settings profile header by removing the duplicate fallback block under the settings account tab page.
- [Spice.Music main] Fixed duplicate Listen Together invites by deduplicating session invites and pending invites lists in JavaScript by invite ID.
- [Spice.Music main] Updated the target user invite lookup to query by `profiles.username` first to find target users when using profile-specific usernames.
- [Spice.Music main] Bump the visible diagnostics version to `PWA v1.0.86`.

## v1.0.85

- [Spice.Music main] Moved Spicer username logic from user account level to profile level, allowing independent unique spicer usernames for different local profiles under the same account.
- [Spice.Music main] Added `username` column to `profiles` table and backfilled existing default profile usernames.
- [Spice.Music main] Updated user profile details, user search, profile sync, and username endpoints to fetch and update `profiles.username` instead of `users.username`.
- [Spice.Music main] Fixed the stale double username string from localStorage profiles by saving the registered username during client auth success payload initialization.
- [Spice.Music main] Bump the visible diagnostics version to `PWA v1.0.85`.

## v1.0.84

- [Spice.Music main] Fixed duplicate `@username` rendering in settings profile header by removing legacy tag-splitting fallback code.
- [Spice.Music main] Fixed greetings banner text-clipping bug where title display could render as solid redacted blocks on theme/gradient transitions by wrapping the header in `display: inline-block` and setting correct fallback styles.
- [Spice.Music main] Fixed profile likes count sync issue on settings page by adding the active profile ID as a dependency to the likes fetch effect.
- [Spice.Music main] Restructured playlist ownership verification (`isPlaylistOwner`) to prevent users from seeing edit and action buttons when viewing other users' public playlists.
- [Spice.Music main] Fixed the description display to exclude unparsed `[object Object]` strings.
- [Spice.Music main] Bump the visible diagnostics version to `PWA v1.0.84`.

## v1.0.83

- [Spice.Music main] Removed username tag-suffixes (e.g. `#12345678`) and random numbers, transitioning Spicer usernames to clean globally unique handles.
- [Spice.Music main] Required users to choose a unique Spicer username during new account signup.
- [Spice.Music main] Integrated Spicer username updates directly into the Edit Profile settings card with backend uniqueness validation.
- [Spice.Music main] Added automatic backward-compatible migration of legacy tag usernames to display-name-based handles (e.g. replacing `#` with `_` or appending incremental `_index` suffixes on name collisions) upon account load/synchronization.
- [Spice.Music main] Updated UI header and profile views to directly render clean handles without splits, and changed Spicer invite placeholder to `e.g. @sound_lover`.
- [Spice.Music main] Updated integration test cases for suffix-free handles and legacy tag migrations.
- [Spice.Music main] Bump the visible diagnostics version to `PWA v1.0.83`.

## v1.0.82

- [Spice.Music main] Fixed stream downloads failing on main (production Vercel deployments) by bypassing the 2MB streaming chunking logic when `download=true` is requested in the YouTube and SoundCloud stream proxy endpoints.
- [Spice.Music main] Bypassed automatic fallback redirects to IP-locked YouTube URLs for downloads, ensuring stream proxying directly downloads the entire song.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.82`.


## v1.0.81

- [Spice.Music main] Fixed ESLint errors and warnings across the backend app and tests (resolved React Compiler memoization dependency mismatches, unescaped characters in JSX, unused imports/variables, and explicit `any` usages).
- [Spice.Music main] Cleaned up unused username input states and manual username save logic from `spice-app.tsx`.
- [Spice.Music main] Fixed the Listen Together active session banner displacement on the desktop layout by shifting its position from relative grid placement to a fixed glassmorphic floating bottom-right widget.
- [Spice.Music main] Moved the Listen Together trigger button in the main desktop player bar between the Share button and the progress bar timestamp.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.81`.


## v1.0.80

- [Spice.Music main] Added support for real-time collaborative listening sessions ("Listen Together") via a shareable link or direct username-tag invite (`@username#00000`).
- [Spice.Music main] Added database tables `listen_together_sessions` and `listen_together_invites` with fully integrated backend API endpoints under `/api/listen-together`.
- [Spice.Music main] Integrated the "Listen Together" action trigger button in the expanded player controls, mini-player control bar, and user profile page.
- [Spice.Music main] Added real-time Listen Together invitation lists inside the topbar notification tray with support for accepting or rejecting invitations.
- [Spice.Music main] Built a beautiful floating glassmorphic session banner to display active hosting/listening states and control session termination.
- [Spice.Music main] Created integration tests in `listen-together.test.mjs` verifying session creation, invitation routing, and playback state sync.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.80`.


## v1.0.79

- [Spice.Music main] Removed the manual unique username creation/save section from Settings since usernames are now globally handled with display names and unique tag-suffixes.
- [Spice.Music main] Renamed "Collaborator" references to "Spicer" across the shared playlists UI (panel, loading indicators, header title, invite button).
- [Spice.Music main] Updated Spicer invites to support usernames starting with `@` (e.g. `@username#000000`) by automatically stripping the leading `@` on the backend invite endpoint.
- [Spice.Music main] Fixed a major bug where public playlists and profile details failed to display on searched user profiles when the user was active on a custom profile ID (e.g. `profile_...`). Removed the hardcoded `profiles.id === 'default'` filter constraint in profile, search, invites, tracks, and shared playlist helper queries to fetch and join profile data dynamically by user ID.
- [Spice.Music main] Added integration test case `Spicer invite username leading @ strip verification`.
- [Spice.Music main] Bump the visible diagnostics version to `PWA v1.0.79`.


## v1.0.78

- [Spice.Music main] Fixed view resetting on page transitions and custom searches (sidebar brand click, empty playlist redirection, home view all button, recommendation open search, shared playlist invite login, create playlist login) to correctly clear the selected user profile overlay.
- [Spice.Music main] Fixed a test execution issue in the user search integration test suite by destructuring `ilike` from `drizzleOrm`.
- [Spice.Music main] Bump the visible diagnostics version to `PWA v1.0.78`.


## v1.0.77

- [Spice.Music main] Added ability to search for users and view their profiles and playlists.
- [Spice.Music main] Added option to set a playlist to public or private during creation or editing.
- [Spice.Music main] Added setting to make user profiles private, hiding bios, statistics, and playlists from other users.
- [Spice.Music main] Added side-by-side statistics cards for Songs Streamed, Liked Songs, and Playlists in user profiles.
- [Spice.Music main] Added a glassmorphic profile likes toggle button showing like counts in user profiles.
- [Spice.Music main] Allowed shared profile display names, removing display name uniqueness constraints.
- [Spice.Music main] Added auto-generation of unique tag-suffix usernames (e.g. name#12345678) derived from the profile display name (converting spaces to underscores) instead of email prefixes.
- [Spice.Music main] Added automatic backfilling of unique tag-suffix usernames for older accounts that do not have one set, executed dynamically during account snapshot queries.
- [Spice.Music main] Styled the username with a fainted, semi-transparent tag suffix in settings and profile details views.
- [Spice.Music main] Created and updated integration tests in `users.test.mjs` to verify profile display name sharing, privacy controls, liking mechanics, older account username backfilling, and unique username tag-suffix generation.
- [Spice.Music main] Bump the visible diagnostics version to `PWA v1.0.77`.

- [Spice.Music main] Added an Emergency Switch to the Admin Dashboard for operators to activate emergency austerity mode and emergency stop globally across all services, targeting all Vercel fluid compute and most neon database sync.
- [Spice.Music main] Designed `systemSettings` table in PostgreSQL to handle operations and state for global emergency halting and throttling.
- [Spice.Music main] Created Next.js `proxy.ts` Edge Middleware to conditionally halt API requests using `503 Service Unavailable` or drop them via `429 Too Many Requests` at various configurable rates based on system settings.

## v1.0.76

- [Spice.Music main] Fixed a Vercel build failure caused by an implicit `any` type error on the `device` parameter within the remote devices mapping logic in `spice-app.tsx`.
- [Spice.Music main] Bump the visible diagnostics version to `v1.0.76`.

- [Spice.Music main] Fixed volume booster to have an explicit BOOST toggle button and an exact percentage UI, capped max normal volume to 200%, capped max boosted volume to 1000%, and fixed the song downloader failing to start properly when popup blockers were triggered.
- [Spice.Music main] Fixed the Profile tab in the Home screen to offer a native profile creation form when no local profile is found instead of redirecting the user to SPICE Music account setup.
- [Spice.Music main] Fixed the Release Notification dialog CSS classes in the marketing home topbar so the popup matches the layout and styling found in the main application.


## v1.0.75

- [Spice.Music main] Fixed an issue where the ListenBrainz user token input field appeared empty after a browser refresh by populating it directly from the database profile connections endpoint, avoiding any dependency on browser cookies or local storage.
- [Spice.Music main] Bump the visible diagnostics version to `PWA v1.0.75`.
- [Spice.Marketing main] Fix layout clipping in the top navigation bar by restructuring the CSS grid and adjusting element widths.
- [Spice.Marketing main] Synchronize the "account info" state on the home screen to match `spice_cloud_user` and `spice_profiles_list` from localStorage.
- [Spice.Music main] Sync notification center release updates dynamically with `walkthrough.md` content via a new `/api/notifications/release` endpoint.


## v1.0.74

- [Spice.Music main] Added a notification bell to the top bar for checking release notes and shared playlist invites.
- [Spice.Music main] Shared playlist invites now display as pending requests inside the new notification tray, allowing users to Accept or Reject them safely.
- [Spice.Music main] Update the SPICE Home screen topbar to include the new notification bell and pending invite synchronization.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.74`.


## v1.0.73

- [Spice.Music main] Optimized the `/api/remote/commands` polling endpoint to use a single SQL query, significantly reducing fluid compute consumption on Neon DB.

- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.73`.

- [Spice.Home] Refactor the Home screen to focus purely on being a service hub, removing unnecessary marketing fluff and syncing its theme tokens with Spice Music. Also added an independent local Profile tab to the Home screen.

## v1.0.72

- Add auto-update polling mechanism in the background that checks for new builds via a `/api/version` endpoint and automatically reloads the client when a new version is detected.
- Added `GET /api/version` endpoint which outputs the current `VERCEL_GIT_COMMIT_SHA` or `VERCEL_URL`.


### Optimization & Containerization Update
- [Spice.Music main] Added multi-stage Dockerfile for Next.js to enable VPS deployments and set Next config output to `standalone`.
- [Spice.Music main] Optimized Vercel Fluid Compute costs on media proxy streams by introducing a 2MB chunking strategy for Range requests in the YouTube and SoundCloud APIs.

## v1.0.71

- Replaced sequential database operations with `db.batch()` across all sync endpoints (`profiles`, `likes`, `history`, `playlists`) for improved performance using the `neon-http` driver.
- Fixed TypeScript errors related to `db.batch()` typing in Next.js `POST` handlers.
- Updated SPICE_MEDIA_CORE_VERSION to v1.0.71 in `spice-app.tsx`.
- [Spice.Music main] UI changes to the volume lever control now include a percentage readout, and max out at 200%. Added a Boost button to optionally enable volume boosting up to 1000% maximum.
- [Spice.Music main] Fixed the placement of the volume booster disclaimer to render in the center of the viewport.

## v1.0.70

- [Spice.Music main] Added a topbar notification bell to the right of the profile control, with a lower-right badge showing unread release updates plus pending shared playlist requests.
- [Spice.Music main] Added version-change notifications with a large detail dialog for reading the current Spice Media Core release notes.
- [Spice.Music main] Surfaced shared playlist collaborator requests in notifications with Accept and Reject actions, while pending requests stay out of the library until accepted.
- [Spice.Music main] Updated collaborator lists to show pending join request status instead of presenting requested users as fully active collaborators.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.70`.


## v1.0.69

- [Spice.Music main] Removed the external loader.to fallback from song downloads so the share dialog Download action stays inside SPICE.
- [Spice.Music main] Updated stream downloads to trigger the browser download manager directly with an MP3 filename by default.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.69`.


## v1.0.68

- [Spice.Music main] Fixed local profile deletion so removing an inactive profile no longer forces a switch away from the current profile, while active profile deletion switches cleanly to the next remaining profile.
- [Spice.Music main] Added a six-profile cap to local profile creation, including disabled create controls and a warning when the cap is reached.


### Added Volume Booster Feature
- [Spice.Music main] Added a volume booster feature to the player bar (up to 1000% volume via Web Audio API) with a disclaimer modal that must be accepted at least once.

- [Spice.Music main] Fixed JWT secret initialization bug that failed production builds.
- [Spice.Music main] Cleaned up unused discord-ipc imports and route handler.
- [Spice.Music main] Updated AGENTS.md with rules for asynchronous agent workflow coordination.
- [Spice.Music main] Fixed walkthrough and version string conflicts from concurrent merges.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.68`.

## v1.0.67

- [Spice.Music main] ListenBrainz user tokens are now encrypted and saved on the signed-in SPICE account instead of browser local storage, with restore on login and account-backed resolution during profile sync submissions.
- [Spice.Music main] Added `PUT /api/profile/connections` for saving or clearing the ListenBrainz token, and extended profile connection restore to include ListenBrainz alongside Last.fm.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.67`.


## v1.0.66

- [Spice] Removed Flutter client and Dart packages from the monorepo.

- [Spice.Music main] Fixed code health issue in `apps/backend/lib/lrclib.ts` by suppressing hardcoded `console.error` for expected LRCLIB lookup failures.
- [Spice.Music main] Removed the scrapped Discord Rich Presence integration, including the `/api/discord/presence` route, `discord-ipc` server helper, client playback hooks, and `DISCORD_CLIENT_ID` environment variable documentation.
- [Spice.Music main] Added a setting in the settings tab to allow users to customize their global theme color.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.66`.


## v1.0.65

- [Spice.Music main] Fixed a code health warning in `spice-app.tsx` by commenting out the unused `RecommendationSeed` import and using an inline type import at the usage site to satisfy TypeScript requirements.
- [Spice.Music main] Cleaned up unused error parameters in catch blocks and renamed an unused function to start with an underscore to appease ESLint warnings.
- [Spice.Music main] Added unit tests for hash functions `hashPassword` and `verifyPassword`.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.65`.

- Fixed a security vulnerability where a hardcoded default string was used for JWT and profile connection secrets if environment variables were missing.
- The application now throws an error if JWT_SECRET or PROFILE_CONNECTION_SECRET is not configured properly, preventing the use of weak fallback keys.
- [Spice.Music main] Fixed N+1 query issue when fetching members and profiles of shared playlists. Replaced iterative SQL queries with bulk fetches using `inArray` for better performance.
- [Spice.Music main] Throw an error in production if the stream HMAC secret is missing, removing the hardcoded fallback secret to prevent unauthorized stream URL generation.
- [Spice.Admin main] Added unit tests for CORS utilities (`optionsResponse` and `jsonResponse`) in `apps/backend/test/cors.test.mjs` to improve backend test coverage and reliability.
- [Spice.Admin main] Removed hardcoded fallback secrets for JWT signing and profile connections. The application will now refuse to start and throw an error if the required `JWT_SECRET` environment variable is not explicitly set, fixing a critical security vulnerability.
- [Spice.Admin main] Bump the visible diagnostics version to `Spice Media Core v1.0.65`.

- Remove unused `SearchCacheEntry` type import from `spice-app.tsx` to improve code maintainability and readability.


### Fixed Vercel Build Errors
- [Spice.Music main] Fixed a Vercel build error caused by Next.js pre-rendering pages that require `.env` variables at build time, by providing a fallback string when not in production.
* [Spice Music Backend] Optimized shared playlist snapshot generation by replacing N+1 queries with batched user profile lookups, reducing DB overhead.

## v1.0.64

- [Spice.Music main] Added zero-dependency Discord Rich Presence (DRP) integration, allowing the SPICE player to show track details, artists, live elapsed/remaining ticking time progress, custom logo cover assets, and a button link back to the song.
- [Spice.Music main] Added automatic Windows named-pipe and Linux/macOS Unix domain socket discovery scanner for communicating with the local Discord client from Next.js server runtime.
- [Spice.Music main] Wired state tracking hooks in `spice-app.tsx` to handle heartbeat ticks, unmount cleanups, and instant notifications on track play, pause, and seek actions.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.64 (Discord RPC)`.


## v1.0.63

- [Spice.Music main] Fixed share dialog and other modals (confirmations, locks) appearing behind the expanded full-screen player by setting their z-index layer styles to stack correctly above it.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.63`.


## v1.0.62

- [Spice.Music main] Implemented a client-side download fallback that opens an external converter popup (loader.to) if the backend's direct MP3 audio stream resolution fails (e.g. because the hosting environment's IP is blocked by YouTube).
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.62`.


## v1.0.61

- [Spice.Music main] Shortened generated song share links by encoding track data into a minimal array tuple instead of a verbose JSON object. Old share links remain fully supported via backward compatibility.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.61`.


## v1.0.60

- [Spice.Music main] Enabled downloading any provider stream as an MP3 file directly from the share dialog. The download button is no longer restricted to direct licensed audio.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.60`.


## v1.0.59

- [Spice.Music main] Added a "Pending Playlist Invites" section to Settings.
- [Spice.Music main] When inviting a user via Collaborative Username, they are now sent a pending invite instead of being instantly added.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.59`.


## v1.0.58

- [Spice.Music main] Display an informative "Song already in playlist." notice instead of a success notice when adding a song that is already present in the target playlist.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.58`.


## v1.0.57

- [Spice.Music main] Dismiss the oldest active notice automatically when a 3rd notice occurs to prevent UI clutter.
- [Spice.Music main] Add mobile-responsive support so notices pile up from the bottom above the playback controls on mobile devices.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.57`.


## v1.0.56

- [Spice.Music main] Add song share buttons across search results, playlists, liked songs, history, the topbar search tray, and all now-playing player surfaces.
- [Spice.Music main] Add share-song links that open the selected track in SPICE Music through a `song` launch parameter.
- [Spice.Music main] Add a share sheet with copy-link, source-open, and safe direct-audio download actions; provider streams remain share/source-only unless the track already exposes a direct audio file URL.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.56`.


## v1.0.55

- [Spice.Music main] Replace native browser alerts and confirmations with themed in-app Spice notices and confirmation dialogs that use the active accent color variables.
- [Spice.Music main] Retheme playlist share/status notifications so they match the selected Spice accent theme instead of using fixed purple styling.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.55`.


## v1.0.54

- [Spice.Music main] Fix multi-profile account isolation so each local profile restores its own SPICE account token, account snapshot, and collaborative username when switching profiles instead of falling back to or overwriting another profile's session.
- [Spice.Music main] Guard profile cloud sync and username fetches against profile-switch races so late network responses update only the profile they started from and cannot erase another saved profile account.
- [Spice.Music main] Bump the visible diagnostics version to `Spice Media Core v1.0.54`.


## v1.0.53

- [Spice.Music main] Fix duplicate key value unique constraint error on `playlists_pkey` during playlist synchronization by checking if the playlist UUID already exists in the database and performing an update instead of an insert.
- [Spice.Music main] Fix profile switching auto-login session synchronization lag by loading the latest profile properties directly from `localStorage` within `switchProfile` to bypass React asynchronous state rendering updates.


## v1.0.52

- [Spice.Music main] Fix missing collaborators panel button on shared playlists for guest/logged-out users by checking only for playlist share status and a valid UUID, and fall back to rendering the member list from local cached metadata (`ownerDisplayName`, `members`) when `cloudToken` is not present.
- [Spice.Music main] Fix cloud account session persistence when switching profiles by ensuring that `cloudToken`, `cloudUser`, and `cloudUsername` are explicitly carried over from local profiles during cloud synchronization.
- [Spice.Admin main] Wire up the developer/admin dashboard at `/admin-dashboard` to allow managing account roles and subscription states.
- [Spice.Admin main] Create backend admin API endpoints (`/api/admin/accounts`) to securely query all registered accounts and save inline role, tier, and status changes.
- [Spice.Admin main] Add an interactive Account Governance panel on the client with dropdown selectors, loading states, success checks, and real-time database sync.
- [Spice.Admin main] Bump the application version in the diagnostics panel inside `apps/backend/app/spice-app.tsx` to align with the release.


## v1.0.51

- [Spice.Music main] Add playlist details customization: users can edit name, description, gradient accent banner presets (including matching neon red and dark purple gradients), and cover art image (by image URL or uploading local files converted to Base64).
- [Spice.Music main] Relocate the "Delete" button from the main actions bar into the customization modal, and replace the browser confirm dialog with a premium React overlay confirmation popup.
- [Spice.Music main] Add the "Crimson Moon" (neon red) and "Midnight Velvet" (dark purple) dynamic themes to Application Settings, painting highlights, buttons, and glow effects.
- [Spice.Music main] Connect the sidebar "S" logo background gradient to the active application theme dynamically instead of hardcoding the active profile's gradient.
- [Spice.Music main] Extend the database schema with a `cover_url` column on the `playlists` table, support it in synchronization, and add a `PATCH` endpoint to support remote updates on shared collaborative playlists.


## v1.0.50

- [Spice.Music main] Update the volume slider styling with a thematic linear gradient that represents the filled volume level in purple (`var(--accent-pink)`), and make the volume icon and slider thumb use the purple accent theme on hover.
- [Spice.Music main] Fix collaborator identity leakage across local profiles by storing and restoring the `cloudToken`, `cloudUser`, and `cloudUsername` fields dynamically on a per-profile basis when switching profiles.
- [Spice.Music main] Decouple the topbar quick search input query state (`topbarSearchQuery`) from the search page input query state (`searchQuery`) so that typing in one search bar does not overwrite or sync text with the other.
- [Spice.Music main] Add a "Shuffle Play" action button to the playlist actions bar, allowing users to start playing a playlist shuffled immediately.


## v1.0.49

- [Spice.Music main] Fix collaborators panel remaining open when selecting a different playlist in SPICE Music by resetting `showMembersPanel` to false whenever `selectedPlaylist` changes.
- [Spice.Music main] Fix empty shared playlist UI to display "Search and add your favorite tracks" and the "Search Tracks" button so collaborators/owners can search and add tracks directly, matching the behavior of normal playlists.


## v1.0.48

- Fix shared playlists disappearing on page refresh by returning the updated playlists list (with server-assigned UUIDs) from the `POST /api/sync/playlists` handler. This allows the client to successfully retrieve and resolve the server-assigned UUIDs when inserting new shared playlists (previously, the POST response did not return playlists, leading the client to keep non-UUID local IDs which skipped the `/api/playlists/invites` call).
- Fix `createPlaylistId` fallback in `spice-app.tsx` to generate a valid RFC 4122 version 4 UUID when `crypto.randomUUID` is unavailable (e.g., in non-secure HTTP contexts). This ensures that generated playlist IDs are valid UUIDs from the start, preventing database insertion mismatches.
- Fix collaborator list rendering by filtering out the playlist owner from the members list returned by `getPlaylistSnapshot` and `GET /api/playlists/shared/members` to prevent double-rendering in the UI.


## v1.0.47

- Fix `createSharedPlaylist` in `spice-app.tsx` to send the new playlist with `shared: false` temporarily during the initial bulk sync POST payload. This ensures that the playlist row gets created in the backend database, allowing subsequent invite link generation and collaborator invitations to locate the playlist on the server and succeed (previously, it was completely filtered out of sync and never reached the database).
- Fix `GET /api/sync/playlists` backend route to inspect both `playlistMembers` and `playlistInvites` tables to determine if a playlist is shared, preventing new shared playlists from reverting to private when synced by the owner before anyone has joined.
- Fix `sharePlaylist` in `spice-app.tsx` to mark the playlist as shared locally (`shared: true`, `shareRole: 'owner'`) once the invite link is successfully created.
- Fix backend track editing permissions in `POST /api/playlists/shared/[playlistId]/tracks` and `DELETE /api/playlists/shared/[playlistId]/tracks` to strictly block members with the `listener` role from adding or deleting tracks, aligning the database security check with the error message and client UI.
- Fix UI button visibility in `spice-app.tsx` so the "Collaborators" panel button is only displayed for shared playlists with a valid server-synced UUID, hiding it on private playlists.
- Add a new integration test file `apps/backend/test/shared-playlists.test.mjs` to verify user signup, username configuration, database collaboration queries, invite links, and role checks.


## v1.0.46

- Fix `createSharedPlaylist` to sync the new playlist to the backend and auto-generate a shareable invite link so the owner can immediately invite collaborators.
- Fix `sharePlaylist` to allow the owner of an existing shared playlist to regenerate a new invite link via a "New Invite Link" button (previously blocked for all shared playlists).
- Add `GET /api/playlists/shared/[playlistId]/tracks` route so authenticated members and owners can fetch the latest track list with attribution data.
- Add live playlist refresh on open: when a user opens a shared UUID-backed playlist the client silently fetches fresh tracks from the new GET endpoint so collaborator additions appear without a manual reload.
- Fix `normalizePlaylistSnapshot` to carry through `ownerDisplayName`, `ownerUsername`, and `members` from the server response so the collaborators panel shows correct owner info after accepting an invite.


## v1.0.45

- Add support for collaborative editing on shared playlists in SPICE Music, including database migrations and API routes.
- Add Username management in the Account panel, enabling users to claim unique usernames.
- Add playlist member/collaborator management (invite by username, list members, remove members).
- Allow collaborators with editor access to add or remove tracks in shared playlists via dedicated API routes.
- Render attribution badges on tracks in collaborative playlists and allow the creator and the track uploader to delete tracks from the playlist.


## v1.0.44

- Link the Spice Movie screening panel to VIDSrc through validated TMDB movie IDs, host-compatible watch routes, and a sandboxed full-screen player shell.
- Add a configurable `SPICE_MOVIE_PROVIDER_BASE_URL`, focused provider URL tests, and Movie-lane release documentation so provider domain changes stay isolated from the UI.


## v1.0.43

- Add a host-specific Spice Movie starter frontend for `movie.spice-app.xyz` plus a local `/movie` preview route with cinematic hero playback, continue-watching cards, premiere rows, showtimes, and original project hero artwork.
- Add Spice Movie to the public `spice-app.xyz` service hub with a direct launch card, hero action, route-map entry, and host-aware page metadata.
- Register Movie in the service changelog, admin launch-status prototype, focused changelog test, and repo service-lane guidance so future Movie work stays scoped.

- [Spice.Music main] Fixed a `QuotaExceededError` issue on `spice_profiles_list` by catching and shrinking massive track items (omitting artwork URLs and keeping only IDs/Names) before saving to local storage.

## v1.0.42

- Add the SPICE Music topbar pattern to the public Home screen at `spice-app.xyz` with integrated search, provider selection, and profile/account controls.
- Wire Home search submissions into `music.spice-app.xyz` launch intents so the Music app opens Search and runs the query with the selected provider.
- Wire Home account prompts into the existing Music account manager, including register-mode handoff and admin-dashboard access for verified admin accounts.


## v1.0.41

- Replace the native Spice Connect receiver selector in the Music player with a custom dark popover so the dropdown no longer falls back to the browser's blue menu styling.
- Add clearer selected-device, local playback, remote status, and last-seen labels inside the player receiver picker.
- Tune the receiver picker layout for the compact bar, expanded player, and mini-player variants.


## v1.0.40

- Add a root `AGENTS.md` with repo-wide agent basics, walkthrough/versioning requirements, and service-lane worktree rules.
- Document the `Spice.Home`, `Spice.Music`, `Spice.Admin`, and `Spice.Anime` scope boundaries so future work stays in the matching host or feature lane.
- Define the naming pattern for future `Spice.<Service> main`, numbered sections, and named minor branches such as `Spice.Music Algorithm`.


## v1.0.39

- Remove the YouTube video player button from the compact, expanded, and mini player controls while keeping hidden embed fallback available for playback recovery.
- Add an unfolding topbar search tray with playable song results, local-cache status, and previous search query chips.
- Keep topbar searches on the current page instead of forcing navigation to the full Search tab.


## v1.0.38

- Add a hideable SPICE Music sidebar with a floating restore control for desktop and tablet layouts.
- Add Settings toggles for showing or hiding the Search and Profile tabs in the sidebar.
- Keep topbar search and profile access available even when their sidebar tabs are disabled.


## v1.0.37

- Split `/changelog` into service-specific release histories for SPICE Home, Music, Anime, Connect, and Accounts.
- Add account-dependent changelog loading so normal users keep the public service history while admin accounts unlock Admin Ops entries.
- Add `/api/changelog` and focused tests for user/admin changelog payload filtering.
- Add a sticky SPICE Music topbar with global search beside the provider chip and profile/account button.


## v1.0.36

- Add account-level roles with `user` and `admin` support, admin bootstrap via `SPICE_ADMIN_EMAILS`, and role-aware auth/session responses.
- Add a future-ready `account_subscriptions` table and account snapshot helpers that expose free/inactive defaults until billing is connected.
- Add `/api/account/me`, backend account-system documentation, and helper tests for role and subscription normalization.


## v1.0.35

- Add a host-specific Spice Anime starter frontend for `anime.spice-app.xyz` plus a local `/anime` preview route with featured playback, continue-watching cards, trending rows, release schedule, and original generated hero artwork.
- Add Spice Anime to the public `spice-app.xyz` service hub with a direct launch card and route-map entry.
- Return host-aware page metadata so the Anime, Music, and root service surfaces describe themselves correctly.


## v1.0.34

- Restore document scrolling on the public `spice-app.xyz` home and `/changelog` pages by removing the global body scroll lock.
- Recover stuck YouTube playback by migrating persisted `embed` transport back to the direct proxy path on load.
- Retry blocked YouTube embeds through the direct proxy and retry direct audio failures through the embed before self-healing skip logic runs.


## v1.0.33

- Add a public `/changelog` page for `spice-app.xyz/changelog`.
- Generate changelog entries from `walkthrough.md` so the public release history updates with the existing version notes.
- Link the changelog from the SPICE home navigation.


## v1.0.32

- Reduce Spice Connect command polling latency while preventing overlapping receiver polls.
- Expire stale pending Spice Connect commands so reconnecting devices do not replay old play or skip actions.
- Add receiver freshness guards and post-command sync refreshes to avoid controlling stale devices with outdated track state.


## v1.0.31

- Promote Spice Connect into the player with a receiver selector for this device or another signed-in account device.
- Route normal player controls through the selected receiver, including play/pause, previous/next, seek, volume, and track handoff.
- Add a `play_track` Spice Connect command payload so selecting a song can start it on the chosen receiver instead of only local playback.


## v1.0.30

- Split pause and resume into explicit player control paths so pausing a loading or fallback stream cannot restart the current track.
- Add a playback intent guard for pending stream requests, preventing late audio/embed resolutions from auto-playing after the user has paused.
- Tighten Spice Connect command polling and add a Player Bar Density setting with a slimmer now-playing bar option.


## v1.0.29

- Add backend tests for Last.fm request signing, scrobble timestamp validation, and account-backed Last.fm session fallback.
- Add Spice Connect tests for device-state normalization, command validation, and resilient remote payload parsing.
- Extract small profile-listen and Spice Connect helper modules so API route behavior is covered without mocking the full Next.js runtime.

- [Spice.Music main] Throw an error in production if the stream HMAC secret is missing, removing the hardcoded fallback secret to prevent unauthorized stream URL generation.


## v1.0.28

- Add a private on-device recommendation profile that scores artists and language hints from local history, likes, and playlists.
- Populate Home with a personalized recommendation row and Search with suggested picks when the query is empty.
- Keep recommendation inputs local; only coarse source searches such as artist or language seeds are sent through existing search endpoints.


## v1.0.27

- Rename the account-backed remote-control feature to Spice Connect across Settings, status messages, diagnostics logs, API fallback messages, and public service copy.
- Keep the internal `/api/remote/*` endpoints and database table names stable while presenting the feature as a branded cross-device control layer.
- Update default connected-device names and Settings copy so users understand Spice Connect requires the same SPICE account on both devices.


## v1.0.26

- Polish the phone layout with a compact home greeting card, cleaner content scrolling, tighter carousel cards, and safer bottom spacing.
- Rework mobile Quick Picks into readable full-width rows and replace flat loading blocks with structured shimmer skeleton cards.
- Refine the mobile now-playing bar and bottom navigation into rounded, touch-friendly controls that keep the active content visible.


## v1.0.25

- Rework `spice-app.xyz` from a single SPICE Music ad into a root service home screen for the wider SPICE ecosystem.
- Keep `music.spice-app.xyz` as the active Music service entry while adding planned launcher cards for Rooms, Recap, and Cloud.
- Update the apex landing route map to explain the root home screen, the live music subdomain, and the future `*.spice-app.xyz` service structure.


## v1.0.24

- Improve phone layouts with safer viewport sizing, fixed mobile Library navigation, tighter cards/lists, stacked settings forms, bottom safe-area spacing, and bounded mini/expanded players.
- Add account-backed Spice Connect tables for signed-in device state and queued playback commands.
- Add `/api/remote/devices` and `/api/remote/commands` so devices on the same SPICE account can discover each other and send play/pause/next/previous/seek/volume commands.
- Add a Settings Spice Connect panel for naming this device, enabling/disabling cross-device access, selecting another account device, and sending transport/volume controls.


## v1.0.23

- Add account-backed shared playlist invites with database tables for invite links and accepted playlist memberships.
- Add playlist invite APIs for creating owner-only share links, previewing invites, accepting shared playlists, and leaving shared playlists.
- Update cloud playlist sync so owned playlists continue to save normally while accepted shared playlists are pulled into the library as read-only items and protected from overwrite.
- Add UI support for sharing owned playlists, accepting invite links, showing shared badges, and hiding edit/remove controls on shared playlists.


## v1.0.22

- Persist signed-in Last.fm links to the backend account through the existing `oauth_links` table, storing the Last.fm username and an encrypted session key for restore after browser storage loss.
- Add a short-lived signed Last.fm callback state so the popup callback can safely associate the approved Last.fm session with the SPICE account.
- Restore account-backed Last.fm connections after sign-in/reload and allow profile listen writes to resolve the saved server-side Last.fm session when the browser has no local session key.


## v1.0.21

- Split the root page by request host so `spice-app.xyz` and `www.spice-app.xyz` render a standalone marketing landing page while `music.spice-app.xyz`, localhost, and preview hosts keep serving the full SPICE music app.
- Add a high-impact SPICE landing page with service CTAs, SVG branding, feature callouts, and a clear handoff to `music.spice-app.xyz`.
- Document the domain split as the public site structure: apex domain for the ad/home page, music subdomain for the player service.


## v1.0.20

- Replace the Settings Last.fm API-key, shared-secret, session-key, and manual-complete controls with one `Set up Last.fm` button.
- Generate a web auth URL from backend `LASTFM_API_KEY` / `LASTFM_SHARED_SECRET`, include `/api/lastfm/callback` as the callback, and open it in a popup.
- Exchange Last.fm callback tokens server-side, store the approved session locally, enable profile sync automatically, and clear old browser-stored Last.fm API credentials.


## v1.0.19

- Add `/api/lastfm/callback` so Last.fm's configured callback URL resolves locally, captures returned auth tokens into browser storage, and sends the user back to SPICE.
- Document the local Last.fm callback URL in Settings next to the API key/shared secret fields.
- Configure the local ignored backend `.env` with the provided Last.fm API credentials; the secret is not committed.


## v1.0.18

- Add Last.fm API key and shared-secret controls to Settings, with local storage for private/local installs and backend environment variables still available as fallback.
- Add a `Link Last.fm` Settings flow that requests a Last.fm desktop auth token, opens the Last.fm authorization page, then exchanges the approved token for a session key with `Complete Link`.
- Pass Settings-provided Last.fm credentials through profile sync so now-playing and scrobble writes no longer require editing `.env` when running locally.


## v1.0.17

- Remove Last.fm and ListenBrainz from Search and Hybrid results so search only returns playable YouTube Music, YouTube Video, and SoundCloud tracks.
- Replace the mistaken metadata-search adapters with profile update clients for Last.fm `track.updateNowPlaying` / `track.scrobble` and ListenBrainz `playing_now` / `single` submissions.
- Add `/api/profile/listens` as a server-side profile write endpoint with per-provider results, Last.fm API signing, ListenBrainz token auth, and non-blocking provider failures.
- Add Settings controls for enabling listening profile sync, storing the user's Last.fm session key and ListenBrainz token locally, and showing the latest profile-sync status while playback runs.


## v1.0.16

- Add Last.fm as a metadata discovery search provider through the official `track.search` API, gated by `LASTFM_API_KEY`.
- Add ListenBrainz-flavored metadata discovery through ListenBrainz Labs recording search, exposing MusicBrainz recording IDs as ListenBrainz-compatible matches.
- Extend Hybrid search to include YouTube Music, YouTube Videos, SoundCloud, Last.fm, and ListenBrainz batches while keeping provider-specific local search caching.
- Resolve Last.fm and ListenBrainz metadata-only results through YouTube Music before playback so the app does not send non-streaming provider IDs into YouTube or SoundCloud stream routes.


## v1.0.15

- Fix lyrics lookups by passing the active track title, artists, and duration from the UI into the YouTube and SoundCloud lyrics routes instead of relying only on provider re-fetch metadata.
- Make LRCLIB caching metadata-aware so a failed lookup from stale or dirty provider metadata does not block a later lookup with cleaner track details.
- Add persisted visual customization settings for surface style, artwork shape, motion level, and interface density, with instant CSS-variable updates and a live preview.
- Document the current TIDAL path: official catalogue search is possible with TIDAL client credentials, but full web playback must go through TIDAL's Player SDK rather than a private stream-bypass endpoint.


## v1.0.14

- Remove the June-only Pride/rainbow UI branch from the sidebar logo, docked play button, and player styling so the normal profile/accent theme stays active year-round.
- Add Hybrid search with YouTube Music, YouTube Videos, and SoundCloud result batches, plus a dedicated YouTube Videos provider mode and provider-specific badges.
- Hide SoundCloud preview-only snippets from search/playback, expose YouTube video playback through the existing iframe transport, and add video controls across docked, expanded, and mini player layouts.
- Improve LRCLIB lookups for YouTube video metadata by stripping channel suffixes and deriving `Artist - Song` search terms before matching.


## v1.0.13

- Add SoundCloud as an optional search provider with namespaced track IDs, provider-specific local search caching, neutral source badges, and progressive audio playback.
- Resolve SoundCloud's public web-client API server-side with an optional `SOUNDCLOUD_CLIENT_ID` override and a refreshable frontend-asset discovery fallback.
- Share truthful LRCLIB matching between YouTube Music and SoundCloud tracks, run direct and ranked lyrics reads in parallel, and keep SoundCloud selections out of the YouTube iframe fallback path.


## v1.0.12

- Replace the bare sidebar playlist `+` glyph with a centered compact SVG action button, neutral resting state, violet hover treatment, and an accessible label.
- Make the docked player fluid across desktop and tablet widths, preserving track metadata longer while progressively hiding secondary controls before they can overflow.


## v1.0.11

- Replace emoji-based UI decoration and text-glyph controls with a consistent inline SVG icon set across navigation, category cards, settings, status messages, lyrics, and all player layouts.
- Convert diagnostic sync marks to readable ASCII status tags and refresh the PWA service-worker cache.


## v1.0.10

- Persist complete track snapshots for Neon likes, history, and playlist items so restored library entries retain titles, artists, durations, and thumbnails.
- Scope automatic likes, history, and playlist saves to the active profile.
- Add bounded local track snapshots, saved search results, and per-profile playback save states.
- Restore the most recent cached search after reload and use exact-query cached results while the network refreshes.
- Replace generated placeholder lyrics with ranked LRCLIB matching, timeout-safe search fallback, a short server cache, real plain-lyrics fallback, and an unsynced UI state.
