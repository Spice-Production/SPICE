import { useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { deviceStatus } from '../../core/connect';
import { activeTimedLyricIndex, cleanLyricLine, parseTimedLyrics } from '../../core/lyrics';
import type { Track } from '../../core/models';
import { useController, useSpice } from '../context';
import { Icon } from '../icons';
import { TrackRow } from '../media';
import { Badge, Button, EmptyState, IconButton, Sheet, Spinner, Txt } from '../primitives';
import { useActivePlayback } from '../playback';
import { useTheme } from '../theme';

export function QueueSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const controller = useController();
  const playback = useActivePlayback();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Queue"
      subtitle={playback.remote ? `Playing on ${playback.device?.displayName ?? 'receiver'}` : 'Playing on this phone'}
      fullHeight
      scroll={false}
    >
      {playback.queue.length === 0 ? (
        <EmptyState icon="listMusic" title="The queue is empty" body="Play a playlist, album shelf, or search results to build a queue." />
      ) : (
        <FlatList
          data={playback.queue}
          keyExtractor={(track, index) => `${track.sourceId}:${track.id}:${index}`}
          initialScrollIndex={Math.max(0, Math.min(playback.queueIndex, playback.queue.length - 1))}
          getItemLayout={(_, index) => ({ length: 64, offset: 64 * index, index })}
          renderItem={({ item, index }) => (
            <View style={{ height: 64, justifyContent: 'center' }}>
              <TrackRow
                track={item}
                index={index}
                active={index === playback.queueIndex}
                onPress={() => {
                  controller.play(item, playback.queue, index);
                  onClose();
                }}
              />
            </View>
          )}
        />
      )}
    </Sheet>
  );
}

export function LyricsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const playback = useActivePlayback();
  const { loading, lyrics } = useSpice((state) => ({ loading: state.lyricsLoading, lyrics: state.lyricsPayload }));
  const lines = useMemo(() => parseTimedLyrics(lyrics?.syncedLyrics), [lyrics?.syncedLyrics]);
  const active = activeTimedLyricIndex(lines, playback.player.positionMs);
  const list = useRef<FlatList>(null);
  useEffect(() => {
    if (active >= 0) list.current?.scrollToIndex({ index: active, viewPosition: 0.35, animated: true });
  }, [active]);
  const plain = (lyrics?.plainLyrics.trim() ? lyrics.plainLyrics : lyrics?.syncedLyrics ?? '')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map(cleanLyricLine);
  const track = playback.track;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Lyrics"
      subtitle={track ? `${track.title} · ${track.artist}` : undefined}
      fullHeight
      scroll={false}
    >
      {loading ? (
        <View style={{ paddingVertical: 48, alignItems: 'center' }}>
          <Spinner size="large" />
        </View>
      ) : lines.length > 0 ? (
        <FlatList
          ref={list}
          data={lines}
          keyExtractor={(line, index) => `${line.timeMs}:${index}`}
          onScrollToIndexFailed={() => undefined}
          contentContainerStyle={{ paddingVertical: 24, gap: 6 }}
          renderItem={({ item, index }) => (
            <Txt
              variant={index === active ? 'title' : 'heading'}
              color={index === active ? theme.fg : theme.fgSubtle}
              style={{ paddingVertical: 4 }}
            >
              {item.text || '♪'}
            </Txt>
          )}
        />
      ) : plain.length > 0 ? (
        <FlatList
          data={plain}
          keyExtractor={(line, index) => `${index}:${line}`}
          contentContainerStyle={{ paddingVertical: 16, gap: 6 }}
          renderItem={({ item }) => <Txt variant="heading">{item}</Txt>}
        />
      ) : (
        <EmptyState icon="micVocal" title="No lyrics found" body="LRCLIB has no lyrics for this track yet." />
      )}
    </Sheet>
  );
}

export function DevicesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const controller = useController();
  const theme = useTheme();
  const state = useSpice((s) => ({
    devices: s.remoteDevices,
    selected: s.selectedPlaybackDeviceId,
    self: s.remoteDeviceId,
    loading: s.connectLoading,
    enabled: s.spiceConnectEnabled,
    hasAccess: s.accountSession !== null || s.pairedDeviceCredential !== null,
    incoming: s.incomingRemoteControllerDeviceId,
    status: s.connectStatus,
  }));
  useEffect(() => {
    if (visible && state.enabled && state.hasAccess) controller.refreshSpiceConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const targets = state.devices.filter((device) => device.deviceId !== state.self);
  const controllerDevice = targets.find((device) => device.deviceId === state.incoming && device.isOnline);
  const row = (options: { key: string; title: string; subtitle: string; selected: boolean; onPress: () => void; icon: 'smartphone' | 'monitor'; trailing?: React.ReactNode }) => (
    <Pressable
      key={options.key}
      onPress={options.onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: options.selected ? theme.accent : theme.border,
        backgroundColor: options.selected ? theme.accentSoft : pressed ? theme.hover : 'transparent',
      })}
    >
      <Icon name={options.icon} size={20} color={options.selected ? theme.accentText : theme.fgMuted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label" lines={1}>
          {options.title}
        </Txt>
        <Txt variant="caption" lines={1}>
          {options.subtitle}
        </Txt>
      </View>
      {options.selected ? <Icon name="check" size={18} color={theme.accentText} /> : null}
      {options.trailing}
    </Pressable>
  );
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Spice Connect"
      subtitle="Choose where playback and controls go."
      headerRight={state.loading ? <Spinner /> : state.enabled && state.hasAccess ? <IconButton icon="refresh" label="Refresh devices" onPress={() => controller.refreshSpiceConnect()} /> : undefined}
    >
      {row({
        key: 'self',
        title: 'This phone',
        subtitle: controllerDevice ? `Controlled by ${controllerDevice.displayName}` : 'Play and control locally',
        selected: !state.selected,
        icon: 'smartphone',
        onPress: () => {
          controller.selectPlaybackDevice(null);
          onClose();
        },
      })}
      {!state.enabled ? (
        <View style={{ gap: 10 }}>
          <Txt variant="caption">Spice Connect is off on this phone. Turn it on to control your desktop or let it control this phone.</Txt>
          <Button label="Turn on Spice Connect" icon="cast" variant="primary" onPress={() => controller.setSpiceConnectEnabled(true)} />
        </View>
      ) : !state.hasAccess ? (
        <Txt variant="caption">Sign in or pair this phone in Settings to see your Spice devices.</Txt>
      ) : targets.length === 0 ? (
        <Txt variant="caption">{state.loading ? 'Looking for devices…' : 'No other devices yet. Open SPICE on your desktop or the web with the same account.'}</Txt>
      ) : (
        targets.map((device) =>
          row({
            key: device.deviceId,
            title: device.displayName,
            subtitle: deviceStatus(device.isOnline, device.isPlaying, device.lastSeenSeconds, device.currentTrack?.title ?? null),
            selected: state.selected === device.deviceId,
            icon: 'monitor',
            onPress: () => {
              controller.selectPlaybackDevice(device.deviceId);
              onClose();
            },
            trailing: (
              <IconButton icon="x" label={`Forget ${device.displayName}`} size={32} onPress={() => controller.forgetSpiceConnectDevice(device.deviceId)} />
            ),
          }),
        )
      )}
      {state.enabled && state.status ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Badge label="Cloud" />
          <Txt variant="caption" style={{ flex: 1 }}>
            {state.status}
          </Txt>
        </View>
      ) : null}
    </Sheet>
  );
}

export function PlaylistPickerSheet({ track, onClose }: { track: Track | null; onClose: () => void }) {
  const controller = useController();
  const theme = useTheme();
  const playlists = useSpice((state) => state.playlists);
  return (
    <Sheet visible={track !== null} onClose={onClose} title="Save to playlist" subtitle={track?.title}>
      <Button
        label="New playlist"
        icon="plus"
        variant="outline"
        onPress={() => {
          if (!track) return;
          const playlist = controller.createPlaylist();
          controller.addTrackToPlaylist(playlist.id, track);
          onClose();
        }}
      />
      {playlists.map((playlist) => {
        const canAdd = !playlist.shared || playlist.shareRole === 'owner' || playlist.shareRole === 'editor';
        const saved = !!track && playlist.tracks.some((entry) => entry.id === track.id && entry.sourceId === track.sourceId);
        return (
          <Pressable
            key={playlist.id}
            disabled={!canAdd || saved}
            onPress={() => {
              if (!track) return;
              controller.addTrackToPlaylist(playlist.id, track);
              onClose();
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 10,
              borderRadius: theme.radius.md,
              backgroundColor: pressed ? theme.hover : 'transparent',
              opacity: !canAdd || saved ? 0.5 : 1,
            })}
          >
            <Icon name={saved ? 'checkCircle' : 'listMusic'} size={20} color={saved ? theme.success : theme.fgMuted} />
            <View style={{ flex: 1 }}>
              <Txt variant="label" lines={1}>
                {playlist.title}
              </Txt>
              <Txt variant="caption">{saved ? 'Saved' : canAdd ? `${playlist.tracks.length} tracks` : 'View-only shared playlist'}</Txt>
            </View>
          </Pressable>
        );
      })}
    </Sheet>
  );
}

export function TrackActionsSheet({
  track,
  onClose,
  onSaveToPlaylist,
}: {
  track: Track | null;
  onClose: () => void;
  onSaveToPlaylist: (track: Track) => void;
}) {
  const controller = useController();
  const liked = useSpice((state) => (track ? state.likedTracks.some((entry) => entry.id === track.id) : false));
  const action = (label: string, icon: 'heart' | 'listPlus' | 'download' | 'play', run: () => void, filled?: boolean) => (
    <Button key={label} label={label} icon={icon} variant="ghost" onPress={run} style={{ justifyContent: 'flex-start' }} accessibilityLabel={label} />
  );
  return (
    <Sheet visible={track !== null} onClose={onClose} title={track?.title} subtitle={track?.artist}>
      {track ? (
        <View style={{ gap: 4 }}>
          {action('Play now', 'play', () => {
            controller.play(track);
            onClose();
          })}
          {action(liked ? 'Remove from Liked' : 'Add to Liked', 'heart', () => {
            void controller.toggleLike(track);
            onClose();
          })}
          {action('Save to playlist', 'listPlus', () => {
            onClose();
            onSaveToPlaylist(track);
          })}
          {action('Download', 'download', () => {
            controller.downloadTrack(track);
            onClose();
          })}
        </View>
      ) : null}
    </Sheet>
  );
}
