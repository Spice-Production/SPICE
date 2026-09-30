'use client';

import { useShowPlayer, type ShowPlayerProps } from '../../../watch-player-state';
import { ProviderTabs, WatchFrame } from '../../../watch-frame';
import WatchSync from '../../../watch-sync';

export default function ShowPlayer(props: ShowPlayerProps) {
  const { tmdbId, title, posterUrl, year, releaseDate } = props;
  const {
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
  } = useShowPlayer(props);

  return (
    <div>
      <WatchSync
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
      <ProviderTabs
        sources={providerUrls.map((entry) => ({ ...entry, disabled: false }))}
        activeId={providerId}
        onPick={pickProvider}
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
          onChange={(e) => selectSeason(Number(e.target.value))}
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
