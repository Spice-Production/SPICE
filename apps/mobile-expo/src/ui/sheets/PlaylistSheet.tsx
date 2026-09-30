import { useState } from 'react';
import { View } from 'react-native';

import { memberInitials } from '../../core/format';
import type { Playlist } from '../../core/models';
import { useController, useSpice } from '../context';
import { PlaylistCover, TrackRow } from '../media';
import { Avatar, Badge, Button, Dialog, Divider, IconButton, Input, SectionHeader, Sheet, Spinner, Txt } from '../primitives';

/** Playlist detail: play, share, download, tracks, and member management. */
export function PlaylistSheet() {
  const controller = useController();
  const state = useSpice((s) => ({
    playlist: s.activeMemberPlaylist,
    livePlaylist: s.activeMemberPlaylist ? s.playlists.find((entry) => entry.id === s.activeMemberPlaylist?.id) ?? null : null,
    members: s.playlistMembers,
    shared: s.sharedPlaylistTracks,
    loading: s.membersLoading,
    actionLoading: s.memberActionLoading,
    trackLoading: s.sharedTrackActionLoading,
    sharingId: s.sharingPlaylistId,
    signedIn: s.accountSession !== null,
    userId: s.accountSession?.account.id ?? '',
    currentTrack: s.currentTrack,
    downloadPlaylistId: s.downloadPlaylistId,
    downloadCompleted: s.downloadPlaylistCompleted,
    downloadTotal: s.downloadPlaylistTotal,
  }));
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const playlist: Playlist | null = state.livePlaylist ?? state.playlist;

  const isOwner = !!playlist && (!playlist.shared || playlist.shareRole === 'owner');
  const role = state.shared?.role ?? (playlist?.shared ? playlist.shareRole : 'owner');
  const canEditTracks = role === 'owner' || role === 'editor';
  const tracks = playlist && !playlist.shared ? playlist.tracks.map((track, index) => ({ position: index, track, addedBy: null })) : state.shared?.tracks ?? [];
  const queue = tracks.map((item) => item.track);
  const downloading = playlist && state.downloadPlaylistId === playlist.id;

  return (
    <Sheet
      visible={state.playlist !== null}
      onClose={() => controller.dismissPlaylistMembers()}
      fullHeight
      headerRight={
        playlist && !playlist.shared ? (
          <IconButton
            icon="pencil"
            label="Rename playlist"
            onPress={() => {
              setTitle(playlist.title);
              setRenaming(true);
            }}
          />
        ) : undefined
      }
    >
      {playlist ? (
        <>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <PlaylistCover playlist={playlist} size={96} />
            <View style={{ flex: 1, gap: 6 }}>
              <Txt variant="title" lines={2}>
                {playlist.title}
              </Txt>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Txt variant="caption">{tracks.length} tracks</Txt>
                {playlist.shared ? <Badge label={`Shared · ${role || 'member'}`} tone="accent" /> : <Badge label="On this phone" />}
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label="Play"
              icon="play"
              variant="primary"
              disabled={queue.length === 0}
              onPress={() => queue[0] && controller.play(queue[0], queue)}
              style={{ flex: 1 }}
            />
            <Button
              label={downloading ? `Stop ${state.downloadCompleted}/${state.downloadTotal}` : 'Download'}
              icon={downloading ? 'x' : 'download'}
              disabled={queue.length === 0}
              onPress={() => (downloading ? controller.cancelDownload() : void controller.downloadPlaylist({ ...playlist, tracks: queue }))}
              style={{ flex: 1 }}
            />
            {isOwner ? (
              <IconButton
                icon="share"
                label="Share playlist"
                variant="surface"
                loading={state.sharingId === playlist.id}
                onPress={() => void controller.sharePlaylist(playlist)}
              />
            ) : null}
          </View>
          {state.currentTrack && canEditTracks ? (
            <Button
              label={`Add “${state.currentTrack.title}”`}
              icon="plus"
              variant="outline"
              size="sm"
              onPress={() => state.currentTrack && controller.addTrackToPlaylist(playlist.id, state.currentTrack)}
            />
          ) : null}

          <SectionHeader
            title="Tracks"
            action={
              playlist.shared ? (
                <Button label="Refresh" size="sm" variant="ghost" loading={state.trackLoading} onPress={() => void controller.refreshActiveSharedPlaylistTracks()} />
              ) : undefined
            }
          />
          {tracks.length === 0 ? (
            <Txt variant="caption">No tracks yet. Play something, then save it here from the player.</Txt>
          ) : (
            tracks.map((item, index) => {
              const canRemove = canEditTracks && (role === 'owner' || !playlist.shared || item.addedBy?.userId === state.userId);
              return (
                <TrackRow
                  key={`${item.position}:${item.track.id}`}
                  track={item.track}
                  subtitle={item.addedBy?.displayName ? `${item.track.artist} · added by ${item.addedBy.displayName}` : undefined}
                  active={state.currentTrack?.id === item.track.id}
                  onPress={() => controller.play(item.track, queue, index)}
                  trailing={
                    canRemove ? (
                      <IconButton
                        icon="minus"
                        label={`Remove ${item.track.title}`}
                        size={32}
                        disabled={state.trackLoading}
                        onPress={() => void controller.removeSharedPlaylistTrack(item)}
                      />
                    ) : undefined
                  }
                />
              );
            })
          )}

          {state.signedIn && (playlist.shared || isOwner) ? (
            <>
              <Divider />
              <SectionHeader
                title="People"
                description={
                  state.members ? `${state.members.members.length}/${state.members.maxMembers} invited members` : playlist.shared ? undefined : 'Invite friends to edit this playlist with you.'
                }
              />
              {state.loading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Spinner />
                  <Txt variant="caption">Loading members…</Txt>
                </View>
              ) : state.members ? (
                [{ ...state.members.owner, role: 'owner' }, ...state.members.members].map((member) => (
                  <View key={member.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar uri={member.avatarUrl} initials={memberInitials(member)} size={34} />
                    <View style={{ flex: 1, gap: 1 }}>
                      <Txt variant="label" lines={1}>
                        {member.displayName || member.username || member.userId}
                      </Txt>
                      <Txt variant="caption" lines={1}>
                        {[member.username ? `@${member.username}` : null, member.role || 'member', member.status || null].filter(Boolean).join(' · ')}
                      </Txt>
                    </View>
                    {isOwner && member.role !== 'owner' ? (
                      <IconButton icon="trash" label="Remove member" size={32} disabled={state.actionLoading} onPress={() => void controller.removePlaylistMember(member.userId)} />
                    ) : null}
                  </View>
                ))
              ) : null}
              {isOwner ? (
                <InviteMemberForm key={playlist.id} loading={state.actionLoading} />
              ) : (
                <Button label="Leave playlist" icon="logOut" variant="danger" size="sm" disabled={state.actionLoading} onPress={() => void controller.leaveActiveSharedPlaylist()} />
              )}
            </>
          ) : null}

          {!playlist.shared ? (
            <Button label="Delete playlist" icon="trash" variant="ghost" size="sm" onPress={() => setConfirmDelete(true)} />
          ) : null}

          <Dialog
            visible={renaming}
            title="Rename playlist"
            onClose={() => setRenaming(false)}
            actions={
              <>
                <Button label="Cancel" variant="ghost" size="sm" onPress={() => setRenaming(false)} />
                <Button
                  label="Save"
                  variant="primary"
                  size="sm"
                  disabled={!title.trim()}
                  onPress={() => {
                    controller.renamePlaylist(playlist, title);
                    setRenaming(false);
                  }}
                />
              </>
            }
          >
            <Input value={title} onChangeText={setTitle} autoCapitalize="sentences" autoFocus />
          </Dialog>
          <Dialog
            visible={confirmDelete}
            title="Delete playlist?"
            onClose={() => setConfirmDelete(false)}
            actions={
              <>
                <Button label="Keep" variant="ghost" size="sm" onPress={() => setConfirmDelete(false)} />
                <Button
                  label="Delete"
                  variant="danger"
                  size="sm"
                  onPress={() => {
                    setConfirmDelete(false);
                    controller.deletePlaylist(playlist);
                    controller.dismissPlaylistMembers();
                  }}
                />
              </>
            }
          >
            <Txt muted>{playlist.title} will be removed from this phone. Synced copies in your cloud library stay until the next sync.</Txt>
          </Dialog>
        </>
      ) : null}
    </Sheet>
  );
}

/** Keyed by playlist id, so switching playlists starts with an empty field. */
function InviteMemberForm({ loading }: { loading: boolean }) {
  const controller = useController();
  const [invite, setInvite] = useState('');
  const send = () => void controller.invitePlaylistMember(invite).then((ok) => ok && setInvite(''));
  return (
    <View style={{ gap: 8 }}>
      <Input value={invite} onChangeText={setInvite} placeholder="Spice username" leadingIcon="atSign" returnKeyType="send" onSubmitEditing={send} />
      <Button label="Invite member" icon="userPlus" variant="secondary" loading={loading} disabled={!invite.trim()} onPress={send} />
    </View>
  );
}

export function InviteDialog({ onOpenSettings }: { onOpenSettings: () => void }) {
  const controller = useController();
  const { preview, loading, signedIn } = useSpice((s) => ({
    preview: s.pendingInvitePreview,
    loading: s.inviteLoading,
    signedIn: s.accountSession !== null,
  }));
  return (
    <Dialog
      visible={preview !== null}
      title="Playlist invite"
      onClose={() => controller.dismissPlaylistInvite()}
      actions={
        <>
          <Button label="Close" variant="ghost" size="sm" disabled={loading} onPress={() => controller.dismissPlaylistInvite()} />
          <Button
            label={signedIn ? 'Accept' : 'Sign in'}
            icon={signedIn ? 'check' : 'logIn'}
            variant="primary"
            size="sm"
            loading={loading}
            onPress={() => {
              if (signedIn) void controller.acceptPlaylistInvite();
              else {
                controller.dismissPlaylistInvite();
                onOpenSettings();
              }
            }}
          />
        </>
      }
    >
      {preview ? (
        <View style={{ gap: 4 }}>
          <Txt variant="heading">{preview.playlist.title}</Txt>
          <Txt variant="caption">
            {preview.playlist.tracks.length} tracks{preview.role ? ` · joins as ${preview.role}` : ''}
          </Txt>
          {!signedIn ? <Txt variant="caption">Sign in to your Spice account before accepting.</Txt> : null}
        </View>
      ) : null}
    </Dialog>
  );
}
