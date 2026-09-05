import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, loadAuth } from '../config.js';
import { searchTracks, getTrackDetails } from '../api.js';

async function resolveToTrack(cfg: any, input: string) {
  const trimmed = input.trim();
  const looksId = /^[a-zA-Z0-9_-]{11}$/.test(trimmed) || /^\d+$/.test(trimmed);
  if (looksId) {
    try { const d = await getTrackDetails(cfg, trimmed); return d.track; } catch {}
  }
  const { tracks } = await searchTracks(cfg, trimmed, 1, 'all');
  if (!tracks.length) throw new Error(`No results for "${trimmed}"`);
  return tracks[0];
}

function trackToLikePayload(track: any) {
  return track; // cloud likes expects TrackSnapshotInput-like; we send minimal
}

export async function likesAddCommand(inputs: string[]) {
  const cfg = loadConfig();
  const auth = loadAuth();
  if (!auth) { console.error(chalk.red('Not logged in.  spice auth login')); process.exitCode = 1; return; }
  if (!inputs.length) { console.error(chalk.red('Provide track ids or queries.')); process.exitCode = 1; return; }
  const spinner = ora('Resolving…').start();
  try {
    const tracks = [];
    for (const input of inputs) tracks.push(await resolveToTrack(cfg, input));
    spinner.text = 'Fetching current likes…';
    const { cloudGetLikes, cloudPostLikes } = await import('../api.js');
    const current = await cloudGetLikes(cfg, auth.token, cfg.profileId);
    const existingIds = new Set(current.likedTracks || []);
    const existingDetails = current.likedTrackDetails || {};
    // Build new like list: merge existing details + new tracks
    const likedTrackDetails: Record<string, any> = { ...existingDetails };
    const newIds: string[] = [...existingIds] as string[];
    let added = 0;
    for (const tr of tracks) {
      if (existingIds.has(tr.id)) continue;
      likedTrackDetails[tr.id] = {
        sourceId: tr.sourceId,
        trackId: tr.id,
        title: tr.title,
        artistsJson: JSON.stringify(tr.artists || []),
        artworkUrl: tr.artworkUrl || null,
        durationMs: tr.durationMs ?? null,
      };
      newIds.push(tr.id);
      added++;
    }
    if (added === 0) { spinner.warn('All tracks already liked.'); return; }
    // The /api/sync/likes expects `likes` array? Check actual field: POST body spreads likesPayload which we built as { tracks, likes? }
    // Looking at route: it reads { likes, likedTracks, profileId } — but we send full sync via library. Simpler: use likes route directly if available.
    // The likes POST expects { likes: TrackSnapshotInput[] } or { likedTracks, likedTrackDetails }.
    // We'll try likedTracks + likedTrackDetails via cloudPostLikes which sends { tracks } — align to route's expected shape.
    // Inspect: POST likes reads body.likes or body.likedTracks — handle both.
    spinner.text = `Saving ${added} like(s)…`;
    // Use a raw fetch that matches the actual route: body must contain `likes` or we use library sync fallback.
    // Try likes route with `likes` field:
    const url = `${cfg.cloudUrl.replace(/\/+$/, '')}/api/sync/likes`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        likes: Object.values(likedTrackDetails).map((d: any) => ({
          sourceId: d.sourceId,
          trackId: d.trackId,
          title: d.title,
          artistsJson: d.artistsJson,
          artworkUrl: d.artworkUrl,
          durationMs: d.durationMs,
        })),
        likedTracks: newIds,
        likedTrackDetails,
        profileId: cfg.profileId,
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
    spinner.succeed(`Liked ${added} track(s) — total ${newIds.length}`);
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}

export async function likesRemoveCommand(inputs: string[]) {
  const cfg = loadConfig();
  const auth = loadAuth();
  if (!auth) { console.error(chalk.red('Not logged in.  spice auth login')); process.exitCode = 1; return; }
  if (!inputs.length) { console.error(chalk.red('Provide track ids to unlike.')); process.exitCode = 1; return; }
  const spinner = ora('Updating likes…').start();
  try {
    const { cloudGetLikes } = await import('../api.js');
    const current = await cloudGetLikes(cfg, auth.token, cfg.profileId);
    const removeSet = new Set(inputs.map(s => s.trim()));
    const likedTracks: string[] = (current.likedTracks || []).filter((id: string) => !removeSet.has(id));
    const likedTrackDetails: Record<string, any> = {};
    for (const id of likedTracks) if (current.likedTrackDetails?.[id]) likedTrackDetails[id] = current.likedTrackDetails[id];
    const removed = (current.likedTracks?.length || 0) - likedTracks.length;
    if (removed === 0) { spinner.warn('No matching liked tracks to remove.'); return; }
    const url = `${cfg.cloudUrl.replace(/\/+$/, '')}/api/sync/likes`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        likes: Object.values(likedTrackDetails).map((d: any) => ({
          sourceId: d.sourceId,
          trackId: d.trackId,
          title: d.title,
          artistsJson: d.artistsJson,
          artworkUrl: d.artworkUrl,
          durationMs: d.durationMs,
        })),
        likedTracks,
        likedTrackDetails,
        profileId: cfg.profileId,
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
    spinner.succeed(`Removed ${removed} like(s) — total ${likedTracks.length}`);
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}
