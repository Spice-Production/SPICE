'use client';

/**
 * Group `playback`: sections `search-sources`, `audio-streaming`,
 * `profile-sync`, `player-layout`, `playback-profiles`. Mirrors
 * app/spice-app.tsx lines ~18180-18509.
 */

import { useId } from 'react';

import type { PlayerBarDensity, PlayerVisualStyle, SearchProvider } from '../../../spice-app';
import { useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import { Badge, Button, Input, Select, SettingsBlock, SettingsRow, SettingsSection, Switch } from '../../primitives';
import { ChoiceGroup, StatusText, type ChoiceOption } from './a-controls';
import { persistLocal } from './b-storage';
import { PlaybackProfiles } from './playback-profiles';
import s from './settings.module.css';

const AUDIO_QUALITY_OPTIONS = [
  { value: 'high' as const, label: 'High Definition (Best Available AAC)' },
  { value: 'standard' as const, label: 'Standard Balanced (Browser Compatible)' },
  { value: 'low' as const, label: 'Data Saver (Lowest Available Stream)' },
];

const STREAM_PROTOCOL_OPTIONS = [
  { value: 'proxy' as const, label: 'Signed Direct Audio Proxy (Recommended)' },
  { value: 'web' as const, label: 'YouTube InnerTube Web Stream (Attestation)' },
  { value: 'embed' as const, label: 'YouTube Embedded Player (Fallback)' },
];

const PLAYER_PLACEMENT_OPTIONS: ChoiceOption<'bottom' | 'top'>[] = [
  { value: 'bottom', label: 'Bottom docked' },
  { value: 'top', label: 'Top header' },
];

const PLAYER_VIEW_MODE_OPTIONS: ChoiceOption<'bar' | 'expanded' | 'mini'>[] = [
  { value: 'bar', label: 'Bar', icon: 'listMusic' },
  { value: 'expanded', label: 'Immersive', icon: 'maximize' },
  { value: 'mini', label: 'Mini', icon: 'pictureInPicture' },
];

export function PlaybackSettings() {
  const m = useSpiceUi();
  // Destructured with names ending in "Ref" so the lint recognizes these as
  // refs and allows the same synchronous `.current` writes the classic
  // handlers make (see app/spice-app.tsx's search-sources / profile-sync handlers).
  const { streamProtocolRef, listenBrainzSaveTimeoutRef } = m;
  const searchProviderId = useId();
  const audioQualityId = useId();
  const streamProtocolId = useId();
  const syncEnabledId = useId();
  const listenBrainzNoteId = useId();
  const listenBrainzId = useId();
  const playerStyleId = useId();

  const attentionItems = m.syncOutboxItems.filter((item) => item.status === 'attention');
  const hasAttention = attentionItems.length > 0;
  const lastFmLinked = Boolean(m.lastFmSessionKey || m.lastFmAccountLinked);
  const lastFmError = Boolean(
    m.lastFmLinkStatus && (m.lastFmLinkStatus.includes('failed') || m.lastFmLinkStatus.includes('required') || m.lastFmLinkStatus.includes('blocked')),
  );
  const showLastFmPlaybackStatus = m.profileSyncEnabled && lastFmLinked && m.currentTrack.id !== 'placeholder' && Boolean(m.lastFmPlaybackStatus);
  const listenBrainzError = Boolean(m.listenBrainzLinkStatus && (m.listenBrainzLinkStatus.includes('failed') || m.listenBrainzLinkStatus.includes('Sign in')));

  return (
    <div className={s.group}>
      <SettingsSection
        id="search-sources"
        title="Search sources"
        icon="search"
        description="Choose whether searches combine YouTube and SoundCloud or stay on one provider. This also updates the selector on the Search page."
      >
        <SettingsRow label="Default music provider" htmlFor={searchProviderId}>
          <Select
            id={searchProviderId}
            wrapperClassName={s.selectControl}
            value={m.searchProvider}
            options={(Object.entries(m.SEARCH_PROVIDER_LABELS) as [SearchProvider, string][]).map(([value, label]) => ({ value, label }))}
            onChange={(value) => {
              m.setSearchProvider(value);
              persistLocal('spice_search_provider', value);
            }}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="audio-streaming"
        title="Audio & quality"
        icon="volume"
        description="Fine-tune streaming codecs and bitrates to match your current network speed or data constraints."
      >
        <SettingsRow label="Audio playback quality" htmlFor={audioQualityId}>
          <Select
            id={audioQualityId}
            wrapperClassName={s.selectControl}
            value={m.audioQuality}
            options={AUDIO_QUALITY_OPTIONS}
            onChange={(value) => {
              m.setAudioQuality(value);
              persistLocal('spice_audio_quality', value);
            }}
          />
        </SettingsRow>
        <SettingsRow label="Stream endpoint transport" htmlFor={streamProtocolId}>
          <Select
            id={streamProtocolId}
            wrapperClassName={s.selectControl}
            value={m.streamProtocol}
            options={STREAM_PROTOCOL_OPTIONS}
            onChange={(value) => {
              m.setStreamProtocol(value);
              streamProtocolRef.current = value;
              persistLocal('spice_stream_protocol', value);
              if (value === 'embed') persistLocal('spice_stream_embed_migration_v1034', 'true');
            }}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="profile-sync"
        title="Listening sync"
        icon="database"
        description="Update your Last.fm and ListenBrainz profiles from playback. Search stays focused on playable providers."
        action={<Badge variant={m.profileSyncStatus === 'error' ? 'danger' : 'secondary'}>{m.PROFILE_SYNC_STATUS_LABELS[m.profileSyncStatus]}</Badge>}
      >
        <SettingsBlock>
          <div className={s.outbox} data-attention={hasAttention ? 'true' : undefined}>
            <div className={s.outboxIcon}>
              <Icon name={hasAttention ? 'alertTriangle' : 'cloud'} size={16} />
            </div>
            <div className={s.outboxText}>
              <p className={s.outboxTitle}>Cloud change outbox</p>
              <p className={s.status}>
                {m.syncOutboxItems.length === 0
                  ? 'All local changes delivered'
                  : `${m.syncOutboxItems.length} latest change${m.syncOutboxItems.length === 1 ? '' : 's'} queued across profiles`}
              </p>
              {attentionItems.length > 0 ? (
                <ul className={s.outboxItems}>
                  {attentionItems.slice(0, 3).map((item) => (
                    <li key={`${item.profileId}:${item.kind}`}>
                      {item.kind} · {item.error || 'Cloud rejected this change.'}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {hasAttention ? (
              <Button variant="outline" size="sm" onClick={() => m.syncOutboxRef.current?.retryAttentionItems()}>
                Retry attention items
              </Button>
            ) : null}
          </div>
        </SettingsBlock>

        <SettingsRow label="Now-playing & scrobble sync" htmlFor={syncEnabledId} description="Enable now-playing and scrobble updates.">
          <Switch
            id={syncEnabledId}
            checked={m.profileSyncEnabled}
            onCheckedChange={(checked) => {
              m.setProfileSyncEnabled(checked);
              persistLocal('spice_profile_sync_enabled', String(checked));
            }}
          />
        </SettingsRow>

        <SettingsBlock>
          <div className={s.syncGrid}>
            <div className={s.block}>
              <div className={s.blockHeader}>
                <div className={s.blockHeaderText}>
                  <p className={s.blockTitle}>Last.fm account</p>
                  <p className={s.blockDescription}>
                    Uses backend Last.fm API credentials. Signed-in SPICE accounts store the approved session in the backend. Callback route:{' '}
                    <span className={s.mono}>{m.spiceApiUrl('cloud', '/lastfm/callback')}</span>.
                  </p>
                </div>
                {m.lastFmLinkedUser ? <Badge variant="success">Linked: {m.lastFmLinkedUser}</Badge> : null}
              </div>

              <div className={s.account}>
                <div className={s.accountIcon} data-linked={lastFmLinked ? 'true' : undefined}>
                  <Icon name="radio" size={16} />
                </div>
                <div className={s.accountText}>
                  <span className={s.accountName}>{lastFmLinked ? m.lastFmLinkedUser || 'Last.fm connected' : 'No Last.fm account linked'}</span>
                  <span className={s.accountHint}>
                    {m.lastFmAccountLinked
                      ? 'Saved to your SPICE account, so it can be restored after clearing browser storage.'
                      : m.lastFmSessionKey
                        ? 'Saved locally. Sign in to SPICE before setup to keep it backed up on the account.'
                        : 'Click setup, sign in through Last.fm, and the callback will finish the link automatically.'}
                  </span>
                </div>
                <Button variant="default" size="sm" loading={m.isLinkingLastFm} onClick={() => void m.handleLinkLastFm()}>
                  {m.isLinkingLastFm ? 'Opening…' : 'Set up Last.fm'}
                </Button>
              </div>

              <StatusText tone={lastFmError ? 'error' : 'muted'} live>
                {m.lastFmLinkStatus || 'Click Set up Last.fm, approve the popup, and SPICE will finish the account link.'}
              </StatusText>

              {showLastFmPlaybackStatus ? (
                <p className={s.playbackStatus} data-tone={m.profileSyncStatus === 'error' ? 'error' : undefined} role="status">
                  {m.lastFmPlaybackStatus}
                </p>
              ) : null}
            </div>

            <div className={s.block}>
              <div className={s.blockHeader}>
                <div className={s.blockHeaderText}>
                  <label htmlFor={listenBrainzId} className={s.blockTitle}>
                    ListenBrainz user token
                  </label>
                  <p id={listenBrainzNoteId} className={s.blockDescription}>
                    Sends temporary playing-now updates and permanent listens after the scrobble threshold.
                  </p>
                </div>
                {m.listenBrainzAccountLinked ? <Badge variant="success">Linked</Badge> : null}
              </div>

              <Input
                id={listenBrainzId}
                type="password"
                aria-describedby={listenBrainzNoteId}
                value={m.listenBrainzToken}
                autoComplete="off"
                placeholder={m.listenBrainzAccountLinked ? 'Token saved on your SPICE account' : 'Paste user token'}
                onChange={(event) => {
                  m.setListenBrainzToken(event.target.value);
                  m.queueListenBrainzTokenSave(event.target.value);
                }}
                onBlur={() => {
                  if (listenBrainzSaveTimeoutRef.current) {
                    clearTimeout(listenBrainzSaveTimeoutRef.current);
                    listenBrainzSaveTimeoutRef.current = null;
                  }
                  void m.saveListenBrainzToken(m.listenBrainzToken);
                }}
              />

              <StatusText>
                {m.listenBrainzAccountLinked
                  ? 'Saved to your SPICE account, so it can be restored after clearing browser storage.'
                  : m.cloudToken
                    ? 'Paste your token and SPICE will save it to your account automatically.'
                    : 'Sign in to SPICE before pasting a token so it is backed up on your account.'}
              </StatusText>

              {m.listenBrainzLinkStatus ? (
                <StatusText tone={listenBrainzError ? 'error' : 'muted'}>{m.listenBrainzLinkStatus}</StatusText>
              ) : null}
            </div>
          </div>
        </SettingsBlock>
      </SettingsSection>

      <SettingsSection
        id="player-layout"
        title="Player"
        icon="play"
        description="Customize the now-playing bar placement, open the immersive full-screen player, or collapse it into a floating picture-in-picture widget."
      >
        <SettingsRow
          label={
            <span className={s.rowLabel}>
              Player visual style <Badge variant="secondary">Classic interface only</Badge>
            </span>
          }
          description="Only changes the now-playing bar's look in the classic interface."
          htmlFor={playerStyleId}
        >
          <Select
            id={playerStyleId}
            wrapperClassName={s.selectControl}
            value={m.playerVisualStyle}
            options={(Object.entries(m.PLAYER_VISUAL_STYLE_LABELS) as [PlayerVisualStyle, string][]).map(([value, label]) => ({ value, label }))}
            onChange={(value) => {
              m.setPlayerVisualStyle(value);
              persistLocal('spice_player_visual_style', value);
            }}
          />
        </SettingsRow>
        <SettingsRow label="Player placement" stacked>
          <ChoiceGroup
            label="Player placement"
            value={m.playerPlacement}
            options={PLAYER_PLACEMENT_OPTIONS}
            onValueChange={(value) => {
              m.setPlayerPlacement(value);
              persistLocal('spice_player_placement', value);
            }}
          />
        </SettingsRow>
        <SettingsRow label="Player view mode" stacked>
          <ChoiceGroup
            label="Player view mode"
            value={m.playerViewMode}
            options={PLAYER_VIEW_MODE_OPTIONS}
            onValueChange={(value) => {
              m.setPlayerViewMode(value);
              persistLocal('spice_player_view_mode', value);
            }}
          />
        </SettingsRow>
        <SettingsRow label="Player bar density" stacked>
          <ChoiceGroup
            label="Player bar density"
            value={m.playerBarDensity}
            options={(Object.entries(m.PLAYER_BAR_DENSITY_LABELS) as [PlayerBarDensity, string][]).map(([value, label]) => ({ value, label }))}
            onValueChange={(value) => {
              m.setPlayerBarDensity(value);
              persistLocal('spice_player_bar_density', value);
            }}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="playback-profiles"
        title="Smart behavior"
        icon="sliders"
        description="Save multiple listening behaviors, smooth direct-audio transitions, and rebuild the queue with repeat-avoidance and artist/source diversity."
      >
        <PlaybackProfiles />
      </SettingsSection>
    </div>
  );
}
