import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { getAlbumImport, getRelatedTracks } from '../api.js';
import { printTracks } from '../ui.js';
import { resolveInputToTrack } from '../resolve.js';

/** Resolve an id-or-query to a concrete track id (search top hit for queries). */
async function resolveToId(cfg: ReturnType<typeof loadConfig>, input: string, source: 'yt' | 'sc' | 'all'): Promise<string> {
  const track = await resolveInputToTrack(cfg, input, source);
  return track.id;
}

export async function radioCommand(input: string, opts: { limit?: string; play?: boolean; json?: boolean; source?: string; player?: string; shuffle?: boolean; loop?: string }) {
  const cfg = loadConfig();
  const query = input?.trim();
  if (!query) { console.error(chalk.red('Provide a seed track id or search query.  spice radio "hopes - apashe"')); process.exitCode = 1; return; }
  const limit = Math.max(1, Math.min(50, parseInt(opts.limit || '20', 10) || 20));
  const source = ((opts.source as string) || 'all') as 'yt' | 'sc' | 'all';

  const spinner = ora(`Building radio from "${query}"…`).start();
  try {
    // Related tracks are a YouTube concept — force the seed through YT unless scoped to SC.
    const seedId = await resolveToId(cfg, query, source === 'sc' ? 'sc' : 'yt');
    const tracks = await getRelatedTracks(cfg, seedId, limit);
    if (!tracks.length) { spinner.fail('No related tracks found.'); process.exitCode = 1; return; }
    spinner.succeed(`Radio seed ${chalk.dim(seedId)} — ${tracks.length} related track(s)`);
    if (opts.json) { console.log(JSON.stringify({ seedId, tracks }, null, 2)); return; }
    printTracks(tracks, {});
    if (!opts.play) {
      console.log(chalk.dim(`\nTip: spice radio "${query}" --play   |   spice queue add "${query}"`));
      return;
    }
    const { playCommand } = await import('./play.js');
    await playCommand(tracks.map((t) => t.id), { shuffle: !!opts.shuffle, loop: opts.loop as any, player: opts.player } as any);
  } catch (e: any) {
    spinner.fail(e.message || String(e));
    if (e.status === 0) console.error(chalk.dim('Is the local runtime running?  spice status'));
    process.exitCode = 1;
  }
}

export async function albumShowCommand(id: string, opts: { json?: boolean }) {
  const cfg = loadConfig();
  const albumId = id?.trim();
  if (!albumId) { console.error(chalk.red('Provide a YouTube Music album id.')); process.exitCode = 1; return; }
  const spinner = ora(`Fetching album ${albumId}…`).start();
  try {
    const album = await getAlbumImport(cfg, albumId);
    spinner.succeed(album.title);
    if (opts.json) { console.log(JSON.stringify(album, null, 2)); return; }
    console.log(chalk.bold(`\n${album.title}`));
    if (album.description) console.log(chalk.dim(album.description));
    console.log(chalk.dim(`\n${album.tracks.length} track(s):`));
    printTracks(album.tracks, {});
    console.log(chalk.dim(`\nTip: spice album play ${albumId}   |   spice album download ${albumId} -o ./music -f mp3`));
  } catch (e: any) {
    spinner.fail(e.message || String(e));
    if (e.status === 0) console.error(chalk.dim('Is the local runtime running?  spice status'));
    process.exitCode = 1;
  }
}

export async function albumPlayCommand(id: string, opts: { shuffle?: boolean; loop?: string; player?: string }) {
  const cfg = loadConfig();
  const albumId = id?.trim();
  if (!albumId) { console.error(chalk.red('Provide a YouTube Music album id.')); process.exitCode = 1; return; }
  const spinner = ora(`Fetching album ${albumId}…`).start();
  try {
    const album = await getAlbumImport(cfg, albumId);
    spinner.succeed(`${album.title} — ${album.tracks.length} track(s)`);
    const { playCommand } = await import('./play.js');
    await playCommand(album.tracks.map((t) => t.id), { shuffle: !!opts.shuffle, loop: opts.loop as any, player: opts.player } as any);
  } catch (e: any) {
    spinner.fail(e.message || String(e));
    process.exitCode = 1;
  }
}

export async function albumDownloadCommand(id: string, opts: { out?: string; format?: string; lyrics?: boolean }) {
  const cfg = loadConfig();
  const albumId = id?.trim();
  if (!albumId) { console.error(chalk.red('Provide a YouTube Music album id.')); process.exitCode = 1; return; }
  const spinner = ora(`Fetching album ${albumId}…`).start();
  try {
    const album = await getAlbumImport(cfg, albumId);
    spinner.succeed(`${album.title} — ${album.tracks.length} track(s), downloading…`);
    const { downloadCommand } = await import('./download.js');
    await downloadCommand(album.tracks.map((t) => t.id), { out: opts.out, format: opts.format, lyrics: opts.lyrics } as any);
  } catch (e: any) {
    spinner.fail(e.message || String(e));
    process.exitCode = 1;
  }
}

export async function relatedCommand(input: string, opts: { limit?: string; json?: boolean }) {
  // Thin alias over radio without playback: `spice related <id|query>`
  return radioCommand(input, { limit: opts.limit, json: opts.json, play: false });
}
