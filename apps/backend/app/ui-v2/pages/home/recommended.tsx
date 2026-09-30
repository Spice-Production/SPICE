'use client';

import { useEffect, useId, useRef } from 'react';

import { DEFAULT_RECOMMENDATION_PREFERENCES } from '../../../recommendation-preferences';
import { useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Popover,
  Progress,
  SectionHeader,
  Separator,
  Slider,
  useIsMobile,
} from '../../primitives';
import s from '../home.module.css';
import { TrackShelf } from './track-shelf';

/** Evidence units the taste profile needs before it is considered learned. */
const TASTE_EVIDENCE_TARGET = 6;

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

/** Shown until the private taste profile has enough meaningful listening. */
function TasteLearning() {
  const m = useSpiceUi();
  const id = useId();
  const profile = m.privateTasteProfile;
  const needed = Math.max(1, profile.signalsNeeded);
  const learned = profile.evidenceTrackCount;
  const percent = Math.min(100, Math.round((profile.evidenceUnits / TASTE_EVIDENCE_TARGET) * 100));
  return (
    <section className={s.section} aria-labelledby={id}>
      <SectionHeader id={id} title="Recommended next" description={`Learns separately for ${m.activeProfile.displayName}`} />
      <Card className={s.learning}>
        <span className={s.learningIcon} aria-hidden="true">
          <Icon name="sparkles" size={18} />
        </span>
        <div className={s.learningBody}>
          <h3 className={s.learningTitle}>Your taste is still warming up</h3>
          <p className={s.learningText}>
            Listen through or like {needed} more {plural(needed, 'song')} so SPICE can find patterns that last. Quick skips
            barely count, and one song will not reshape this profile.
          </p>
          <div className={s.learningProgress}>
            <Progress value={percent} label="Taste profile learning progress" className={s.learningBar} />
            <span className={s.learningStatus}>
              {learned} meaningful {plural(learned, 'track')} learned
            </span>
          </div>
        </div>
      </Card>
    </section>
  );
}

/**
 * Panel body of the tuner. The popover portals away from its trigger, so this
 * moves focus to the slider on open and hands it back to the trigger on close.
 */
function TunerPanel() {
  const m = useSpiceUi();
  const sliderRef = useRef<HTMLInputElement>(null);
  const level = m.recommendationPreferences.discoveryLevel;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // The popover is hidden for its first measuring pass, so focus on the next frame.
    const frame = requestAnimationFrame(() => sliderRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className={s.tune}>
      <div className={s.tuneHeader}>
        <p className={s.tuneTitle}>Discovery</p>
        <span className={s.tuneValue}>{level}</span>
      </div>
      <p className={s.tuneText}>Lean toward artists you already play, or toward new finds near your taste.</p>
      <Slider
        ref={sliderRef}
        value={level}
        min={0}
        max={100}
        step={5}
        accent
        showThumb
        label="Recommendation discovery level"
        valueText={`${level} of 100`}
        onValueChange={(value) =>
          m.persistRecommendationPreferences({
            ...m.recommendationPreferences,
            discoveryLevel: value,
          })
        }
      />
      <div className={s.tuneScale} aria-hidden="true">
        <span>Familiar</span>
        <span>Discover</span>
      </div>
      <Separator className={s.tuneSeparator} />
      <div className={s.tuneReset}>
        <p className={s.tuneText}>Restore the default mix and clear hidden tracks, dislikes, and snoozed artists.</p>
        <Button
          variant="outline"
          size="sm"
          icon="rotateCcw"
          onClick={() => m.persistRecommendationPreferences(DEFAULT_RECOMMENDATION_PREFERENCES)}
        >
          Reset feedback
        </Button>
      </div>
    </div>
  );
}

/** Familiar ↔ Discover slider and the feedback reset, tucked into a popover. */
function DiscoveryTuner({ compact }: { compact: boolean }) {
  return (
    <Popover
      label="Tune recommendations"
      align="end"
      width={300}
      trigger={(props) =>
        compact ? (
          <IconButton {...props} icon="sliders" label="Tune recommendations" />
        ) : (
          <Button {...props} variant="outline" size="sm" icon="sliders">
            Tune
          </Button>
        )
      }
    >
      <TunerPanel />
    </Popover>
  );
}

function RecommendationActions() {
  const m = useSpiceUi();
  const isMobile = useIsMobile();
  const seed = m.homeRecommendationSeed;
  const openSeedSearch = () => {
    if (!seed) return;
    m.openCommandPage('search');
    m.setSearchQuery(seed.query);
    m.queueSearch(seed.query);
  };
  return (
    <div className={s.headerActions}>
      {seed ? (
        isMobile ? (
          <IconButton icon="search" label={`Search for ${seed.query}`} onClick={openSeedSearch} />
        ) : (
          <Button variant="ghost" size="sm" icon="search" title={`Search for ${seed.query}`} onClick={openSeedSearch}>
            Open in Search
          </Button>
        )
      ) : null}
      <DiscoveryTuner compact={isMobile} />
    </div>
  );
}

/**
 * "Recommended next": the learning state until the private taste profile is
 * ready, then the profile's mix with discovery tuning and per-card feedback.
 */
export function RecommendedSection() {
  const m = useSpiceUi();
  if (!m.privateTasteProfile.isReady) return <TasteLearning />;

  const tracks = m.homeRecommended;
  return (
    <TrackShelf
      title={
        <span className={s.titleWithBadge}>
          Recommended next
          <Badge variant="secondary">{m.activeProfile.displayName}&apos;s mix</Badge>
        </span>
      }
      description="Balanced from this profile's meaningful plays, likes, artists, albums, and playlist themes."
      action={<RecommendationActions />}
      tracks={tracks}
      recommendation
      loading={m.isLoadingRecommendations && tracks.length === 0}
      loadingLabel="Loading recommendations"
      emptyState={
        <EmptyState
          icon="sparkles"
          title="Nothing to recommend right now"
          description="Try a different discovery level, or check back after a few more listens."
        />
      }
    />
  );
}
