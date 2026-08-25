export interface FallbackArtist {
  name?: string;
}

export interface FallbackTrack {
  id: string;
  title: string;
  artists?: readonly FallbackArtist[];
  durationMs?: number;
  sourceId?: string;
  previewOnly?: boolean;
}

export const FALLBACK_DURATION_TOLERANCE_MS = 4000;
export const FALLBACK_CANDIDATES_PER_SOURCE = 3;

export const isFallbackSoundCloudTrack = (track: FallbackTrack) =>
  track.sourceId === 'soundcloud' || track.id.startsWith('soundcloud:');

export const isFallbackYouTubeTrack = (track: FallbackTrack) =>
  track.sourceId === 'youtube_music'
  || track.sourceId === 'youtube_video'
  || (!track.sourceId && !isFallbackSoundCloudTrack(track));

export const fallbackSoundCloudTrackId = (track: FallbackTrack) =>
  track.id.startsWith('soundcloud:') ? track.id.slice('soundcloud:'.length) : track.id;

export const fallbackSearchQuery = (track: FallbackTrack) =>
  [
    track.title,
    track.artists?.map((entry) => entry.name).filter(Boolean).join(', '),
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .trim();

export const durationWithinFallbackTolerance = (
  candidate: FallbackTrack,
  requested: FallbackTrack,
) => {
  if (!candidate.durationMs || !requested.durationMs) return true;
  return Math.abs(candidate.durationMs - requested.durationMs) <= FALLBACK_DURATION_TOLERANCE_MS;
};

export const youTubeFallbackCandidates = <TTrack extends FallbackTrack>(
  requested: FallbackTrack,
  candidates: readonly TTrack[],
): TTrack[] =>
  candidates.filter((candidate) =>
    isFallbackYouTubeTrack(candidate)
    && candidate.id !== requested.id
    && !candidate.previewOnly
    && Boolean(candidate.title)
    && durationWithinFallbackTolerance(candidate, requested));

export const soundCloudFallbackCandidates = <TTrack extends FallbackTrack>(
  requested: FallbackTrack,
  candidates: readonly TTrack[],
): TTrack[] =>
  candidates.filter((candidate) =>
    isFallbackSoundCloudTrack(candidate)
    && fallbackSoundCloudTrackId(candidate) !== (
      isFallbackSoundCloudTrack(requested) ? fallbackSoundCloudTrackId(requested) : ''
    )
    && !candidate.previewOnly
    && durationWithinFallbackTolerance(candidate, requested));

export const rankFallbackCandidates = <TTrack extends FallbackTrack>(
  requested: FallbackTrack,
  youTubeResults: readonly TTrack[],
  soundCloudResults: readonly TTrack[],
): TTrack[] => [
  ...youTubeFallbackCandidates(requested, youTubeResults).slice(0, FALLBACK_CANDIDATES_PER_SOURCE),
  ...soundCloudFallbackCandidates(requested, soundCloudResults).slice(0, FALLBACK_CANDIDATES_PER_SOURCE),
];
