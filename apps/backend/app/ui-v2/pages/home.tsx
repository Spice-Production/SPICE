'use client';

import { useNavigation } from '../actions';
import { useSpiceUi } from '../context';
import { Button, EmptyState, PageHeader, useIsMobile } from '../primitives';
import { JumpBackIn } from './home/jump-back-in';
import { PlaylistShelf } from './home/playlist-shelf';
import { QuickPicks } from './home/quick-picks';
import { RecommendedSection } from './home/recommended';
import { TrackShelf } from './home/track-shelf';
import { useTimeOfDayGreeting } from './home/use-greeting';
import { WeeklyRecap } from './home/weekly-recap';
import s from './home.module.css';

function listenerCountReason(neighborCount: number) {
  if (neighborCount <= 0) return 'Community favorites from listeners whose taste overlaps yours.';
  const listeners = `${neighborCount} listener${neighborCount === 1 ? '' : 's'}`;
  return `Community favorites from ${listeners} whose taste overlaps yours. Counts only — no one's library is exposed.`;
}

/** First-run home: nothing played or saved yet on this profile. */
function WelcomeEmptyState() {
  const { goTo } = useNavigation();
  return (
    <EmptyState
      icon="headphones"
      title="Pick something to play"
      description="Search for something you love or open your library. Home fills in with your history, weekly recap, and picks as you listen."
      action={
        <div className={s.emptyActions}>
          <Button icon="search" onClick={() => goTo('search')}>
            Search music
          </Button>
          <Button variant="outline" icon="library" onClick={() => goTo('library')}>
            Open library
          </Button>
        </div>
      }
    />
  );
}

export function HomePage() {
  const m = useSpiceUi();
  const isMobile = useIsMobile();
  const greeting = useTimeOfDayGreeting();

  const { recentlyPlayed, forgottenFavorites } = m.homeHistoryShelves;
  const tasteReady = m.privateTasteProfile.isReady;
  const because = m.homeBecauseShelf;
  const listeners = m.listenersLikeYou;
  const timeMix = m.homeTimeMix;
  const onRepeat = m.onRepeatShelf;
  const isNewListener =
    m.customPlaylists.length === 0 &&
    recentlyPlayed.length === 0 &&
    forgottenFavorites.length === 0 &&
    m.weeklyListeningRecap.eventCount <= 0;
  const displayName = m.activeProfile.displayName?.trim();

  return (
    <div className={s.home}>
      <PageHeader
        className={s.greeting}
        title={displayName ? `${greeting}, ${displayName}` : greeting}
        description="Discover, stream, and sync your favorite music across all your devices."
      />

      {isNewListener ? <WelcomeEmptyState /> : <JumpBackIn />}

      <WeeklyRecap />

      <PlaylistShelf />

      {recentlyPlayed.length > 0 ? (
        <TrackShelf
          title="Recently played"
          tracks={recentlyPlayed}
          action={
            <Button variant="ghost" size={isMobile ? 'md' : 'sm'} aria-label="Clear recently played" onClick={m.clearHistory}>
              Clear
            </Button>
          }
        />
      ) : null}

      {forgottenFavorites.length > 0 ? (
        <TrackShelf
          title="Forgotten favorites"
          description="Songs you played a lot that you have not come back to lately."
          tracks={forgottenFavorites}
        />
      ) : null}

      <RecommendedSection />

      {tasteReady && because && because.tracks.length > 0 ? (
        <TrackShelf title={because.label} description={because.reason} tracks={because.tracks} recommendation />
      ) : null}

      {listeners && listeners.tracks.length > 0 ? (
        <TrackShelf
          title="Listeners like you"
          description={listenerCountReason(listeners.neighborCount)}
          tracks={listeners.tracks}
          recommendation
        />
      ) : null}

      {tasteReady && timeMix && timeMix.tracks.length > 0 ? (
        <TrackShelf title={timeMix.label} description={timeMix.reason} tracks={timeMix.tracks} recommendation />
      ) : null}

      {tasteReady && m.homeFreshFinds.length >= 3 ? (
        <TrackShelf
          title="Fresh finds"
          description="Artists you have not played yet, picked near this profile's taste and rotated daily."
          tracks={m.homeFreshFinds}
          recommendation
        />
      ) : null}

      {onRepeat && onRepeat.tracks.length > 0 ? (
        <TrackShelf title={onRepeat.label} description={onRepeat.reason} tracks={onRepeat.tracks} />
      ) : null}

      {tasteReady
        ? m.homeRecommendationShelves.map((shelf) => (
            <TrackShelf
              key={shelf.seed.id}
              title={shelf.seed.label}
              description={shelf.seed.reason}
              tracks={shelf.tracks}
              recommendation
            />
          ))
        : null}

      <QuickPicks />
    </div>
  );
}
