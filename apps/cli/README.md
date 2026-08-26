# Spice Music CLI

Terminal client for Spice — talks to your **local runtime** (`http://127.0.0.1:3939`) for media search / streams / lyrics. Cloud (`https://music.spice-app.xyz`) is the control plane; media scraping no longer lives on Vercel.

## Install

```bash
# from repo root (once workspace is added)
npm ci
npm --workspace @spice/cli run build
npm link --workspace @spice/cli   # exposes `spice` globally

# or run without linking
npx --workspace @spice/cli spice --help
node apps/cli/dist/index.js --help
```

Requires Node >=24. For playback/downloads:

- **Player:** `mpv` (best, gapless) or `ffplay`/`vlc`
  - `winget install mpv` / `brew install mpv` / https://mpv.io
  - `winget install ffmpeg` (includes ffplay)
- **Transcoding:** `ffmpeg` for `-f mp3 / opus / m4a` downloads
  - `winget install ffmpeg` / `brew install ffmpeg`

## Quick start

```bash
spice status                          # is the local runtime up?
spice search "hopes - apashe" -l 5
spice search "lofi hip hop" --source sc
spice play "hopes - apashe"           # resolves first result and plays
spice play dQw4w9WgXcQ --shuffle --loop all
spice play "song A" "song B" dQw4w9WgXcQ
spice stream dQw4w9WgXcQ --raw | mpv --no-video -
spice download dQw4w9WgXcQ -o ./music -f mp3 --lyrics
spice lyrics dQw4w9WgXcQ
spice config list
spice config set downloadDir C:/Music/Spice
spice config set localUrl http://127.0.0.1:3939
```

## Config

`~/.config/spice/config.json` (or `$XDG_CONFIG_HOME/spice/config.json`, fallback `~/.spice.json`):

```json
{
  "localUrl": "http://127.0.0.1:3939",
  "cloudUrl": "https://music.spice-app.xyz",
  "defaultSource": "all",
  "downloadDir": "C:/Users/you/Music/Spice",
  "downloadFormat": "original"
}
```

Env overrides: `SPICE_LOCAL_RUNTIME_URL`, `SPICE_CLOUD_URL`.

## Notes

- Streams are **signed 10-min URLs** from `/api/yt/track/[id]` → `/api/yt/stream/[id]` proxy. The CLI picks the best variant (AAC/m4a preferred, highest bitrate). Use `-f opus` / `-f m4a` / `-f mp3` to prefer a codec.
- If you see `[capped ~1MB]`, the local runtime couldn't mint a PO token (BotGuard). Playback/downloads will truncate at ~1.07 MB (HTTP 403 beyond). Fix via `apps/backend/lib/po-token.ts` / `bgutils-js` setup and restart the runtime.
- SoundCloud search/track is also via local runtime (`/api/sc/*`).
