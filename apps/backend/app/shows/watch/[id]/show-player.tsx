'use client';

import { AdShieldBadge, ProviderTabs, WatchFrame } from '../../../watch-frame';
import { useShowPlayer, type ShowPlayerProps } from '../../../watch-player-state';
import WatchSync from '../../../watch-sync';

export default function ShowPlayer(
  props: ShowPlayerProps & { tagline?: string | null; meta?: string | null; overview?: string | null },
) {
  const { kind = 'show', tmdbId, title, tagline, meta, overview, posterUrl, year, releaseDate } = props;
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
      {activeUrl ? (
        <WatchFrame key={`${providerId}:${season}:${episode}`} src={activeUrl} title={`${title} S${season} E${episode} player`} frameKey={`${providerId}:${season}:${episode}`} />
      ) : (
        <p style={{ color: 'var(--text-secondary, #94a3b8)' }}>No source carries this episode — try another provider.</p>
      )}

      <div className="watch-provider-bar">
        <ProviderTabs
          sources={providerUrls.map((entry) => ({ ...entry, disabled: false }))}
          activeId={providerId}
          onPick={pickProvider}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <AdShieldBadge />
          {hasNext && (
            <button
              type="button"
              onClick={() => pickEpisode(episode + 1)}
              style={{
                background: 'var(--accent-gradient, linear-gradient(135deg, #7c3aed, #a855f7))',
                border: 'none',
                borderRadius: '999px',
                color: '#fff',
                padding: '7px 14px',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Next episode →
            </button>
          )}
        </div>
      </div>

      <section className="watch-details">
        <h1 className="watch-title">{title}</h1>
        {tagline && (
          <p style={{ color: 'var(--accent-pink, #c084fc)', fontStyle: 'italic', fontSize: '0.92rem', margin: '0 0 6px 0' }}>
            “{tagline}”
          </p>
        )}
        {meta && <p className="watch-meta">{meta}</p>}

        <WatchSync
          kind={kind}
          tmdbId={tmdbId}
          title={title}
          posterUrl={posterUrl}
          year={year}
          releaseDate={releaseDate}
          season={season}
          episode={episode}
          episodeLabel={`S${season} E${episode} watched`}
        />

        {current && (
          <div style={{ marginTop: '4px' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 800 }}>
              S{season} E{current.episodeNumber} · {current.name}
            </h2>
            {current.overview && <p className="watch-overview" style={{ marginTop: '4px' }}>{current.overview}</p>}
          </div>
        )}
        {!current?.overview && overview && <p className="watch-overview">{overview}</p>}
      </section>

      {available.length > 0 && (
        <div
          role="tablist"
          aria-label="Seasons"
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            marginTop: '22px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            paddingBottom: '4px',
          }}
        >
          {available.map((s) => {
            const active = s.seasonNumber === season;
            return (
              <button
                key={s.seasonNumber}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (s.seasonNumber !== season) selectSeason(s.seasonNumber);
                }}
                style={{
                  background: active ? 'rgba(124,58,237,0.24)' : 'rgba(255,255,255,0.05)',
                  border: active ? '1px solid var(--accent-violet, #7c3aed)' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px',
                  color: active ? '#fff' : 'var(--text-secondary, #cbd5e1)',
                  padding: '7px 13px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.name} ({s.episodeCount})
              </button>
            );
          })}
        </div>
      )}

      {loadingList && <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.88rem', marginTop: '12px' }}>Loading episodes…</p>}
      {listError && (
        <p style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: '12px', padding: '12px 16px', color: '#fda4af', marginTop: '12px' }}>
          {listError}
        </p>
      )}

      <div className="watch-episodes-grid">
        {episodes.map((ep) => {
          const active = ep.episodeNumber === episode;
          return (
            <button
              key={ep.episodeNumber}
              type="button"
              onClick={() => pickEpisode(ep.episodeNumber)}
              className="watch-ep-card"
              style={{
                background: active ? 'rgba(124,58,237,0.22)' : 'var(--bg-surface, rgba(255,255,255,0.04))',
                border: active ? '1px solid var(--accent-violet, #7c3aed)' : '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              }}
            >
              {ep.stillUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ep.stillUrl} alt="" className="watch-ep-thumb" loading="lazy" />
              ) : (
                <div className="watch-ep-fallback">E{ep.episodeNumber}</div>
              )}
              <div className="watch-ep-body">
                <div style={{ fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.3 }}>E{ep.episodeNumber} · {ep.name}</div>
                {ep.runtimeMinutes && <div style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.73rem', marginTop: '3px' }}>{ep.runtimeMinutes} min</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
