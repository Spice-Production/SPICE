'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_STREAM_PROVIDER_ID, loadPreferredProvider, savePreferredProvider, streamProviders } from '@/lib/movie-provider';

import { V2ProviderTabs, V2WatchFrame } from '../../../watch-frame';
import { V2WatchSync } from '../../../watch-sync';
import { Button, EmptyState, ErrorNote, Picker } from '@/components/ui';

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
  posterUrl?: string | null;
  year?: string | null;
  releaseDate?: string | null;
  seasons: SeasonSummary[];
  initialSeason?: number;
  initialEpisode?: number;
}

/**
 * v2 show player: season/episode browsing, per-episode provider frame,
 * episode-scoped progress sync. Same endpoints and state flow as the
 * original; the native season <select> becomes a themed kit Picker.
 */
export function V2ShowPlayer({ tmdbId, title, posterUrl, year, releaseDate, seasons, initialSeason, initialEpisode }: ShowPlayerProps) {
  const available = seasons.filter((s) => s.seasonNumber > 0 && s.episodeCount > 0);
  const [season, setSeason] = useState(
    initialSeason && available.some((s) => s.seasonNumber === initialSeason) ? initialSeason : (available[0]?.seasonNumber ?? 1),
  );
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [episode, setEpisode] = useState(initialEpisode && initialEpisode >= 1 ? initialEpisode : 1);
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
    <>
      <style>{`
        .v2-show { display: grid; gap: 4px; font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .v2-ep-now { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
        .v2-ep-now h2 { margin: 0; font-size: 1.02rem; font-weight: 700; color: var(--spk-text, #e8eaf0); }
        .v2-ep-overview { color: var(--spk-text-2, #a3a7b5); font-size: 0.88rem; line-height: 1.6;
          margin: 8px 0 0; max-width: 720px; }
        .v2-ep-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; margin-top: 14px; }
        .v2-ep { text-align: left; background: var(--spk-surface, #101014);
          border: 1px solid var(--spk-line, rgba(255,255,255,0.09));
          border-radius: var(--spk-radius-md, 12px); overflow: hidden; cursor: pointer; padding: 0;
          color: inherit; font: inherit; }
        .v2-ep:hover { border-color: var(--spk-text-3, #6b6f7d); }
        .v2-ep[data-on="true"] { border-color: var(--spk-accent, #8b93f8); }
        .v2-ep-still { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; background: var(--spk-surface-2, #17171d); }
        .v2-ep-fallback { width: 100%; aspect-ratio: 16 / 9; display: grid; place-items: center;
          background: var(--spk-surface-2, #17171d); color: var(--spk-text-3, #6b6f7d); font-weight: 700; }
        .v2-ep-body { padding: 8px 10px; }
        .v2-ep-title { font-weight: 650; font-size: 0.8rem; color: var(--spk-text, #e8eaf0); }
        .v2-ep-meta { color: var(--spk-text-3, #6b6f7d); font-size: 0.74rem; margin-top: 2px; }
        .v2-loading { color: var(--spk-text-3, #6b6f7d); font-size: 0.88rem; }
      `}</style>
      <div className="v2-show">
        <V2WatchSync
          kind="show"
          tmdbId={tmdbId}
          title={title}
          posterUrl={posterUrl}
          year={year}
          releaseDate={releaseDate}
          season={season}
          episode={episode}
          episodeLabel={`S${season} E${episode} watched`}
        />
        <V2ProviderTabs
          sources={providerUrls.map((entry) => ({ ...entry, disabled: false }))}
          activeId={providerId}
          onPick={(id) => {
            setProviderId(id);
            savePreferredProvider(id);
          }}
        />
        {activeUrl ? (
          <V2WatchFrame key={`${providerId}:${season}:${episode}`} src={activeUrl} title={`${title} S${season} E${episode} player`} frameKey={`${providerId}:${season}:${episode}`} />
        ) : (
          <EmptyState message="No source carries this episode — try another provider." />
        )}

        {current && (
          <div className="v2-ep-now">
            <h2>
              E{current.episodeNumber} · {current.name}
            </h2>
            {hasNext && (
              <Button size="sm" variant="primary" onClick={() => pickEpisode(episode + 1)}>
                Next episode →
              </Button>
            )}
          </div>
        )}
        {current?.overview && <p className="v2-ep-overview">{current.overview}</p>}

        <div style={{ marginTop: 18 }}>
          <Picker
            label="Season"
            options={available.map((s) => ({ value: String(s.seasonNumber), label: `${s.name} (${s.episodeCount})` }))}
            value={String(season)}
            onChange={(value) => {
              setSeason(Number(value));
              setLoadingList(true);
              setListError(null);
            }}
          />
        </div>

        {loadingList && <p className="v2-loading">Loading episodes…</p>}
        {listError && <ErrorNote message={listError} />}

        <div className="v2-ep-grid">
          {episodes.map((ep) => (
            <button
              key={ep.episodeNumber}
              type="button"
              data-on={ep.episodeNumber === episode ? 'true' : 'false'}
              className="v2-ep"
              onClick={() => pickEpisode(ep.episodeNumber)}
              aria-pressed={ep.episodeNumber === episode}
            >
              {ep.stillUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ep.stillUrl} alt="" loading="lazy" className="v2-ep-still" />
              ) : (
                <div className="v2-ep-fallback" aria-hidden="true">
                  E{ep.episodeNumber}
                </div>
              )}
              <div className="v2-ep-body">
                <div className="v2-ep-title">
                  E{ep.episodeNumber} · {ep.name}
                </div>
                {ep.runtimeMinutes && <div className="v2-ep-meta">{ep.runtimeMinutes} min</div>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
