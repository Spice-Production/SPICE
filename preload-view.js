/**
 * Preload script for BrowserView
 * Exposes a global function for track detection scripts to report what's playing
 */

const { contextBridge, ipcRenderer, webFrame } = require('electron');

// BrowserView preloads run in Electron's sandbox and cannot require local files.
// Keep this tiny helper here so a failed local import cannot prevent every
// desktop bridge (including the Downloads Folder picker) from being installed.
function shouldBlockNativeStartupPlayback({
    waitingForAudioSettings = false,
    guardActive = false,
    userPlaybackIntent = false,
} = {}) {
    return !userPlaybackIntent && (waitingForAudioSettings || guardActive);
}

const IS_SPICE_LOCAL_RUNTIME =
    (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') &&
    window.location.port === '3939';
const IS_YOUTUBE_MUSIC = window.location.hostname === 'music.youtube.com';
const SPICE_MUSIC_HOSTS = new Set([
    'music.spice-app.xyz',
    'spice-app.xyz',
    'www.spice-app.xyz',
]);
const IS_SPICE_MUSIC =
    IS_SPICE_LOCAL_RUNTIME || SPICE_MUSIC_HOSTS.has(window.location.hostname);

if (IS_SPICE_LOCAL_RUNTIME) {
    window.__spiceDesktopAudioReady = false;
    window.__spiceDesktopAudioSettingsQueued = false;
}

const NATIVE_STARTUP_PLAYBACK_GUARD_MS = 60 * 1000;
const NATIVE_REMOTE_SUPPRESS_KEY = 'spice_update_reload_remote_suppress_until';
const NATIVE_STARTUP_GUARD_KEY = 'spice_native_startup_playback_guard_until';

function installNativeStartupPlaybackGuard() {
    if (!IS_SPICE_LOCAL_RUNTIME || window.__spiceNativeStartupPlaybackGuardInstalled) return;
    window.__spiceNativeStartupPlaybackGuardInstalled = true;

    const guardUntil = Date.now() + NATIVE_STARTUP_PLAYBACK_GUARD_MS;
    let userPlaybackIntent = false;
    let loggedBlockedPlayback = false;

    function readStoredGuardUntil() {
        try {
            const value = Number(window.localStorage.getItem(NATIVE_STARTUP_GUARD_KEY) || 0);
            return Number.isFinite(value) ? value : 0;
        } catch (_) {
            return 0;
        }
    }

    function writeStartupGuards() {
        try {
            const suppressUntil = String(guardUntil);
            window.localStorage.setItem(NATIVE_REMOTE_SUPPRESS_KEY, suppressUntil);
            window.localStorage.setItem(NATIVE_STARTUP_GUARD_KEY, suppressUntil);
        } catch (error) {
            console.warn('[Preload] Native startup playback guard could not write localStorage:', error && error.message);
        }
    }

    function isGuardActive() {
        return Date.now() < Math.max(guardUntil, readStoredGuardUntil());
    }

    function shouldBlockStartupPlayback() {
        const waitingForAudioSettings = window.__spiceDesktopAudioReady === false;
        return shouldBlockNativeStartupPlayback({
            waitingForAudioSettings,
            guardActive: isGuardActive(),
            userPlaybackIntent,
        });
    }

    function allowPlaybackIntent(reason) {
        userPlaybackIntent = true;
        try {
            window.localStorage.removeItem(NATIVE_STARTUP_GUARD_KEY);
        } catch (_) {}
        console.log(`[Preload] Native startup playback guard released by ${reason || 'user intent'}.`);
    }

    function isEditableTarget(target) {
        const element = target && target.nodeType === Node.ELEMENT_NODE
            ? target
            : target && target.parentElement;
        if (!element || !element.closest) return false;
        const editable = element.closest('input, textarea, select, [contenteditable="true"]');
        return Boolean(editable);
    }

    function looksLikePlaybackTarget(target) {
        const element = target && target.nodeType === Node.ELEMENT_NODE
            ? target
            : target && target.parentElement;
        if (!element || !element.closest) return false;

        const candidate = element.closest([
            'button',
            'a',
            '[role="button"]',
            '[data-track-id]',
            '[data-song-id]',
            '.queue-item',
            '.search-result',
            '.track-card',
            '.track-row',
            '.playlist-track',
            '.recommendation-card',
            '.chart-card',
            '.now-playing__control',
            '.mini-player__control',
            '.player-controls',
            '.playback-control'
        ].join(','));

        if (!candidate) return false;

        const label = [
            candidate.getAttribute('aria-label'),
            candidate.getAttribute('title'),
            candidate.getAttribute('data-action'),
            candidate.className,
            candidate.textContent
        ].filter(Boolean).join(' ').toLowerCase();

        if (candidate.matches('[data-track-id], [data-song-id], .queue-item, .search-result, .track-card, .track-row, .playlist-track, .recommendation-card, .chart-card')) {
            return true;
        }

        return /play|pause|track|song|queue|listen|album|artist|result/.test(label);
    }

    function noteTrustedPlaybackIntent(event) {
        if (!event || event.defaultPrevented || !event.isTrusted) return;

        if (event.type === 'keydown') {
            const playbackKeys = new Set([' ', 'Enter', 'MediaPlayPause', 'MediaPlay', 'MediaTrackNext', 'MediaTrackPrevious']);
            if (!playbackKeys.has(event.key)) return;
            if (isEditableTarget(event.target) && !event.key.startsWith('Media')) return;
            allowPlaybackIntent(`trusted ${event.type}`);
            return;
        }

        if (looksLikePlaybackTarget(event.target)) {
            allowPlaybackIntent(`trusted ${event.type}`);
        }
    }

    function blockPlayback(media) {
        try {
            if (media && typeof media.pause === 'function') media.pause();
        } catch (_) {}
        if (!loggedBlockedPlayback) {
            loggedBlockedPlayback = true;
            console.warn('[Preload] Blocked native startup playback until the user starts playback.');
        }
    }

    function pauseUnexpectedMedia() {
        if (!shouldBlockStartupPlayback() || !document.querySelectorAll) return;
        document.querySelectorAll('audio, video').forEach((media) => {
            if (!media.paused) blockPlayback(media);
        });
    }

    function patchHtmlMediaPlayback() {
        const prototype = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
        if (!prototype || typeof prototype.play !== 'function' || prototype.play.__spiceNativeGuardPatched) return;

        const originalPlay = prototype.play;
        const guardedPlay = function(...args) {
            if (shouldBlockStartupPlayback()) {
                blockPlayback(this);
                const error = new DOMException(
                    'Native startup playback is blocked until the user starts playback.',
                    'NotAllowedError'
                );
                return Promise.reject(error);
            }
            return originalPlay.apply(this, args);
        };

        guardedPlay.__spiceNativeGuardPatched = true;
        prototype.play = guardedPlay;
    }

    function patchYouTubePlayerInstance(player) {
        if (!player || player.__spiceNativeGuardPatched) return player;
        player.__spiceNativeGuardPatched = true;

        ['playVideo', 'loadVideoById'].forEach((method) => {
            const original = player[method];
            if (typeof original !== 'function') return;

            player[method] = function(...args) {
                if (shouldBlockStartupPlayback()) {
                    if (method === 'loadVideoById' && typeof this.cueVideoById === 'function') {
                        try {
                            return this.cueVideoById(...args);
                        } catch (_) {}
                    }
                    if (!loggedBlockedPlayback) {
                        loggedBlockedPlayback = true;
                        console.warn('[Preload] Blocked native startup YouTube playback until the user starts playback.');
                    }
                    return undefined;
                }
                return original.apply(this, args);
            };
        });

        return player;
    }

    function patchYouTubeApi(value) {
        if (!value || typeof value.Player !== 'function' || value.Player.__spiceNativeGuardPatched) return;

        const OriginalPlayer = value.Player;
        function GuardedPlayer(...args) {
            const player = new OriginalPlayer(...args);
            return patchYouTubePlayerInstance(player);
        }

        Object.setPrototypeOf(GuardedPlayer, OriginalPlayer);
        GuardedPlayer.prototype = OriginalPlayer.prototype;
        GuardedPlayer.__spiceNativeGuardPatched = true;
        value.Player = GuardedPlayer;
    }

    function patchYouTubeApiWhenAvailable() {
        let ytValue = window.YT;
        try {
            Object.defineProperty(window, 'YT', {
                configurable: true,
                get() {
                    return ytValue;
                },
                set(value) {
                    ytValue = value;
                    patchYouTubeApi(value);
                },
            });
        } catch (_) {}

        patchYouTubeApi(ytValue);
        const interval = window.setInterval(() => patchYouTubeApi(window.YT), 250);
        window.setTimeout(() => window.clearInterval(interval), NATIVE_STARTUP_PLAYBACK_GUARD_MS);
    }

    writeStartupGuards();
    window.__spiceNativeAllowPlaybackIntent = allowPlaybackIntent;
    window.addEventListener('pointerdown', noteTrustedPlaybackIntent, true);
    window.addEventListener('click', noteTrustedPlaybackIntent, true);
    window.addEventListener('keydown', noteTrustedPlaybackIntent, true);

    patchHtmlMediaPlayback();
    patchYouTubeApiWhenAvailable();

    const pauseInterval = window.setInterval(pauseUnexpectedMedia, 250);
    window.setTimeout(() => window.clearInterval(pauseInterval), NATIVE_STARTUP_PLAYBACK_GUARD_MS);
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', pauseUnexpectedMedia);
    } else {
        pauseUnexpectedMedia();
    }
}

installNativeStartupPlaybackGuard();

function installNativeSessionSnapshot() {
    if (!IS_SPICE_LOCAL_RUNTIME) return;
    try {
        const snapshot = ipcRenderer.sendSync('native-account-snapshot-sync');
        if (snapshot && snapshot.token) {
            let profiles = [];
            try {
                const parsed = JSON.parse(window.localStorage.getItem('spice_profiles_list') || '[]');
                if (Array.isArray(parsed)) profiles = parsed;
            } catch (_) {}

            const activeProfileId = window.localStorage.getItem('spice_active_profile_id') || 'default';
            const storedProfileId = window.localStorage.getItem('spice_cloud_profile_id');
            const snapshotUserId = snapshot.user && typeof snapshot.user.id === 'string'
                ? snapshot.user.id
                : null;
            const profileUserId = (profile) => profile && profile.cloudUser && typeof profile.cloudUser.id === 'string'
                ? profile.cloudUser.id
                : null;
            const canReceiveSnapshot = (profile) => (
                profile
                && (!profile.cloudToken || profile.cloudToken === snapshot.token || (snapshotUserId && profileUserId(profile) === snapshotUserId))
            );

            let targetIndex = profiles.findIndex((profile) => profile && profile.cloudToken === snapshot.token);
            if (targetIndex < 0 && snapshotUserId) {
                targetIndex = profiles.findIndex((profile) => profile && profile.cloudToken && profileUserId(profile) === snapshotUserId);
            }
            if (targetIndex < 0 && storedProfileId) {
                const storedIndex = profiles.findIndex((profile) => profile && profile.id === storedProfileId);
                if (storedIndex >= 0 && canReceiveSnapshot(profiles[storedIndex])) targetIndex = storedIndex;
            }
            if (targetIndex < 0) {
                const defaultIndex = profiles.findIndex((profile) => profile && profile.id === 'default');
                if (defaultIndex >= 0 && canReceiveSnapshot(profiles[defaultIndex])) targetIndex = defaultIndex;
            }
            if (targetIndex < 0) {
                targetIndex = profiles.findIndex(canReceiveSnapshot);
            }

            const targetProfileId = targetIndex >= 0
                ? profiles[targetIndex].id
                : (profiles.length === 0 ? 'default' : null);
            if (targetIndex >= 0) {
                profiles[targetIndex] = {
                    ...profiles[targetIndex],
                    cloudToken: snapshot.token,
                    cloudUser: snapshot.user || null,
                    ...(snapshot.user && typeof snapshot.user.username === 'string'
                        ? { cloudUsername: snapshot.user.username }
                        : {}),
                };
                window.localStorage.setItem('spice_profiles_list', JSON.stringify(profiles));
            }

            if (targetProfileId) {
                window.localStorage.setItem('spice_cloud_profile_id', targetProfileId);
            } else {
                window.localStorage.removeItem('spice_cloud_profile_id');
            }

            if (targetProfileId === activeProfileId) {
                window.localStorage.setItem('spice_cloud_token', snapshot.token);
                window.localStorage.setItem('spice_token', snapshot.token);
                if (snapshot.user) {
                    window.localStorage.setItem('spice_cloud_user', JSON.stringify(snapshot.user));
                }
            } else {
                window.localStorage.removeItem('spice_cloud_token');
                window.localStorage.removeItem('spice_token');
                window.localStorage.removeItem('spice_cloud_user');
            }
        }
    } catch (error) {
        console.warn('[Preload] Native account snapshot unavailable:', error && error.message);
    }
}

installNativeSessionSnapshot();

function installSpiceNativeShellBridge() {
    if (!IS_SPICE_LOCAL_RUNTIME || window.spiceNativeShell) return;

    const bridge = {
        getSettings: () => ipcRenderer.invoke('get-settings'),
        setDiscordRpc: (enabled) => {
            const next = enabled === true;
            ipcRenderer.send('set-discord-rpc', next);
            return Promise.resolve(next);
        },
        setAlwaysOnTop: (enabled) => ipcRenderer.invoke('set-always-on-top', enabled === true),
        getStartOnBoot: () => ipcRenderer.invoke('get-start-on-boot'),
        setStartOnBoot: (enabled) => ipcRenderer.invoke('set-start-on-boot', enabled === true),
        setToolbarButtons: (buttons) => {
            ipcRenderer.send('set-toolbar-buttons', buttons);
        },
        setCustomCss: (css) => {
            ipcRenderer.send('set-custom-css', typeof css === 'string' ? css : '');
        },
        checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
        installUpdate: () => ipcRenderer.send('install-update'),
        openDevTools: () => ipcRenderer.send('open-devtools'),
        onUpdateStatus: (callback) => {
            if (typeof callback !== 'function') return () => {};
            const listener = (_event, status) => callback(status);
            ipcRenderer.on('update-status', listener);
            return () => ipcRenderer.removeListener('update-status', listener);
        },
    };

    Object.defineProperty(window, 'spiceNativeShell', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: Object.freeze(bridge),
    });
}

installSpiceNativeShellBridge();

function installSpiceDesktopUpdaterBridge() {
    if (!IS_SPICE_MUSIC || window.spiceDesktopUpdater) return;

    const bridge = {
        checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
        installUpdate: () => ipcRenderer.send('install-update'),
        getStartOnBoot: () => ipcRenderer.invoke('get-start-on-boot'),
        setStartOnBoot: (enabled) => ipcRenderer.invoke('set-start-on-boot', enabled === true),
        onUpdateStatus: (callback) => {
            if (typeof callback !== 'function') return () => {};
            const listener = (_event, status) => callback(status);
            ipcRenderer.on('update-status', listener);
            return () => ipcRenderer.removeListener('update-status', listener);
        },
    };

    Object.defineProperty(window, 'spiceDesktopUpdater', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: Object.freeze(bridge),
    });
}

installSpiceDesktopUpdaterBridge();

function installSpiceDesktopRuntimeBridge() {
    if (!IS_SPICE_MUSIC || window.spiceDesktopRuntime) return;

    const bridge = {
        prepare: () => ipcRenderer.invoke('spice-runtime-prepare'),
    };

    Object.defineProperty(window, 'spiceDesktopRuntime', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: Object.freeze(bridge),
    });
}

installSpiceDesktopRuntimeBridge();

function installSpiceDesktopOfflineLibraryBridge() {
    if (!process.contextIsolated && window.spiceDesktopOfflineLibrary) return;

    const bridge = {
        getSettings: () => ipcRenderer.invoke('spice-offline-library-settings'),
        chooseDirectory: () => ipcRenderer.invoke('spice-offline-library-choose-directory'),
        list: () => ipcRenderer.invoke('spice-offline-library-list'),
        save: (fileName, bytes, track) => {
            if (!(bytes instanceof ArrayBuffer)) throw new TypeError('Downloaded audio bytes are required.');
            return ipcRenderer.invoke('spice-offline-library-save', { fileName, bytes, track });
        },
        exists: (fileName) => ipcRenderer.invoke('spice-offline-library-exists', fileName),
        remove: (fileName) => ipcRenderer.invoke('spice-offline-library-remove', fileName),
        show: (fileName) => ipcRenderer.invoke('spice-offline-library-show', fileName),
    };

    if (process.contextIsolated) {
        contextBridge.exposeInMainWorld('spiceDesktopOfflineLibrary', bridge);
    } else {
        Object.defineProperty(window, 'spiceDesktopOfflineLibrary', {
            configurable: false,
            enumerable: false,
            writable: false,
            value: Object.freeze(bridge),
        });
    }
    window.dispatchEvent(new CustomEvent('spice-desktop-bridge-ready', {
        detail: { capability: 'offline-library' },
    }));
}

installSpiceDesktopOfflineLibraryBridge();

function installSpiceDesktopUiBridge() {
    if (!IS_SPICE_MUSIC) return;

    const validAccents = new Set([
        'pink', 'blue', 'orange', 'green', 'gold', 'crimson', 'deeppurple'
    ]);
    const validSurfaces = new Set(['midnight', 'glass', 'solid', 'aurora', 'daylight']);
    let lastThemeSignature = '';
    const defaultCustomPalette = {
        primary: '#a855f7',
        secondary: '#7c3aed',
        highlight: '#c084fc',
        background: '#050507',
        surface: '#111018',
        glass: 'rgba(11, 8, 18, 0.82)',
        border: 'rgba(168, 85, 247, 0.24)',
    };

    function emitTheme() {
        let accent = 'pink';
        let surface = 'midnight';
        let custom = null;
        try {
            const savedAccent = window.localStorage.getItem('spice_accent_theme');
            const savedSurface = window.localStorage.getItem('spice_visual_surface');
            if (validAccents.has(savedAccent)) accent = savedAccent;
            if (validSurfaces.has(savedSurface)) surface = savedSurface;
            if (window.localStorage.getItem('spice_custom_theme_enabled') === 'true') {
                custom = defaultCustomPalette;
                const savedPalette = window.localStorage.getItem('spice_custom_theme_palette');
                if (savedPalette) {
                    const parsed = JSON.parse(savedPalette);
                    if (parsed && parsed.colors && typeof parsed.colors === 'object') {
                        custom = {
                            primary: parsed.colors.primary,
                            secondary: parsed.colors.secondary,
                            highlight: parsed.colors.highlight,
                            background: parsed.colors.background,
                            surface: parsed.colors.surface,
                            glass: parsed.colors.glass,
                            border: parsed.colors.border,
                        };
                    }
                }
            }
        } catch (_) {}

        const theme = { accent, surface, custom };
        const signature = JSON.stringify(theme);
        if (signature === lastThemeSignature) return;
        lastThemeSignature = signature;
        ipcRenderer.send('spice-theme-changed', theme);
    }

    // Older packaged runtimes used a complete purple app icon inside the
    // themed logo tile. Keep those installs visually correct until updated.
    webFrame.insertCSS(`
        .sidebar__logo-icon:has(> .sidebar__logo-image) > .sidebar__logo-image {
            display: none !important;
        }
        .sidebar__logo-icon:has(> .sidebar__logo-image)::after {
            content: '';
            width: 20px;
            height: 20px;
            background: #fff;
            -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath d='M256 128v176.8c-9.44-5.44-20.32-8.8-32-8.8-35.36 0-64 28.64-64 64s28.64 64 64 64 64-28.64 64-64V192h64v-64h-96z' fill='black'/%3E%3C/svg%3E") center / contain no-repeat;
            mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath d='M256 128v176.8c-9.44-5.44-20.32-8.8-32-8.8-35.36 0-64 28.64-64 64s28.64 64 64 64 64-28.64 64-64V192h64v-64h-96z' fill='black'/%3E%3C/svg%3E") center / contain no-repeat;
        }
    `).catch((error) => {
        console.warn('[Preload] Could not install legacy logo compatibility CSS:', error && error.message);
    });

    emitTheme();
    window.addEventListener('DOMContentLoaded', emitTheme, { once: true });
    window.addEventListener('storage', emitTheme);
    window.setInterval(emitTheme, 350);
}

installSpiceDesktopUiBridge();

function normalizeSpiceDesktopAudioPayload(payload) {
    const boostEnabled = Boolean(payload && payload.boostEnabled);
    const maxVolume = boostEnabled ? 1000 : 200;
    const requestedVolume = Number(payload && payload.volume);
    if (!Number.isFinite(requestedVolume)) return null;
    const requestedRevision = Number(payload && payload.revision);
    return {
        volume: Math.max(0, Math.min(maxVolume, Math.round(requestedVolume))),
        boostEnabled,
        revision: Number.isSafeInteger(requestedRevision) && requestedRevision >= 0
            ? requestedRevision
            : null,
    };
}

function installSpiceAudioBridge() {
    if (!IS_SPICE_LOCAL_RUNTIME) return;

    const PLAYER_VOLUME_STORAGE_KEY = 'spice_player_volume';
    let lastSignature = '';
    let listenerAttached = false;
    let pendingAudioPayload = null;
    let desktopAudioPayload = null;
    let desktopAudioPayloadApplied = false;
    let applyingDesktopAudioPayload = false;
    let desktopAudioRevision = -1;
    let userVolumeDragActive = false;

    function readBoostEnabled() {
        const slider = findVolumeSlider();
        const sliderMaximum = Number(slider && slider.max);
        if (Number.isFinite(sliderMaximum)) return sliderMaximum > 200;
        return window.localStorage.getItem('spice_volume_booster_accepted') === 'true';
    }

    function findVolumeSlider() {
        return findVolumeSliders()[0] || null;
    }

    function findVolumeSliders() {
        const matches = document.querySelectorAll([
            '.now-playing__volume-slider',
            '.mini-player__volume-slider',
            'input[type="range"][max="1000"]',
            'input[type="range"][max="200"]',
        ].join(','));
        const unique = new Set();
        for (const slider of matches) unique.add(slider);
        return [...unique];
    }

    function readVolume(fromSlider) {
        const slider = fromSlider || findVolumeSlider();
        if (!slider) return null;
        const value = Number(slider.value);
        return Number.isFinite(value) ? value : null;
    }

    function writeDesktopAudioPayloadToStorage(payload) {
        if (!payload) return;
        try {
            window.localStorage.setItem(PLAYER_VOLUME_STORAGE_KEY, String(payload.volume));
            window.localStorage.setItem('spice_volume_booster_accepted', String(payload.boostEnabled));
        } catch {
            // LocalStorage may be unavailable on early navigation; the DOM bridge still applies the payload.
        }
    }

    function emitAudioState(force = false, source = 'observer', fromSlider = null) {
        if (!desktopAudioPayloadApplied) return;
        const volume = readVolume(fromSlider);
        const boostEnabled = readBoostEnabled();
        if (volume === null) return;

        const isUserSource = source === 'user';
        if (!isUserSource && desktopAudioPayload) {
            const expectedVolume = desktopAudioPayload.volume;
            const expectedBoost = desktopAudioPayload.boostEnabled;
            if (volume !== expectedVolume || boostEnabled !== expectedBoost) {
                applyAudioSettingsPayload(desktopAudioPayload);
            }
            return;
        }

        const signature = `${volume}:${boostEnabled}`;
        if (!force && signature === lastSignature) return;
        lastSignature = signature;
        desktopAudioPayload = {
            volume,
            boostEnabled,
            revision: desktopAudioRevision >= 0 ? desktopAudioRevision : null,
        };
        writeDesktopAudioPayloadToStorage(desktopAudioPayload);
        ipcRenderer.send('spice-audio-state-changed', {
            volume,
            boostEnabled,
            desktopReady: true,
        });
    }

    function setNativeRangeValue(input, value) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, String(value));
        else input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function applyAudioSettingsPayload(payload) {
        const nextPayload = normalizeSpiceDesktopAudioPayload(payload);
        if (!nextPayload) return false;
        if (nextPayload.revision !== null && nextPayload.revision < desktopAudioRevision) {
            return true;
        }
        if (nextPayload.revision !== null) desktopAudioRevision = nextPayload.revision;
        desktopAudioPayload = nextPayload;

        const boostEnabled = nextPayload.boostEnabled;
        const currentBoost = readBoostEnabled();
        writeDesktopAudioPayloadToStorage(nextPayload);
        let boostClickQueued = false;
        if (currentBoost !== boostEnabled) {
            const boostButton = document.querySelector('button[title="Toggle Volume Booster"]');
            if (boostButton) {
                boostButton.click();
                boostClickQueued = true;
            } else {
                window.localStorage.setItem('spice_volume_booster_accepted', String(boostEnabled));
            }
        }

        const applyRequestedVolume = (remainingAttempts = 40) => {
            if (desktopAudioPayload !== nextPayload) return;
            const nextVolume = nextPayload.volume;

            if (desktopAudioPayloadApplied && userVolumeDragActive) {
                // A user is actively dragging a volume slider; applying the
                // payload now would yank the thumb mid-drag. Their drag end
                // emits the authoritative value back to the desktop shell.
                return;
            }

            const slider = findVolumeSlider();
            if (!slider) {
                pendingAudioPayload = nextPayload;
                return;
            }

            const sliderMaximum = Number(slider.max);
            if (boostEnabled && nextVolume > 200 && sliderMaximum < nextVolume && remainingAttempts > 0) {
                pendingAudioPayload = nextPayload;
                setTimeout(() => applyRequestedVolume(remainingAttempts - 1), 50);
                return;
            }
            pendingAudioPayload = null;
            desktopAudioPayloadApplied = true;
            window.__spiceDesktopAudioReady = true;
            lastSignature = `${nextVolume}:${boostEnabled}`;
            if (Number(slider.value) === nextVolume && readBoostEnabled() === boostEnabled) {
                // Already in sync; skip the synthetic events so repeated
                // desktop pushes cannot churn the player state mid-playback.
                return;
            }
            applyingDesktopAudioPayload = true;
            try {
                setNativeRangeValue(slider, nextVolume);
            } finally {
                setTimeout(() => {
                    applyingDesktopAudioPayload = false;
                }, 0);
            }
        };

        if (boostClickQueued) setTimeout(() => applyRequestedVolume(), 0);
        else applyRequestedVolume();

        setTimeout(() => {
            if (desktopAudioPayload === nextPayload) emitAudioState(true, 'desktop');
        }, 50);
        return true;
    }

    window.__spiceDesktopSetAudioSettings = function(payload) {
        window.__spiceDesktopAudioSettingsQueued = true;
        return applyAudioSettingsPayload(payload);
    };

    function attachListeners() {
        const sliders = findVolumeSliders();
        if (sliders.length > 0 && pendingAudioPayload) {
            applyAudioSettingsPayload(pendingAudioPayload);
        }
        for (const slider of sliders) {
            if (slider.dataset.spiceDesktopAudioBridge) continue;
            slider.dataset.spiceDesktopAudioBridge = '1';
            slider.addEventListener('pointerdown', () => {
                userVolumeDragActive = true;
            });
            slider.addEventListener('input', (event) => {
                emitAudioState(false, event.isTrusted && !applyingDesktopAudioPayload ? 'user' : 'programmatic', slider);
            });
            slider.addEventListener('change', (event) => {
                emitAudioState(true, event.isTrusted && !applyingDesktopAudioPayload ? 'user' : 'programmatic', slider);
            });
        }
        if (!listenerAttached) {
            listenerAttached = true;
            window.addEventListener('pointerup', () => {
                userVolumeDragActive = false;
            });
            window.addEventListener('pointercancel', () => {
                userVolumeDragActive = false;
            });
            document.addEventListener('click', (event) => {
                const target = event.target;
                if (target && target.closest && target.closest('button[title="Toggle Volume Booster"]')) {
                    setTimeout(() => emitAudioState(true, event.isTrusted ? 'user' : 'programmatic'), 50);
                }
            }, true);
        }

        emitAudioState(false, 'observer');
    }

    function startBridgeObserver() {
        attachListeners();
        const observer = new MutationObserver(attachListeners);
        observer.observe(document.body, { childList: true, subtree: true });
        setInterval(attachListeners, 1500);
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', startBridgeObserver);
    } else {
        startBridgeObserver();
    }
}

installSpiceAudioBridge();

let spicePolicy;
if (window.trustedTypes && window.trustedTypes.createPolicy) {
    try {
        spicePolicy = window.trustedTypes.createPolicy('spice-policy', {
            createHTML: (string) => string,
            createScript: (string) => string
        });
    } catch (e) {
        // Policy might be registered already
    }
}

function getTrustedHTML(str) {
    return spicePolicy ? spicePolicy.createHTML(str) : str;
}

function getTrustedScript(str) {
    return spicePolicy ? spicePolicy.createScript(str) : str;
}

// Forward console logs to main process for debugging
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
    try {
        const safeArgs = args.map(a => {
            if (typeof a === 'object') {
                try {
                    return JSON.stringify(a);
                } catch (e) {
                    return String(a);
                }
            }
            return String(a);
        });
        ipcRenderer.send('renderer-log', { level: 'INFO', args: safeArgs });
    } catch (e) {
        // ignore logging errors
    }
    originalLog(...args);
};

console.warn = (...args) => {
    try {
        const safeArgs = args.map(a => String(a));
        ipcRenderer.send('renderer-log', { level: 'WARN', args: safeArgs });
    } catch (e) { }
    originalWarn(...args);
};

console.error = (...args) => {
    try {
        const safeArgs = args.map(a => String(a));
        ipcRenderer.send('renderer-log', { level: 'ERROR', args: safeArgs });
    } catch (e) { }
    originalError(...args);
};

window.spiceReportTrack = function (track) {
    console.log('[BrowserView Preload] spiceReportTrack CALLED:', track?.track, 'by', track?.artist);
    console.log('[BrowserView Preload] ipcRenderer available:', typeof ipcRenderer);
    console.log('[BrowserView Preload] ipcRenderer.send available:', typeof ipcRenderer?.send);
    try {
        console.log('[BrowserView Preload] Sending IPC: scrobble-now-playing');
        ipcRenderer.send('scrobble-now-playing', track);
        console.log('[BrowserView Preload] IPC SENT SUCCESSFULLY');
    } catch (e) {
        console.error('[BrowserView Preload] IPC SEND FAILED:', e.message);
        originalError('[BrowserView Preload] Failed to send IPC:', e);
    }
};

window.spiceReportProgress = function (progress) {
    ipcRenderer.send('scrobble-track-progress', progress);
};

// NUCLEAR OPTION 1: Inject CSS Synchronously via webFrame
const AD_CSS = `
    .video-ads, .ytp-ad-module, .ytp-ad-image-overlay, .ytp-ad-text-overlay,
    ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, ytd-compact-promoted-item-renderer,
    .ytd-action-companion-ad-renderer, .ytd-search-pyv-renderer,
    #player-ads, .ad-container, .masthead-ad-control,
    .ytp-ad-button, .ytp-ad-progress-list, .ytp-ad-player-overlay,
    div.ad-showing, div.ad-interrupting {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
    }
`;

if (!IS_SPICE_LOCAL_RUNTIME) {
    try {
        webFrame.insertCSS(AD_CSS);
        console.log('[Preload] Aggressive CSS Injected (via webFrame)');
    } catch (e) {
        console.error('[Preload] Failed to inject CSS:', e);
    }
}

// Hysteresis windows for the ad mute toggle: the ad signal must persist
// briefly before we mute, and its absence must persist briefly before we
// restore. Without this, ad classes that flicker between mutation batches
// cause audible mute/unmute cycles (random volume dips).
const AD_MUTE_CONFIRM_MS = 350;
const AD_UNMUTE_CONFIRM_MS = 700;

function shouldMuteAdVideo(adFirstSeenAt, now) {
    return Boolean(adFirstSeenAt) && now - adFirstSeenAt >= AD_MUTE_CONFIRM_MS;
}

function shouldRestoreAdAudio(video, adLastSeenAt, now) {
    return Boolean(
        video
        && video.muted
        && video.dataset
        && video.dataset.spiceAdMuted === '1'
        && adLastSeenAt
        && now - adLastSeenAt >= AD_UNMUTE_CONFIRM_MS
    );
}

// NUCLEAR OPTION 2: MutationObserver for INSTANT Reaction
// This watches the DOM for changes and kills ads the millisecond they appear.
if (!IS_SPICE_LOCAL_RUNTIME) window.addEventListener('DOMContentLoaded', () => {
    let adFirstSeenAt = 0;
    let adLastSeenAt = 0;

    const observer = new MutationObserver(() => {
        const video = document.querySelector('video');

        // 1. Check for Ad Containers / State
        const adShowing = document.querySelector('.ad-showing, .ad-interrupting, .ytp-ad-player-overlay');
        const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
        const now = Date.now();

        if (adShowing || skipBtn) {
            if (!adFirstSeenAt) adFirstSeenAt = now;
            adLastSeenAt = now;
            console.log('[Preload] Ad Detected!');

            // A. MUTE once the signal has persisted (marking the video so we
            // only undo our own mute)
            if (video && !video.muted && shouldMuteAdVideo(adFirstSeenAt, now)) {
                video.muted = true;
                try { video.dataset.spiceAdMuted = '1'; } catch (e) { /* detached node */ }
                console.log('[Preload] Muted Ad Audio');
            }

            // B. SPEED UP (Fast Forward)
            if (video && !isNaN(video.duration) && video.duration > 0) {
                video.currentTime = video.duration;
                video.playbackRate = 16; // Max speed
                console.log('[Preload] Fast-forwarded Ad');
            }

            // C. CLICK SKIP
            if (skipBtn) {
                skipBtn.click();
                console.log('[Preload] Clicked Skip');
            }

            // D. NUKE OVERLAYS via JS (Backup to CSS)
            const overlays = document.querySelectorAll('.ytp-ad-module, .ytp-ad-image-overlay, .ytp-ad-text-overlay');
            overlays.forEach(el => el.remove());
        } else {
            adFirstSeenAt = 0;
            // Ad is gone and WE muted the video for it; restore audio only
            // after the clear state persists, without touching a mute the
            // user chose themselves.
            if (shouldRestoreAdAudio(video, adLastSeenAt, now)) {
                video.muted = false;
                delete video.dataset.spiceAdMuted;
                console.log('[Preload] Restored audio after ad ended');
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'src'] // Watch for class changes (ad-showing)
    });

    console.log('[Preload] Ad MutationObserver Attached');
});

function isYouTubeIdleDialogText(value) {
    return /video interrupted|continue (?:to )?(?:watch|listen)|are you still (?:there|watching|listening)|still there/i
        .test(String(value || ''));
}

function findYouTubeIdleDialogAction(root) {
    if (!root || typeof root.querySelector !== 'function') return null;

    const actionSelector = [
        '#confirm-button button',
        'button[dialog-confirm]',
        'button[aria-label*="continue" i]',
        'button[aria-label="yes" i]',
        'yt-button-renderer[dialog-confirm]',
        'tp-yt-paper-button[dialog-confirm]',
        '#confirm-button',
        '[dialog-confirm]',
    ].join(', ');

    function findEnabledAction(container) {
        if (!container || typeof container.querySelector !== 'function') return null;
        const action = container.querySelector(actionSelector);
        if (!action || action.disabled === true) return null;
        if (typeof action.getAttribute === 'function' && action.getAttribute('aria-disabled') === 'true') {
            return null;
        }
        return action;
    }

    const youThereRenderer = root.querySelector('ytmusic-you-there-renderer');
    const dedicatedAction = findEnabledAction(youThereRenderer);
    if (dedicatedAction) return dedicatedAction;

    if (typeof root.querySelectorAll !== 'function') return null;
    const dialogs = root.querySelectorAll(
        'yt-confirm-dialog, tp-yt-paper-dialog, paper-dialog, [role="dialog"]'
    );
    for (const dialog of dialogs) {
        if (!isYouTubeIdleDialogText(dialog && dialog.textContent)) continue;
        const action = findEnabledAction(dialog);
        if (action) return action;
    }

    return null;
}

function dismissYouTubeIdleDialog(root) {
    const action = findYouTubeIdleDialogAction(root);
    if (!action || typeof action.click !== 'function') return false;
    action.click();
    console.log('[Preload] Dismissed YouTube Music idle confirmation dialog');
    return true;
}

function installYouTubeIdleDialogAutoDismiss() {
    if (!IS_YOUTUBE_MUSIC || window.__spiceYouTubeIdleDialogAutoDismissInstalled) return;
    window.__spiceYouTubeIdleDialogAutoDismissInstalled = true;

    let observer = null;
    let fallbackInterval = null;

    function dismissIdleDialog() {
        return dismissYouTubeIdleDialog(document);
    }

    function stopWatching() {
        if (observer) observer.disconnect();
        if (fallbackInterval !== null) window.clearInterval(fallbackInterval);
        observer = null;
        fallbackInterval = null;
    }

    function startWatching() {
        if (!document.body) return;

        dismissIdleDialog();
        observer = new MutationObserver(dismissIdleDialog);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-disabled'],
        });
        fallbackInterval = window.setInterval(dismissIdleDialog, 2000);
        window.addEventListener('pagehide', stopWatching, { once: true });
        console.log('[Preload] YouTube Music idle-dialog auto-dismiss attached');
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', startWatching, { once: true });
    } else {
        startWatching();
    }
}

installYouTubeIdleDialogAutoDismiss();

function injectVkPlayer() {
    console.log('[Preload] Attempting to inject VK Player...');
    if (document.getElementById('spice-vk-player')) {
        console.log('[Preload] VK Player already exists in DOM! Aborting.');
        return;
    }

    // Wait for YT Music's player bar to be in the DOM before injecting
    let retries = 0;
    const maxRetries = 60; // 30 seconds max wait

    function waitForPlayerBar() {
        const playerBar = document.querySelector('ytmusic-player-bar');
        if (playerBar) {
            console.log('[Preload] YT Music player bar found, injecting VK Player...');
            buildVkPlayer();
        } else if (retries < maxRetries) {
            retries++;
            setTimeout(waitForPlayerBar, 500);
        } else {
            console.warn('[Preload] YT Music player bar not found after 30s, injecting anyway...');
            buildVkPlayer();
        }
    }

    waitForPlayerBar();
}

function buildVkPlayer() {
    // VK player UI lives in the Electron app frame (index.html), not here.
    // No CSS/DOM injection into YouTube Music.
    console.log('[Preload] VK Player mode active (UI is in app frame, not injected here)');
}


ipcRenderer.on('vk-player-config', (event, enabled) => {
    if (IS_SPICE_LOCAL_RUNTIME) return;
    console.log('[Preload] Received vk-player-config IPC event. Enabled status:', enabled);
    if (enabled) {
        console.log('[Preload] VK Player is enabled. Checking document readyState:', document.readyState);
        // Run now if DOM ready, otherwise wait for it
        if (document.readyState === 'loading') {
            console.log('[Preload] Document is loading. Attaching DOMContentLoaded listener.');
            document.addEventListener('DOMContentLoaded', injectVkPlayer);
        } else {
            console.log('[Preload] Document readyState is ' + document.readyState + '. Injecting immediately.');
            injectVkPlayer();
        }
    }
});

// IPC handler to fetch Innertube keys from the actual renderer environment
ipcRenderer.on('get-yt-keys', () => {
    if (IS_SPICE_LOCAL_RUNTIME) {
        ipcRenderer.send('yt-keys-reply', { apiKey: null, context: null });
        return;
    }
    console.log('[Preload] Main process requested ytcfg keys');

    // Attempt 1: Window object
    if (window.ytcfg && window.ytcfg.get) {
        const apiKey = window.ytcfg.get('INNERTUBE_API_KEY');
        const context = window.ytcfg.get('INNERTUBE_CONTEXT');
        if (apiKey && context) {
            ipcRenderer.send('yt-keys-reply', { apiKey, context });
            return;
        }
    }

    // Attempt 2: Local Storage or raw script tags
    try {
        const html = document.documentElement.innerHTML;
        let apiKey = null;
        let context = null;

        const keyMatch = html.match(/"?INNERTUBE_API_KEY"?\s*:\s*"([^"]+)"/);
        if (keyMatch) apiKey = keyMatch[1];

        const ctxMatch = html.match(/"?INNERTUBE_CONTEXT"?\s*:\s*({.+?})(?:,"|\}$)/m);
        if (ctxMatch) context = JSON.parse(ctxMatch[1]);

        ipcRenderer.send('yt-keys-reply', { apiKey, context });
    } catch (e) {
        ipcRenderer.send('yt-keys-reply', { apiKey: null, context: null });
    }
});

// Steal API credentials directly from YouTube Music's fetch requests
const interceptScript = document.createElement('script');
interceptScript.textContent = getTrustedScript(`
        (function () {
            const originalFetch = window.fetch;
            window.fetch = async function () {
                const url = arguments[0];
                const opts = arguments[1];

                if (typeof url === 'string' && url.includes('youtubei/v1')) {
                    try {
                        const urlObj = new URL(url.startsWith('http') ? url : window.location.origin + url);
                        const key = urlObj.searchParams.get('key');
                        if (key) {
                            window.postMessage({ type: 'SPICE_API_KEY', key: key }, '*');
                        }

                        if (opts && opts.body && typeof opts.body === 'string') {
                            const bodyData = JSON.parse(opts.body);
                            if (bodyData.context) {
                                window.postMessage({ type: 'SPICE_API_CONTEXT', context: bodyData.context }, '*');
                            }
                        }
                    } catch (e) { }
                }
                return originalFetch.apply(this, arguments);
            };

            const originalXhrOpen = window.XMLHttpRequest.prototype.open;
            window.XMLHttpRequest.prototype.open = function () {
                const url = arguments[1];
                if (typeof url === 'string' && url.includes('youtubei/v1')) {
                    try {
                        const urlObj = new URL(url.startsWith('http') ? url : window.location.origin + url);
                        const key = urlObj.searchParams.get('key');
                        if (key) {
                            window.postMessage({ type: 'SPICE_API_KEY', key: key }, '*');
                        }
                    } catch (e) { }
                }
                return originalXhrOpen.apply(this, arguments);
            };

    const originalXhrSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.send = function (body) {
        if (typeof body === 'string') {
            try {
                const bodyData = JSON.parse(body);
                if (bodyData.context) {
                    window.postMessage({ type: 'SPICE_API_CONTEXT', context: bodyData.context }, '*');
                }
            } catch (e) { }
        }
        return originalXhrSend.apply(this, arguments);
    };
})();
`);

// SAFEST INJECTION METHOD: Append to whatever is available, or use window/document events.
// Because preload scripts run BEFORE the DOM is constructed, document.head or document.documentElement might be null.
function injectScript() {
    try {
        const parent = document.head || document.documentElement || document.body;
        if (parent) {
            parent.appendChild(interceptScript);
        } else {
            // Ultimate fallback
            setTimeout(injectScript, 10);
        }
    } catch (e) {
        console.error('[Preload] Failed to inject interceptScript:', e);
    }
}

if (!IS_SPICE_LOCAL_RUNTIME) {
    injectScript();
}

// Listen for the stolen credentials and send them to the main process
if (!IS_SPICE_LOCAL_RUNTIME) window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || !event.data.type) return;

    if (event.data.type === 'SPICE_API_KEY') {
        ipcRenderer.send('yt-api-key-intercepted', event.data.key);
    } else if (event.data.type === 'SPICE_API_CONTEXT') {
        ipcRenderer.send('yt-api-context-intercepted', event.data.context);
    }
});
