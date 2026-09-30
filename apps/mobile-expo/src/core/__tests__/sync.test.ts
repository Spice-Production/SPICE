/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import { makePlaylist, makeTrack } from '../models.ts';
import { findPortableSpiceConnectPlaylist, mergeSyncHistory, mergeSyncLikes, resolveLikeMutation } from '../sync.ts';

const desktopNewest = makeTrack({ id: 'desktop-new', title: 'Desktop New', artist: 'Artist' });
const shared = makeTrack({ id: 'shared', title: 'Shared', artist: 'Artist' });
const mobilePending = makeTrack({ id: 'mobile-new', title: 'Mobile New', artist: 'Other' });
const ids = (tracks: { id: string }[]) => tracks.map((track) => track.id);

test('first history reconciliation keeps cloud recency and appends unique phone plays', () => {
  assert.deepEqual(ids(mergeSyncHistory([desktopNewest, shared], [shared, mobilePending], new Set(), true)), [
    'desktop-new',
    'shared',
    'mobile-new',
  ]);
});

test('pending phone listens lead the next cloud snapshot', () => {
  assert.deepEqual(ids(mergeSyncHistory([desktopNewest, shared], [mobilePending, shared], new Set(['mobile-new']))), [
    'mobile-new',
    'desktop-new',
    'shared',
  ]);
});

test('settled phone history follows the cloud order', () => {
  assert.deepEqual(ids(mergeSyncHistory([desktopNewest, shared], [shared, mobilePending])), ['desktop-new', 'shared']);
});

test('likes reconcile once, respect pending unlikes, then follow the cloud', () => {
  assert.deepEqual(ids(mergeSyncLikes([desktopNewest], [mobilePending], new Set(), true)), ['desktop-new', 'mobile-new']);
  assert.deepEqual(ids(mergeSyncLikes([desktopNewest, shared], [shared], new Set(['desktop-new']))), ['shared']);
  assert.deepEqual(ids(mergeSyncLikes([desktopNewest], [mobilePending])), ['desktop-new']);
  assert.deepEqual(
    ids(mergeSyncLikes([desktopNewest, desktopNewest, shared], [desktopNewest, mobilePending, mobilePending], new Set(), true)),
    ['desktop-new', 'shared', 'mobile-new'],
  );
});

test('an older like response never overwrites a newer tap', () => {
  const base = { requestRevision: 4, latestRevision: 4, requestedLiked: true, currentlyLiked: true };
  assert.equal(resolveLikeMutation({ ...base, succeeded: true }), 'Confirm');
  assert.equal(resolveLikeMutation({ ...base, requestedLiked: false, currentlyLiked: false, succeeded: false }), 'RollBack');
  assert.equal(resolveLikeMutation({ ...base, latestRevision: 6, succeeded: true }), 'ReconcileNewerChange');
  assert.equal(resolveLikeMutation({ ...base, latestRevision: 6, succeeded: false }), 'ReconcileNewerChange');
  assert.equal(resolveLikeMutation({ ...base, currentlyLiked: false, succeeded: true }), 'ReconcileNewerChange');
});

test('pairing-only playlists fall back to a private title match', () => {
  const sharedPlaylist = makePlaylist({ id: 'shared', title: 'Road Trip', shared: true });
  const local = makePlaylist({ id: 'local', title: '  road trip  ' });
  assert.equal(findPortableSpiceConnectPlaylist([sharedPlaylist, local], 'phone-only-id', 'Road Trip'), local);
  assert.equal(findPortableSpiceConnectPlaylist([sharedPlaylist, local], 'shared', 'Different title'), sharedPlaylist);
  assert.equal(findPortableSpiceConnectPlaylist([sharedPlaylist], 'missing', ''), null);
});
