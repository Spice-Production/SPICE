import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface SpiceCliConfig {
  localUrl: string;   // e.g. http://127.0.0.1:3939
  cloudUrl: string;   // e.g. https://music.spice-app.xyz
  /** Preferred provider order for /search without explicit source */
  defaultSource: 'yt' | 'sc' | 'all';
  /** Preferred container for downloads (used as fallback) */
  downloadDir: string;
  downloadFormat: 'm4a' | 'mp3' | 'opus' | 'original';
}

const DEFAULTS: SpiceCliConfig = {
  localUrl: process.env.SPICE_LOCAL_RUNTIME_URL || 'http://127.0.0.1:3939',
  cloudUrl: process.env.SPICE_CLOUD_URL || 'https://music.spice-app.xyz',
  defaultSource: 'all',
  downloadDir: path.join(os.homedir(), 'Music', 'Spice'),
  downloadFormat: 'original',
};

// Config lives at:  XDG_CONFIG_HOME/spice/config.json  or  ~/.config/spice/config.json  or  ~/.spice.json (legacy)
function candidatePaths() {
  const xdg = process.env.XDG_CONFIG_HOME;
  const primary = xdg
    ? path.join(xdg, 'spice', 'config.json')
    : os.platform() === 'win32'
      ? path.join(os.homedir(), '.config', 'spice', 'config.json')
      : path.join(os.homedir(), '.config', 'spice', 'config.json');
  return [
    primary,
    path.join(os.homedir(), '.spice.json'),
  ];
}

export function configFilePath(): string {
  return candidatePaths()[0];
}

export function loadConfig(): SpiceCliConfig {
  for (const p of candidatePaths()) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      return { ...DEFAULTS, ...normalize(raw) };
    } catch { /* ignore corrupt */ }
  }
  return { ...DEFAULTS };
}

export function saveConfig(patch: Partial<SpiceCliConfig>) {
  const file = configFilePath();
  const current = loadConfig();
  const next: SpiceCliConfig = { ...current, ...normalize(patch) } as SpiceCliConfig;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  return next;
}

export function resetConfig() {
  const file = configFilePath();
  try { fs.unlinkSync(file); } catch {}
  // also try legacy
  try { fs.unlinkSync(candidatePaths()[1]); } catch {}
  return { ...DEFAULTS };
}

function normalize(raw: any): Partial<SpiceCliConfig> {
  const out: any = {};
  if (typeof raw.localUrl === 'string' && raw.localUrl) out.localUrl = raw.localUrl.replace(/\/+$/, '');
  if (typeof raw.cloudUrl === 'string' && raw.cloudUrl) out.cloudUrl = raw.cloudUrl.replace(/\/+$/, '');
  if (['yt', 'sc', 'all'].includes(raw.defaultSource)) out.defaultSource = raw.defaultSource;
  if (typeof raw.downloadDir === 'string' && raw.downloadDir) out.downloadDir = raw.downloadDir;
  if (['m4a', 'mp3', 'opus', 'original'].includes(raw.downloadFormat)) out.downloadFormat = raw.downloadFormat;
  return out;
}

export function resolveEndpoints(cfg = loadConfig()) {
  return {
    localBase: cfg.localUrl.replace(/\/+$/, ''),
    cloudBase: cfg.cloudUrl.replace(/\/+$/, ''),
    // Local runtime exposes heavy routes under /api/local/* and proxies cloud under /api/cloud/*
    localSearch: (q: string, limit: number, kind: string) => `${cfg.localUrl.replace(/\/+$/, '')}/api/yt/search?q=${encodeURIComponent(q)}&limit=${limit}&kind=${encodeURIComponent(kind)}`,
    localTrack: (id: string) => `${cfg.localUrl.replace(/\/+$/, '')}/api/yt/track/${encodeURIComponent(id)}`,
    localScSearch: (q: string, limit: number) => `${cfg.localUrl.replace(/\/+$/, '')}/api/sc/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    localScTrack: (id: string) => `${cfg.localUrl.replace(/\/+$/, '')}/api/sc/track/${encodeURIComponent(id)}`,
    localRuntime: `${cfg.localUrl.replace(/\/+$/, '')}/api/runtime`,
    localLyrics: (id: string) => `${cfg.localUrl.replace(/\/+$/, '')}/api/yt/lyrics/${encodeURIComponent(id)}`,
  };
}
