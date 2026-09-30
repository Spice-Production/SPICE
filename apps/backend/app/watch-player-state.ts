'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_STREAM_PROVIDER_ID, loadPreferredProvider, savePreferredProvider, streamProviders } from '@/lib/movie-provider';

export interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
}

export interface Episode {
  episodeNumber: number;
  name: string;
  overview: string;
  stillUrl: string | null;
  runtimeMinutes: number | null;
}

export interface ShowPlayerProps {
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
 * Season/episode/source state for the series player, shared by the classic
 * and new interfaces: loads a season's episodes, resumes ?s=&e= links, and
 * remembers the preferred source.
 */
export function useShowPlayer({ tmdbId, seasons, initialSeason, initialEpisode }: ShowPlayerProps) {
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

  const selectSeason = useCallback((next: number) => {
    setSeason(next);
    setLoadingList(true);
    setListError(null);
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

  const pickProvider = useCallback((id: string) => {
    setProviderId(id);
    savePreferredProvider(id);
  }, []);

  return {
    available,
    season,
    selectSeason,
    episodes,
    episode,
    pickEpisode,
    current,
    hasNext,
    loadingList,
    listError,
    providerUrls,
    providerId,
    pickProvider,
    activeUrl,
  };
}

/** Movie source list (preferred source first when it has this title). */
export function useMovieSources(tmdbId: string) {
  const sources = useMemo(() => {
    const stored = loadPreferredProvider(DEFAULT_STREAM_PROVIDER_ID);
    const list = streamProviders()
      .map((provider) => ({ id: provider.id, label: provider.label, url: provider.movieUrl(tmdbId) }))
      .filter((entry) => entry.url !== null);
    const active = list.some((entry) => entry.id === stored) ? stored : (list[0]?.id ?? DEFAULT_STREAM_PROVIDER_ID);
    return { list, active };
  }, [tmdbId]);
  const [activeId, setActiveId] = useState(sources.active);
  const activeUrl = sources.list.find((entry) => entry.id === activeId)?.url ?? sources.list[0]?.url;
  const pick = useCallback((id: string) => {
    setActiveId(id);
    savePreferredProvider(id);
  }, []);
  return { list: sources.list, activeId, activeUrl, pick };
}
