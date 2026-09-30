'use client';

import { useEffect, useId, useMemo, useRef } from 'react';

import type { RemoteDevice } from '../../../spice-app';
import { useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import { Artwork, artistNames } from '../../media';
import {
  Badge,
  Button,
  DropdownMenu,
  IconButton,
  Input,
  Kbd,
  Select,
  SettingsBlock,
  SettingsRow,
  SettingsSection,
  Slider,
  Switch,
  type MenuEntry,
  type SelectOption,
} from '../../primitives';
import { SecurePairing } from './b-secure-pairing';
import { persistLocal } from './b-storage';
import s from './b-settings.module.css';

const REMOTE_ENABLED_STORAGE_KEY = 'spice_remote_control_enabled';
const REMOTE_DEVICE_NAME_STORAGE_KEY = 'spice_remote_device_name';
/** The receiver select uses an empty value for "this device". */
const LOCAL_RECEIVER_VALUE = '';

function deviceStateLabel(device: RemoteDevice) {
  return device.isOnline === false ? 'Offline' : device.isPlaying ? 'Playing' : 'Online';
}

function lastSeenMinutesLabel(device: RemoteDevice) {
  const minutes = Math.floor((device.lastSeenSeconds ?? 0) / 60);
  return minutes === 0 ? '<1' : String(minutes);
}

/** Group `connect`: section `spice-connect`. */
export function ConnectSettings() {
  const m = useSpiceUi();
  const enabledId = useId();
  const nameId = useId();
  const receiverId = useId();
  const diagnosticsId = useId();

  const devices = m.remoteTargetDevices;
  const selected = m.selectedRemoteDevice;
  const hasAuth = Boolean(m.remoteAuthToken);
  const statusIsError = Boolean(m.remoteStatus && (m.remoteStatus.includes('failed') || m.remoteStatus.includes('Sign in')));

  const receiverOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: LOCAL_RECEIVER_VALUE, label: 'This device (current browser)' },
      ...devices.map((device) => ({ value: device.deviceId, label: `${device.displayName} - ${deviceStateLabel(device)}` })),
    ],
    [devices],
  );

  const toggleRemoteControl = (checked: boolean) => {
    m.setRemoteControlEnabled(checked);
    persistLocal(REMOTE_ENABLED_STORAGE_KEY, String(checked));
    m.setRemoteStatus(checked ? 'Spice Connect enabled on this device.' : 'Spice Connect disabled on this device.');
  };

  const refreshReceivers = () => {
    if (m.remoteControlEnabled) {
      void m.reportRemoteDeviceState();
    }
    void m.loadRemoteDevices(true);
  };

  // On mirrors the Ctrl+Shift+Alt+L shortcut; off mirrors the trace's close button.
  // The floating trace itself is rendered by the player region.
  const setTransportDiagnostics = (enabled: boolean) => {
    m.setRemoteTransportDiagnosticsEnabled(enabled);
    persistLocal(m.SPICE_CONNECT_TRANSPORT_DIAGNOSTICS_STORAGE_KEY, String(enabled));
    if (enabled) m.setRemoteStatus('Secret Spice Connect transport diagnostics enabled.');
  };

  return (
    <div className={s.group}>
      <SettingsSection
        id="spice-connect"
        title="Spice Connect"
        icon="cast"
        description="Spice Connect is off by default. When two desktop or web devices enable it on the same network, controls automatically prefer an encrypted peer-to-peer link and fall back to the cloud if direct negotiation is unavailable."
        action={<Badge variant={m.remoteControlEnabled ? 'accent' : 'outline'}>{m.remoteControlEnabled ? 'On' : 'Off'}</Badge>}
      >
        <SettingsRow
          label="Keep this device available for Spice Connect"
          description="Let your other signed-in SPICE devices find and control playback here."
          htmlFor={enabledId}
        >
          <Switch id={enabledId} checked={m.remoteControlEnabled} onCheckedChange={toggleRemoteControl} />
        </SettingsRow>

        <SettingsRow
          label="This Spice Connect device"
          htmlFor={nameId}
          description={
            <>
              Connect ID <code className={s.inlineCode}>{m.remoteDeviceId.slice(0, 8)}</code>. Sign in on another device with the same
              account, keep SPICE open, then choose it here.
            </>
          }
        >
          <Input
            id={nameId}
            type="text"
            value={m.remoteDeviceName}
            onChange={(event) => {
              m.setRemoteDeviceName(event.target.value);
              persistLocal(REMOTE_DEVICE_NAME_STORAGE_KEY, event.target.value);
            }}
            placeholder="Living room speaker"
            wrapperClassName={s.controlWide}
          />
        </SettingsRow>

        <SettingsBlock className={s.block}>
          <div className={s.blockHeader}>
            <div className={s.blockHeaderText}>
              <h3 className={s.blockTitle}>Player receiver</h3>
              <p className={s.blockDescription}>
                {hasAuth
                  ? `${devices.length} other Spice Connect device(s) visible. The player uses this same receiver.`
                  : 'Sign in or pair this device to see Spice Connect devices.'}
              </p>
            </div>
            <Button size="sm" variant="outline" icon="refresh" className={s.touch} onClick={refreshReceivers} disabled={!hasAuth}>
              Refresh
            </Button>
          </div>

          <div className={s.fieldStack}>
            <label htmlFor={receiverId} className={s.fieldLabel}>
              Control playback on
            </label>
            <Select
              id={receiverId}
              value={m.selectedRemoteDeviceId}
              onChange={(value) => m.selectSpiceConnectReceiver(value)}
              options={receiverOptions}
              disabled={!hasAuth}
              wrapperClassName={s.controlWide}
            />
          </div>

          {devices.length > 0 ? (
            <ul className={s.deviceList} aria-label="Spice Connect devices">
              {devices.map((device) => (
                <ReceiverDeviceRow
                  key={`remembered-${device.deviceId}`}
                  device={device}
                  selected={device.deviceId === m.selectedRemoteDeviceId}
                  lan={m.remoteLanPeerDeviceIds.includes(device.deviceId)}
                  forgetting={m.forgettingRemoteDeviceIds.has(device.deviceId)}
                  statusLabel={m.receiverStatusLabel(device)}
                  canSelect={hasAuth}
                  onSelect={m.selectSpiceConnectReceiver}
                  onForget={m.forgetSpiceConnectDevice}
                />
              ))}
            </ul>
          ) : null}

          {selected ? (
            <div className={s.receiverPanel}>
              <div className={s.nowPlaying}>
                <Artwork src={selected.currentTrack?.artworkUrl || '/icon.svg'} size={48} />
                <div className={s.nowPlayingText}>
                  <span className={s.nowPlayingTitle}>{selected.currentTrack?.title || 'No active track'}</span>
                  <span className={s.nowPlayingSubtitle}>
                    {(selected.currentTrack ? artistNames(selected.currentTrack) : '') || selected.displayName}
                  </span>
                  <span className={s.nowPlayingMeta}>Last seen {lastSeenMinutesLabel(selected)}m ago</span>
                </div>
              </div>

              <div className={s.transport} role="group" aria-label={`Control ${selected.displayName}`}>
                <Button variant="outline" size="sm" icon="skipBack" className={s.touch} onClick={() => m.handleReceiverPrev()}>
                  Previous
                </Button>
                <Button size="sm" icon={selected.isPlaying ? 'pause' : 'play'} className={s.touch} onClick={() => m.toggleReceiverPlayPause()}>
                  {selected.isPlaying ? 'Pause' : 'Play'}
                </Button>
                <Button variant="outline" size="sm" icon="skipForward" className={s.touch} onClick={() => m.handleReceiverNext()}>
                  Next
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={s.touch}
                  aria-label="Seek back 15 seconds"
                  onClick={() => void m.sendRemoteCommand('seek', { progress: Math.max(0, selected.progress - 15) })}
                >
                  -15s
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={s.touch}
                  aria-label="Seek forward 15 seconds"
                  onClick={() =>
                    void m.sendRemoteCommand('seek', {
                      progress: Math.min(selected.duration || selected.progress + 15, selected.progress + 15),
                    })
                  }
                >
                  +15s
                </Button>
              </div>

              <ReceiverVolume volume={selected.volume} onVolumeChange={m.setReceiverVolume} />

              <Button
                block
                icon="cast"
                onClick={() => void m.handoffPlaybackToSelectedDevice()}
                disabled={m.currentTrack.id === 'placeholder' || selected.isOnline === false}
                title="Transfer the current track, queue, position, volume, shuffle, and repeat state"
              >
                Move this playback to {selected.displayName}
              </Button>
            </div>
          ) : null}

          {m.remoteStatus ? (
            <p className={s.status} role="status" aria-live="polite" data-tone={statusIsError ? 'danger' : undefined}>
              {m.remoteStatus}
            </p>
          ) : null}
        </SettingsBlock>

        <SettingsBlock className={s.block}>
          <div className={s.blockHeaderText}>
            <h3 className={s.blockTitle}>Connection route</h3>
            <p className={s.blockDescription}>How playback commands currently reach the selected receiver.</p>
          </div>
          <div role="status" aria-live="polite">
            <dl className={s.kvList}>
              <div className={s.kvItem}>
                <dt className={s.kvLabel}>Playback command route</dt>
                <dd className={s.kvValue} data-accent={m.selectedRemoteDeviceId ? 'true' : undefined} data-muted={m.selectedRemoteDeviceId ? undefined : 'true'}>
                  {m.remoteCommandRouteLabel}
                </dd>
              </div>
              <div className={s.kvItem}>
                <dt className={s.kvLabel}>Cloud signaling and fallback</dt>
                <dd className={s.kvValue} data-muted="true">
                  {m.remoteCloudPathLabel}
                </dd>
              </div>
            </dl>
          </div>
          <p className={s.note}>
            The direct path uses local-only WebRTC host candidates; cloud signaling authenticates the peer and remains the fallback. The playback
            route above updates only after the direct data channel is verified, so a command can use cloud while that link is still negotiating.
            The Android app uses the same direct protocol.
          </p>
        </SettingsBlock>

        <SecurePairing
          key={`${m.activeProfileId}:${m.cloudUser?.id ?? 'paired'}`}
          accountAvailable={Boolean(m.cloudToken)}
          pairedCredentialActive={Boolean(m.activePairedRemoteCredential)}
          deviceName={m.remoteDeviceName}
          onCreateCode={m.createSecurePairingCode}
          onCancelCode={m.cancelSecurePairingCode}
          onClaimCode={m.claimSecurePairingCode}
          onLoadAuthorizations={m.loadSecurePairingAuthorizations}
          onRevokeAuthorization={m.revokeSecurePairingAuthorization}
          onForgetCredential={m.forgetLocalPairingCredential}
        />

        <SettingsRow
          label="Transport diagnostics"
          htmlFor={diagnosticsId}
          description={
            <>
              Show a floating trace of which route each Spice Connect command takes. Shortcut <Kbd>Ctrl</Kbd> <Kbd>Shift</Kbd> <Kbd>Alt</Kbd> <Kbd>L</Kbd>
            </>
          }
        >
          <Switch id={diagnosticsId} checked={m.remoteTransportDiagnosticsEnabled} onCheckedChange={setTransportDiagnostics} />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

function ReceiverDeviceRow({
  device,
  selected,
  lan,
  forgetting,
  statusLabel,
  canSelect,
  onSelect,
  onForget,
}: {
  device: RemoteDevice;
  selected: boolean;
  lan: boolean;
  forgetting: boolean;
  statusLabel: string;
  canSelect: boolean;
  onSelect: (deviceId: string) => void;
  onForget: (deviceId: string) => Promise<void>;
}) {
  const online = device.isOnline !== false;
  const items: MenuEntry[] = [
    selected
      ? {
          key: 'disconnect',
          label: 'Play on this device instead',
          description: 'Switch the receiver back to this browser',
          icon: 'laptop',
          disabled: !canSelect,
          onSelect: () => onSelect(LOCAL_RECEIVER_VALUE),
        }
      : { key: 'control', label: 'Control this device', icon: 'cast', disabled: !canSelect, onSelect: () => onSelect(device.deviceId) },
    { type: 'separator', key: 'forget-sep' },
    {
      key: 'forget',
      label: `Forget ${device.displayName}`,
      description: 'Remove it from Spice Connect',
      icon: 'trash',
      destructive: true,
      disabled: forgetting,
      onSelect: () => void onForget(device.deviceId),
    },
  ];
  return (
    <li className={s.deviceRow} data-selected={selected ? 'true' : undefined}>
      <span className={s.deviceIcon} data-online={online ? 'true' : undefined} aria-hidden="true">
        <Icon name="monitor" size={16} />
      </span>
      <span className={s.deviceText}>
        <span className={s.deviceName}>
          <span className={s.deviceNameText}>{device.displayName}</span>
        </span>
        <span className={s.deviceMeta}>{selected ? `Currently connected - ${statusLabel}` : statusLabel}</span>
      </span>
      <span className={s.deviceBadges}>
        {selected ? <Badge variant="accent">Connected</Badge> : null}
        {lan ? <Badge variant="info">LAN</Badge> : null}
        <Badge variant={!online ? 'outline' : device.isPlaying ? 'success' : 'secondary'}>{deviceStateLabel(device)}</Badge>
      </span>
      <DropdownMenu
        items={items}
        label={`${device.displayName} actions`}
        trigger={(props) => (
          <IconButton {...props} icon="more" label={`Actions for ${device.displayName}`} size="sm" className={s.touch} loading={forgetting} />
        )}
      />
    </li>
  );
}

/**
 * Connected-device volume. The wheel handler matches the classic slider (5%
 * steps, 25% with Shift) and is registered non-passively so it can stop the
 * page from scrolling.
 */
function ReceiverVolume({ volume, onVolumeChange }: { volume: number; onVolumeChange: (volume: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onVolumeChange);
  useEffect(() => {
    onChangeRef.current = onVolumeChange;
  });
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!delta) return;
      event.preventDefault();
      const maxAllowed = 100;
      const step = event.shiftKey ? 25 : 5;
      onChangeRef.current(Math.max(0, Math.min(maxAllowed, Number(input.value) + (delta < 0 ? step : -step))));
    };
    input.addEventListener('wheel', onWheel, { passive: false });
    return () => input.removeEventListener('wheel', onWheel);
  }, []);
  return (
    <div className={s.volumeRow}>
      <Icon name={volume <= 0 ? 'volumeMute' : volume < 50 ? 'volumeLow' : 'volume'} size={16} className={s.volumeIcon} />
      <span className={s.volumeLabel} aria-hidden="true">
        Connected device volume
      </span>
      <Slider
        ref={inputRef}
        className={s.volumeSlider}
        min={0}
        max={100}
        value={volume}
        onValueChange={onVolumeChange}
        label="Connected device volume"
        valueText={`${Math.round(volume)}%`}
        accent
        showThumb
      />
      <span className={s.volumeValue} aria-hidden="true">
        {Math.round(volume)}%
      </span>
    </div>
  );
}
