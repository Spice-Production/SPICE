# Spice

Spice is a unified music application repository containing:

- an Electron desktop client for YouTube Music, SoundCloud, and SPICE Music;
- the SPICE web and local runtime backend;
- an Android preview client.

The desktop app includes ad blocking, Discord Rich Presence, Last.fm and ListenBrainz scrobbling, synchronized lyrics, and classic wrapper and native SPICE modes.

## Repository layout

- The repository root contains the CommonJS Electron desktop app (`main.js`, `preload.js`, and the desktop HTML/CSS files).
- `apps/backend` contains the Next.js backend and the build scripts for local Windows, Linux, and universal macOS runtimes.
- `apps/mobile` contains the native Android client and its npm command wrappers.
- `native-runtime` receives a prepared local runtime for native Electron builds. Its generated contents are not source files.
- `test` contains the desktop Node test suite.

## Prerequisites

- Node.js 24 and npm.
- JDK 21 and Android SDK compile SDK 36 for Android work.
- Platform packaging tools required by Electron Builder when producing installers.

## Install

One root install covers both the desktop app and the backend workspace:

```bash
git clone https://github.com/Anti-Depressants-Dev-Team/spice.git
cd spice
npm ci
```

Use `npm install` when intentionally changing dependencies and updating `package-lock.json`.

## Desktop commands

```bash
npm start                 # Standard Electron wrapper
npm run start:native      # SPICE-only desktop development mode
npm test                  # Desktop Node tests
npm run installer:assets  # Regenerate the branded Windows installer artwork
npm run dist              # Standard desktop package
npm run dist:mac          # Universal Apple Silicon + Intel macOS package
npm run dist:native       # Native package on a supported Windows/Linux host
npm run dist:native:windows
npm run dist:native:linux
npm run dist:native:mac   # Universal Apple Silicon + Intel Native package
```

Native builds use distinct application metadata and update channels, so publishing a native build does not replace the classic desktop updater release.

Standard and Native Windows packages use the same SPICE-branded assisted installer artwork while retaining separate product names, shortcuts, update channels, and uninstall identities.

The standard and Native macOS apps are packaged universally for Apple Silicon and Intel. Native includes the universal local runtime and FFmpeg payload, and release CI checks both architecture slices before publishing. The runtime manager restores executable permissions, clears quarantine metadata on its separately installed runtime, waits for the local readiness endpoint, and surfaces a recovery message when macOS blocks startup.

Public macOS artifacts are signed or notarized only when the release environment supplies valid Apple signing credentials. Without those credentials, Gatekeeper can still require Finder → Open or approval under System Settings → Privacy & Security on first launch; the app reports this limitation instead of silently failing.

## Backend commands

Run backend work through the root npm wrappers:

```bash
npm run backend:dev
npm run backend:test
npm run backend:typecheck
npm run backend:lint
npm run backend:build:local
npm run backend:build:vercel
npm run backend:package:local:windows
npm run backend:package:local:linux
npm run backend:package:local:macos
```

The Vercel project root remains `apps/backend` inside this unified repository.

## Local runtime preparation

`npm run native:prepare-runtime` builds and packages `apps/backend` from this repository by default, then copies the platform runtime into `native-runtime/spice-local-windows`, `native-runtime/spice-local-linux`, or `native-runtime/spice-local-macos`. `dist:native:*` already invokes this preparation step; do not run it separately before a native distribution command.

For an intentional external backend checkout, set `SPICE_BACKEND_REPO` to that repository root. If no usable checkout is available, preparation can download the matching artifact from the dedicated [`spice-local-runtime`](https://github.com/Anti-Depressants-Dev-Team/spice/releases/tag/spice-local-runtime) release. `SPICE_NATIVE_RUNTIME_ZIP_URL` can override that artifact URL for testing.

The stable runtime release is separate from versioned desktop releases and is deliberately not marked as GitHub's latest release.

## Android commands

```bash
npm run mobile:test
npm run mobile:build
npm run mobile:android:debug
npm run mobile:android:check
npm run mobile:android:release
```

The debug APK is written under `apps/mobile/android/app/build/outputs/apk/debug/`.

## Verification

Before submitting a change, run the checks for the areas you touched:

```bash
npm test
npm run backend:test
npm run backend:typecheck
npm run backend:lint
npm run backend:build:local
npm run backend:build:vercel
npm run mobile:android:check   # for mobile changes
```

For native runtime or packaging changes, also run `npm run start:native` or the relevant `npm run dist:native:*` command when practical.

## Migration note

The former separate SPICE backend repository has been merged into `apps/backend`. The root `package.json` and `package-lock.json` are now the single npm workspace authority for desktop and backend dependencies. A sibling backend checkout is no longer expected, and pnpm workspace files or separate backend lockfiles should not be reintroduced.

## Releases

Installers and APKs are available from Spice Production. AppImage builds use the in-app updater; `.deb` and `.rpm` installs are updated through the matching package format.

## License

Distributed under the MIT License.
