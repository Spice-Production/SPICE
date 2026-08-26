import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { getTrackDetails, pickBestStream, searchTracks, type SpiceTrack, type SpiceStreamVariant } from '../api.js';
import { detectPlayer, PlayQueue, playQueue, playerInstallHint, type QueueItem } from '../player.js';

function isProbablyId(s: string) {
  return /^[a-zA-Z0-9_-]{11}$/.test(s) || /^\d+$/.test(s) || /^[a-zA-Z0-9_-]{8,}$/.test(s);
}

function parseIdsOrQueries(inputs: string[]) {
  // Keep original order; expand quoted queries already joined by commander
  return inputs.map(s => s.trim()).filter(Boolean);
}

export async function playCommand(inputs: string[], opts: { shuffle?: boolean; loop?: string; player?: string; source?: string; format?: string; json?: boolean }) {
  const cfg = loadConfig();
  const queries = parseIdsOrQueries(inputs);
  if (!queries.length) {
    console.error(chalk.red('Provide at least one track id or search query.'));
    console.error(chalk.dim('  spice play dQw4w9WgXcQ'));
    console.error(chalk.dim('  spice play "hopes - apashe" "lofi hip hop"'));
    console.error(chalk.dim('  spice play --shuffle "my playlist query"'));
    process.exitCode = 1;
    return;
  }

  const kind = detectPlayer(opts.player);
  if (!kind) {
    console.error(playerInstallHint());
    process.exitCode = 1;
    return;
  }

  const spinner = ora('Resolving tracks…').start();
  const queue = new PlayQueue();
  const prefer = (opts.format === 'mp3' ? 'mp3' : opts.format === 'opus' ? 'opus' : opts.format === 'm4a' ? 'm4a' : 'original') as any;

  try {
    for (const input of queries) {
      const looksLikeId = !input.includes(' ') && isProbablyId(input);
      let track: SpiceTrack | null = null;
      let streams: SpiceStreamVariant[] = [];
      let details: any = null;

      if (looksLikeId) {
        try {
          details = await getTrackDetails(cfg, input, (opts.source as any) || 'yt');
          track = details.track;
          streams = details.streams;
        } catch (e: any) {
          // Fall through to search-as-query if id resolution 404s — handles "play some words" that look id-ish
          if (!e.message?.includes('404') && e.status !== 404) throw e;
          // Try search
          const { tracks } = await searchTracks(cfg, input, 1, (opts.source as any) || 'all');
          if (!tracks.length) { spinner.warn(`No results for "${input}" — skipping.`); continue; }
          details = await getTrackDetails(cfg, tracks[0].id, (opts.source as any) || 'yt');
          track = details.track;
          streams = details.streams;
        }
      } else {
        // Treat as search query — pick first result (like `spice search` top hit)
        const { tracks } = await searchTracks(cfg, input, 5, (opts.source as any) || 'all');
        if (!tracks.length) { spinner.warn(`No results for "${input}" — skipping.`); continue; }
        // If query returned multiple, pick the first that resolves to streams
        let resolved = false;
        for (const t of tracks) {
          try {
            details = await getTrackDetails(cfg, t.id, (opts.source as any) || 'yt');
            if (details.streams.length) { track = details.track; streams = details.streams; resolved = true; break; }
          } catch { /* try next */ }
        }
        if (!resolved) { spinner.warn(`No playable streams for "${input}" — skipping.`); continue; }
      }

      if (!track || !streams.length) { spinner.warn(`No streams for "${input}" — skipping.`); continue; }
      const best = pickBestStream(streams, prefer);
      if (!best) { spinner.warn(`No suitable stream for "${input}" — skipping.`); continue; }

      queue.add([{ track, stream: best, url: best.url }]);
      spinner.text = `Resolved ${queue.length} track(s)…`;
    }

    if (!queue.length) {
      spinner.fail('Nothing to play.');
      process.exitCode = 1;
      return;
    }

    spinner.succeed(`Queue ready — ${queue.length} track(s) via ${chalk.cyan(kind)}`);

    // Handle capped warning once
    if (queue.items.some(i => i.stream.capped)) {
      console.log(chalk.yellow('⚠ Some streams are capped (~1.07 MB window, HTTP 403 beyond it) — PO token not minted. Playback may cut off. Check local runtime logs / bgutil setup.'));
    }

    await playQueue(queue, {
      player: opts.player,
      shuffle: !!opts.shuffle,
      loop: (opts.loop as any) || 'off',
    });
  } catch (e: any) {
    spinner.fail(e.message || String(e));
    if (e.status === 0 || e.code === 'ECONNREFUSED') {
      console.error(chalk.dim('Is the local runtime running?  spice status'));
    }
    process.exitCode = 1;
  }
}
