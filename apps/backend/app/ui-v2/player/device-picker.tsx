'use client';

/**
 * Spice Connect receiver picker, rebuilt from the classic
 * renderSpiceConnectReceiverOption / renderSpiceConnectReceiverSelect
 * renderers (app/spice-app.tsx ~11895-12012) as a popover. `variant` controls
 * the trigger's shape only — the behavior underneath is identical everywhere.
 */

import type { MouseEvent as ReactMouseEvent } from 'react';

import type { ReceiverSelectVariant } from '../../spice-app';
import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { Button, cn, IconButton, Popover } from '../primitives';
import s from './device-picker.module.css';

function DeviceRow({
  label,
  detail,
  selected,
  forgetting,
  onSelect,
  onForget,
}: {
  label: string;
  detail: string;
  selected: boolean;
  forgetting?: boolean;
  onSelect: () => void;
  onForget?: () => void;
}) {
  return (
    <div className={s.row}>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        className={cn(s.option, selected && s.optionSelected)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onSelect}
      >
        <Icon name="monitor" size={16} className={s.optionIcon} />
        <span className={s.optionCopy}>
          <span className={s.optionLabel}>{label}</span>
          <span className={s.optionDetail}>{detail}</span>
        </span>
        {selected ? <Icon name="check" size={14} className={s.optionCheck} /> : null}
      </button>
      {onForget ? (
        <IconButton
          icon="x"
          label={`Forget ${label}`}
          size="xs"
          loading={forgetting}
          disabled={forgetting}
          className={s.forgetBtn}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onForget();
          }}
        />
      ) : null}
    </div>
  );
}

export function DevicePicker({ variant, className }: { variant: ReceiverSelectVariant; className?: string }) {
  const m = useSpiceUi();
  const open = m.receiverMenuOpen === variant;
  const detail = m.receiverSelectDisabled
    ? 'Sign in or pair to choose devices'
    : m.selectedRemoteDevice
      ? m.receiverStatusLabel(m.selectedRemoteDevice)
      : m.incomingRemoteController
        ? `Controlled by ${m.incomingRemoteController.displayName}`
        : m.receiverStatusLabel(null);

  // Mirrors the classic trigger: when signed out it only explains itself and
  // never opens the menu; otherwise it refreshes the list and toggles.
  const onTrigger = (event: ReactMouseEvent<HTMLElement>, toggle: (event: ReactMouseEvent<HTMLElement>) => void) => {
    if (m.receiverSelectDisabled) {
      m.showSpiceNotice('Sign in or pair this device to choose another playback device.', 'warning');
      return;
    }
    m.refreshSpiceConnectReceiverList();
    toggle(event);
  };
  const triggerTitle = m.receiverSelectDisabled ? 'Sign in or pair to choose another receiver' : `Receiver: ${m.receiverLabel}`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => m.setReceiverMenuOpen(next ? variant : null)}
      label="Choose Spice Connect receiver"
      align={variant === 'expanded' ? 'center' : 'end'}
      width={280}
      trigger={(props) =>
        variant === 'bar' ? (
          <IconButton
            {...props}
            icon="monitor"
            label={`Playback device: ${m.receiverLabel}`}
            title={triggerTitle}
            active={m.isControllingRemoteReceiver}
            className={cn(m.receiverSelectDisabled && s.triggerDisabled, className)}
            onFocus={m.receiverSelectDisabled ? undefined : m.refreshSpiceConnectReceiverList}
            onClick={(event) => onTrigger(event, props.onClick)}
          />
        ) : (
          <button
            {...props}
            type="button"
            className={cn(s.trigger, variant === 'mini' && s['trigger-mini'], m.receiverSelectDisabled && s.triggerDisabled, className)}
            data-active={m.isControllingRemoteReceiver ? 'true' : undefined}
            title={triggerTitle}
            onFocus={m.receiverSelectDisabled ? undefined : m.refreshSpiceConnectReceiverList}
            onClick={(event) => onTrigger(event, props.onClick)}
          >
            <Icon name="monitor" size={16} />
            <span className={s.triggerCopy}>
              <strong className={s.triggerLabel}>{m.receiverLabel}</strong>
              <small className={s.triggerDetail}>{detail}</small>
            </span>
            <Icon name="chevronDown" size={14} className={s.triggerChevron} />
          </button>
        )
      }
    >
      {(close) => (
        <div className={s.panel} onPointerDown={(event) => event.stopPropagation()}>
          <div className={s.panelHeader}>
            <span className={s.panelTitle}>Playback device</span>
            <IconButton icon="refresh" label="Refresh device list" size="xs" onClick={() => m.refreshSpiceConnectReceiverList()} />
          </div>
          <div role="listbox" aria-label="Choose Spice Connect receiver" className={s.list}>
            <DeviceRow
              label="This device"
              detail="Play and control locally"
              selected={!m.selectedRemoteDeviceId}
              onSelect={() => {
                m.selectSpiceConnectReceiver('');
                close();
              }}
            />
            {m.remoteTargetDevices.length > 0 ? (
              m.remoteTargetDevices.map((device) => (
                <DeviceRow
                  key={device.deviceId}
                  label={device.displayName}
                  detail={m.receiverStatusLabel(device)}
                  selected={m.selectedRemoteDeviceId === device.deviceId}
                  forgetting={m.forgettingRemoteDeviceIds.has(device.deviceId)}
                  onSelect={() => {
                    m.selectSpiceConnectReceiver(device.deviceId);
                    close();
                  }}
                  onForget={() => void m.forgetSpiceConnectDevice(device.deviceId)}
                />
              ))
            ) : (
              <p className={s.empty}>No other remembered devices.</p>
            )}
          </div>
          {m.selectedRemoteDevice ? (
            <div className={s.panelFooter}>
              <Button
                variant="outline"
                size="sm"
                icon="externalLink"
                block
                disabled={m.currentTrack.id === 'placeholder' || m.selectedRemoteDevice.isOnline === false}
                title="Transfer the current track, queue, position, volume, shuffle, and repeat state"
                onClick={() => {
                  void m.handoffPlaybackToSelectedDevice();
                  close();
                }}
              >
                Move playback to {m.selectedRemoteDevice.displayName}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Popover>
  );
}
