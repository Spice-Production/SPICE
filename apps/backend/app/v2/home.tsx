'use client';

import { useEffect, useMemo, useState } from 'react';

import { buildHomeHistoryShelves } from '../home-history';
import {
  buildWeeklyListeningRecap,
  normalizeListeningEvents,
  type ListeningEvent,
} from '../listening-insights';
import { readAccountToken } from '../watch-client';
import { AppShell, Avatar, Button, Card, EmptyState, PosterCard, Shelf } from '@/components/ui';
import { V2_NAV } from './nav';
import type { EngineTrack } from './music/engine';
import { useMusicLibrary } from './music/library';
import { useMusicProfiles } from './music/profiles';

type HomeTrack = EngineTrack & { msListened?: number };

function withListenMs(track: EngineTrack): HomeTrack {
  const raw = (track as { msListened?: unknown }).msListened;
  return { ...track, msListened: typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : undefined };
}

const artistNames = (track: EngineTrack) => track.artists.map((artist) => artist.name).join(', ') || 'Unknown artist';

/**
 * The rebuilt home screen: greeting hero, on-device weekly recap, and
 * playlist / recently-played / forgotten-favorite shelves. Same data as
 * the original — synced library + history for the shelves, local
 * per-profile listening events (written by the music player) for the
 * recap — presented in the quiet kit. Playback lives on /v2/music, so
 * every tile routes there.
 */
export function HomeView() {
  const [token] = useState<string | null>(() => readAccountToken());
  const library = useMusicLibrary(token);
  const profiles = useMusicProfiles(token);
  const [events, setEvents] = useState<ListeningEvent[]>([]);

  useEffect(() => {
    const read = () => {
      try {
        const profile = window.localStorage.getItem('spice_cloud_profile_id') || 'default';
        const raw = window.localStorage.getItem(`spice_listening_events:${profile}`);
        setEvents(normalizeListeningEvents(raw ? JSON.parse(raw) : []));
      } catch {
        setEvents([]);
      }
    };
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, []);

  const recap = useMemo(() => buildWeeklyListeningRecap(events), [events]);
  const shelves = useMemo(
    () => buildHomeHistoryShelves(library.history.map(withListenMs)),
    [library.history],
  );
  const activeProfile = profiles.profiles.find((item) => item.id === profiles.activeId) ?? null;
  const name = activeProfile?.displayName?.trim() || null;

  if (!token) {
    return (
      <AppShell items={V2_NAV} active="home">
        <Card title="Welcome to SPICE">
          <p style={{ margin: '0 0 14px', fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--spk-text-2, #a3a7b5)' }}>
            Your week in music, playlists, and recent plays — once you sign in.
          </p>
          <a href="/v2/profile" style={{ textDecoration: 'none' }}>
            <Button variant="primary">Sign in</Button>
          </a>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell items={V2_NAV} active="home">
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: '0 0 4px', fontSize: '1.35rem', fontWeight: 750, letterSpacing: '-0.01em', color: 'var(--spk-text, #fafafa)' }}>
              Welcome back{name ? `, ${name}` : ''}!
            </h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--spk-text-2, #a3a7b5)' }}>
              Discover, stream, and sync your favorite music across all your devices.
            </p>
          </div>
          <Avatar name={name ?? '?'} src={activeProfile?.avatarUrl} />
        </div>
      </Card>

      {!library.loaded && <EmptyState message="Loading your home…" />}
      {library.error && <EmptyState message={library.error} />}

      {recap.eventCount > 0 && (
        <Card title="Your Listening Week" extra={recap.topArtists[0] ? `Top artist: ${recap.topArtists[0].name}` : undefined}>
          <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: 'var(--spk-text-2, #a3a7b5)' }}>
            Private, on-device recap{name ? ` for ${name}` : ''}. Nothing extra is uploaded.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            {[
              [String(recap.creditedMinutes), 'minutes'],
              [String(recap.uniqueTrackCount), 'unique tracks'],
              [`${recap.discoveryPercent}%`, 'discoveries'],
              [String(recap.longestSessionMinutes), 'longest session, min'],
            ].map(([value, label]) => (
              <div
                key={label}
                style={{ border: '1px solid var(--spk-line, #26262c)', borderRadius: 'var(--spk-radius-md, 8px)', padding: '12px 14px' }}
              >
                <div style={{ fontSize: '1.25rem', fontWeight: 750, color: 'var(--spk-text, #fafafa)' }}>{value}</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--spk-text-2, #a3a7b5)' }}>{label}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {library.playlists.length > 0 && (
        <Shelf title="Your Playlists" action={<a href="/v2/music">View All</a>}>
          {library.playlists.map((playlist) => (
            <PosterCard
              key={playlist.id}
              href="/v2/music"
              title={playlist.title}
              meta={`${playlist.tracks.length} tracks${playlist.shared ? ' · Shared' : ''}`}
              posterUrl={playlist.tracks[0]?.artworkUrl}
            />
          ))}
        </Shelf>
      )}

      {shelves.recentlyPlayed.length > 0 && (
        <Shelf title="Recently Played">
          {shelves.recentlyPlayed.map((track) => (
            <PosterCard
              key={`${track.sourceId ?? 'youtube_music'}:${track.id}`}
              href="/v2/music"
              title={track.title}
              meta={artistNames(track)}
              posterUrl={track.artworkUrl}
            />
          ))}
        </Shelf>
      )}

      {shelves.forgottenFavorites.length > 0 && (
        <Shelf title="Forgotten Favorites">
          {shelves.forgottenFavorites.map((track) => (
            <PosterCard
              key={`${track.sourceId ?? 'youtube_music'}:${track.id}`}
              href="/v2/music"
              title={track.title}
              meta={artistNames(track)}
              posterUrl={track.artworkUrl}
            />
          ))}
        </Shelf>
      )}
    </AppShell>
  );
}
