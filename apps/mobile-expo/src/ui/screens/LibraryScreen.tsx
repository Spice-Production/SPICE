import { FlatList, Pressable, View } from 'react-native';

import { formatBytes } from '../../core/format';
import { LIBRARY_TABS, type DownloadedTrack, type Playlist, type Track } from '../../core/models';
import { useController, useSpice } from '../context';
import { Icon } from '../icons';
import { PlaylistCover, TrackRow } from '../media';
import { Artwork, Badge, Button, Card, EmptyState, IconButton, Segmented, Spinner, Txt } from '../primitives';
import { useTheme } from '../theme';

export function LibraryScreen({
  bottomInset,
  onOpenPlaylist,
  onTrackMenu,
}: {
  bottomInset: number;
  onOpenPlaylist: (playlist: Playlist) => void;
  onTrackMenu: (track: Track) => void;
}) {
  const controller = useController();
  const tab = useSpice((state) => state.libraryTab);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Txt variant="display" style={{ flex: 1 }}>
            Library
          </Txt>
          <Button label="New" icon="plus" size="sm" variant="secondary" onPress={() => controller.createPlaylist()} />
        </View>
        <Segmented options={LIBRARY_TABS.map((id) => ({ id, label: id }))} value={tab} onChange={(next) => controller.setLibraryTab(next)} />
      </View>
      {tab === 'Playlists' ? (
        <PlaylistList bottomInset={bottomInset} onOpen={onOpenPlaylist} />
      ) : tab === 'Downloads' ? (
        <DownloadList bottomInset={bottomInset} />
      ) : (
        <TrackList tab={tab} bottomInset={bottomInset} onTrackMenu={onTrackMenu} />
      )}
    </View>
  );
}

function PlaylistList({ bottomInset, onOpen }: { bottomInset: number; onOpen: (playlist: Playlist) => void }) {
  const controller = useController();
  const theme = useTheme();
  const { playlists, downloadPlaylistId, completed, total } = useSpice((state) => ({
    playlists: state.playlists,
    downloadPlaylistId: state.downloadPlaylistId,
    completed: state.downloadPlaylistCompleted,
    total: state.downloadPlaylistTotal,
  }));
  if (playlists.length === 0) {
    return (
      <EmptyState
        icon="listMusic"
        title="No playlists yet"
        body="Create a playlist on this phone, then sync it to your Spice account."
        actionLabel="Create playlist"
        onAction={() => controller.createPlaylist()}
      />
    );
  }
  return (
    <FlatList
      data={playlists}
      keyExtractor={(playlist) => playlist.id}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomInset + 24, gap: 4 }}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onOpen(item)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.title}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 8,
            marginHorizontal: -8,
            borderRadius: theme.radius.md,
            backgroundColor: pressed ? theme.hover : 'transparent',
          })}
        >
          <PlaylistCover playlist={item} size={56} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="label" lines={1}>
              {item.title}
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt variant="caption">
                {downloadPlaylistId === item.id
                  ? `Downloading ${completed}/${total}`
                  : `${item.tracks.length} ${item.tracks.length === 1 ? 'track' : 'tracks'}`}
              </Txt>
              {item.shared ? <Badge label={item.shareRole ? `Shared · ${item.shareRole}` : 'Shared'} tone="accent" /> : null}
            </View>
          </View>
          <IconButton
            icon="play"
            label={`Play ${item.title}`}
            filled
            size={36}
            variant="surface"
            disabled={item.tracks.length === 0}
            onPress={() => item.tracks[0] && controller.play(item.tracks[0], item.tracks)}
          />
        </Pressable>
      )}
    />
  );
}

function TrackList({ tab, bottomInset, onTrackMenu }: { tab: 'Liked' | 'History'; bottomInset: number; onTrackMenu: (track: Track) => void }) {
  const controller = useController();
  const { tracks, currentId, resolvingTrackId } = useSpice((state) => ({
    tracks: tab === 'Liked' ? state.likedTracks : state.historyTracks,
    currentId: state.currentTrack?.id ?? null,
    resolvingTrackId: state.resolvingTrackId,
  }));
  if (tracks.length === 0) {
    return (
      <EmptyState
        icon={tab === 'Liked' ? 'heart' : 'history'}
        title={tab === 'Liked' ? 'No liked tracks' : 'No listening history'}
        body="Play or like a track to add it here."
      />
    );
  }
  return (
    <FlatList
      data={tracks}
      keyExtractor={(track, index) => `${track.sourceId}:${track.id}:${index}`}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomInset + 24 }}
      ListHeaderComponent={
        <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 8 }}>
          <Button label="Play" icon="play" variant="primary" size="sm" onPress={() => tracks[0] && controller.play(tracks[0], tracks)} />
          <Txt variant="caption" style={{ alignSelf: 'center' }}>
            {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
          </Txt>
        </View>
      }
      renderItem={({ item }) => (
        <TrackRow
          track={item}
          active={item.id === currentId}
          resolving={item.id === resolvingTrackId}
          onPress={() => controller.play(item, tracks)}
          trailing={<IconButton icon="moreVertical" label={`More for ${item.title}`} size={32} onPress={() => onTrackMenu(item)} />}
        />
      )}
    />
  );
}

function DownloadList({ bottomInset }: { bottomInset: number }) {
  const controller = useController();
  const theme = useTheme();
  const { downloads, activeTrackId, progress } = useSpice((state) => ({
    downloads: state.downloads,
    activeTrackId: state.downloadTrackId,
    progress: state.downloadProgress,
  }));
  if (downloads.length === 0 && !activeTrackId) {
    return (
      <EmptyState
        icon="download"
        title="No downloads yet"
        body="Use the download button in the full player or on a playlist. Saved tracks play here without a connection."
      />
    );
  }
  const queue = downloads.map((download) => download.track);
  return (
    <FlatList
      data={downloads}
      keyExtractor={(download) => download.id}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomInset + 24, gap: 10 }}
      ListHeaderComponent={
        activeTrackId ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Spinner />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="label">Download in progress</Txt>
              <Txt variant="caption" lines={2}>
                {progress || 'Preparing download...'}
              </Txt>
            </View>
            <Button label="Cancel" size="sm" variant="ghost" onPress={() => controller.cancelDownload()} />
          </Card>
        ) : null
      }
      renderItem={({ item }) => <DownloadRow download={item} onPlay={() => controller.play(item.track, queue)} themeHover={theme.hover} />}
    />
  );
}

function DownloadRow({ download, onPlay, themeHover }: { download: DownloadedTrack; onPlay: () => void; themeHover: string }) {
  const controller = useController();
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPlay}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 8,
        marginHorizontal: -8,
        borderRadius: theme.radius.md,
        backgroundColor: pressed ? themeHover : 'transparent',
      })}
    >
      <View>
        <Artwork uri={download.track.artworkUrl} size={48} />
        <View
          style={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: theme.success,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: theme.bg,
          }}
        >
          <Icon name="check" size={10} color="#ffffff" strokeWidth={3} />
        </View>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label" lines={1}>
          {download.track.title}
        </Txt>
        <Txt variant="caption" lines={1}>
          {download.track.artist} · {formatBytes(download.bytes)}
        </Txt>
      </View>
      <IconButton icon="externalLink" label="Open" size={32} onPress={() => void controller.openDownload(download)} />
      <IconButton icon="share" label="Share" size={32} onPress={() => void controller.shareDownload(download)} />
      <IconButton icon="trash" label="Remove download" size={32} onPress={() => controller.removeDownload(download)} />
    </Pressable>
  );
}
