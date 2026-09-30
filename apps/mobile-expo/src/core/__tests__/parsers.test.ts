/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import { makePlaylist, makeTrack } from '../models.ts';
import {
  parseAccountSession,
  parseEmailVerificationChallenge,
  parseListenerFavorites,
  parsePairedDeviceCredential,
  parsePendingPlaylistInvites,
  parsePlaylistInvite,
  parsePlaylistInvitePreview,
  parsePlaylistMembersSummary,
  parsePlaylists,
  parseRemoteCommands,
  parseRemoteDevices,
  parseRemoteRepeatMode,
  parseSharedPlaylistTracks,
  parseSpiceTimestampEpochMs,
  parseTrackSnapshot,
  parseTracks,
  repeatModeToRemote,
  trackToSnapshotJson,
} from '../parsers.ts';
import { mergeSyncPlaylistTracks, mergeSyncPlaylists, mergeSyncTracks } from '../sync.ts';

test('parses provider track metadata and skips invalid rows', () => {
  const tracks = parseTracks(
    {
      tracks: [
        {
          id: 'abc123',
          title: 'Digital Love',
          artists: [{ name: 'Daft Punk' }],
          album: { title: 'Discovery' },
          durationMs: 301000,
          artworkUrl: 'https://example.test/art.jpg',
          sourceId: 'youtube_music',
        },
        { id: '', title: 'Invalid' },
      ],
    },
    'youtube_music',
  );
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0]!.artist, 'Daft Punk');
  assert.equal(tracks[0]!.album, 'Discovery');
  assert.equal(tracks[0]!.durationMs, 301000);
  const soundCloud = parseTracks({ tracks: [{ id: 'soundcloud:42', title: 'One More Time' }] }, 'soundcloud');
  assert.equal(soundCloud[0]!.sourceId, 'soundcloud');
  assert.equal(soundCloud[0]!.artist, 'Unknown artist');
});

test('parses account sessions and email challenges', () => {
  const session = parseAccountSession({
    token: 'session-token',
    account: { id: 'user-1', email: 'listener@example.test', accountRole: 'admin', isAdmin: true },
  });
  assert.equal(session.token, 'session-token');
  assert.equal(session.account.id, 'user-1');
  assert.equal(session.account.isAdmin, true);
  assert.equal(session.account.moderationStatus, 'active');
  assert.throws(() => parseAccountSession({ token: '', account: { id: 'x' } }));

  const challenge = parseEmailVerificationChallenge({
    verificationRequired: true,
    registrationId: 'registration-1',
    email: 'li******@example.test',
    expiresAt: '2026-07-13T12:10:00.000Z',
  });
  assert.equal(challenge.registrationId, 'registration-1');
  assert.equal(challenge.expiresAt, '2026-07-13T12:10:00.000Z');
});

test('parses a scoped paired-device credential and rejects the wrong scope', () => {
  const payload = {
    authorizationId: 'authorization-1',
    userId: 'owner-1',
    accessToken: 'spice_pair_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
    tokenType: 'Bearer',
    scope: 'spice_connect',
    expiresAt: '2026-08-12T12:10:00.000Z',
    device: { deviceId: 'android-device-1', displayName: 'Spice Android' },
  };
  const credential = parsePairedDeviceCredential(payload);
  assert.equal(credential.ownerUserId, 'owner-1');
  assert.equal(credential.deviceId, 'android-device-1');
  assert.ok(credential.expiresAtEpochMs > 0);
  assert.throws(() => parsePairedDeviceCredential({ ...payload, scope: 'account' }));
  assert.equal(parseSpiceTimestampEpochMs('2026-08-12T12:10:00Z'), Date.UTC(2026, 7, 12, 12, 10, 0));
  assert.equal(parseSpiceTimestampEpochMs('tomorrow'), 0);
});

test('parses and serializes track snapshots for sync', () => {
  const track = parseTrackSnapshot({
    id: 'sync-1',
    title: 'Something About Us',
    artists: [{ name: 'Daft Punk' }],
    durationMs: 232000,
    artworkUrl: 'https://example.test/cover.jpg',
    sourceId: 'youtube_music',
  });
  const snapshot = trackToSnapshotJson(track);
  assert.equal(track.artist, 'Daft Punk');
  assert.equal(snapshot.title, 'Something About Us');
  assert.deepEqual(snapshot.artists, [{ name: 'Daft Punk' }]);
});

test('merges remote and local sync tracks with local details winning', () => {
  const merged = mergeSyncTracks(
    [makeTrack({ id: 'one' }), makeTrack({ id: 'two', title: 'Remote', artist: 'Cloud', sourceId: 'soundcloud' })],
    [makeTrack({ id: 'one', title: 'Local title', artist: 'Local artist', artworkUrl: 'https://example.test/a.jpg' })],
  );
  assert.deepEqual(
    merged.map((track) => track.id),
    ['one', 'two'],
  );
  assert.equal(merged[0]!.title, 'Local title');
  assert.equal(merged[0]!.artworkUrl, 'https://example.test/a.jpg');
});

test('parses playlists, invites, members, and shared tracks', () => {
  const playlists = parsePlaylists({
    playlists: [
      {
        id: 'playlist-1',
        title: 'Favorites',
        shareRole: 'owner',
        tracks: [{ id: 'track-1', title: 'Voyager', artists: [{ name: 'Daft Punk' }], sourceId: 'youtube_music' }],
      },
    ],
  });
  assert.equal(playlists[0]!.shareRole, 'owner');
  assert.equal(playlists[0]!.tracks[0]!.artist, 'Daft Punk');

  const invite = parsePlaylistInvite({
    token: 'invite-token',
    inviteUrl: 'https://music.spice-app.xyz/?playlistInvite=invite-token',
    expiresAt: '2026-08-01T00:00:00.000Z',
  });
  assert.equal(invite.inviteUrl, 'https://music.spice-app.xyz/?playlistInvite=invite-token');

  const preview = parsePlaylistInvitePreview({
    invite: { token: 'invite-token', role: 'listener' },
    playlist: { id: 'playlist-1', title: 'Road Mix', shared: true, shareRole: 'listener', tracks: [] },
  });
  assert.equal(preview.role, 'listener');
  assert.equal(preview.playlist.shared, true);

  const pending = parsePendingPlaylistInvites({
    invites: [{ playlistId: 'playlist-1', playlistTitle: 'Road Mix', ownerId: 'owner-1', ownerDisplayName: 'Spice Owner' }],
  });
  assert.equal(pending[0]!.ownerDisplayName, 'Spice Owner');

  const members = parsePlaylistMembersSummary({
    playlistId: 'playlist-1',
    owner: { userId: 'owner-1', username: 'owner', displayName: 'Owner', role: 'owner' },
    members: [{ userId: 'member-1', username: 'listener', role: 'editor', status: 'pending' }],
    maxMembers: 4,
  });
  assert.equal(members.members[0]!.displayName, 'listener');
  assert.equal(members.maxMembers, 4);

  const shared = parseSharedPlaylistTracks({
    playlistId: 'playlist-1',
    role: 'editor',
    tracks: [{ id: 'track-1', title: 'Voyager', position: 3, addedBy: { userId: 'member-1', displayName: 'Listener' } }],
  });
  assert.equal(shared.tracks[0]!.position, 3);
  assert.equal(shared.tracks[0]!.addedBy?.userId, 'member-1');
});

test('merges playlists by id and keeps duplicate cloud occurrences', () => {
  const merged = mergeSyncPlaylists(
    [makePlaylist({ id: 'playlist-1', title: 'Favorites', tracks: [makeTrack({ id: 'remote' })] })],
    [makePlaylist({ id: 'playlist-1', title: 'Favorites', tracks: [makeTrack({ id: 'local' })] })],
  );
  assert.deepEqual(
    merged[0]!.tracks.map((track) => track.id),
    ['remote', 'local'],
  );
  const remoteTracks = [makeTrack({ id: 'a' }), makeTrack({ id: 'b' }), makeTrack({ id: 'a', title: 'A duplicate' })];
  assert.deepEqual(
    mergeSyncPlaylistTracks(remoteTracks, remoteTracks.slice(0, 2)).map((track) => track.id),
    ['a', 'b', 'a'],
  );
});

test('parses Spice Connect devices with queue and playback state', () => {
  const [device] = parseRemoteDevices({
    devices: [
      {
        deviceId: 'desktop-1',
        displayName: 'Studio PC',
        currentTrack: { id: 'track-2', title: 'Voyager', artist: 'Daft Punk' },
        queue: [
          { id: 'track-1', title: 'Digital Love', artist: 'Daft Punk' },
          { id: 'track-2', title: 'Voyager', artist: 'Daft Punk' },
        ],
        queueIndex: 1,
        isPlaying: true,
        shuffleEnabled: true,
        repeatMode: 'one',
        progress: 12.5,
        duration: 180,
        isOnline: false,
        rememberedUntil: '2026-08-21T00:00:00.000Z',
      },
    ],
  });
  assert.ok(device);
  assert.deepEqual(
    device.queue.map((track) => track.id),
    ['track-1', 'track-2'],
  );
  assert.equal(device.progressMs, 12_500);
  assert.equal(device.repeatMode, 'One');
  assert.equal(device.isOnline, false);
  assert.equal(device.currentTrack?.artist, 'Daft Punk');
});

test('parses Spice Connect command payloads', () => {
  const commands = parseRemoteCommands({
    commands: [
      {
        id: 'command-1',
        sourceDeviceId: 'studio-phone',
        command: 'play_track',
        payload: {
          track: { id: 'track-2', title: 'Voyager', artist: 'Daft Punk' },
          queue: [
            { id: 'track-1', title: 'Digital Love', artist: 'Daft Punk' },
            { id: 'track-2', title: 'Voyager', artist: 'Daft Punk' },
          ],
          queueIndex: 1,
        },
      },
      { id: 'command-2', command: 'seek', payload: { progress: 42.25 } },
      { id: 'command-3', command: 'shuffle', payload: { enabled: true } },
      { id: 'command-4', command: 'repeat', payload: { mode: 'all' } },
      { id: 'command-5', command: 'volume', payload: { volume: 84 } },
      {
        id: 'command-6',
        command: 'handoff',
        payload: {
          track: { id: 'track-2', title: 'Voyager', artist: 'Daft Punk' },
          queue: [{ id: 'track-2', title: 'Voyager', artist: 'Daft Punk' }],
          queueIndex: 0,
          progress: 58.5,
          volume: 71,
          isPlaying: true,
          shuffleEnabled: true,
          repeatMode: 'one',
        },
      },
      { id: 'command-7', sourceDeviceId: 'studio-phone', command: 'connect', payload: { connected: true } },
      { id: 'command-8', command: 'set_like', payload: { track: { id: 'track-2', title: 'Voyager' }, liked: true } },
      {
        id: 'command-9',
        command: 'add_to_playlist',
        payload: { track: { id: 'track-2', title: 'Voyager' }, playlistId: 'playlist-1', playlistTitle: 'Road trip' },
      },
      { id: 'command-10', command: 'play_queue_index', payload: { queueIndex: 37 } },
      { id: '', command: 'invalid' },
    ],
  });
  assert.equal(commands.length, 10);
  assert.deepEqual(
    commands[0]!.payloadQueue.map((track) => track.id),
    ['track-1', 'track-2'],
  );
  assert.equal(commands[0]!.sourceDeviceId, 'studio-phone');
  assert.equal(commands[0]!.payloadQueueIndex, 1);
  assert.equal(commands[1]!.seekPositionMs, 42_250);
  assert.equal(commands[2]!.shuffleEnabled, true);
  assert.equal(commands[3]!.repeatMode, 'All');
  assert.equal(commands[4]!.volume, 84);
  assert.equal(commands[5]!.seekPositionMs, 58_500);
  assert.equal(commands[5]!.shouldPlay, true);
  assert.equal(commands[5]!.repeatMode, 'One');
  assert.equal(commands[6]!.connected, true);
  assert.equal(commands[7]!.liked, true);
  assert.equal(commands[7]!.payloadTrack?.id, 'track-2');
  assert.equal(commands[8]!.playlistTitle, 'Road trip');
  assert.equal(commands[9]!.payloadQueueIndex, 37);
  assert.equal(repeatModeToRemote('One'), 'one');
  assert.equal(repeatModeToRemote('Off'), 'none');
  assert.equal(parseRemoteRepeatMode('invalid'), 'Off');
});

test('parses listener favorites and ignores placeholders', () => {
  const favorites = parseListenerFavorites({
    tracks: [
      {
        trackId: 'hit1',
        sourceId: 'youtube_music',
        title: 'Community Hit',
        artists: [{ name: 'Shared Artist' }],
        durationMs: 210000,
      },
      { trackId: '', sourceId: 'youtube_music', title: 'No Id' },
      { trackId: 'placeholder', sourceId: 'youtube_music', title: 'Track' },
    ],
  });
  assert.equal(favorites.length, 1);
  assert.equal(favorites[0]!.id, 'hit1');
  assert.equal(favorites[0]!.artist, 'Shared Artist');
  assert.equal(parseListenerFavorites({}).length, 0);
});
