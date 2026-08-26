import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { getLyrics, searchTracks } from '../api.js';

export async function lyricsCommand(idOrQuery: string, opts: { json?: boolean; source?: string }) {
  const cfg = loadConfig();
  let id = idOrQuery?.trim();
  if (!id) { console.error(chalk.red('Provide a track id or query.')); process.exitCode = 1; return; }

  let titleHint: string | undefined;
  const looksLikeId = /^[a-zA-Z0-9_-]{8,}$/.test(id) && !id.includes(' ');
  if (!looksLikeId) {
    const spinner = ora(`Resolving "${id}"…`).start();
    try {
      const { tracks } = await searchTracks(cfg, id, 1, (opts.source as any) || 'all');
      if (!tracks.length) { spinner.fail('No results.'); process.exitCode = 1; return; }
      id = tracks[0].id;
      titleHint = tracks[0].title;
      spinner.succeed(`Resolved → ${tracks[0].title} [${id}]`);
    } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; return; }
  }

  const spinner = ora(`Fetching lyrics for ${id}${titleHint ? ' — ' + titleHint : ''}…`).start();
  try {
    const lyrics = await getLyrics(cfg, id);
    if (!lyrics.plainLyrics && !lyrics.syncedLyrics) {
      spinner.warn('No lyrics found.');
      if (opts.json) console.log(JSON.stringify(lyrics, null, 2));
      else console.log(chalk.dim('Try a different track or check spelling. LRCLIB may not have this song.'));
      return;
    }
    spinner.succeed(`${lyrics.title} — ${lyrics.artist}  ${lyrics.isSynced ? chalk.green('[synced]') : chalk.dim('[plain]')}`);
    if (opts.json) {
      console.log(JSON.stringify(lyrics, null, 2));
      return;
    }
    const text = lyrics.syncedLyrics || lyrics.plainLyrics;
    console.log('');
    console.log(chalk.dim('─'.repeat(40)));
    console.log(text);
    console.log(chalk.dim('─'.repeat(40)));
  } catch (e: any) {
    spinner.fail(e.message || String(e));
    if (e.status === 0) console.error(chalk.dim('Is the local runtime running?  spice status'));
    process.exitCode = 1;
  }
}
