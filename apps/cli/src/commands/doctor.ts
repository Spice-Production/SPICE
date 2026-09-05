import { spawnSync } from 'node:child_process';
import os from 'node:os';
import chalk from 'chalk';
import { loadConfig, loadAuth, configFilePath, getAuthFilePath, getQueueFilePath } from '../config.js';
import { probeLocalRuntime, fetchJson } from '../api.js';

function binExists(bin: string, probeArgs: string[]): boolean {
  try {
    const r = spawnSync(bin, probeArgs, { stdio: 'ignore', timeout: 3000 });
    if ((r.error as any)?.code === 'ENOENT') return false;
    if (r.status === 0) return true;
    // Installed but probe flags differ (e.g. vlc) — confirm via PATH lookup.
  } catch (e: any) {
    if (e?.code === 'ENOENT') return false;
  }
  const which = os.platform() === 'win32' ? 'where' : 'which';
  try {
    const r = spawnSync(which, [bin], { stdio: 'ignore', timeout: 3000 });
    return r.status === 0;
  } catch { return false; }
}

async function probeCloud(cloudUrl: string) {
  try {
    const { res } = await fetchJson(`${cloudUrl.replace(/\/+$/, '')}/api/runtime`, { timeoutMs: 5000 });
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    return { ok: false, status: 0, message: e?.message || String(e) };
  }
}

export async function doctorCommand(opts: { json?: boolean }) {
  const cfg = loadConfig();
  const auth = loadAuth();
  const local = await probeLocalRuntime(cfg);
  const cloud = await probeCloud(cfg.cloudUrl);

  const checks = {
    node: { ok: true, detail: process.version },
    config: { ok: true, detail: configFilePath() },
    authFile: { ok: true, detail: auth ? 'token saved' : 'not logged in' },
    queueFile: { ok: true, detail: getQueueFilePath() },
    mpv: { ok: binExists('mpv', ['--version']), detail: 'gapless player (recommended)' },
    ffplay: { ok: binExists('ffplay', ['-version']), detail: 'ships with ffmpeg' },
    vlc: { ok: binExists('vlc', ['--version']), detail: 'fallback player' },
    ffmpeg: { ok: binExists('ffmpeg', ['-version']), detail: 'needed for -f mp3/opus/m4a downloads' },
    localRuntime: local.ok
      ? { ok: true as const, detail: cfg.localUrl }
      : { ok: false as const, detail: `${cfg.localUrl} — ${(local as any).message || 'unreachable'}` },
    cloud: cloud.ok
      ? { ok: true as const, detail: cfg.cloudUrl }
      : { ok: false as const, detail: `${cfg.cloudUrl} — HTTP ${(cloud as any).status || 'unreachable'}` },
    auth: auth ? { ok: true as const, detail: `saved ${auth.savedAt}` } : { ok: false as const, detail: 'not logged in (spice auth login)' },
  };

  const playerOk = checks.mpv.ok || checks.ffplay.ok || checks.vlc.ok;
  const rows: [string, boolean, string][] = [
    [`node ${checks.node.detail}`, true, ''],
    [`config ${checks.config.detail}`, true, ''],
    [`auth.json ${auth ? 'saved' : 'missing'} ${chalk.dim(getAuthFilePath())}`, true, ''],
    [`mpv ${checks.mpv.ok ? 'found' : 'missing'}`, checks.mpv.ok, checks.mpv.detail],
    [`ffplay ${checks.ffplay.ok ? 'found' : 'missing'}`, checks.ffplay.ok, checks.ffplay.detail],
    [`vlc ${checks.vlc.ok ? 'found' : 'missing'}`, checks.vlc.ok, checks.vlc.detail],
    [`ffmpeg ${checks.ffmpeg.ok ? 'found' : 'missing'}`, checks.ffmpeg.ok, checks.ffmpeg.detail],
    [`local runtime ${checks.localRuntime.detail}`, checks.localRuntime.ok, 'search/play/stream/download/lyrics'],
    [`cloud ${checks.cloud.detail}`, checks.cloud.ok, 'auth/playlists/likes/history'],
    [`auth ${checks.auth.detail}`, true, ''],
  ];

  if (opts.json) {
    console.log(JSON.stringify({ ...checks, playerOk, authFile: getAuthFilePath(), queueFile: getQueueFilePath() }, null, 2));
    return;
  }

  console.log(chalk.bold('\nSpice CLI — doctor'));
  console.log(chalk.dim('─'.repeat(24)));
  for (const [label, ok, hint] of rows) {
    const mark = ok ? chalk.green('●') : chalk.red('○');
    console.log(`  ${mark} ${label}${hint && !ok ? chalk.dim(`  (${hint})`) : ''}`);
  }

  const problems: string[] = [];
  if (!checks.localRuntime.ok) problems.push(`Local runtime down — start it: npm run backend:dev  (or spice config set localUrl <url>)`);
  if (!playerOk) problems.push('No player — winget install mpv  |  brew install mpv  (ffplay ships with ffmpeg)');
  if (!checks.ffmpeg.ok) problems.push('No ffmpeg — downloads limited to -f original (winget install ffmpeg)');
  if (!cloud.ok) problems.push('Cloud unreachable — auth/playlists/likes/history will fail (check network / cloudUrl)');
  if (!auth) problems.push('Not logged in — cloud commands need: spice auth login');

  if (!problems.length) {
    console.log(chalk.green('\n✔ All good — search/play/download (local) and auth/sync (cloud) should work.'));
  } else {
    console.log(chalk.yellow('\nNext steps:'));
    for (const p of problems) console.log(`  ${chalk.dim('•')} ${p}`);
  }
  console.log('');
}
