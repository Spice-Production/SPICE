import chalk from 'chalk';

export function fmtDuration(ms?: number) {
  if (!ms || !Number.isFinite(ms)) return '—';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtArtists(artists: { name: string }[]) {
  if (!artists?.length) return 'Unknown Artist';
  return artists.map(a => a.name).join(', ');
}

export function trackLine(t: { id: string; title: string; artists: { name: string }[]; durationMs?: number; sourceId?: string }, prefix = '') {
  const src = t.sourceId ? chalk.dim(`[${t.sourceId}]`) + ' ' : '';
  return `${prefix}${src}${chalk.bold(t.title)} — ${chalk.cyan(fmtArtists(t.artists))}  ${chalk.dim(fmtDuration(t.durationMs))}  ${chalk.dim(t.id)}`;
}

export function printTracks(tracks: any[], opts: { json?: boolean; limit?: number } = {}) {
  if (opts.json) {
    console.log(JSON.stringify(tracks, null, 2));
    return;
  }
  if (!tracks.length) {
    console.log(chalk.yellow('No results.'));
    return;
  }
  tracks.forEach((t, i) => {
    const n = String(i + 1).padStart(2, ' ');
    console.log(`${chalk.dim(n + '.')} ${trackLine(t)}`);
  });
}

export function header(text: string) {
  console.log(chalk.bold('\n' + text));
  console.log(chalk.dim('─'.repeat(text.length)));
}

export function bullet(k: string, v: string) {
  console.log(`  ${chalk.dim(k + ':')} ${v}`);
}

export function errorBox(msg: string) {
  console.error(chalk.red('✖ ') + msg);
}

export function success(msg: string) {
  console.log(chalk.green('✔ ') + msg);
}

export function warn(msg: string) {
  console.log(chalk.yellow('⚠ ') + msg);
}
