'use client';

import { useSyncExternalStore } from 'react';

import { listeningBucketForHour, type ListeningTimeBucket } from '../../../listening-context';

const GREETINGS: Record<ListeningTimeBucket, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  lateNight: 'Good evening',
};

// Re-check the clock once a minute so the greeting follows the day.
const subscribe = (onChange: () => void) => {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
};

const readBucket = (): ListeningTimeBucket | null => listeningBucketForHour(new Date().getHours());
const readServerBucket = (): ListeningTimeBucket | null => null;

/** "Good morning" / "Good afternoon" / "Good evening" for the local clock. */
export function useTimeOfDayGreeting() {
  const bucket = useSyncExternalStore(subscribe, readBucket, readServerBucket);
  return bucket ? GREETINGS[bucket] : 'Welcome back';
}
