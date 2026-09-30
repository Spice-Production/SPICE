'use client';

import { useId } from 'react';

import type { NativeShellPreferences, NativeToolbarButtonKey } from '../../../spice-app';
import { useSpiceUi } from '../../context';
import { Icon, type IconName } from '../../icons';
import { Artwork } from '../../media';
import {
  Alert,
  Badge,
  Button,
  Progress,
  SettingsBlock,
  SettingsRow,
  SettingsSection,
  Switch,
  Textarea,
  type BadgeVariant,
} from '../../primitives';
import { MusicRuntimeSection } from './b-music-runtime';
import s from './b-settings.module.css';

const TOOLBAR_ICONS: Record<NativeToolbarButtonKey, IconName> = {
  back: 'arrowLeft',
  reload: 'refresh',
  home: 'home',
  volume: 'volume',
  lyrics: 'micVocal',
  miniPlayer: 'pictureInPicture',
  queue: 'listMusic',
};

const UTILITY_URLS: ReadonlyArray<{ url: string; label: string; description: string }> = [
  { url: 'http://localhost:6969/mini-player/', label: 'Mini Player', description: 'Compact player for a browser window.' },
  { url: 'http://localhost:6969/obs/', label: 'OBS', description: 'Now-playing overlay for an OBS Browser Source.' },
];

/** Shell messages are either confirmations or "Could not ..." failures. */
function ShellMessage({ message }: { message: string }) {
  const failed = /^could not/i.test(message);
  return (
    <Alert variant={failed ? 'danger' : 'success'} className={s.message}>
      {message}
    </Alert>
  );
}

/**
 * Group `desktop`: sections `desktop-updates`, `native-shell`,
 * `music-runtime`, and `discord-activity`. Each renders only where the
 * classic interface shows it (desktop updater / SPICE Native shell).
 */
export function DesktopSettings() {
  const m = useSpiceUi();
  const nativeSettings = m.nativeShellAvailable ? m.nativeShellSettings : null;
  if (!m.desktopUpdaterAvailable && !m.nativeShellAvailable) return null;
  return (
    <div className={s.group}>
      {m.desktopUpdaterAvailable ? <DesktopUpdatesSection /> : null}
      {nativeSettings ? <NativeShellSection settings={nativeSettings} /> : null}
      {m.nativeShellAvailable ? <MusicRuntimeSection /> : null}
      {nativeSettings ? <DiscordActivitySection settings={nativeSettings} /> : null}
    </div>
  );
}

/* ── SPICE Desktop updates ──────────────────────────────────── */

function DesktopUpdatesSection() {
  const m = useSpiceUi();
  const bootId = useId();
  const update = m.nativeUpdateStatus;
  const status = update?.status;
  const badge: { label: string; variant: BadgeVariant } =
    status === 'downloaded'
      ? { label: 'Ready', variant: 'success' }
      : status === 'error'
        ? { label: 'Error', variant: 'danger' }
        : { label: 'Updater', variant: 'outline' };
  const checking = m.nativeShellBusy === 'updates';
  const downloadPercent = status === 'downloading' ? Math.round(update?.progress?.percent ?? 0) : null;

  return (
    <SettingsSection
      id="desktop-updates"
      icon="laptop"
      title="SPICE Desktop"
      description="Keep the desktop app up to date and choose how it starts."
      action={<Badge variant={badge.variant}>{badge.label}</Badge>}
    >
      <SettingsRow
        label="App updates"
        description={
          <span role="status" aria-live="polite" className={status === 'error' ? s.dangerText : undefined}>
            {m.nativeUpdateStatusMessage(update)}
          </span>
        }
      >
        <Button variant="outline" size="sm" icon="refresh" className={s.touch} loading={checking} onClick={() => void m.checkDesktopUpdates()}>
          {checking ? 'Checking...' : 'Check for updates'}
        </Button>
        {status === 'downloaded' ? (
          <Button size="sm" icon="rotateCcw" className={s.touch} onClick={() => m.getSpiceDesktopUpdaterBridge()?.installUpdate()}>
            Restart and install
          </Button>
        ) : null}
      </SettingsRow>

      {downloadPercent !== null ? (
        <SettingsBlock>
          <Progress value={downloadPercent} label="Update download progress" />
        </SettingsBlock>
      ) : null}

      {m.desktopStartOnBoot?.supported ? (
        <SettingsRow
          label="Start SPICE on boot"
          description="Open SPICE automatically when you sign in to this computer. Off by default."
          htmlFor={bootId}
        >
          <Switch
            id={bootId}
            checked={m.desktopStartOnBoot.enabled}
            disabled={m.nativeShellBusy === 'startOnBoot'}
            onCheckedChange={(checked) => void m.updateDesktopStartOnBoot(checked)}
          />
        </SettingsRow>
      ) : null}

      {m.desktopStartOnBootMessage ? (
        <SettingsBlock>
          <ShellMessage message={m.desktopStartOnBootMessage} />
        </SettingsBlock>
      ) : null}
    </SettingsSection>
  );
}

/* ── SPICE Native shell ─────────────────────────────────────── */

function NativeShellSection({ settings }: { settings: NativeShellPreferences }) {
  const m = useSpiceUi();
  const topId = useId();
  const cssId = useId();
  const cssDirty = m.nativeShellCssDraft !== (settings.customCss || '');

  return (
    <SettingsSection
      id="native-shell"
      icon="monitor"
      title="SPICE Native Desktop"
      description="Native shell controls now live here. The standard SPICE wrapper keeps its separate Desktop Settings window."
      action={<Badge variant="outline">Native only</Badge>}
      footer={
        <p className={s.footerNote}>
          Last.fm and ListenBrainz for SPICE playback remain in Listening Profile Sync. YouTube Music and SoundCloud desktop scrobbling
          remains wrapper-only.
        </p>
      }
    >
      {m.nativeShellMessage ? (
        <SettingsBlock>
          <ShellMessage message={m.nativeShellMessage} />
        </SettingsBlock>
      ) : null}

      <SettingsRow
        label="Always on Top"
        description="Keep the SPICE Native window above other applications and remember the choice."
        htmlFor={topId}
      >
        <Switch
          id={topId}
          checked={settings.alwaysOnTop}
          disabled={m.nativeShellBusy === 'alwaysOnTop'}
          onCheckedChange={(checked) => void m.updateNativeShellBoolean('alwaysOnTop', checked)}
        />
      </SettingsRow>

      <SettingsBlock className={s.block}>
        <div className={s.blockHeaderText}>
          <h3 className={s.blockTitle}>Desktop toolbar controls</h3>
          <p className={s.blockDescription}>
            Choose the icons shown in the Native title bar. Settings and window controls always remain available.
          </p>
        </div>
        <div className={s.optionGrid} role="group" aria-label="Desktop toolbar controls">
          {m.NATIVE_TOOLBAR_CONTROLS.map((control) => {
            const checked = settings.toolbarButtons[control.id] !== false;
            return (
              <button
                key={control.id}
                type="button"
                role="checkbox"
                aria-checked={checked}
                className={s.optionTile}
                onClick={() => m.updateNativeToolbarControl(control.id, !checked)}
              >
                <span className={s.optionCheck} aria-hidden="true">
                  {checked ? <Icon name="check" size={12} strokeWidth={3} /> : null}
                </span>
                <span className={s.optionText}>
                  <span className={s.optionLabel}>{control.label}</span>
                  <span className={s.optionDescription}>{control.description}</span>
                </span>
                <Icon name={TOOLBAR_ICONS[control.id] ?? 'grid'} size={16} className={s.optionIcon} />
              </button>
            );
          })}
        </div>
      </SettingsBlock>

      <SettingsBlock className={s.block}>
        <div className={s.blockHeader}>
          <div className={s.blockHeaderText}>
            <h3 className={s.blockTitle}>
              <label htmlFor={cssId}>Custom desktop CSS</label>
            </h3>
            <p className={s.blockDescription}>
              Apply optional CSS to the Electron shell and embedded Native view. SPICE theme settings remain authoritative.
            </p>
          </div>
          {cssDirty ? <Badge variant="warning">Unsaved</Badge> : null}
        </div>
        <Textarea
          id={cssId}
          className={s.codeEditor}
          value={m.nativeShellCssDraft}
          onChange={(event) => m.setNativeShellCssDraft(event.target.value)}
          spellCheck={false}
          placeholder=":root { --accent: #ff4d8d; }"
          aria-label="Custom desktop CSS"
          rows={6}
        />
        <div className={`${s.actions} ${s.actionsEnd}`}>
          <Button
            variant="ghost"
            size="sm"
            className={s.touch}
            onClick={m.clearNativeShellCss}
            disabled={!m.nativeShellCssDraft && !settings.customCss}
          >
            Clear
          </Button>
          <Button size="sm" icon="save" className={s.touch} onClick={m.saveNativeShellCss}>
            Save CSS
          </Button>
        </div>
      </SettingsBlock>

      <SettingsBlock className={s.block}>
        <div className={s.blockHeader}>
          <div className={s.blockHeaderText}>
            <h3 className={s.blockTitle}>Mini Player &amp; OBS</h3>
            <p className={s.blockDescription}>Use the local desktop companion surfaces from a browser or OBS Browser Source.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon="terminal"
            className={s.touch}
            onClick={() => m.getSpiceNativeShellBridge()?.openDevTools()}
          >
            Open developer console
          </Button>
        </div>
        <ul className={s.linkList} aria-label="Desktop companion URLs">
          {UTILITY_URLS.map((item) => (
            <li key={item.url} className={s.linkRow}>
              <span className={s.linkText}>
                <span className={s.linkLabel}>{item.label}</span>
                <code className={s.linkCode}>{item.url}</code>
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon="copy"
                className={s.touch}
                aria-label={`Copy ${item.label} URL`}
                title={item.description}
                onClick={() => void m.copyNativeUtilityUrl(item.url, item.label)}
              >
                Copy
              </Button>
            </li>
          ))}
        </ul>
      </SettingsBlock>
    </SettingsSection>
  );
}

/* ── Discord activity ───────────────────────────────────────── */

function DiscordActivitySection({ settings }: { settings: NativeShellPreferences }) {
  const m = useSpiceUi();
  const rpcId = useId();
  const track = m.currentTrack;
  const idle = track.id === 'placeholder';
  const discordMessage = m.nativeShellMessage?.startsWith('Discord Rich Presence') ? m.nativeShellMessage : null;

  return (
    <SettingsSection
      id="discord-activity"
      icon="activity"
      title="Discord Activity"
      description="Show the current song, artist, live elapsed time, cover artwork, and a public SPICE action on your Discord profile."
      action={<Badge variant="outline">Native only</Badge>}
    >
      <SettingsRow
        label="Enable Discord Rich Presence"
        description="SPICE updates Discord on track changes, play/pause, repeats, and seeks while keeping Discord's activity rate limit."
        htmlFor={rpcId}
      >
        <Switch
          id={rpcId}
          checked={settings.discordRpcEnabled}
          disabled={m.nativeShellBusy === 'discordRpcEnabled'}
          onCheckedChange={(checked) => void m.updateNativeShellBoolean('discordRpcEnabled', checked)}
        />
      </SettingsRow>

      <SettingsBlock className={s.block}>
        <span className={s.activityEyebrow}>Preview</span>
        <div className={s.activityCard} aria-label="Discord activity preview" data-disabled={settings.discordRpcEnabled ? undefined : 'true'}>
          <Artwork src={track.artworkUrl || track.album?.artworkUrl || '/icon.svg'} size={56} />
          <div className={s.nowPlayingText}>
            <span className={s.nowPlayingTitle}>{idle ? 'Nothing playing' : track.title}</span>
            <span className={s.nowPlayingSubtitle}>{idle ? 'SPICE Music' : `by ${m.profileArtistName(track)}`}</span>
            <span className={s.nowPlayingMeta}>{idle ? 'Activity appears when playback starts' : 'Listen on SPICE · Live track time'}</span>
          </div>
        </div>
      </SettingsBlock>

      {discordMessage ? (
        <SettingsBlock>
          <ShellMessage message={discordMessage} />
        </SettingsBlock>
      ) : null}
    </SettingsSection>
  );
}
