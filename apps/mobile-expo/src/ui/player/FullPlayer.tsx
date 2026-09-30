import { useState } from 'react';
import { Modal, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatTime, queueLabel, sourceLabel } from '../../core/format';
import type { Track } from '../../core/models';
import { useController, useSpice } from '../context';
import { Icon } from '../icons';
import { Artwork, Button, Dialog, IconButton, Slider, Spinner, Txt } from '../primitives';
import { useActivePlayback } from '../playback';
import { useTheme } from '../theme';

export function FullPlayer({
  visible,
  onClose,
  onQueue,
  onLyrics,
  onDevices,
  onSaveToPlaylist,
}: {
  visible: boolean;
  onClose: () => void;
  onQueue: () => void;
  onLyrics: () => void;
  onDevices: () => void;
  onSaveToPlaylist: (track: Track) => void;
}) {
  const controller = useController();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const playback = useActivePlayback();
  const { track, player } = playback;
  const extra = useSpice((state) => ({
    liked: track ? state.likedTracks.some((entry) => entry.id === track.id) : false,
    downloadTrackId: state.downloadTrackId,
    downloadProgress: state.downloadProgress,
    hasLocalTrack: state.currentTrack !== null,
  }));
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const [askDownloadTarget, setAskDownloadTarget] = useState(false);
  if (!visible || !track) return null;

  const duration = player.durationMs > 0 ? player.durationMs : track.durationMs;
  const artSize = Math.min(width - 48, height * 0.42, 420);
  const downloading = extra.downloadTrackId === track.id;
  const shown = scrubbing ?? Math.min(player.positionMs, duration);
  const receiverName = playback.device?.displayName ?? 'the receiver';

  return (
    <Modal visible transparent={false} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 52 }}>
          <IconButton icon="chevronDown" label="Close player" onPress={onClose} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Txt variant="eyebrow">{playback.remote ? `Playing on ${receiverName}` : 'Now playing'}</Txt>
            <Txt variant="caption" lines={1}>
              {queueLabel(playback.queue.length, playback.queueIndex) || sourceLabel(track)}
            </Txt>
          </View>
          <IconButton icon="listMusic" label="Open queue" onPress={onQueue} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16, gap: 20, flexGrow: 1, justifyContent: 'center' }}>
          <View style={{ alignItems: 'center' }}>
            <Artwork uri={track.artworkUrl} size={artSize} radius={theme.radius.xl} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt variant="title" lines={2}>
                {track.title}
              </Txt>
              <Txt muted lines={1}>
                {track.artist}
              </Txt>
            </View>
            <IconButton
              icon="heart"
              label={extra.liked ? 'Remove from Liked' : 'Like'}
              filled={extra.liked}
              color={extra.liked ? theme.accent : undefined}
              onPress={() => void controller.toggleLike(track)}
            />
          </View>

          <View style={{ gap: 2 }}>
            <Slider
              label="Playback position"
              value={shown}
              max={Math.max(duration, 1)}
              disabled={duration <= 0}
              onChange={setScrubbing}
              onComplete={(value) => {
                setScrubbing(null);
                controller.seekTo(Math.round(value));
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt variant="caption">{formatTime(shown)}</Txt>
              <Txt variant="caption">{duration > 0 ? formatTime(duration) : '--:--'}</Txt>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <IconButton icon="shuffle" label="Shuffle" active={player.shuffleEnabled} onPress={() => controller.toggleShuffle()} />
            <IconButton icon="skipBack" label="Previous track" filled size={52} iconSize={26} onPress={() => controller.playPrevious()} />
            {playback.resolving || player.isBuffering ? (
              <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
                <Spinner size="large" />
              </View>
            ) : (
              <IconButton
                icon={player.isPlaying ? 'pause' : 'play'}
                label={player.isPlaying ? 'Pause' : 'Play'}
                filled
                size={72}
                iconSize={30}
                variant="accent"
                onPress={() => controller.togglePlayback()}
              />
            )}
            <IconButton icon="skipForward" label="Next track" filled size={52} iconSize={26} onPress={() => controller.playNext()} />
            <IconButton
              icon={player.repeatMode === 'One' ? 'repeatOne' : 'repeat'}
              label={`Repeat: ${player.repeatMode}`}
              active={player.repeatMode !== 'Off'}
              onPress={() => controller.cycleRepeat()}
            />
          </View>

          {playback.remote ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="volumeLow" size={18} color={theme.fgMuted} />
              <View style={{ flex: 1 }}>
                <Slider
                  label={`${receiverName} volume`}
                  value={player.volume}
                  max={100}
                  disabled={playback.device?.isOnline === false}
                  onComplete={(value) => controller.setRemoteVolume(value)}
                  onChange={(value) => controller.setRemoteVolume(value)}
                />
              </View>
              <Txt variant="caption" style={{ width: 36, textAlign: 'right' }}>
                {Math.round(player.volume)}%
              </Txt>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <IconButton icon={playback.remote ? 'cast' : 'speaker'} label="Playback device" active={playback.remote} onPress={onDevices} />
            <IconButton icon="micVocal" label="Lyrics" onPress={onLyrics} />
            <IconButton icon="listPlus" label="Save to playlist" onPress={() => onSaveToPlaylist(track)} />
            <IconButton
              icon="download"
              label="Download audio"
              loading={downloading}
              onPress={() => (playback.remote ? setAskDownloadTarget(true) : controller.downloadTrack(track))}
            />
            <IconButton
              icon="x"
              label={playback.remote ? 'Pause receiver' : 'Stop playback'}
              onPress={() => {
                controller.stopPlayback();
                if (!playback.remote) onClose();
              }}
            />
          </View>

          {downloading && extra.downloadProgress ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt variant="caption" style={{ flex: 1 }}>
                {extra.downloadProgress}
              </Txt>
              <Button label="Cancel" size="sm" variant="ghost" onPress={() => controller.cancelDownload()} />
            </View>
          ) : null}

          {playback.remote && playback.device && extra.hasLocalTrack ? (
            <Button
              label={`Move phone playback to ${playback.device.displayName}`}
              icon="cast"
              variant="outline"
              onPress={() => controller.handoffPlaybackToSelectedDevice()}
            />
          ) : null}
        </ScrollView>
      </View>

      <Dialog
        visible={askDownloadTarget}
        title="Where should Spice download it?"
        onClose={() => setAskDownloadTarget(false)}
        actions={
          <>
            <Button
              label={playback.device?.displayName ?? 'Receiver'}
              variant="outline"
              size="sm"
              onPress={() => {
                setAskDownloadTarget(false);
                controller.downloadTrackOnSelectedReceiver(track);
              }}
            />
            <Button
              label="This phone"
              variant="primary"
              size="sm"
              onPress={() => {
                setAskDownloadTarget(false);
                controller.downloadTrack(track);
              }}
            />
          </>
        }
      >
        <Txt muted>
          Save {track.title} on this phone or ask {receiverName} to download it.
        </Txt>
      </Dialog>
    </Modal>
  );
}
