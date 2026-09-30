'use client';

import { useId } from 'react';

import { useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import { Badge, SectionHeader, Stat } from '../../primitives';
import s from '../home.module.css';

function StatValue({ value, unit }: { value: number; unit?: string }) {
  return (
    <>
      {value.toLocaleString()}
      {unit ? <span className={s.statUnit}>{unit}</span> : null}
    </>
  );
}

/** Private, on-device recap of the active profile's listening week. */
export function WeeklyRecap() {
  const m = useSpiceUi();
  const id = useId();
  const recap = m.weeklyListeningRecap;
  if (recap.eventCount <= 0) return null;

  const topArtist = recap.topArtists[0];
  return (
    <section className={s.section} aria-labelledby={id}>
      <SectionHeader
        id={id}
        title="Your listening week"
        action={
          topArtist ? (
            <Badge variant="outline" icon="micVocal" className={s.topArtist} title={`Top artist: ${topArtist.name}`}>
              <span className={s.truncate}>Top artist: {topArtist.name}</span>
            </Badge>
          ) : null
        }
      />
      <div className={s.recapGrid}>
        <Stat className={s.recapStat} label="Minutes listened" value={<StatValue value={recap.creditedMinutes} />} />
        <Stat className={s.recapStat} label="Unique tracks" value={<StatValue value={recap.uniqueTrackCount} />} />
        <Stat className={s.recapStat} label="Discoveries" value={<StatValue value={recap.discoveryPercent} unit="%" />} />
        <Stat className={s.recapStat} label="Longest session" value={<StatValue value={recap.longestSessionMinutes} unit="min" />} />
      </div>
      <p className={s.footnote}>
        <Icon name="lock" size={12} />
        <span>Private, on-device recap for {m.activeProfile.displayName}. Nothing extra is uploaded.</span>
      </p>
    </section>
  );
}
