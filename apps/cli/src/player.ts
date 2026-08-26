import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import chalk from 'chalk';
import type { SpiceTrack, SpiceStreamVariant } from './api.js';

// ---- player discovery ----

export type PlayerKind = 'mpv' | 'ffplay' | 'vlc' | null;

export function detectPlayer(preferred?: string): PlayerKind {
  const order: PlayerKind[] = preferred
    ? [preferred as PlayerKind]
    : (['mpv', 'ffplay', 'vlc'] as PlayerKind[]);
  for (const bin of order) {
    if (!bin) continue;
    const r = spawnSync(bin, bin === 'mpv' ? ['--version'] : bin === 'ffplay' ? ['-version'] : ['--version'], { stdio: 'ignore', timeout: 2000 });
    if (r.status === 0 || (r.error as any)?.code !== 'ENOENT') {
      // spawnSync returns error ENOENT when missing; otherwise assume found if no ENOENT
      if ((r.error as any)?.code === 'ENOENT') continue;
      return bin;
    }
    // Some Windows mpv builds exit non-zero for --version but still exist — check ENOENT only
    if ((r.error as any)?.code !== 'ENOENT') return bin;
  }
  // Second pass: which bin exists (PATH probe via `where`/`which`)
  for (const bin of (['mpv', 'ffplay', 'vlc'] as const)) {
    const probe = os.platform() === 'win32' ? 'where' : 'which';
    const r = spawnSync(probe, [bin], { stdio: 'ignore', timeout: 1500 });
    if (r.status === 0) return bin;
  }
  return null;
}

export function playerInstallHint() {
  return [
    chalk.dim('No audio player found. Install one:'),
    `  ${chalk.cyan('mpv')}    — best (gapless, queue, http seek)  ${chalk.dim('https://mpv.io/install/  |  winget install mpv  |  brew install mpv')}`,
    `  ${chalk.cyan('ffplay')} — ffmpeg suite                         ${chalk.dim('https://ffmpeg.org  |  winget install ffmpeg')}`,
    `  ${chalk.cyan('vlc')}    — fallback                             ${chalk.dim('https://videolan.org/vlc/')}`,
  ].join('\n');
}

// ---- queue ----

export interface QueueItem {
  track: SpiceTrack;
  stream: SpiceStreamVariant;
  url: string; // signed proxy URL (10-min TTL)
}

export class PlayQueue {
  items: QueueItem[] = [];
  index = 0;
  loop: 'off' | 'all' | 'one' = 'off';
  shuffle = false;

  get current(): QueueItem | null { return this.items[this.index] ?? null; }
  get length() { return this.items.length; }

  add(items: QueueItem[]) { this.items.push(...items); }
  clear() { this.items = []; this.index = 0; }
  next(): QueueItem | null {
    if (this.loop === 'one') return this.current;
    if (this.index + 1 < this.items.length) { this.index++; return this.current; }
    if (this.loop === 'all' && this.items.length) { this.index = 0; return this.current; }
    return null;
  }
  prev(): QueueItem | null {
    if (this.index > 0) { this.index--; return this.current; }
    if (this.loop === 'all' && this.items.length) { this.index = this.items.length - 1; return this.current; }
    return this.current;
  }
  removeAt(i: number) {
    if (i < 0 || i >= this.items.length) return;
    this.items.splice(i, 1);
    if (this.index >= this.items.length) this.index = Math.max(0, this.items.length - 1);
  }
  shuffleQueue() {
    // Keep current at 0, shuffle rest (Fisher-Yates)
    if (this.items.length <= 1) return;
    const cur = this.items[this.index];
    const rest = this.items.filter((_, i) => i !== this.index);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.items = [cur, ...rest];
    this.index = 0;
  }
}

// ---- mpv ipc helpers (optional) ----

function mpvArgsForQueue(urls: string[], opts: { shuffle?: boolean; loop?: string }) {
  // mpv playlist mode: pass all urls, enable gapless
  const args = [
    '--no-video',
    '--force-window=no',
    '--terminal=yes',
    '--msg-level=all=no,ao=info,statusline=status',
    '--term-status-msg=${time-pos} / ${duration}  ${media-title}',
  ];
  if (opts.shuffle) args.push('--shuffle');
  if (opts.loop === 'all') args.push('--loop-playlist=inf');
  if (opts.loop === 'one') args.push('--loop-file=inf');
  args.push(...urls);
  return args;
}

function ffplayArgsForUrl(url: string) {
  return ['-nodisp', '-autoexit', '-loglevel', 'error', url];
}

// ---- session player (blocking) ----

export interface PlayOptions {
  player?: string; // force
  shuffle?: boolean;
  loop?: 'off' | 'all' | 'one';
  volume?: number; // 0-100
}

/**
 * Play a queue interactively. Controls (while focused):
 *   n / >  next    p / <  prev    q / Esc  quit
 *   Space  pause   +/- volume      s shuffle  l loop
 * mpv handles most of this natively; for ffplay we re-spawn per track.
 */
export async function playQueue(queue: PlayQueue, opts: PlayOptions = {}) {
  const kind = detectPlayer(opts.player);
  if (!kind) {
    console.error(playerInstallHint());
    process.exitCode = 1;
    return;
  }

  if (opts.shuffle) queue.shuffleQueue();
  queue.loop = opts.loop ?? 'off';

  if (kind === 'mpv') {
    await playWithMpv(queue, opts);
  } else if (kind === 'ffplay') {
    await playWithFfplay(queue, opts);
  } else {
    await playWithVlc(queue, opts);
  }
}

async function playWithMpv(queue: PlayQueue, opts: PlayOptions) {
  const urls = queue.items.map(i => i.url);
  // Build a temp playlist file to keep titles visible
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spice-'));
  const playlist = path.join(tmpDir, 'queue.m3u');
  // m3u with EXTINF so mpv shows track names
  const m3u = queue.items.map(it => {
    const title = `${it.track.title} — ${it.track.artists.map(a => a.name).join(', ')}`;
    return `#EXTINF:-1,${title.replace(/[\r\n]/g, ' ')}\n${it.url}`;
  }).join('\n');
  fs.writeFileSync(playlist, m3u, 'utf8');

  const args = [
    '--no-video',
    '--force-window=no',
    '--terminal=yes',
    `--playlist=${playlist}`,
    '--gapless-audio=yes',
  ];
  if (opts.loop === 'all') args.push('--loop-playlist=inf');
  if (opts.loop === 'one') args.push('--loop-file=inf');
  if (opts.shuffle) args.push('--shuffle');
  if (opts.volume !== undefined) args.push(`--volume=${Math.max(0, Math.min(100, opts.volume))}`);

  console.log(chalk.dim(`▶ mpv ${args.join(' ')}`));
  printQueue(queue);
  printControls('mpv');

  const child = spawn('mpv', args, { stdio: 'inherit' });
  await waitForExit(child);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

async function playWithFfplay(queue: PlayQueue, _opts: PlayOptions) {
  console.log(chalk.yellow('ffplay mode: one process per track (no gapless). Install mpv for seamless playback.'));
  printQueue(queue);
  printControls('ffplay');

  // Put stdin in raw mode so single keypress works without Enter
  const wasRaw = process.stdin.isRaw;
  try { if (process.stdin.isTTY) process.stdin.setRawMode(true); } catch {}

  let idx = queue.index;
  let skip: 'next' | 'prev' | 'quit' | null = null;

  const onKey = (buf: Buffer) => {
    const ch = buf.toString('utf8');
    if (ch === 'q' || ch === '\u001b' || ch === '\u0003') skip = 'quit';
    else if (ch === 'n' || ch === '>') skip = 'next';
    else if (ch === 'p' || ch === '<') skip = 'prev';
    else if (ch === 's') { queue.shuffleQueue(); console.log(chalk.dim('↻ shuffled')); }
  };
  process.stdin.on('data', onKey);

  try {
    while (idx < queue.items.length) {
      const item = queue.items[idx];
      const title = `${item.track.title} — ${item.track.artists.map(a => a.name).join(', ')}`;
      console.log(`\n${chalk.bold(`▶ ${idx + 1}/${queue.items.length}`)}  ${chalk.cyan(title)}  ${chalk.dim(item.track.id)}`);

      const child = spawn('ffplay', ffplayArgsForUrl(item.url), { stdio: ['ignore', 'inherit', 'inherit'] });

      // Race: child exit vs skip signal
      skip = null;
      const exitPromise = waitForExit(child);
      while (true) {
        const done = await Promise.race([
          exitPromise.then(() => 'exit' as const),
          new Promise<'key'>(r => {
            const iv = setInterval(() => {
              if (skip) { clearInterval(iv); r('key'); }
            }, 100);
            exitPromise.then(() => { clearInterval(iv); });
          }),
        ]);
        if (done === 'key') {
          child.kill('SIGTERM');
          await exitPromise.catch(() => {});
          break;
        }
        break;
      }

      if (skip === 'quit') break;
      if (skip === 'next') { idx = Math.min(queue.items.length - 1, idx + 1); if (queue.loop === 'all' && idx === queue.items.length - 1 && skip === 'next') { /* stay */ } else if (idx < queue.items.length - 1 || queue.loop === 'all') { /* next already */ } continue; }
      if (skip === 'prev') { idx = Math.max(0, idx - 1); continue; }

      // Natural track end -> advance
      if (queue.loop === 'one') continue; // replay same
      idx++;
      if (idx >= queue.items.length && queue.loop === 'all') idx = 0;
      if (idx >= queue.items.length) break;
    }
  } finally {
    process.stdin.off('data', onKey);
    try { if (process.stdin.isTTY) process.stdin.setRawMode(!!wasRaw); } catch {}
  }
}

async function playWithVlc(queue: PlayQueue, _opts: PlayOptions) {
  const urls = queue.items.map(i => i.url);
  console.log(chalk.yellow('vlc mode: launching vlc (ensure http access is allowed).'));
  printQueue(queue);
  // VLC CLI: vlc --intf dummy --no-video <urls>  (or --intf rc for control)
  const child = spawn('vlc', ['--intf', 'dummy', '--no-video', ...urls], { stdio: 'inherit' });
  await waitForExit(child);
}

function waitForExit(child: ReturnType<typeof spawn>) {
  return new Promise<void>((resolve) => {
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
}

function printQueue(q: PlayQueue) {
  console.log(chalk.dim(`\nQueue — ${q.items.length} track(s)  ${q.loop !== 'off' ? `[loop:${q.loop}]` : ''} ${q.shuffle ? '[shuffle]' : ''}`));
  q.items.forEach((it, i) => {
    const marker = i === q.index ? chalk.green('▶') : chalk.dim(`${String(i + 1).padStart(2, ' ')} `);
    const title = `${it.track.title} — ${it.track.artists.map(a => a.name).join(', ')}`;
    const extra = it.stream.capped ? chalk.yellow(' [capped ~1MB]') : '';
    console.log(` ${marker} ${chalk.bold(title)} ${chalk.dim(`(${it.stream.container}/${it.stream.codec} ${Math.round(it.stream.bitrate / 1000)}k)${extra}`)}`);
  });
  console.log('');
}

function printControls(kind: string) {
  if (kind === 'mpv') {
    console.log(chalk.dim('Controls:  n next  p prev  SPACE pause  9/0 vol  q quit  s shuffle  l loop  (mpv handles keys directly)'));
  } else {
    console.log(chalk.dim('Controls:  n next  p prev  q quit  s shuffle  (terminal focused)'));
  }
  console.log(chalk.dim('Tip: keep this terminal focused for keys to register (ffplay/vlc mode). mpv reads keys natively.\n'));
}
