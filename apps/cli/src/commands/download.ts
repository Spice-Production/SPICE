import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { getTrackDetails, pickBestStream, searchTracks } from '../api.js';

function safeFilename(title: string, artist: string, ext: string) {
  const base = `${artist} - ${title}`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 120) || 'track';
  return `${base}.${ext.replace(/^\./, '')}`;
}

function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 2000 });
  if ((r.error as any)?.code === 'ENOENT') return false;
  // ffmpeg exists if not ENOENT, even if exit code non-zero
  return (r.error as any)?.code !== 'ENOENT';
}

function ffmpegTranscode(inputUrl: string, outPath: string, format: string, title?: string, artist?: string) {
  const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputUrl];
  if (title) args.push('-metadata', `title=${title}`);
  if (artist) args.push('-metadata', `artist=${artist}`);
  // Format-specific encoding
  if (format === 'mp3') {
    args.push('-c:a', 'libmp3lame', '-q:a', '0', outPath); // V0 ~245k
  } else if (format === 'opus') {
    args.push('-c:a', 'libopus', '-b:a', '128k', outPath);
  } else if (format === 'm4a') {
    args.push('-c:a', 'aac', '-b:a', '192k', outPath);
  } else {
    args.push('-c', 'copy', outPath);
  }
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit', timeout: 5 * 60 * 1000 });
  if (r.status !== 0) throw new Error(`ffmpeg failed (exit ${r.status})`);
}

function parseInputs(inputs: string[]) {
  return inputs.map(s => s.trim()).filter(Boolean);
}

export async function downloadCommand(inputs: string[], opts: { out?: string; format?: string; source?: string; concurrency?: string; lyrics?: boolean }) {
  const cfg = loadConfig();
  const items = parseInputs(inputs);
  if (!items.length) {
    console.error(chalk.red('Provide at least one track id, URL, or search query.'));
    console.error(chalk.dim('  spice download dQw4w9WgXcQ -o ./music -f mp3'));
    console.error(chalk.dim('  spice download "hopes - apashe" -o ./music'));
    process.exitCode = 1;
    return;
  }

  const outDir = path.resolve(opts.out || cfg.downloadDir);
  const formatRaw = (opts.format || cfg.downloadFormat || 'original').toLowerCase();
  const format = ['mp3', 'm4a', 'opus', 'original'].includes(formatRaw) ? formatRaw : 'original' as const;
  const wantTranscode = format === 'mp3' || format === 'opus' || format === 'm4a';
  if (wantTranscode && !hasFfmpeg()) {
    console.error(chalk.red('ffmpeg not found — needed for mp3/opus/m4a transcoding.'));
    console.error(chalk.dim('  winget install ffmpeg  |  brew install ffmpeg  |  https://ffmpeg.org'));
    console.error(chalk.dim('  Or use:  spice download <id> -f original  (no transcode, fastest)'));
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  console.log(chalk.dim(`Output: ${outDir}  [format: ${format}]`));
  if (format === 'original') console.log(chalk.dim('Transcode: off (original container from YouTube) — use -f mp3 for MP3.\n'));

  let ok = 0, fail = 0;

  for (const input of items) {
    const spinner = ora(`Resolving "${input}"…`).start();
    try {
      // Resolve input -> track + streams
      let id = input;
      // Extract video id from youtube URL if given
      const m = input.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/);
      if (m) id = m[1];

      let details: any = null;
      const looksLikeId = !id.includes(' ') && /^[a-zA-Z0-9_-]{8,}$/.test(id);
      if (looksLikeId) {
        try {
          details = await getTrackDetails(cfg, id, (opts.source as any) || 'yt');
        } catch (e: any) {
          if (e.status !== 404) throw e;
          // Fallback to search
          const { tracks } = await searchTracks(cfg, id, 1, (opts.source as any) || 'all');
          if (!tracks.length) throw e;
          details = await getTrackDetails(cfg, tracks[0].id, (opts.source as any) || 'yt');
        }
      } else {
        const { tracks } = await searchTracks(cfg, id, 1, (opts.source as any) || 'all');
        if (!tracks.length) { spinner.fail(`No results for "${id}"`); fail++; continue; }
        details = await getTrackDetails(cfg, tracks[0].id, (opts.source as any) || 'yt');
      }

      if (!details?.streams?.length) { spinner.fail(`No streams for "${input}"`); fail++; continue; }

      const prefer = format === 'original' ? 'original' : format as any;
      const best = pickBestStream(details.streams, prefer);
      if (!best) { spinner.fail('No suitable stream'); fail++; continue; }

      if (best.capped) {
        spinner.warn(chalk.yellow(`Capped stream (~1MB window) for "${details.track.title}" — download will be truncated. Fix PO token in local runtime.`));
        // Still proceed — user may want the snippet
        spinner.start(`Downloading "${details.track.title}"…`);
      } else {
        spinner.text = `Downloading "${details.track.title}"…`;
      }

      const artist = details.track.artists?.[0]?.name || 'Unknown Artist';
      const title = details.track.title || details.track.id;
      // Decide extension: for original, infer from container; else use requested format
      let ext = format === 'original'
        ? (best.container === 'mp4' ? 'm4a' : best.container === 'webm' ? 'webm' : best.container || 'm4a')
        : format;
      // ffmpeg mp3 -> mp3, opus -> opus, m4a -> m4a
      if (wantTranscode) ext = format;

      const filename = safeFilename(title, artist, ext);
      const outPath = path.join(outDir, filename);

      if (format === 'original') {
        // Stream-copy via fetch pipe (no ffmpeg) — faster and no dep
        spinner.text = `Fetching → ${filename}…`;
        const res = await fetch(best.url, { headers: { 'User-Agent': 'SPICE-CLI/1.0' } });
        if (!res.ok || !res.body) throw new Error(`upstream ${res.status} ${res.statusText}`);
        const fileStream = fs.createWriteStream(outPath);
        // Node fetch body is Web ReadableStream — pipe via async iteration
        const reader = res.body.getReader();
        await new Promise<void>((resolve, reject) => {
          (async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                fileStream.write(value);
              }
              fileStream.end(resolve);
            } catch (e) { reject(e); }
          })();
        });
        await new Promise<void>((resolve) => fileStream.on('close', resolve));
      } else {
        spinner.text = `Transcoding → ${filename} (ffmpeg)…`;
        ffmpegTranscode(best.url, outPath, format, title, artist);
      }

      // Optionally fetch lyrics sidecar
      if (opts.lyrics) {
        try {
          const { getLyrics } = await import('../api.js');
          const lyrics = await getLyrics(cfg, details.track.id);
          const lrc = lyrics.syncedLyrics || lyrics.plainLyrics;
          if (lrc) {
            const lrcPath = outPath.replace(/\.[^.]+$/, '.lrc');
            const plainPath = outPath.replace(/\.[^.]+$/, '.txt');
            if (lyrics.syncedLyrics) fs.writeFileSync(lrcPath, lrc, 'utf8');
            else fs.writeFileSync(plainPath, lrc, 'utf8');
          }
        } catch { /* non-fatal */ }
      }

      const stat = fs.statSync(outPath);
      spinner.succeed(`${chalk.bold(title)} — ${artist}  ${chalk.dim(`→ ${filename}  ${(stat.size/1024/1024).toFixed(2)} MB`)}`);
      ok++;
    } catch (e: any) {
      spinner.fail(`${input}: ${e.message || String(e)}`);
      if (e.status === 0) console.error(chalk.dim('  Is the local runtime running?  spice status'));
      fail++;
    }
  }

  console.log('');
  if (ok) console.log(chalk.green(`✔ Done — ${ok} file(s) in ${outDir}`));
  if (fail) { console.log(chalk.yellow(`⚠ ${fail} failed`)); process.exitCode = 1; }
}
