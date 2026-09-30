import { memo, type ReactNode } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { formatTime, trackSubtitle } from '../core/format';
import type { Playlist, Track } from '../core/models';
import { Icon } from './icons';
import { Artwork, Spinner, Txt } from './primitives';
import { useTheme } from './theme';

export const TrackRow = memo(function TrackRow({
  track,
  onPress,
  active,
  resolving,
  trailing,
  subtitle,
  index,
}: {
  track: Track;
  onPress: () => void;
  active?: boolean;
  resolving?: boolean;
  trailing?: ReactNode;
  subtitle?: string;
  index?: number;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${active ? 'Now playing' : 'Play'} ${track.title} by ${track.artist}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 8,
        paddingHorizontal: 8,
        marginHorizontal: -8,
        borderRadius: theme.radius.md,
        backgroundColor: pressed ? theme.hover : active ? theme.accentSoft : 'transparent',
      })}
    >
      {index !== undefined ? (
        <Txt variant="caption" style={{ width: 20, textAlign: 'center' }} color={active ? theme.accentText : undefined}>
          {index + 1}
        </Txt>
      ) : null}
      <Artwork uri={track.artworkUrl} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label" lines={1} color={active ? theme.accentText : undefined}>
          {track.title}
        </Txt>
        <Txt variant="caption" lines={1}>
          {subtitle ?? trackSubtitle(track)}
        </Txt>
      </View>
      {resolving ? <Spinner /> : null}
      {!resolving && track.durationMs > 0 && !trailing ? <Txt variant="caption">{formatTime(track.durationMs)}</Txt> : null}
      {trailing}
    </Pressable>
  );
});

export const TrackCard = memo(function TrackCard({ track, onPress, width = 148 }: { track: Track; onPress: () => void; width?: number }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Play ${track.title} by ${track.artist}`}
      style={({ pressed }) => ({ width, gap: 8, opacity: pressed ? 0.85 : 1 })}
    >
      <View>
        <Artwork uri={track.artworkUrl} size={width} radius={theme.radius.lg} />
        <View
          style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: theme.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="play" size={14} color={theme.onAccent} filled />
        </View>
      </View>
      <View style={{ gap: 2 }}>
        <Txt variant="label" lines={1}>
          {track.title}
        </Txt>
        <Txt variant="caption" lines={1}>
          {trackSubtitle(track)}
        </Txt>
      </View>
    </Pressable>
  );
});

export function Shelf({
  title,
  tracks,
  onPlay,
  action,
}: {
  title: string;
  tracks: Track[];
  onPlay: (track: Track, queue: Track[]) => void;
  action?: ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 }}>
        <Txt variant="heading" style={{ flex: 1 }} lines={1}>
          {title}
        </Txt>
        {action}
      </View>
      <FlatList
        horizontal
        data={tracks}
        keyExtractor={(track, index) => `${title}:${track.sourceId}:${track.id}:${index}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
        renderItem={({ item }) => <TrackCard track={item} onPress={() => onPlay(item, tracks)} />}
      />
    </View>
  );
}

/** Four-up artwork mosaic from a playlist's first covers, like the web library tiles. */
export function PlaylistCover({ playlist, size }: { playlist: Playlist; size: number }) {
  const theme = useTheme();
  const covers = playlist.tracks.map((track) => track.artworkUrl).filter(Boolean);
  if (playlist.coverUrl) return <Artwork uri={playlist.coverUrl} size={size} fallbackIcon="listMusic" />;
  if (covers.length < 4) return <Artwork uri={covers[0]} size={size} fallbackIcon="listMusic" />;
  const half = size / 2;
  return (
    <View style={{ width: size, height: size, borderRadius: theme.radius.md, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }}>
      {covers.slice(0, 4).map((uri, index) => (
        <Artwork key={`${uri}:${index}`} uri={uri} size={half} radius={0} />
      ))}
    </View>
  );
}
