import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, loadAuth, loadQueue, saveQueue, type StoredQueueItem } from '../config.js';
import { searchTracks, getTrackDetails } from '../api.js';
import { fmtArtists, fmtDuration } from '../ui.js';

function toQueueItem(track: any): StoredQueueItem {
  return {
    id: track.id,
    sourceId: track.sourceId,
    title: track.title,
    artists: track.artists || [],
    durationMs: track.durationMs,
    artworkUrl: track.artworkUrl,
    addedAt: new Date().toISOString(),
  };
}

async function resolveInputsToTracks(cfg: any, inputs: string[]) {
  const out: any[] = [];
  for (const input of inputs) {
    const trimmed = input.trim();
    if (!trimmed) continue;
    const looksId = /^[a-zA-Z0-9_-]{11}$/.test(trimmed) || /^\d+$/.test(trimmed);
    if (looksId) {
      try { const d = await getTrackDetails(cfg, trimmed); out.push(d.track); continue; } catch {}
    }
    const { tracks } = await searchTracks(cfg, trimmed, 1, 'all');
    if (!tracks.length) throw new Error(`No results for "${trimmed}"`);
    out.push(tracks[0]);
  }
  return out;
}

export async function queueAddCommand(inputs: string[], opts: { json?: boolean }) {
  const cfg = loadConfig();
  if (!inputs.length) { console.error(chalk.red('Provide track ids or queries.  spice queue add "hopes - apashe" dQw4w9WgXcQ')); process.exitCode = 1; return; }
  const spinner = ora('Resolving…').start();
  try {
    const tracks = await resolveInputsToTracks(cfg, inputs);
    const q = loadQueue();
    const existingKeys = new Set(q.items.map(i => `${i.sourceId}:${i.id}`));
    let added = 0;
    for (const t of tracks) {
      const key = `${t.sourceId}:${t.id}`;
      if (existingKeys.has(key)) continue;
      q.items.push(toQueueItem(t));
      added++;
    }
    saveQueue(q.items);
    // reload to get updated payload
    const saved = loadQueue();
    spinner.succeed(`Added ${added} track(s) — queue now ${saved.items.length}`);
    if (opts.json) console.log(JSON.stringify(saved, null, 2));
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}

export function queueListCommand(opts: { json?: boolean }) {
  const q = loadQueue();
  if (opts.json) { console.log(JSON.stringify(q, null, 2)); return; }
  if (!q.items.length) { console.log(chalk.dim('Queue is empty.  spice queue add "song"  or  spice queue import <playlistId>')); return; }
  console.log(chalk.bold(`\nQueue — ${q.items.length} track(s)  ${chalk.dim(new Date(q.updatedAt).toLocaleString())}`));
  console.log(chalk.dim('─'.repeat(40)));
  q.items.forEach((it, i) => {
    console.log(` ${chalk.dim(String(i + 1).padStart(3, ' ') + '.')} ${chalk.bold(it.title)} — ${chalk.cyan(fmtArtists(it.artists))} ${chalk.dim(fmtDuration(it.durationMs))} ${chalk.dim(it.id)}`);
  });
  console.log(chalk.dim('\n  spice queue play        # play entire queue in mpv'));
  console.log(chalk.dim('  spice queue clear       # empty queue'));
  console.log(chalk.dim('  spice queue remove 2    # remove position 2'));
}

export function queueClearCommand() {
  saveQueue([]);
  console.log(chalk.green('✔ Queue cleared.'));
}

export function queueRemoveCommand(posStr: string) {
  const pos = parseInt(posStr, 10);
  if (!Number.isFinite(pos) || pos < 1) { console.error(chalk.red('Provide a 1-based position: spice queue remove 2')); process.exitCode = 1; return; }
  const q = loadQueue();
  if (pos > q.items.length) { console.error(chalk.red(`Queue only has ${q.items.length} items.`)); process.exitCode = 1; return; }
  const removed = q.items.splice(pos - 1, 1)[0];
  saveQueue(q.items);
  console.log(chalk.green(`✔ Removed ${removed.title} — queue now ${q.items.length}`));
}

export function queueShuffleCommand() {
  const q = loadQueue();
  if (q.items.length <= 1) { console.log(chalk.dim('Nothing to shuffle.')); return; }
  for (let i = q.items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q.items[i], q.items[j]] = [q.items[j], q.items[i]];
  }
  saveQueue(q.items);
  console.log(chalk.green(`✔ Shuffled ${q.items.length} tracks.`));
}

export async function queuePlayCommand(opts: { shuffle?: boolean; loop?: string; player?: string }) {
  const { loadQueue: lq } = await import('../config.js');
  const q = lq();
  if (!q.items.length) { console.error(chalk.red('Queue is empty.  spice queue add "song" first.')); process.exitCode = 1; return; }
  // Reuse the play path — build inputs from queue ids
  const ids = q.items.map(i => i.id);
  const { playCommand } = await import('./play.js');
  // playCommand handles --shuffle/--loop via its own queue
  // We pass ids directly so it resolves streams one by one
  await playCommand(ids, { shuffle: !!opts.shuffle, loop: opts.loop as any, player: opts.player } as any);
}

export async function queueImportCommand(playlistId: string, opts: { json?: boolean } = {}) {
  const cfg = loadConfig();
  const auth = loadAuth();
  if (!auth) { console.error(chalk.red('Not logged in.  spice queue import needs cloud playlist — spice auth login')); process.exitCode = 1; return; }
  const spinner = ora(`Loading playlist ${playlistId}…`).start();
  try {
    const { cloudGetPlaylists } = await import('../api.js');
    const data = await cloudGetPlaylists(cfg, auth.token, cfg.profileId);
    const pl = (data.playlists || []).find((p: any) => p.id === playlistId || p.title === playlistId);
    if (!pl) { spinner.fail(`Playlist not found: ${playlistId}`); process.exitCode = 1; return; }
    const tracks: any[] = pl.tracks || [];
    if (!tracks.length) { spinner.warn(`Playlist "${pl.title}" is empty.`); return; }
    const q = loadQueue();
    const existingKeys = new Set(q.items.map(i => `${i.sourceId}:${i.id}`));
    let added = 0;
    for (const t of tracks) {
      const id = t.trackId || t.id;
      const sourceId = t.sourceId || 'youtube_music';
      const key = `${sourceId}:${id}`;
      if (existingKeys.has(key)) continue;
      let artists: any[] = [];
      try { artists = t.artistsJson ? JSON.parse(t.artistsJson) : t.artists || []; } catch {}
      q.items.push({
        id,
        sourceId,
        title: t.title || id,
        artists,
        durationMs: t.durationMs ?? undefined,
        artworkUrl: t.artworkUrl || undefined,
        addedAt: new Date().toISOString(),
      });
      added++;
    }
    saveQueue(q.items);
    spinner.succeed(`Imported ${added} track(s) from "${pl.title}" — queue now ${loadQueue().items.length}`);
    if (opts.json) console.log(JSON.stringify(loadQueue(), null, 2));
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}

export async function likesListCommand(opts: { json?: boolean }) {
  const cfg = loadConfig();
  const auth = loadAuth();
  if (!auth) { console.error(chalk.red('Not logged in.  spice auth login')); process.exitCode = 1; return; }
  const spinner = ora('Fetching likes…').start();
  try {
    const { cloudGetLikes } = await import('../api.js');
    const data = await cloudGetLikes(cfg, auth.token, cfg.profileId);
    const ids = data.likedTracks || [];
    spinner.succeed(`${ids.length} liked track(s) [profile: ${cfg.profileId}]`);
    if (opts.json) { console.log(JSON.stringify(data, null, 2)); return; }
    if (!ids.length) { console.log(chalk.dim('  No likes yet.  spice likes add <id|query>')); return; }
    const details = data.likedTrackDetails || {};
    ids.forEach((id: string, i: number) => {
      const d = details[id] || { title: id };
      let artists = '';
      try { artists = d.artistsJson ? fmtArtists(JSON.parse(d.artistsJson)) : ''; } catch {}
      console.log(` ${chalk.dim(String(i + 1).padStart(3, ' ') + '.')} ${chalk.bold(d.title || id)} ${chalk.cyan(artists)} ${chalk.dim(id)}`);
    });
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}

export function queueMoveCommand(fromStr: string, toStr: string) {
  const from = parseInt(fromStr, 10);
  const to = parseInt(toStr, 10);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < 1) {
    console.error(chalk.red('Provide 1-based positions: spice queue move <from> <to>'));
    process.exitCode = 1;
    return;
  }
  const q = loadQueue();
  if (from > q.items.length || to > q.items.length) {
    console.error(chalk.red(`Queue only has ${q.items.length} item(s).`));
    process.exitCode = 1;
    return;
  }
  const [item] = q.items.splice(from - 1, 1);
  q.items.splice(to - 1, 0, item);
  saveQueue(q.items);
  console.log(chalk.green(`✔ Moved "${item.title}" from ${from} → ${to}.`));
}

export function queueDedupeCommand() {
  const q = loadQueue();
  const seen = new Set<string>();
  const before = q.items.length;
  const kept = q.items.filter((it) => {
    const key = `${it.sourceId}:${it.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const removed = before - kept.length;
  if (removed === 0) { console.log(chalk.dim('Queue has no duplicates.')); return; }
  saveQueue(kept);
  console.log(chalk.green(`✔ Removed ${removed} duplicate(s) — queue now ${kept.length}.`));
}

export async function queueExportCommand(opts: { out?: string; json?: boolean }) {
  const fs = await import('node:fs');
  const path = (await import('node:path')).default;
  const q = loadQueue();
  if (!q.items.length) { console.log(chalk.dim('Queue is empty — nothing to export.')); return; }
  const outPath = path.resolve(opts.out || 'spice-queue.m3u');
  const { toM3u } = await import('../playlist-file.js');
  fs.writeFileSync(outPath, toM3u('Spice queue', q.items as any));
  console.log(chalk.green(`✔ Exported ${q.items.length} track(s) → ${chalk.dim(outPath)}`));
  if (opts.json) console.log(JSON.stringify({ path: outPath, tracks: q.items.length }, null, 2));
}
