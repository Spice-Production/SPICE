import { Pressable, View } from 'react-native';

import { formatMiniDuration, queueLabel } from '../../core/format';
import { useController } from '../context';
import { Artwork, IconButton, Slider, Spinner, Txt } from '../primitives';
import { useActivePlayback } from '../playback';
import { useTheme } from '../theme';

export function MiniPlayer({ onOpen, onDevices }: { onOpen: () => void; onDevices: () => void }) {
  const controller = useController();
  const theme = useTheme();
  const playback = useActivePlayback();
  const { track, player } = playback;
  const duration = player.durationMs > 0 ? player.durationMs : track?.durationMs ?? 0;
  const subtitle = playback.remote && !track
    ? `${playback.device?.displayName ?? 'Spice Connect'} · Choose a track`
    : playback.resolving
      ? 'Resolving stream…'
      : [
          track?.artist ?? '',
          formatMiniDuration(player.positionMs, duration),
          queueLabel(playback.queue.length, playback.queueIndex, true),
        ]
          .filter(Boolean)
          .join(' · ');
  return (
    <View
      style={{
        marginHorizontal: 8,
        marginBottom: 6,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.elevated,
        borderWidth: 1,
        borderColor: theme.border,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={onOpen}
        disabled={!track}
        accessibilityRole="button"
        accessibilityLabel={track ? `Open player for ${track.title}` : 'No active track'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 8, paddingRight: 4, paddingTop: 8, paddingBottom: 4 }}
      >
        <Artwork uri={track?.artworkUrl} size={40} radius={theme.radius.sm} />
        <View style={{ flex: 1, gap: 1 }}>
          <Txt variant="label" lines={1}>
            {track?.title ?? (playback.resolving ? 'Starting playback…' : 'No active track')}
          </Txt>
          <Txt variant="caption" lines={1}>
            {subtitle}
          </Txt>
        </View>
        <IconButton
          icon={playback.remote ? 'cast' : 'speaker'}
          label={`Playback device: ${playback.device?.displayName ?? 'This phone'}`}
          size={36}
          active={playback.remote}
          onPress={onDevices}
        />
        {playback.resolving || player.isBuffering ? (
          <View style={{ width: 40, alignItems: 'center' }}>
            <Spinner />
          </View>
        ) : (
          <IconButton
            icon={player.isPlaying ? 'pause' : 'play'}
            label={player.isPlaying ? 'Pause' : 'Play'}
            filled
            size={40}
            variant="solid"
            iconSize={18}
            disabled={!track}
            onPress={() => controller.togglePlayback()}
          />
        )}
        <IconButton icon="skipForward" label="Next track" filled size={36} iconSize={18} disabled={!track} onPress={() => controller.playNext()} />
      </Pressable>
      <View style={{ paddingHorizontal: 10 }}>
        <Slider
          compact
          label="Playback position"
          value={Math.min(player.positionMs, duration)}
          max={Math.max(duration, 1)}
          disabled={!track || duration <= 0}
          onComplete={(value) => controller.seekTo(Math.round(value))}
        />
      </View>
    </View>
  );
}
