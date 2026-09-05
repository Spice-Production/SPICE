# Spice Music CLI

Terminal client for Spice — talks to your **local runtime** (`http://127.0.0.1:3939`) for media search / streams / lyrics, and to **cloud** (`https://music.spice-app.xyz`) for auth, playlists, likes, history.

## Install

```bash
npm ci
npm --workspace @spice/cli run build
npm link --workspace @spice/cli   # exposes `spice` globally

# or run without linking
node apps/cli/dist/index.js --help
```

Requires Node >=24. For playback/downloads:

- **Player:** `mpv` (best, gapless) or `ffplay`/`vlc`
  - `winget install mpv` / `brew install mpv` / https://mpv.io
- **Transcoding:** `ffmpeg` for `-f mp3 / opus / m4a` downloads

## Quick start

```bash
spice status          # quick local-runtime check
spice doctor          # full env check: players, ffmpeg, local, cloud, auth
spice search "hopes - apashe" -l 5
spice play "hopes - apashe" --shuffle
spice play dQw4w9WgXcQ --loop all
spice stream dQw4w9WgXcQ --raw | mpv --no-video -
spice download dQw4w9WgXcQ -o ./music -f mp3 --lyrics
spice lyrics dQw4w9WgXcQ
spice radio "hopes - apashe" --play        # related-tracks station from a seed
spice album show <albumId>                 # YouTube Music album tracks
spice open "hopes - apashe"                # open track page in the browser
```

Shell completions: `spice completion bash|zsh|powershell` (e.g. `eval "$(spice completion bash)"`).

## Auth (cloud control plane)

```bash
spice auth signup --email you@example.com --username you --password 'S3cure!Pass'
# → check email for code, then:
spice auth verify --registrationId <id> --code <code>
# or
spice auth login --email you@example.com          # prompts hidden password
spice auth status --json
spice auth logout
spice auth resend --registrationId <id>
```

Token saved to `~/.config/spice/auth.json` (0600). Validated via `GET /api/account/me`.

## Full control layer

### Playlists (cloud sync, per profile)

Cloud uses `GET/POST /api/sync/playlists?profileId=default` — full-replacement sync. The CLI does read-modify-write for you.

```bash
spice playlists list                          # --profile <id> --json
spice playlists show <idOrTitle>
spice playlists create --title "My Mix" --description "vibes"
spice playlists add <playlistId> "hopes - apashe" dQw4w9WgXcQ
spice playlists remove <playlistId> <trackId>
spice playlists delete <id> --yes
# Import a YouTube playlist via local runtime and save as cloud playlist:
spice playlists import "https://www.youtube.com/playlist?list=PL..." --title "Imported"
# Round-trip back out:
spice playlists export <idOrTitle> -o mix.m3u -f m3u   # or -f json (default)
spice playlists play <idOrTitle> --shuffle             # play straight from cloud
spice playlists download <idOrTitle> -o ./music -f mp3 # bulk download
```

### Queue (persistent local)

Stored at `~/.config/spice/queue.json` — survives restarts. Not cloud-synced; it's your local now-playing queue.

```bash
spice queue add "song query" dQw4w9WgXcQ
spice queue list
spice queue shuffle
spice queue move 3 1      # reorder (1-based)
spice queue dedupe         # drop repeats, keep first occurrence
spice queue remove 2
spice queue export -o queue.m3u
spice queue clear
spice queue import <playlistId>              # load a cloud playlist into queue
spice queue play --shuffle --loop all --player mpv
```

`spice queue play` resolves each queued id to a fresh signed stream URL and plays via mpv/ffplay/vlc (same as `spice play`).

### Likes / History / Library

```bash
spice likes list
spice likes add "hopes - apashe" dQw4w9WgXcQ
spice likes remove <trackId>

spice history --limit 20
spice library          # likes + history + playlists combined
spice profiles         # list cloud profiles
```

All three use cloud `Bearer` token + `profileId` (default `default`). Change profile with `spice config set profileId <id>`.

## Config

`~/.config/spice/config.json` (or `$XDG_CONFIG_HOME/spice/config.json`):

```json
{
  "localUrl": "http://127.0.0.1:3939",
  "cloudUrl": "https://music.spice-app.xyz",
  "defaultSource": "all",
  "downloadDir": "C:/Users/you/Music/Spice",
  "downloadFormat": "original",
  "profileId": "default"
}
```

Env overrides: `SPICE_LOCAL_RUNTIME_URL`, `SPICE_CLOUD_URL`.

`spice config list` / `get` / `set` / `reset` / `path` work as expected. Auth lives separately at `~/.config/spice/auth.json`; queue at `~/.config/spice/queue.json`.

## Player notes

- Streams are **signed 10-min URLs** from `/api/yt/track/[id]` → proxied at `/api/yt/stream/[id]`. Use `-f opus/m4a/mp3` to prefer a codec.
- If you see `[capped ~1MB]`, the local runtime couldn't mint a PO token (BotGuard). Playback/downloads truncate at ~1.07 MB. Fix via `apps/backend/lib/po-token.ts` / `bgutils-js` and restart the runtime.
- SoundCloud search/track also via local runtime (`/api/sc/*`).
