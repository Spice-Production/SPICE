import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { getTrackDetails, pickBestStream, searchTracks } from '../api.js';

export async function streamCommand(idOrQuery: string, opts: { json?: boolean; raw?: boolean; source?: string; format?: string }) {
  const cfg = loadConfig();
  let id = idOrQuery?.trim();
  if (!id) { console.error(chalk.red('Provide a track id or search query.')); process.exitCode = 1; return; }

  // If it looks like a query (spaces) or not 11-char YT id, search first
  const looksLikeId = /^[a-zA-Z0-9_-]{8,}$/.test(id) && !id.includes(' ');
  if (!looksLikeId) {
    const spinner = ora(`Resolving "${id}"…`).start();
    try {
      const { tracks } = await searchTracks(cfg, id, 1, (opts.source as any) || 'all');
      if (!tracks.length) { spinner.fail('No results for query.'); process.exitCode = 1; return; }
      id = tracks[0].id;
      spinner.succeed(`Resolved → ${tracks[0].title} [${id}]`);
    } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; return; }
  }

  const spinner = ora(`Fetching streams for ${id}…`).start();
  try {
    const details = await getTrackDetails(cfg, id, opts.source === 'sc' ? 'sc' : 'yt');
    const prefer = (opts.format === 'mp3' ? 'mp3' : opts.format === 'opus' ? 'opus' : opts.format === 'm4a' ? 'm4a' : 'original') as any;
    const best = pickBestStream(details.streams, prefer);
    if (!best) { spinner.fail('No streams available.'); process.exitCode = 1; return; }
    spinner.succeed(`${details.track.title} — ${details.track.artists.map(a => a.name).join(', ')}  [${details.streams.length} variants]`);

    if (opts.json) {
      console.log(JSON.stringify({ track: details.track, streams: details.streams, best }, null, 2));
      return;
    }
    if (opts.raw) {
      console.log(best.url);
      return;
    }
    console.log('');
    console.log(chalk.bold(details.track.title) + ' — ' + chalk.cyan(details.track.artists.map(a => a.name).join(', ')));
    console.log(chalk.dim(`id: ${details.track.id}  duration: ${details.track.durationMs ? Math.round(details.track.durationMs/1000)+'s' : '—'}  source: ${details.track.sourceId}`));
    console.log('');
    details.streams.forEach((s, i) => {
      const star = s.url === best.url ? chalk.green(' ★ best') : '';
      const cap = s.capped ? chalk.yellow(' [capped ~1MB — PO token missing]') : '';
      console.log(` ${s.url === best.url ? chalk.green('▶') : ' '} ${chalk.dim(String(i+1).padStart(2,' ')+'.')} ${s.container}/${s.codec} ${chalk.dim(Math.round(s.bitrate/1000)+'k')}  itag ${s.itag}${star}${cap}`);
      console.log(chalk.dim('   ' + s.url.slice(0, 120) + (s.url.length > 120 ? '…' : '')));
    });
    console.log(chalk.dim('\nTip: spice play ' + id + '   |   spice download ' + id + ' -f mp3'));
    if (details.streams.some(s => s.capped)) {
      console.log(chalk.yellow('\n⚠ Some streams are capped (~1.07 MB) — PO token not minted. Install/Bake bgutil or check local runtime logs.'));
    }
  } catch (e: any) {
    spinner.fail(e.message || String(e));
    process.exitCode = 1;
  }
}
