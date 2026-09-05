import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, loadAuth } from '../config.js';
import { cloudGetPlaylists, cloudPostPlaylists, getPlaylistImport, getTrackDetails, searchTracks, type SpiceTrack } from '../api.js';
import { fmtArtists, fmtDuration } from '../ui.js';

// Helpers to map cloud playlist snapshot → local shape and back
function snapshotToClientPayload(pl: any) {
  // Cloud snapshots have: id, title, description, gradient, coverUrl, tracks[], isPublic, etc.
  // For POST /api/sync/playlists we send ClientPlaylistPayload: id/title/description/gradient/coverUrl/tracks/shared/isPublic
  return {
    id: pl.id,
    title: pl.title,
    description: pl.description || '',
    gradient: pl.gradient || '',
    coverUrl: pl.coverUrl || '',
    tracks: (pl.tracks || []).map((t: any) => ({
      // TrackSnapshotInput keeps multiple aliases; we normalize to id/title/artistsJson/etc.
      id: t.id || t.trackId || '',
      trackId: t.trackId || t.id || '',
      sourceId: t.sourceId || 'youtube_music',
      title: t.title || '',
      artistsJson: typeof t.artistsJson === 'string' ? t.artistsJson : JSON.stringify(t.artists || []),
      artworkUrl: t.artworkUrl || t.artwork_url || null,
      durationMs: t.durationMs ?? t.duration_ms ?? null,
      // also keep raw for display
      _raw: t,
    })),
    isPublic: !!pl.isPublic,
    shared: !!pl.shared,
  };
}

function trackToSnapshotInput(track: SpiceTrack) {
  return {
    id: track.id,
    sourceId: track.sourceId,
    title: track.title,
    artistsJson: JSON.stringify(track.artists || []),
    artworkUrl: track.artworkUrl || null,
    durationMs: track.durationMs ?? null,
  };
}

function requireAuth() {
  const auth = loadAuth();
  if (!auth) {
    console.error(chalk.red('Not logged in. Run: spice auth login'));
    process.exit(1);
    throw new Error('not logged in');
  }
  return auth;
}

export async function playlistsListCommand(opts: { profile?: string; json?: boolean }) {
  const cfg = loadConfig();
  const auth = requireAuth();
  const profileId = opts.profile || cfg.profileId || 'default';
  const spinner = ora('Fetching playlists…').start();
  try {
    const data = await cloudGetPlaylists(cfg, auth.token, profileId);
    const playlists = data.playlists || [];
    spinner.succeed(`Found ${playlists.length} playlist(s) [profile: ${profileId}]`);
    if (opts.json) { console.log(JSON.stringify(playlists, null, 2)); return; }
    if (!playlists.length) { console.log(chalk.dim('  No playlists. Create one: spice playlists create --title "My Mix"')); return; }
    for (const pl of playlists) {
      const tracks = pl.tracks?.length ?? pl.trackCount ?? '?';
      const shared = pl.shared ? chalk.cyan(' shared') : '';
      const pub = pl.isPublic ? chalk.dim(' public') : '';
      console.log(`  ${chalk.bold(pl.title || '(untitled)')}  ${chalk.dim(pl.id)}  ${chalk.dim(`${tracks} tracks`)}${shared}${pub}`);
      if (pl.description) console.log(chalk.dim(`    ${pl.description}`));
    }
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}

export async function playlistsShowCommand(id: string, opts: { json?: boolean }) {
  const cfg = loadConfig();
  const auth = requireAuth();
  const profileId = cfg.profileId || 'default';
  const spinner = ora(`Fetching playlist ${id}…`).start();
  try {
    const data = await cloudGetPlaylists(cfg, auth.token, profileId);
    const pl = (data.playlists || []).find((p: any) => p.id === id || p.title === id);
    if (!pl) { spinner.fail(`Playlist not found: ${id}`); process.exitCode = 1; return; }
    spinner.succeed(pl.title);
    if (opts.json) { console.log(JSON.stringify(pl, null, 2)); return; }
    console.log(chalk.bold(`\n${pl.title}`) + chalk.dim(`  ${pl.id}`));
    if (pl.description) console.log(chalk.dim(pl.description));
    const tracks = pl.tracks || [];
    console.log(chalk.dim(`\n${tracks.length} track(s):`));
    tracks.forEach((t: any, i: number) => {
      const title = t.title || t.id || '?';
      let artists = '';
      try { artists = fmtArtists(JSON.parse(t.artistsJson || '[]')); } catch { artists = ''; }
      console.log(` ${chalk.dim(String(i + 1).padStart(3, ' ') + '.')} ${chalk.bold(title)} ${chalk.cyan(artists)} ${chalk.dim(fmtDuration(t.durationMs))} ${chalk.dim(t.trackId || t.id || '')}`);
    });
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}

export async function playlistsCreateCommand(opts: { title: string; description?: string; json?: boolean; profile?: string }) {
  const cfg = loadConfig();
  const auth = requireAuth();
  const profileId = opts.profile || cfg.profileId || 'default';
  const title = opts.title?.trim();
  if (!title) { console.error(chalk.red('Provide --title')); process.exitCode = 1; return; }

  const spinner = ora('Creating playlist…').start();
  try {
    const existing = await cloudGetPlaylists(cfg, auth.token, profileId);
    const payloads = (existing.playlists || []).map(snapshotToClientPayload);
    const newId = crypto.randomUUID();
    payloads.push({
      id: newId,
      title,
      description: opts.description || '',
      gradient: '',
      coverUrl: '',
      tracks: [],
      isPublic: false,
      shared: false,
    });
    const res: any = await cloudPostPlaylists(cfg, auth.token, payloads, profileId);
    const created = (res.playlists || []).find((p: any) => p.id === newId);
    spinner.succeed(`Created "${title}"  ${chalk.dim(newId)}`);
    if (opts.json) console.log(JSON.stringify(created || res, null, 2));
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}

export async function playlistsDeleteCommand(id: string, opts: { yes?: boolean }) {
  const cfg = loadConfig();
  const auth = requireAuth();
  const profileId = cfg.profileId || 'default';
  if (!opts.yes) {
    console.log(chalk.yellow(`This will delete playlist ${id}. Pass --yes to confirm.`));
    process.exitCode = 1;
    return;
  }
  const spinner = ora(`Deleting ${id}…`).start();
  try {
    const existing = await cloudGetPlaylists(cfg, auth.token, profileId);
    const payloads = (existing.playlists || []).map(snapshotToClientPayload).filter((p: any) => p.id !== id);
    const before = (existing.playlists || []).length;
    if (payloads.length === before) { spinner.fail(`Playlist not found: ${id}`); process.exitCode = 1; return; }
    await cloudPostPlaylists(cfg, auth.token, payloads, profileId);
    spinner.succeed(`Deleted ${id}`);
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}

async function resolveInputsToTracks(cfg: any, inputs: string[]): Promise<SpiceTrack[]> {
  const out: SpiceTrack[] = [];
  for (const input of inputs) {
    const trimmed = input.trim();
    if (!trimmed) continue;
    // If it looks like a track id (11 char youtube or numeric SC), fetch details
    const looksId = /^[a-zA-Z0-9_-]{11}$/.test(trimmed) || /^\d+$/.test(trimmed);
    if (looksId) {
      try {
        const details = await getTrackDetails(cfg, trimmed);
        out.push(details.track);
        continue;
      } catch { /* fall through to search */ }
    }
    // Otherwise search for first result
    const { tracks } = await searchTracks(cfg, trimmed, 1, 'all');
    if (!tracks.length) throw new Error(`No results for "${trimmed}"`);
    out.push(tracks[0]);
  }
  return out;
}

export async function playlistsAddCommand(playlistId: string, inputs: string[], opts: { json?: boolean }) {
  const cfg = loadConfig();
  const auth = requireAuth();
  const profileId = cfg.profileId || 'default';
  if (!inputs.length) { console.error(chalk.red('Provide track ids or search queries to add.')); process.exitCode = 1; return; }

  const spinner = ora('Resolving tracks…').start();
  try {
    const tracks = await resolveInputsToTracks(cfg, inputs);
    spinner.text = `Adding ${tracks.length} track(s) to ${playlistId}…`;
    const existing = await cloudGetPlaylists(cfg, auth.token, profileId);
    const payloads = (existing.playlists || []).map(snapshotToClientPayload);
    const idx = payloads.findIndex((p: any) => p.id === playlistId || p.title === playlistId);
    if (idx === -1) { spinner.fail(`Playlist not found: ${playlistId}`); process.exitCode = 1; return; }
    const target = payloads[idx];
    const existingIds = new Set(target.tracks.map((t: any) => `${t.sourceId}:${t.id || t.trackId}`));
    let added = 0;
    for (const tr of tracks) {
      const key = `${tr.sourceId}:${tr.id}`;
      if (existingIds.has(key)) continue;
      target.tracks.push(trackToSnapshotInput(tr));
      added++;
    }
    if (added === 0) { spinner.warn('All tracks already in playlist.'); return; }
    const res: any = await cloudPostPlaylists(cfg, auth.token, payloads, profileId);
    spinner.succeed(`Added ${added} track(s) to "${target.title}"  ${chalk.dim(target.id)}`);
    if (opts.json) console.log(JSON.stringify(res, null, 2));
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}

export async function playlistsRemoveCommand(playlistId: string, inputs: string[]) {
  const cfg = loadConfig();
  const auth = requireAuth();
  const profileId = cfg.profileId || 'default';
  if (!inputs.length) { console.error(chalk.red('Provide track ids to remove.')); process.exitCode = 1; return; }
  const spinner = ora(`Removing from ${playlistId}…`).start();
  try {
    const existing = await cloudGetPlaylists(cfg, auth.token, profileId);
    const payloads = (existing.playlists || []).map(snapshotToClientPayload);
    const idx = payloads.findIndex((p: any) => p.id === playlistId || p.title === playlistId);
    if (idx === -1) { spinner.fail(`Playlist not found: ${playlistId}`); process.exitCode = 1; return; }
    const target = payloads[idx];
    const removeSet = new Set(inputs.map(s => s.trim()));
    const before = target.tracks.length;
    target.tracks = target.tracks.filter((t: any) => !removeSet.has(t.id) && !removeSet.has(t.trackId));
    const removed = before - target.tracks.length;
    if (removed === 0) { spinner.warn('No matching tracks to remove.'); return; }
    await cloudPostPlaylists(cfg, auth.token, payloads, profileId);
    spinner.succeed(`Removed ${removed} track(s) from "${target.title}"`);
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}

export async function playlistsImportCommand(url: string, opts: { title?: string; as?: string; json?: boolean }) {
  const cfg = loadConfig();
  const auth = requireAuth();
  const profileId = cfg.profileId || 'default';

  // Extract playlist id from YouTube URL
  const m = url.match(/[?&]list=([^&]+)/) || url.match(/^([a-zA-Z0-9_-]{10,})$/);
  const playlistId = m ? m[1] : url.trim();
  if (!playlistId) { console.error(chalk.red('Provide a YouTube playlist URL or id (with ?list=)')); process.exitCode = 1; return; }

  const spinner = ora(`Importing YouTube playlist ${playlistId}…`).start();
  try {
    const imported = await getPlaylistImport(cfg, playlistId);
    const title = opts.title || opts.as || imported.title || 'Imported Playlist';
    spinner.text = `Fetched "${imported.title}" — ${imported.tracks.length} tracks. Saving to cloud…`;
    const existing = await cloudGetPlaylists(cfg, auth.token, profileId);
    const payloads = (existing.playlists || []).map(snapshotToClientPayload);
    payloads.push({
      id: crypto.randomUUID(),
      title,
      description: imported.description || `Imported from YouTube ${playlistId}`,
      gradient: '',
      coverUrl: '',
      tracks: imported.tracks.map(trackToSnapshotInput),
      isPublic: false,
      shared: false,
    });
    const res: any = await cloudPostPlaylists(cfg, auth.token, payloads, profileId);
    spinner.succeed(`Imported "${title}" — ${imported.tracks.length} tracks`);
    if (opts.json) console.log(JSON.stringify(res, null, 2));
  } catch (e: any) { spinner.fail(e.message); if (e.status === 0) console.log(chalk.dim('Is local runtime running? Imports need it.')); process.exitCode = 1; }
}

async function findPlaylist(cfg: ReturnType<typeof loadConfig>, token: string, profileId: string, idOrTitle: string) {
  const data = await cloudGetPlaylists(cfg, token, profileId);
  const pl = (data.playlists || []).find((p: any) => p.id === idOrTitle || p.title === idOrTitle);
  if (!pl) throw new Error(`Playlist not found: ${idOrTitle}  (spice playlists list)`);
  return pl;
}

export async function playlistsExportCommand(idOrTitle: string, opts: { out?: string; format?: string; json?: boolean }) {
  const fs = await import('node:fs');
  const path = (await import('node:path')).default;
  const cfg = loadConfig();
  const auth = requireAuth();
  const profileId = cfg.profileId || 'default';
  const format = (opts.format || 'json').toLowerCase();
  if (format !== 'json' && format !== 'm3u') { console.error(chalk.red('Format must be json or m3u.')); process.exitCode = 1; return; }

  const spinner = ora(`Fetching playlist ${idOrTitle}…`).start();
  try {
    const pl = await findPlaylist(cfg, auth.token, profileId, idOrTitle);
    const { toM3u, exportFileName } = await import('../playlist-file.js');
    const tracks: any[] = pl.tracks || [];
    const outPath = path.resolve(opts.out || exportFileName(pl.title || 'playlist', format));
    if (format === 'json') {
      fs.writeFileSync(outPath, JSON.stringify(pl, null, 2) + '\n');
    } else {
      fs.writeFileSync(outPath, toM3u(pl.title || 'playlist', tracks));
    }
    spinner.succeed(`Exported "${pl.title}" — ${tracks.length} track(s) → ${chalk.dim(outPath)}`);
    if (opts.json) console.log(JSON.stringify({ path: outPath, tracks: tracks.length }, null, 2));
  } catch (e: any) { spinner.fail(e.message || String(e)); process.exitCode = 1; }
}

export async function playlistsPlayCommand(idOrTitle: string, opts: { shuffle?: boolean; loop?: string; player?: string }) {
  const cfg = loadConfig();
  const auth = requireAuth();
  const profileId = cfg.profileId || 'default';
  const spinner = ora(`Loading playlist ${idOrTitle}…`).start();
  try {
    const pl = await findPlaylist(cfg, auth.token, profileId, idOrTitle);
    const tracks: any[] = pl.tracks || [];
    if (!tracks.length) { spinner.warn(`Playlist "${pl.title}" is empty.`); return; }
    spinner.succeed(`"${pl.title}" — ${tracks.length} track(s), resolving streams…`);
    const { playCommand } = await import('./play.js');
    const ids = tracks.map((t: any) => t.trackId || t.id).filter(Boolean);
    await playCommand(ids, { shuffle: !!opts.shuffle, loop: opts.loop as any, player: opts.player } as any);
  } catch (e: any) { spinner.fail(e.message || String(e)); process.exitCode = 1; }
}

export async function playlistsDownloadCommand(idOrTitle: string, opts: { out?: string; format?: string; lyrics?: boolean }) {
  const cfg = loadConfig();
  const auth = requireAuth();
  const profileId = cfg.profileId || 'default';
  const spinner = ora(`Loading playlist ${idOrTitle}…`).start();
  try {
    const pl = await findPlaylist(cfg, auth.token, profileId, idOrTitle);
    const tracks: any[] = pl.tracks || [];
    if (!tracks.length) { spinner.warn(`Playlist "${pl.title}" is empty.`); return; }
    spinner.succeed(`"${pl.title}" — ${tracks.length} track(s), downloading…`);
    const { downloadCommand } = await import('./download.js');
    const path = (await import('node:path')).default;
    const fallback = typeof pl.title === 'string' && pl.title.trim()
      ? path.join(cfg.downloadDir, pl.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 80))
      : undefined;
    const ids = tracks.map((t: any) => t.trackId || t.id).filter(Boolean);
    await downloadCommand(ids, { out: opts.out || fallback, format: opts.format, lyrics: opts.lyrics } as any);
  } catch (e: any) { spinner.fail(e.message || String(e)); process.exitCode = 1; }
}
