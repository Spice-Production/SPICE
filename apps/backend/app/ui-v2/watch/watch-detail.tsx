'use client';

/* eslint-disable @next/next/no-img-element -- TMDB artwork URLs are not configured for next/image. */

import { useState, type ReactNode } from 'react';

import { WATCH_LIST_STATUS_LABELS, WATCH_LIST_STATUS_ORDER } from '../../watch-client';
import { useMovieSources, useShowPlayer, type ShowPlayerProps } from '../../watch-player-state';
import { useWatchSync, type WatchSyncProps } from '../../watch-sync-state';
import { Icon } from '../icons';
import { Alert, Badge, Button, DropdownMenu, EmptyState, Select, Skeleton, Spinner, Tabs, cn } from '../primitives';
import { useWatchSession } from './session';
import { WatchHost } from './watch-host';
import { WatchShell, WatchSignInForm } from './watch-shell';
import s from './watch.module.css';

export interface WatchDetailInfo {
  title: string;
  tagline?: string | null;
  meta?: string[];
  overview?: string | null;
  backdropUrl?: string | null;
  posterUrl?: string | null;
}

function DetailPage({
  kind,
  info,
  children,
}: {
  kind: 'movie' | 'show';
  info: WatchDetailInfo;
  children: (sessionKey: string, onSignedIn: (token: string) => void) => ReactNode;
}) {
  const session = useWatchSession();
  const back = kind === 'show' ? { href: '/shows', label: 'TV Series' } : { href: '/movie', label: 'Movies' };
  return (
    <WatchHost>
      <WatchShell active={kind === 'show' ? 'shows' : 'movies'} session={session} back={back}>
        <header className={s.detailHero}>
          {info.backdropUrl ? <img src={info.backdropUrl} alt="" aria-hidden="true" className={s.detailBackdrop} /> : null}
          <div className={s.heroScrim} />
          <div className={s.detailHeroBody}>
            {info.posterUrl ? <img src={info.posterUrl} alt="" className={s.detailPoster} /> : null}
            <div className={s.detailText}>
              <h1 className={s.detailTitle}>{info.title}</h1>
              {info.tagline ? <p className={s.detailTagline}>“{info.tagline}”</p> : null}
              {info.meta && info.meta.length > 0 ? (
                <div className={s.detailMeta}>
                  {info.meta.map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {info.overview ? <p className={s.detailOverview}>{info.overview}</p> : null}
            </div>
          </div>
        </header>
        <div className={cn(s.page, s.detailPage)}>{children(session.token ?? 'signed-out', session.onSignedIn)}</div>
      </WatchShell>
    </WatchHost>
  );
}

/** List status + Mark watched (or a compact sign-in when signed out). */
function WatchSyncBar({ onSignedIn, ...props }: WatchSyncProps & { onSignedIn: (token: string) => void }) {
  const sync = useWatchSync(props);
  if (!sync.token) {
    return (
      <div className={s.syncSignIn}>
        <p className={s.syncHint}>Sign in to track this in your list and Continue watching.</p>
        <WatchSignInForm
          compact
          onSignedIn={(token) => {
            sync.setToken(token);
            onSignedIn(token);
          }}
        />
      </div>
    );
  }
  return (
    <div className={s.syncBar}>
      <DropdownMenu
        align="start"
        label="File under"
        items={[
          ...WATCH_LIST_STATUS_ORDER.map((option) => ({
            key: option,
            label: WATCH_LIST_STATUS_LABELS[option],
            checked: sync.status === option,
            onSelect: () => void sync.pickStatus(option),
          })),
          sync.status !== null ? { type: 'separator' as const, key: 'sep' } : null,
          sync.status !== null
            ? { key: 'remove', label: 'Remove from list', destructive: true, onSelect: () => void sync.removeFromList() }
            : null,
        ]}
        trigger={(triggerProps) => (
          <Button
            {...triggerProps}
            variant={sync.status === null ? 'outline' : 'default'}
            icon={sync.status === null ? 'plus' : 'check'}
            iconRight="chevronDown"
            disabled={sync.busy || !sync.known}
          >
            {sync.status === null ? 'Add to list' : WATCH_LIST_STATUS_LABELS[sync.status]}
          </Button>
        )}
      />
      {!sync.completed ? (
        <Button variant="outline" icon="checkCircle" disabled={sync.busy} onClick={() => void sync.markWatched()}>
          Mark {props.episodeLabel ?? 'watched'}
        </Button>
      ) : (
        <Badge variant="success" icon="check">
          Watched
        </Badge>
      )}
    </div>
  );
}

function SourceTabs({ sources, activeId, onPick }: { sources: { id: string; label: string }[]; activeId: string; onPick: (id: string) => void }) {
  if (sources.length < 2) return null;
  return (
    <div className={s.sources}>
      <span className={s.sourcesLabel}>Source</span>
      <Tabs label="Stream source" size="sm" value={activeId} onValueChange={onPick} items={sources.map((source) => ({ value: source.id, label: source.label }))} />
    </div>
  );
}

function PlayerFrame({ src, title }: { src: string; title: string }) {
  const [ready, setReady] = useState(false);
  return (
    <div className={s.frame}>
      {!ready ? (
        <div className={s.frameLoading}>
          <Spinner size={20} label="Loading player" />
          <span>Loading player…</span>
        </div>
      ) : null}
      <iframe
        src={src}
        title={title}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        onLoad={() => setReady(true)}
        className={s.frameIframe}
      />
    </div>
  );
}

function MoviePlayerV2({ tmdbId, title }: { tmdbId: string; title: string }) {
  const sources = useMovieSources(tmdbId);
  if (!sources.activeUrl) return null;
  return (
    <>
      <SourceTabs sources={sources.list} activeId={sources.activeId} onPick={sources.pick} />
      <PlayerFrame key={sources.activeId} src={sources.activeUrl} title={`${title} player`} />
    </>
  );
}

export function MovieWatchView({
  tmdbId,
  info,
  sync,
}: {
  tmdbId: string;
  info: WatchDetailInfo;
  sync: Omit<WatchSyncProps, 'kind' | 'tmdbId'>;
}) {
  return (
    <DetailPage kind="movie" info={info}>
      {(sessionKey, onSignedIn) => (
        <>
          <WatchSyncBar key={sessionKey} kind="movie" tmdbId={tmdbId} onSignedIn={onSignedIn} {...sync} />
          <MoviePlayerV2 tmdbId={tmdbId} title={sync.title} />
        </>
      )}
    </DetailPage>
  );
}

function ShowPlayerV2({ player, sessionKey, onSignedIn }: { player: ShowPlayerProps; sessionKey: string; onSignedIn: (token: string) => void }) {
  const show = useShowPlayer(player);
  const { tmdbId, title, posterUrl, year, releaseDate } = player;
  const frameKey = `${show.providerId}:${show.season}:${show.episode}`;
  return (
    <>
      <WatchSyncBar
        key={sessionKey}
        kind="show"
        tmdbId={tmdbId}
        title={title}
        posterUrl={posterUrl}
        year={year}
        releaseDate={releaseDate}
        season={show.season}
        episode={show.episode}
        episodeLabel={`S${show.season} E${show.episode} watched`}
        onSignedIn={onSignedIn}
      />
      <SourceTabs sources={show.providerUrls} activeId={show.providerId} onPick={show.pickProvider} />
      {show.activeUrl ? (
        <PlayerFrame key={frameKey} src={show.activeUrl} title={`${title} S${show.season} E${show.episode} player`} />
      ) : (
        <EmptyState icon="tv" title="No source carries this episode" description="Try another provider." />
      )}

      {show.current ? (
        <div className={s.episodeNow}>
          <div className={s.episodeNowText}>
            <h2 className={s.episodeNowTitle}>
              E{show.current.episodeNumber} · {show.current.name}
            </h2>
            {show.current.overview ? <p className={s.episodeNowOverview}>{show.current.overview}</p> : null}
          </div>
          {show.hasNext ? (
            <Button iconRight="arrowRight" onClick={() => show.pickEpisode(show.episode + 1)}>
              Next episode
            </Button>
          ) : null}
        </div>
      ) : null}

      <section className={s.episodes} aria-label="Episodes">
        <div className={s.episodesHeader}>
          <h2 className={s.episodesTitle}>Episodes</h2>
          <Select
            label="Season"
            size="sm"
            value={String(show.season)}
            options={show.available.map((season) => ({ value: String(season.seasonNumber), label: `${season.name} (${season.episodeCount})` }))}
            onChange={(value) => show.selectSeason(Number(value))}
            wrapperClassName={s.seasonSelect}
          />
        </div>
        {show.listError ? <Alert variant="danger">{show.listError}</Alert> : null}
        {show.loadingList ? (
          <div className={s.episodeGrid} aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height="auto" className={s.episodeSkeleton} />
            ))}
          </div>
        ) : (
          <div className={s.episodeGrid}>
            {show.episodes.map((ep) => {
              const active = ep.episodeNumber === show.episode;
              return (
                <button
                  key={ep.episodeNumber}
                  type="button"
                  className={s.episode}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => show.pickEpisode(ep.episodeNumber)}
                >
                  <span className={s.episodeStill}>
                    {ep.stillUrl ? <img src={ep.stillUrl} alt="" loading="lazy" /> : <span className={s.episodeStillFallback}>E{ep.episodeNumber}</span>}
                    {active ? (
                      <span className={s.episodePlaying}>
                        <Icon name="play" size={10} filled />
                        Playing
                      </span>
                    ) : null}
                  </span>
                  <span className={s.episodeName}>
                    E{ep.episodeNumber} · {ep.name}
                  </span>
                  {ep.runtimeMinutes ? <span className={s.episodeRuntime}>{ep.runtimeMinutes} min</span> : null}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

export function ShowWatchView({ info, player }: { info: WatchDetailInfo; player: ShowPlayerProps }) {
  return (
    <DetailPage kind="show" info={info}>
      {(sessionKey, onSignedIn) => <ShowPlayerV2 player={player} sessionKey={sessionKey} onSignedIn={onSignedIn} />}
    </DetailPage>
  );
}
