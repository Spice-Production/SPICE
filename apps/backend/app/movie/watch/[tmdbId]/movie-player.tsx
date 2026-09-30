'use client';

import { ProviderTabs, WatchFrame } from '../../../watch-frame';
import { useMovieSources } from '../../../watch-player-state';

/** Movie player island: source tabs over a loading-aware frame. */
export default function MoviePlayer({ tmdbId, title }: { tmdbId: string; title: string }) {
  const sources = useMovieSources(tmdbId);
  const { activeId, activeUrl } = sources;

  if (!activeUrl) return null;
  return (
    <div>
      <ProviderTabs
        sources={sources.list.map((entry) => ({ ...entry, disabled: false }))}
        activeId={activeId}
        onPick={sources.pick}
      />
      <WatchFrame key={activeId} src={activeUrl} title={`${title} player`} frameKey={activeId} />
    </div>
  );
}
