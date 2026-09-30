import { useState } from 'react';
import { View } from 'react-native';

import { profileInitials, readableBlockExpiry } from '../../core/format';
import { useController, useSpice } from '../context';
import { Icon } from '../icons';
import { Avatar, Button, Card, Input, SettingRow, Switch, Sheet, Txt } from '../primitives';
import { useTheme } from '../theme';

export function ProfileSheet({ visible, onClose, onOpenSettings }: { visible: boolean; onClose: () => void; onOpenSettings: () => void }) {
  const controller = useController();
  const theme = useTheme();
  const state = useSpice((s) => ({
    session: s.accountSession,
    summary: s.profileSummary,
    loading: s.profileLoading,
    history: s.historyTracks.length,
    liked: s.likedTracks.length,
    playlists: s.playlists.length,
    downloads: s.downloads.length,
  }));
  const account = state.session?.account;
  const profile = state.summary?.profile;
  const displayName = profile?.displayName || account?.displayName || account?.email.split('@')[0] || 'Spice Listener';
  const username = profile?.username || account?.username;
  const stats = [
    ['Played', state.summary?.stats.songsPlayed ?? state.history],
    ['Liked', state.summary?.stats.likedCount ?? state.liked],
    ['Playlists', state.summary?.stats.playlistsCount ?? state.playlists],
    ['Downloads', state.downloads],
  ] as const;
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Avatar uri={profile?.avatarUrl || account?.avatarUrl} initials={profileInitials(displayName, account?.id)} size={72} />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Txt variant="title">{displayName}</Txt>
          <Txt variant="caption">{username ? `@${username}` : account?.email ?? 'Not signed in'}</Txt>
          {state.loading ? <Txt variant="caption">Refreshing profile…</Txt> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {stats.map(([label, value]) => (
          <View key={label} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: theme.radius.lg, backgroundColor: theme.hover, gap: 2 }}>
            <Txt variant="heading">{String(value)}</Txt>
            <Txt variant="caption">{label}</Txt>
          </View>
        ))}
      </View>
      {profile?.bio ? <Txt muted>{profile.bio}</Txt> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {state.session ? (
          <Button
            label="Edit profile"
            icon="pencil"
            variant="primary"
            onPress={() => {
              onClose();
              controller.openProfileEditor();
            }}
            style={{ flex: 1 }}
          />
        ) : null}
        <Button
          label={state.session ? 'Account' : 'Sign in'}
          icon={state.session ? 'settings' : 'logIn'}
          variant={state.session ? 'secondary' : 'primary'}
          onPress={() => {
            onClose();
            onOpenSettings();
          }}
          style={{ flex: 1 }}
        />
      </View>
    </Sheet>
  );
}

export function ProfileEditorSheet() {
  const controller = useController();
  const open = useSpice((s) => s.profileEditOpen);
  return (
    <Sheet visible={open} onClose={() => controller.dismissProfileEditor()} title="Edit profile" subtitle="Saved to your Spice account.">
      {open ? <ProfileEditorForm /> : null}
    </Sheet>
  );
}

/** Mounted fresh each time the editor opens, so it starts from the current profile. */
function ProfileEditorForm() {
  const controller = useController();
  const loading = useSpice((s) => s.profileEditLoading);
  const [form, setForm] = useState(() => controller.profileEditDefaults());
  const save = () => void controller.saveProfileEdit(form);
  return (
    <>
      <Input label="Display name" value={form.displayName} onChangeText={(displayName) => setForm({ ...form, displayName })} autoCapitalize="words" />
      <Input label="Username" value={form.username} onChangeText={(username) => setForm({ ...form, username })} helper="3-20 letters, numbers, or underscores." />
      <Input label="Profile picture URL" value={form.avatarUrl} onChangeText={(avatarUrl) => setForm({ ...form, avatarUrl })} keyboardType="url" />
      <Input label="Bio" value={form.bio} onChangeText={(bio) => setForm({ ...form, bio })} multiline autoCapitalize="sentences" />
      <SettingRow
        title="Private profile"
        description="Hide bio, stats, and playlists from other listeners."
        right={<Switch value={form.isPrivate} onChange={(isPrivate) => setForm({ ...form, isPrivate })} label="Private profile" />}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Cancel" variant="ghost" disabled={loading} onPress={() => controller.dismissProfileEditor()} style={{ flex: 1 }} />
        <Button label="Save" icon="check" variant="primary" loading={loading} onPress={save} style={{ flex: 1 }} />
      </View>
    </>
  );
}

export function NotificationsSheet({ visible, onClose, onOpenSettings }: { visible: boolean; onClose: () => void; onOpenSettings: () => void }) {
  const controller = useController();
  const state = useSpice((s) => ({
    invites: s.pendingAccountInvites,
    loading: s.accountInvitesLoading,
    downloadTrackId: s.downloadTrackId,
    downloadProgress: s.downloadProgress,
  }));
  const empty = state.invites.length === 0 && !state.downloadTrackId;
  return (
    <Sheet visible={visible} onClose={onClose} title="Notifications">
      {state.downloadTrackId ? (
        <Card>
          <Txt variant="label">Download</Txt>
          <Txt variant="caption">{state.downloadProgress ?? 'Preparing download…'}</Txt>
        </Card>
      ) : null}
      {empty ? <Txt muted>{"You're all caught up."}</Txt> : null}
      {state.invites.map((invite) => (
        <Card key={invite.playlistId}>
          <View style={{ gap: 2 }}>
            <Txt variant="label" lines={1}>
              {invite.playlistTitle}
            </Txt>
            <Txt variant="caption" lines={1}>
              Playlist invite from {invite.ownerDisplayName || invite.ownerUsername || invite.ownerId}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Decline" variant="outline" size="sm" disabled={state.loading} onPress={() => void controller.rejectPendingPlaylistInvite(invite)} style={{ flex: 1 }} />
            <Button label="Accept" variant="primary" size="sm" disabled={state.loading} onPress={() => void controller.acceptPendingPlaylistInvite(invite)} style={{ flex: 1 }} />
          </View>
        </Card>
      ))}
      <Button
        label="Account settings"
        icon="settings"
        variant="ghost"
        onPress={() => {
          onClose();
          onOpenSettings();
        }}
      />
    </Sheet>
  );
}

export function AccountBlockScreen() {
  const controller = useController();
  const theme = useTheme();
  const block = useSpice((s) => s.accountBlock);
  if (!block) return null;
  const banned = block.status === 'banned';
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: banned ? theme.dangerSoft : theme.warningSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={banned ? 'ban' : 'clock'} size={28} color={banned ? theme.danger : theme.warning} />
      </View>
      <Txt variant="title" align="center">
        {banned ? 'Account banned' : 'Account temporarily timed out'}
      </Txt>
      <Txt muted align="center">
        {banned
          ? 'This account has been banned and can no longer sign in or use SPICE services.'
          : 'This account is temporarily timed out. SPICE services come back when the timeout ends.'}
      </Txt>
      {block.reason ? (
        <Txt variant="caption" align="center">
          Reason: {block.reason}
        </Txt>
      ) : null}
      {block.expiresAt ? (
        <Txt variant="caption" align="center">
          Access returns {readableBlockExpiry(block.expiresAt)}
        </Txt>
      ) : null}
      <Button label="Sign out" variant="outline" onPress={() => controller.signOut()} />
    </View>
  );
}
