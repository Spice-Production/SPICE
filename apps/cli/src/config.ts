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
  /** Active sync profile id (default: "default") */
  profileId: string;
}

const DEFAULTS: SpiceCliConfig = {
  localUrl: process.env.SPICE_LOCAL_RUNTIME_URL || 'http://127.0.0.1:3939',
  cloudUrl: process.env.SPICE_CLOUD_URL || 'https://music.spice-app.xyz',
  defaultSource: 'all',
  downloadDir: path.join(os.homedir(), 'Music', 'Spice'),
  downloadFormat: 'original',
  profileId: 'default',
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

function authFilePath() {
  return path.join(path.dirname(candidatePaths()[0]), 'auth.json');
}

function queueFilePath() {
  return path.join(path.dirname(candidatePaths()[0]), 'queue.json');
}

export function configFilePath(): string {
  return candidatePaths()[0];
}

export function getAuthFilePath(): string { return authFilePath(); }
export function getQueueFilePath(): string { return queueFilePath(); }

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
  if (typeof raw.profileId === 'string' && raw.profileId.trim()) out.profileId = raw.profileId.trim();
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
    localPlaylist: (id: string) => `${cfg.localUrl.replace(/\/+$/, '')}/api/yt/playlist/${encodeURIComponent(id)}`,
    localAlbum: (id: string) => `${cfg.localUrl.replace(/\/+$/, '')}/api/yt/album/${encodeURIComponent(id)}`,
    localRelated: (id: string, limit: number) => `${cfg.localUrl.replace(/\/+$/, '')}/api/yt/related/${encodeURIComponent(id)}?limit=${limit}`,
  };
}

// ---- auth storage ----

export interface StoredAuth {
  token: string;
  user?: any;
  email?: string;
  username?: string;
  savedAt: string;
}

export function loadAuth(): StoredAuth | null {
  const p = authFilePath();
  try {
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (typeof raw.token === 'string' && raw.token) return raw as StoredAuth;
    return null;
  } catch { return null; }
}

export function saveAuth(data: StoredAuth) {
  const p = authFilePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(p, 0o600); } catch {}
  return data;
}

export function clearAuth() {
  const p = authFilePath();
  try { fs.unlinkSync(p); } catch {}
}

// ---- queue storage (persistent) ----

export interface StoredQueueItem {
  id: string;
  sourceId: string;
  title: string;
  artists: { id: string; name: string }[];
  durationMs?: number;
  artworkUrl?: string;
  addedAt: string;
}

export interface StoredQueue {
  items: StoredQueueItem[];
  updatedAt: string;
}

export function loadQueue(): StoredQueue {
  const p = queueFilePath();
  try {
    if (!fs.existsSync(p)) return { items: [], updatedAt: new Date().toISOString() };
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (Array.isArray(raw.items)) return raw as StoredQueue;
    if (Array.isArray(raw)) return { items: raw as StoredQueueItem[], updatedAt: new Date().toISOString() };
    return { items: [], updatedAt: new Date().toISOString() };
  } catch { return { items: [], updatedAt: new Date().toISOString() }; }
}

export function saveQueue(items: StoredQueueItem[]) {
  const p = queueFilePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const payload: StoredQueue = { items, updatedAt: new Date().toISOString() };
  fs.writeFileSync(p, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}
