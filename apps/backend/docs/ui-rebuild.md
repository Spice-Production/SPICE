# UI rebuild — from zero, features intact (lab)

Rebuild the entire backend web UI from a blank slate on the quiet kit,
without losing a single feature. Strategy: build the new UI as a
parallel `/v2` tree reusing every API route and `lib/` module unchanged.
Old pages stay live until a surface reaches parity, then it swaps.

## What "retaining all features" means

Presentation is rewritten; behavior contracts are not. Every v2 surface
must hit the same endpoints, honour the same localStorage keys, and keep
the same user-visible capabilities as the original. The parity list below
is the definition of done.

## Kit roadmap

- [x] Tokens + Button, Card, TextField, Picker, Shelf (`components/ui`)
- [x] AppShell (sidebar + topbar + responsive), PageHeader
- [x] PosterCard, Skeleton, ErrorNote, EmptyState, AccountMenu
- [x] Avatar, Badge, Dialog, ProfileButton, Separator, Switch, Toaster
- [ ] Tabs (Picker covers segmented selection for now)

## Surface parity list

| Surface | Original | Status | Notes |
|---|---|---|---|
| Home / hub | `app/hub/page.tsx` | done (`/v2`) | player, movies, shows, anime, runtime links |
| Movies browse | `app/movie/page.tsx` (335) | done (`/v2/movie`) | hero, search, shelves, spotlight, account |
| Movie watch | `app/movie/watch/[tmdbId]` | done (`/v2/movie/watch/[tmdbId]`) | validated page, sync island, provider player |
| Shows browse | `app/shows/page.tsx` (279) | done (`/v2/shows`) | hero, search, shelves, account |
| Show watch | `app/shows/watch/[id]` | done (`/v2/shows/watch/[id]`) | resume query, season picker, per-episode frame |
| Anime | `app/anime/page.tsx` | launchpad (`/v2/anime`) | placeholder today — real surface needs TMDB anime lists + provider paths (backend) |
| Generic watch | `app/watch/*` | done (no rebuild) | orphaned shelved stubs, zero live links — v2 shelves route via `v2WatchPageHref` |
| Music player | `app/spice-app.tsx` (20k) | slice 1 (`/v2/music`) | search + resolve + play; slices 2-6 in `docs/ui-rebuild-music.md` |
| Auth | reset-password, media-signin | done (`/v2/reset-password`, `/v2/profile`) | full auth card (signup + verify + username); AccountMenu covers browse sign-in |
| System | changelog, install, local-runtime, admin | done (`/v2/*`) | new frames, shared islands reused (InstallGuide, ChangelogView, AdminView) |
| Profile + settings | new surfaces | done (`/v2/profile`, `/v2/settings`) | account, profiles, library stats; playback, theme, diagnostics (moved off music page) |
| Global | command palette, theme editor, toasts | todo | |

## Rules

- No edits to existing pages/routes in this branch — v2 files only,
  plus kit and tests. (Exception: deleting the old tree at swap time.)
- No new API routes unless a surface needs one; classify it per
  `local-packaging-invariants` in the same change.
- Kit guards (`test/ui-kit.test.mjs`) apply to every new file:
  no `<select>`, no emoji, theme-var styling, `spk-` prefix.
- `SPICE_MEDIA_CORE_VERSION` stays untouched until the swap ships;
  the lab is an experiment, not a release.
