import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, loadAuth } from '../config.js';
import { fmtArtists, fmtDuration } from '../ui.js';

export async function historyListCommand(opts: { json?: boolean; limit?: string }) {
  const cfg = loadConfig();
  const auth = loadAuth();
  if (!auth) { console.error(chalk.red('Not logged in.  spice auth login')); process.exitCode = 1; return; }
  const spinner = ora('Fetching history…').start();
  try {
    const { cloudGetHistory } = await import('../api.js');
    const data: any = await cloudGetHistory(cfg, auth.token, cfg.profileId);
    // History shape varies: { history: [...] } or { history: { items: [...] } }
    const raw = data.history ?? data.items ?? data;
    const items: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    const limit = parseInt(opts.limit || '20', 10) || 20;
    const slice = items.slice(0, limit);
    spinner.succeed(`${items.length} history item(s) [profile: ${cfg.profileId}], showing ${slice.length}`);
    if (opts.json) { console.log(JSON.stringify(data, null, 2)); return; }
    if (!slice.length) { console.log(chalk.dim('  No history yet. Play something: spice play "song"')); return; }
    slice.forEach((h: any, i: number) => {
      const track = h.track || h;
      const title = track.title || h.title || h.trackId || '?';
      let artists = '';
      try {
        const aj = track.artistsJson || h.artistsJson;
        if (aj) artists = fmtArtists(JSON.parse(aj));
        else if (track.artists) artists = fmtArtists(track.artists);
      } catch {}
      const dur = fmtDuration(track.durationMs ?? h.durationMs);
      const ms = h.msListened ? chalk.dim(` listened ${Math.round(h.msListened/1000)}s`) : '';
      console.log(` ${chalk.dim(String(i + 1).padStart(3, ' ') + '.')} ${chalk.bold(title)} ${chalk.cyan(artists)} ${chalk.dim(dur)}${ms} ${chalk.dim(h.trackId || track.id || '')}  ${chalk.dim(h.playedAt ? new Date(h.playedAt).toLocaleString() : '')}`);
    });
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}

export async function libraryCommand(opts: { json?: boolean }) {
  const cfg = loadConfig();
  const auth = loadAuth();
  if (!auth) { console.error(chalk.red('Not logged in.  spice auth login')); process.exitCode = 1; return; }
  const spinner = ora('Fetching library (likes + history + playlists)…').start();
  try {
    const { cloudGetLibrary } = await import('../api.js');
    const data: any = await cloudGetLibrary(cfg, auth.token, cfg.profileId);
    spinner.succeed(`Library fetched [profile: ${cfg.profileId}]`);
    if (opts.json) { console.log(JSON.stringify(data, null, 2)); return; }
    const likes = data.likedTracks?.length ?? data.likes?.length ?? 0;
    const history = Array.isArray(data.history) ? data.history.length : Array.isArray(data.history?.items) ? data.history.items.length : 0;
    const playlists = data.playlists?.length ?? 0;
    console.log(chalk.bold(`\nLibrary — profile ${cfg.profileId}`));
    console.log(chalk.dim('─'.repeat(32)));
    console.log(`  ${chalk.cyan('likes:')}     ${likes}`);
    console.log(`  ${chalk.cyan('history:')}   ${history}`);
    console.log(`  ${chalk.cyan('playlists:')} ${playlists}`);
    if (playlists && Array.isArray(data.playlists)) {
      console.log(chalk.dim('\n  Playlists:'));
      data.playlists.forEach((pl: any) => console.log(`    • ${chalk.bold(pl.title || '(untitled)')} ${chalk.dim(pl.id)} (${pl.tracks?.length ?? '?'} tracks)`));
    }
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}

export async function profilesListCommand(opts: { json?: boolean }) {
  const cfg = loadConfig();
  const auth = loadAuth();
  if (!auth) { console.error(chalk.red('Not logged in.  spice auth login')); process.exitCode = 1; return; }
  const spinner = ora('Fetching profiles…').start();
  try {
    const { cloudGetProfiles } = await import('../api.js');
    const data: any = await cloudGetProfiles(cfg, auth.token);
    const profiles = data.profiles || data || [];
    spinner.succeed(`Found ${Array.isArray(profiles) ? profiles.length : '?'} profile(s)`);
    if (opts.json) { console.log(JSON.stringify(data, null, 2)); return; }
    if (Array.isArray(profiles)) {
      profiles.forEach((p: any) => {
        const name = p.displayName || p.id || p.name || '?';
        const active = (p.id === cfg.profileId || p.profileId === cfg.profileId) ? chalk.green(' ← active') : '';
        console.log(`  ${chalk.bold(name)} ${chalk.dim(p.id || p.profileId || '')}${active}`);
      });
      console.log(chalk.dim(`\n  Active profile: ${cfg.profileId}  (change: spice config set profileId <id>)`));
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}
