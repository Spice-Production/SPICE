'use client';

/* eslint-disable @next/next/no-img-element -- TMDB artwork URLs are not configured for next/image. */

import { useEffect, useState, type ReactNode } from 'react';

import { PLAYER_IFRAME_SANDBOX } from '@/lib/movie-provider';

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

function DetailShell({
  kind,
  backdropUrl,
  children,
}: {
  kind: 'movie' | 'show' | 'anime';
  backdropUrl?: string | null;
  children: (sessionKey: string, onSignedIn: (token: string) => void) => ReactNode;
}) {
  const session = useWatchSession();
  const back =
    kind === 'anime'
      ? { href: '/anime', label: 'Anime' }
      : kind === 'show'
        ? { href: '/shows', label: 'TV Series' }
        : { href: '/movie', label: 'Movies' };
  const active = kind === 'anime' ? 'anime' : kind === 'show' ? 'shows' : 'movies';
  return (
    <WatchHost>
      <WatchShell active={active} session={session} back={back}>
        <div className={s.detailRoot}>
          {backdropUrl ? (
            <div className={s.detailBackdropBand} aria-hidden="true">
              <img src={backdropUrl} alt="" className={s.detailBackdrop} />
              <div className={s.detailBackdropScrim} />
            </div>
          ) : null}
          <div className={cn(s.page, s.detailPage)}>{children(session.token ?? 'signed-out', session.onSignedIn)}</div>
        </div>
      </WatchShell>
    </WatchHost>
  );
}

function DetailCard({ info }: { info: WatchDetailInfo }) {
  return (
    <header className={s.detailCard}>
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
    </header>
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
      <span className={s.sourcesLabel}>Server</span>
      <Tabs label="Stream source" size="sm" value={activeId} onValueChange={onPick} items={sources.map((source) => ({ value: source.id, label: source.label }))} />
    </div>
  );
}

function AdShieldBadge() {
  return (
    <Badge
      variant="success"
      icon="shield"
      title="Strict iframe sandbox active: popups, new tabs, and page redirects are blocked."
    >
      Ad Shield
    </Badge>
  );
}

function PlayerFrame({ src, title }: { src: string; title: string }) {
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setSlow(true), 7000);
    return () => clearTimeout(timer);
  }, [ready, src]);

  return (
    <div className={s.frame}>
      {!ready ? (
        <div className={s.frameLoading}>
          <Spinner size={20} label="Loading player" />
          <div className={s.frameLoadingText}>
            <span>Loading player…</span>
            {slow ? <span className={s.frameSlowHint}>Taking a while? Try switching servers below.</span> : null}
          </div>
        </div>
      ) : null}
      <iframe
        src={src}
        title={title}
        sandbox={PLAYER_IFRAME_SANDBOX}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="origin"
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
      <PlayerFrame key={sources.activeId} src={sources.activeUrl} title={`${title} player`} />
      <div className={s.sourceBar}>
        <SourceTabs sources={sources.list} activeId={sources.activeId} onPick={sources.pick} />
        <AdShieldBadge />
      </div>
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
    <DetailShell kind="movie" backdropUrl={info.backdropUrl}>
      {(sessionKey, onSignedIn) => (
        <>
          <MoviePlayerV2 tmdbId={tmdbId} title={sync.title} />
          <WatchSyncBar key={sessionKey} kind="movie" tmdbId={tmdbId} onSignedIn={onSignedIn} {...sync} />
          <DetailCard info={info} />
        </>
      )}
    </DetailShell>
  );
}

function ShowPlayerV2({
  kind = 'show',
  info,
  player,
  sessionKey,
  onSignedIn,
}: {
  kind?: 'show' | 'anime';
  info: WatchDetailInfo;
  player: ShowPlayerProps;
  sessionKey: string;
  onSignedIn: (token: string) => void;
}) {
  const show = useShowPlayer(player);
  const { tmdbId, title, posterUrl, year, releaseDate } = player;
  const frameKey = `${show.providerId}:${show.season}:${show.episode}`;
  return (
    <>
      {show.activeUrl ? (
        <PlayerFrame key={frameKey} src={show.activeUrl} title={`${title} S${show.season} E${show.episode} player`} />
      ) : (
        <EmptyState icon={kind === 'anime' ? 'sparkles' : 'tv'} title="No source carries this episode" description="Try another provider." />
      )}

      <div className={s.sourceBar}>
        <SourceTabs sources={show.providerUrls} activeId={show.providerId} onPick={show.pickProvider} />
        <div className={s.sourceBarRight}>
          <AdShieldBadge />
          {show.hasNext ? (
            <Button size="sm" iconRight="arrowRight" onClick={() => show.pickEpisode(show.episode + 1)}>
              Next episode
            </Button>
          ) : null}
        </div>
      </div>

      <WatchSyncBar
        key={sessionKey}
        kind={kind}
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

      {show.current ? (
        <div className={s.episodeNow}>
          <div className={s.episodeNowText}>
            <h2 className={s.episodeNowTitle}>
              S{show.season} E{show.current.episodeNumber} · {show.current.name}
            </h2>
            {show.current.overview ? <p className={s.episodeNowOverview}>{show.current.overview}</p> : null}
          </div>
        </div>
      ) : null}

      <DetailCard info={info} />

      <section className={s.episodes} aria-label="Episodes">
        <div className={s.episodesHeader}>
          <h2 className={s.episodesTitle}>Episodes</h2>
          {show.available.length > 0 ? (
            <Select
              label="Season"
              size="sm"
              value={String(show.season)}
              options={show.available.map((season) => ({ value: String(season.seasonNumber), label: `${season.name} (${season.episodeCount})` }))}
              onChange={(value) => show.selectSeason(Number(value))}
              wrapperClassName={s.seasonSelect}
            />
          ) : null}
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
                  <span className={s.episodeMeta}>
                    <span className={s.episodeName}>
                      E{ep.episodeNumber} · {ep.name}
                    </span>
                    {ep.runtimeMinutes ? <span className={s.episodeRuntime}>{ep.runtimeMinutes} min</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

export function ShowWatchView({ kind = 'show', info, player }: { kind?: 'show' | 'anime'; info: WatchDetailInfo; player: ShowPlayerProps }) {
  return (
    <DetailShell kind={kind} backdropUrl={info.backdropUrl}>
      {(sessionKey, onSignedIn) => <ShowPlayerV2 kind={kind} info={info} player={player} sessionKey={sessionKey} onSignedIn={onSignedIn} />}
    </DetailShell>
  );
}
