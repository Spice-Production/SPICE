'use client';

import { AdShieldBadge, ProviderTabs, WatchFrame } from '../../../watch-frame';
import { useMovieSources } from '../../../watch-player-state';

/** Movie player island: video frame first, server switcher + ad shield directly below. */
export default function MoviePlayer({ tmdbId, title }: { tmdbId: string; title: string }) {
  const sources = useMovieSources(tmdbId);
  const { activeId, activeUrl } = sources;

  if (!activeUrl) return null;
  return (
    <div>
      <WatchFrame key={activeId} src={activeUrl} title={`${title} player`} frameKey={activeId} />
      <div className="watch-provider-bar">
        <ProviderTabs
          sources={sources.list.map((entry) => ({ ...entry, disabled: false }))}
          activeId={activeId}
          onPick={sources.pick}
        />
        <AdShieldBadge />
      </div>
    </div>
  );
}
