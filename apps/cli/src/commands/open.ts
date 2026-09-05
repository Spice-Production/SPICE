import { execFile } from 'node:child_process';
import os from 'node:os';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { resolveInputToTrack } from '../resolve.js';

function openUrl(url: string) {
  const platform = os.platform();
  const cmd = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  execFile(cmd, args, { windowsHide: true }, () => {});
}

export async function openCommand(input: string, opts: { source?: string }) {
  const cfg = loadConfig();
  const query = input?.trim();
  if (!query) { console.error(chalk.red('Provide a track id or search query.  spice open "hopes - apashe"')); process.exitCode = 1; return; }
  const spinner = ora('Resolving…').start();
  try {
    const track = await resolveInputToTrack(cfg, query, (opts.source as any) || 'all');
    const id = track.id;
    const url = /^\d+$/.test(id) || track.sourceId === 'soundcloud'
      ? `https://soundcloud.com/tracks/${id}`
      : `https://music.youtube.com/watch?v=${id}`;
    spinner.succeed(`${track.title} — opening ${chalk.dim(url)}`);
    openUrl(url);
  } catch (e: any) {
    spinner.fail(e.message || String(e));
    process.exitCode = 1;
  }
}
