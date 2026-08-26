import ora from 'ora';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { searchTracks } from '../api.js';
import { printTracks } from '../ui.js';

export async function searchCommand(queryParts: string[], opts: { limit: string; source: string; json?: boolean; web?: boolean }) {
  const query = queryParts.join(' ').trim();
  if (!query) {
    console.error(chalk.red('Provide a search query:  spice search "lofi hip hop"'));
    process.exitCode = 1;
    return;
  }
  const cfg = loadConfig();
  const limit = Math.max(1, Math.min(50, parseInt(opts.limit, 10) || 20));
  const source = (opts.source || cfg.defaultSource) as 'yt' | 'sc' | 'all';

  const spinner = ora(`Searching ${source} for "${query}"…`).start();
  try {
    // `web` flag searches YouTube web videos (regular uploads) instead of Music catalog
    if (opts.web) {
      const { searchWebVideos } = await import('../api.js');
      const tracks = await searchWebVideos(cfg, query, limit);
      spinner.succeed(`Found ${tracks.length} video(s)`);
      printTracks(tracks, { json: opts.json });
      return;
    }
    const { tracks } = await searchTracks(cfg, query, limit, source);
    spinner.succeed(`Found ${tracks.length} track(s) [${source}]`);
    printTracks(tracks, { json: opts.json });
    if (!opts.json && tracks.length) {
      console.log(chalk.dim('\nTip: spice play <id>  |  spice play "' + query + '"  (auto picks first result)'));
      console.log(chalk.dim('     spice download <id> -o ./music -f mp3'));
    }
  } catch (e: any) {
    spinner.fail(e.message || String(e));
    if (!opts.json) console.error(chalk.dim('Is the local runtime running?  Try:  spice status'));
    process.exitCode = 1;
  }
}
