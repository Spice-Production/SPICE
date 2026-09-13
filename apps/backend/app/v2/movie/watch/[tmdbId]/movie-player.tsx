'use client';

import { useMemo, useState } from 'react';

import { DEFAULT_STREAM_PROVIDER_ID, loadPreferredProvider, savePreferredProvider, streamProviders } from '@/lib/movie-provider';

import { V2ProviderTabs, V2WatchFrame } from '../../../watch-frame';

/** v2 movie player island: source tabs over a loading-aware frame. */
export function V2MoviePlayer({ tmdbId, title }: { tmdbId: string; title: string }) {
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

  if (!activeUrl) return null;
  return (
    <div>
      <V2ProviderTabs
        sources={sources.list.map((entry) => ({ ...entry, disabled: false }))}
        activeId={activeId}
        onPick={(id) => {
          setActiveId(id);
          savePreferredProvider(id);
        }}
      />
      <V2WatchFrame key={activeId} src={activeUrl} title={`${title} player`} frameKey={activeId} />
    </div>
  );
}
