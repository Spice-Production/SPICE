'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_STREAM_PROVIDER_ID, streamProviders } from '@/lib/movie-provider';

import { loadPreferredProvider, ProviderTabs, savePreferredProvider, WatchFrame } from '../../../watch-frame';

interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
}

interface Episode {
  episodeNumber: number;
  name: string;
  overview: string;
  stillUrl: string | null;
  runtimeMinutes: number | null;
}

interface ShowPlayerProps {
  tmdbId: string;
  title: string;
  seasons: SeasonSummary[];
}

export default function ShowPlayer({ tmdbId, title, seasons }: ShowPlayerProps) {
  const available = seasons.filter((s) => s.seasonNumber > 0 && s.episodeCount > 0);
  const [season, setSeason] = useState(available[0]?.seasonNumber ?? 1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [episode, setEpisode] = useState(1);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/shows/${tmdbId}?season=${season}`, {
          headers: { 'x-spice-api-namespace': 'local' },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Could not load episodes.');
        if (cancelled) return;
        const list: Episode[] = Array.isArray(data.episodes) ? data.episodes : [];
        setEpisodes(list);
        setEpisode((prev) => (list.some((e) => e.episodeNumber === prev) ? prev : (list[0]?.episodeNumber ?? 1)));
        setListError(null);
      } catch (err) {
        if (cancelled) return;
        setEpisodes([]);
        setListError(err instanceof Error ? err.message : 'Could not load episodes.');
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tmdbId, season]);

  const pickEpisode = useCallback((next: number) => {
    setEpisode(next);
  }, []);

  const current = episodes.find((e) => e.episodeNumber === episode);
  const providerUrls = useMemo(
    () =>
      streamProviders()
        .map((provider) => ({ id: provider.id, label: provider.label, url: provider.tvUrl(tmdbId, season, episode) }))
        .filter((entry) => entry.url !== null),
    [tmdbId, season, episode],
  );
  const [providerId, setProviderId] = useState(() => {
    const stored = loadPreferredProvider(DEFAULT_STREAM_PROVIDER_ID);
    return providerUrls.some((entry) => entry.id === stored) ? stored : (providerUrls[0]?.id ?? DEFAULT_STREAM_PROVIDER_ID);
  });
  const activeUrl = providerUrls.find((entry) => entry.id === providerId)?.url ?? providerUrls[0]?.url ?? null;
  const hasNext = episodes.some((e) => e.episodeNumber === episode + 1);

  return (
    <div>
      <ProviderTabs
        sources={providerUrls.map((entry) => ({ ...entry, disabled: false }))}
        activeId={providerId}
        onPick={(id) => {
          setProviderId(id);
          savePreferredProvider(id);
        }}
      />
      {activeUrl ? (
        <WatchFrame key={`${providerId}:${season}:${episode}`} src={activeUrl} title={`${title} S${season} E${episode} player`} frameKey={`${providerId}:${season}:${episode}`} />
      ) : (
        <p style={{ color: '#94a3b8' }}>No source carries this episode — try another provider.</p>
      )}

      {current && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '14px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
            E{current.episodeNumber} · {current.name}
          </h2>
          {hasNext && (
            <button
              type="button"
              onClick={() => pickEpisode(episode + 1)}
              style={{ background: 'var(--accent-gradient, linear-gradient(135deg, #7c3aed, #a855f7))', border: 'none', borderRadius: '10px', color: '#fff', padding: '8px 16px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Next episode →
            </button>
          )}
        </div>
      )}
      {current?.overview && (
        <p style={{ color: '#d4d4d8', fontSize: '0.9rem', lineHeight: 1.6, margin: '8px 0 0 0', maxWidth: '720px' }}>
          {current.overview}
        </p>
      )}

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '22px', flexWrap: 'wrap' }}>
        <label htmlFor="show-season" style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Season</label>
        <select
          id="show-season"
          value={season}
          onChange={(e) => { setSeason(Number(e.target.value)); setLoadingList(true); setListError(null); }}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: '#f1f5f9', padding: '8px 12px', fontSize: '0.9rem' }}
        >
          {available.map((s) => (
            <option key={s.seasonNumber} value={s.seasonNumber}>
              {s.name} ({s.episodeCount})
            </option>
          ))}
        </select>
      </div>

      {loadingList && <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading episodes…</p>}
      {listError && (
        <p style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: '12px', padding: '12px 16px', color: '#fda4af' }}>
          {listError}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginTop: '14px' }}>
        {episodes.map((ep) => {
          const active = ep.episodeNumber === episode;
          return (
            <button
              key={ep.episodeNumber}
              type="button"
              onClick={() => pickEpisode(ep.episodeNumber)}
              style={{
                textAlign: 'left',
                background: active ? 'rgba(124,58,237,0.22)' : 'rgba(255,255,255,0.04)',
                border: active ? '1px solid #7c3aed' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                overflow: 'hidden',
                cursor: 'pointer',
                padding: 0,
                color: 'inherit',
              }}
            >
              {ep.stillUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ep.stillUrl} alt="" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block' }} loading="lazy" />
              ) : (
                <div style={{ width: '100%', aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', background: 'rgba(124,58,237,0.15)', color: '#c4b5fd' }}>
                  E{ep.episodeNumber}
                </div>
              )}
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>E{ep.episodeNumber} · {ep.name}</div>
                {ep.runtimeMinutes && <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '2px' }}>{ep.runtimeMinutes} min</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
