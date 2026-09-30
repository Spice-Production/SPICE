# Repository Guidelines

## Project overview

Spice is a unified repository for an Electron desktop client, the SPICE Next.js backend/local runtime, and an Android preview client. The root desktop app is CommonJS-based and starts from `main.js`. The root npm workspace and `package-lock.json` are authoritative for desktop and backend dependencies.

## Repository layout

- `main.js`, `preload.js`, `preload-view.js`, `index.html`, and `styles.css`: primary Electron shell and UI.
- `lyrics-core.js`, `lyrics.js`, and `lyrics.html`: lyrics fetching and lyrics-window behavior.
- `discord-rpc.js`, `scrobbler.js`, and `spice-local-runtime-manager.js`: desktop integrations and local runtime management.
- `scripts/`: desktop helpers, including in-repository native runtime preparation.
- `test/`: Node tests for root desktop logic.
- `apps/backend/`: Next.js backend plus Windows/Linux local-runtime builders and tests.
- `apps/mobile/`: native Android app and npm command wrappers.
- `apps/mobile-expo/`: React Native (Expo) rewrite of the Android client; a standalone npm project with its own lockfile. See `apps/mobile-expo/AGENTS.md`.
- `native-runtime/`: generated prepared runtime content; do not assume it is checked in or current.
- `src/extensions/`: bundled browser-extension assets; keep changes narrow and intentional.

## Commands

Run commands from the repository root unless noted.

### Unified install

- `npm ci`: install the desktop and backend workspace from the root lockfile.
- `npm install`: use only when intentionally updating dependencies and `package-lock.json`.

Do not add pnpm workspace files or a separate backend lockfile.

### Desktop

- `npm start`: run the standard Electron app.
- `npm run start:native`: run the SPICE-only native-mode shell.
- `npm test`: run root Node tests.
- `npm run dist`: build the standard desktop package.
- `npm run dist:mac`: build the standard desktop package as a universal macOS app for both Apple Silicon and Intel.
- `npm run dist:native`, `npm run dist:native:windows`, or `npm run dist:native:linux`: prepare the in-repo backend runtime once and build the native package.

### Backend

- `npm run backend:dev`: run the backend in local development mode.
- `npm run backend:test`: run backend tests.
- `npm run backend:typecheck`: run TypeScript checks.
- `npm run backend:lint`: run ESLint.
- `npm run backend:build:local`: build the local runtime.
- `npm run backend:build:vercel`: build the Vercel runtime.
- `npm run backend:package:local:windows` or `npm run backend:package:local:linux`: assemble a platform runtime under `apps/backend/dist/`.

### Mobile

- `npm run mobile:test`: run the Android check pipeline through `apps/mobile`.
- `npm run mobile:build` or `npm run mobile:android:debug`: build a debug APK.
- `npm run mobile:android:check`: run Android lint, JVM tests, and debug APK assembly.
- `npm run mobile:android:release`: build the release APK path.

### Mobile (Expo rewrite)

Install once with `npm --prefix apps/mobile-expo ci`.

- `npm run mobile-expo:check`: typecheck, lint, and core tests.
- `npm run mobile-expo:android:debug` or `npm run mobile-expo:android:release`: prebuild and assemble an APK.
- `npm run mobile-expo:engine:test`: run the native engine's JVM tests.

## Development notes

- Preserve CommonJS style in root desktop code and the existing TypeScript/ES module style in `apps/backend`.
- Keep desktop, backend, and mobile changes scoped separately when practical.
- For every desktop product implementation or bug fix, assess whether the behavior is compatible with the native Android client. When it is compatible, implement and verify the equivalent Android behavior in the same change; when it is not, document the concrete platform or product constraint.
- Keep the standard Windows and macOS Electron apps feature-equivalent. Desktop implementations and fixes must work on both unless an operating-system-specific limitation applies; document and test any intentional platform exception.
- Frontend features and design changes must blend naturally with the existing visual language, including its spacing, typography, colors, controls, and interaction patterns.
- Any new or changed frontend surface must use the shared theme system rather than fixed theme-specific styling, and it must update immediately when the user changes the theme in Settings.
- Treat existing uncommitted changes as user work. Do not revert or reformat unrelated files.
- Do not commit generated logs, debug dumps, build output, `.next`, `dist`, APKs, or prepared `native-runtime` content.
- Prefer small tests near changed behavior. Desktop tests use Node's built-in test runner.
- The Vercel project root is `apps/backend` within this repository.

## Native runtime notes

- Native preparation uses `apps/backend` in this repository by default.
- `SPICE_BACKEND_REPO` may point to an intentional external checkout for testing.
- If that checkout is unavailable, preparation falls back to platform assets on the dedicated `spice-local-runtime` release.
- `dist:native:*` already performs runtime preparation; do not add a second explicit preparation step in packaging workflows.

## Mobile notes

- The mobile app expects JDK 21 and Android SDK compile SDK 36.
- The debug APK is emitted under `apps/mobile/android/app/build/outputs/apk/debug/`.
- Native background playback depends on direct HTTPS audio URLs. Do not add WebView or iframe playback paths without confirming product direction.

## Verification

Local verification is a mandatory publication gate:

- Test every implementation and bug fix locally before committing it. Start with the smallest targeted test or static check that covers the changed behavior, then run the broader affected-surface checks needed to establish that the change is safe.
- When a change affects a build, package, installer, generated runtime, or platform-specific startup path, produce the relevant build locally and smoke-test the resulting artifact before requesting permission to commit. A source-level test alone is not sufficient for a build-affecting change.
- Run `npm test` for broad root-desktop changes or when no narrower root test exists.
- Run the relevant backend tests, typecheck, lint, and local or Vercel build when backend files require them. Prefer a targeted backend test first, but do not omit an affected build gate.
- Run the applicable Electron smoke test, Native packaging check, or Android check for changes to those surfaces. If the current machine cannot run a required platform check, report that limitation explicitly and do not present the change as fully locally verified.
- CI is additional evidence, not a substitute for required local verification.
- Before asking to commit, publish, deploy, or release, report the exact checks run, their results, any intentionally skipped checks, and the remaining risks.
- Documentation-only and policy-only changes do not require a product build unless they modify executable commands, workflow files, or packaging configuration. Validate their wording and repository diff locally.

## Publication and release policy

Do not automatically commit, push, deploy, merge, tag, or release completed work.

### Approval gates

- After local verification passes, summarize the scoped files and evidence and obtain explicit user confirmation before creating a commit.
- Obtain explicit user confirmation before pushing a branch, opening or merging a pull request, or deploying a backend update. A confirmation may cover several clearly named publication steps, but it does not authorize unmentioned steps or materially expanded scope.
- Every change published to GitHub must be committed on a non-`main` branch, pushed to that branch, and submitted through a pull request. Direct pushes to `main` are strictly forbidden for agents and maintainers; only GitHub's merge of an approved pull request may update `main`.
- Never bypass branch protection, force-push `main`, or use administrative privileges to avoid the required pull-request workflow.
- Obtain separate explicit user confirmation before bumping a product version, creating or pushing a release tag, or creating a GitHub release. Never infer release approval from approval to commit, push, merge, or deploy.
- If verification fails, required evidence is unavailable, or the scope changes after confirmation, stop the publication sequence, report the new state, and obtain fresh direction.
- Commit only the scoped files. Do not include unrelated user work or generated artifacts.

### Release batching

- Accumulate ordinary, low-impact features and fixes into a meaningful, cohesive release instead of creating a new product release for each completed change.
- Before proposing a release, inspect the unreleased changes and decide whether they provide enough combined user value to justify new desktop, Native, and Android artifacts. Report that assessment with the test and build evidence for every affected surface.
- A prompt release may be justified for a security or privacy issue, data-loss risk, startup or crash failure, severe user-facing regression, or another important fix that users cannot reasonably receive without new packaged binaries.
- Defer a product release when changes are non-important, have an easy workaround, or can be delivered completely through a single Vercel backend update. For a backend-only fix, prefer proposing a tested Vercel deployment and continue accumulating packaged-client changes.
- A Vercel deployment still requires the relevant local backend tests and Vercel build plus explicit user confirmation before deployment.
- The final release decision belongs to the user after the agent presents the batching assessment, affected platforms, local evidence, CI status, remaining risks, and recommended action.

### Approved release flow

- After release approval, bump the root desktop patch version for product releases. Bump `SPICE_MEDIA_CORE_VERSION` and its changelog/tests only when backend or local media runtime code changes.
- Push the verified non-`main` release branch, open and merge a pull request through GitHub, then create and push the matching `v<desktop-version>` tag from the merge commit only when those steps were explicitly authorized.
- Monitor the required `main` CI, Vercel production, `Release Spice`, and `Release Spice Native` workflows with compact status checks and address failures.
- Confirm the final GitHub release contains the expected desktop, Native, and Android assets. Confirm `spice-local-runtime` only when runtime code changed.
- Documentation-only, test-only, policy-only, and workflow-only maintenance does not require a product version bump or release unless the user explicitly approves one after the release assessment.

## Migration note

The former separate SPICE backend repository now lives at `apps/backend`. Do not restore the legacy sibling-checkout assumption or copy backend sources between repositories. The root npm workspace, CI, native runtime preparation, and release workflows must continue to operate from this single repository.
