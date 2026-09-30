/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BoundedCommandIds,
  COMMAND_POLL_INTERVAL_MS,
  CONTROLLER_REFRESH_INTERVAL_MS,
  HANDOFF_ACCEPT_TIMEOUT_MS,
  HANDOFF_COMPLETE_TIMEOUT_MS,
  REALTIME_FALLBACK_POLL_INTERVAL_MS,
  RealtimeEventParser,
  acceptHandoffReady,
  acceptsPreparedCommit,
  beginHandoff,
  completesHandoff,
  deviceStatus,
  formatPairingCodeInput,
  hasConnectAccess,
  isCompletePairingCode,
  nextDeviceSyncAt,
  normalizePairingCodeInput,
  normalizeTransferId,
  pairingCodeForSubmission,
  projectedProgressMs,
  requiresDeviceRegistration,
  sanitizePairingCodeEdit,
  shouldResetDeviceRegistration,
  shouldResumeSource,
  shouldStartConnect,
  shouldSyncDevices,
} from '../connect.ts';

test('Connect requires an explicit opt-in and remote access', () => {
  assert.equal(shouldStartConnect(false, true, false), false);
  assert.equal(shouldStartConnect(true, false, false), false);
  assert.equal(shouldStartConnect(true, true, false), true);
  assert.equal(shouldStartConnect(true, false, true), true);
  assert.equal(hasConnectAccess(false, true), true);
  assert.equal(hasConnectAccess(false, false), false);
  assert.equal(COMMAND_POLL_INTERVAL_MS, 5_000);
  assert.equal(REALTIME_FALLBACK_POLL_INTERVAL_MS, 30_000);
  assert.equal(CONTROLLER_REFRESH_INTERVAL_MS, 30_000);
});

test('device sync waits for its deadline unless commands or state events arrive', () => {
  const base = { nextDeviceSyncAtMs: 60_000, receivedCommands: false, isControllingRemoteDevice: false };
  assert.equal(shouldSyncDevices({ ...base, nowMs: 59_999 }), false);
  assert.equal(shouldSyncDevices({ ...base, nowMs: 60_000 }), true);
  assert.equal(shouldSyncDevices({ ...base, nowMs: 1_500, receivedCommands: true }), true);
  assert.equal(shouldSyncDevices({ ...base, nowMs: 1_500, receivedStateUpdate: true }), true);
  assert.equal(shouldSyncDevices({ ...base, nowMs: 2_000, isControllingRemoteDevice: true }), true);
  assert.equal(nextDeviceSyncAt(1_500, true, false), 6_500);
  assert.equal(nextDeviceSyncAt(1_500, false, false), 61_500);
  assert.equal(nextDeviceSyncAt(2_000, false, true), 32_000);
});

test('pairing codes use a stable four-by-four format', () => {
  assert.equal(formatPairingCodeInput(''), '____-____');
  assert.equal(formatPairingCodeInput('2'), '2___-____');
  assert.equal(formatPairingCodeInput('2w8pclu7'), '2W8P-CLU7');
  assert.equal(formatPairingCodeInput('2w8p-cl'), '2W8P-CL__');
  assert.equal(normalizePairingCodeInput('2W8P-CLU7'), '2W8PCLU7');
  assert.equal(pairingCodeForSubmission('2w8p‑clu7'), '2W8P-CLU7');
  assert.equal(normalizePairingCodeInput('ａｂｃｄ－２３４５'), 'ABCD2345');
  assert.equal(normalizePairingCodeInput('0O1I-2345'), '2345');
  assert.ok(isCompletePairingCode('2W8P-CLU7'));
  assert.ok(!isCompletePairingCode('2W8P-CLU'));
  assert.deepEqual(sanitizePairingCodeEdit('ABCD-2345', 4, 4), { text: 'ABCD2345', selectionStart: 4, selectionEnd: 4 });
  assert.deepEqual(sanitizePairingCodeEdit('ABCD-2345', 7, 7), { text: 'ABCD2345', selectionStart: 6, selectionEnd: 6 });
  assert.deepEqual(sanitizePairingCodeEdit('ABC-2345', 3, 3), { text: 'ABC2345', selectionStart: 3, selectionEnd: 3 });
});

test('remote progress is projected between authoritative snapshots', () => {
  assert.equal(projectedProgressMs(12_500, 180_000, true, 1_000, 2_000), 13_500);
  assert.equal(projectedProgressMs(12_500, 180_000, false, 1_000, 10_000), 12_500);
  assert.equal(projectedProgressMs(179_500, 180_000, true, 1_000, 5_000), 180_000);
});

test('redelivered commands apply only once within a bounded history', () => {
  const ids = new BoundedCommandIds(3, ['old']);
  assert.equal(ids.contains('not-applied'), false);
  assert.equal(ids.markIfNew('not-applied'), true);
  assert.equal(ids.markIfNew('old'), false);
  assert.equal(ids.markIfNew('one'), true);
  assert.equal(ids.markIfNew('two'), true);
  assert.equal(ids.markIfNew('three'), true);
  assert.deepEqual(ids.snapshot(), ['one', 'two', 'three']);
  assert.equal(ids.markIfNew('old'), true);
  assert.deepEqual(ids.snapshot(), ['two', 'three', 'old']);
});

test('device registration and status follow the receiver contract', () => {
  assert.ok(requiresDeviceRegistration(null, 'paired-owner'));
  assert.ok(!requiresDeviceRegistration('paired-owner', 'paired-owner'));
  assert.ok(shouldResetDeviceRegistration(404));
  assert.ok(!shouldResetDeviceRegistration(401));
  assert.equal(deviceStatus(false, false, 245, null), 'Offline · last seen 4m ago');
  assert.equal(deviceStatus(true, true, 1, 'Test Song'), 'Playing · Test Song');
  assert.equal(deviceStatus(true, false, 2, null), 'Online now');
});

test('handoff source waits for the exact target and transfer before committing', () => {
  const pending = beginHandoff('phone:desktop:transfer', 'desktop', 'Desktop', true);
  assert.equal(pending.phase, 'WaitingForReady');
  const accepted = acceptHandoffReady(pending, pending.transferId, 'desktop', true);
  assert.equal(accepted?.phase, 'WaitingForComplete');
  assert.equal(acceptHandoffReady(pending, 'transfer-b', 'desktop', true), null);
  assert.equal(acceptHandoffReady(pending, pending.transferId, 'unknown', true), null);
  assert.ok(!completesHandoff(pending, pending.transferId, 'desktop'));
  assert.ok(completesHandoff(accepted, pending.transferId, 'desktop'));
  assert.ok(!completesHandoff(accepted, 'transfer-b', 'desktop'));
  assert.ok(!shouldResumeSource(accepted, false));
  assert.ok(shouldResumeSource(accepted, true));
  assert.equal(normalizeTransferId(' phone:desktop:abc-123_value ! '), 'phone:desktop:abc-123_value');
  assert.ok(HANDOFF_ACCEPT_TIMEOUT_MS < HANDOFF_COMPLETE_TIMEOUT_MS);
});

test('destination rejects late or mismatched commits', () => {
  const prepared = { transferId: 'transfer-a', sourceDeviceId: 'desktop', expiresAtMs: 9_000 };
  assert.ok(acceptsPreparedCommit(prepared, 'transfer-a', 'desktop', 8_999));
  assert.ok(!acceptsPreparedCommit(prepared, 'transfer-a', 'desktop', 9_000));
  assert.ok(!acceptsPreparedCommit(prepared, 'transfer-b', 'desktop', 8_000));
  assert.ok(!acceptsPreparedCommit(prepared, 'transfer-a', 'phone', 8_000));
});

test('realtime SSE records fire only after their blank terminator', () => {
  const parser = new RealtimeEventParser();
  assert.equal(parser.consumeLine('event: command'), null);
  assert.equal(parser.consumeLine('data: {}'), null);
  assert.equal(parser.consumeLine(''), 'Command');
  assert.equal(parser.consumeLine(''), null);
  assert.equal(parser.consumeLine(': keep-alive'), null);
  assert.equal(parser.consumeLine('event: ready'), null);
  assert.equal(parser.consumeLine(''), 'Ready');
  assert.equal(parser.consumeLine('event: state'), null);
  assert.equal(parser.consumeLine(''), 'State');
  assert.equal(parser.consumeLine('event: something-else'), null);
  assert.equal(parser.consumeLine(''), null);
});
