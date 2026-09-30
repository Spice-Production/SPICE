import Constants from 'expo-constants';
import { useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, TextInput, View } from 'react-native';

import { profileInitials } from '../../core/format';
import { ACCENT_THEMES, STREAM_QUALITIES, type AuthMode } from '../../core/models';
import { CROSSFADE_OPTIONS_MS } from '../../core/playback';
import { useController, useSpice } from '../context';
import { Icon } from '../icons';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  Input,
  RadioRow,
  SectionHeader,
  Segmented,
  SettingRow,
  Switch,
  Txt,
} from '../primitives';
import { useTheme } from '../theme';

type SettingsTab = 'General' | 'Playback' | 'About';

export function SettingsScreen({ bottomInset }: { bottomInset: number }) {
  const [tab, setTab] = useState<SettingsTab>('General');
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: bottomInset + 32, gap: 20 }}>
      <Txt variant="display">Settings</Txt>
      <Segmented
        options={[
          { id: 'General', label: 'General' },
          { id: 'Playback', label: 'Playback' },
          { id: 'About', label: 'About' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'General' ? (
        <>
          <AccountSection />
          <ConnectSection />
          <AppearanceSection />
        </>
      ) : tab === 'Playback' ? (
        <PlaybackSection />
      ) : (
        <AboutSection />
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------

function AccountSection() {
  const controller = useController();
  const theme = useTheme();
  const state = useSpice((s) => ({
    session: s.accountSession,
    profile: s.profileSummary?.profile ?? null,
    syncLoading: s.syncLoading,
    accountLoading: s.accountLoading,
    lastSync: s.lastSync,
    verification: s.emailVerification,
    invites: s.pendingAccountInvites,
    invitesLoading: s.accountInvitesLoading,
  }));
  const [mode, setMode] = useState<AuthMode>('SignIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');

  if (state.session) {
    const account = state.session.account;
    const displayName = state.profile?.displayName || account.displayName || account.email.split('@')[0] || 'Spice Listener';
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar uri={state.profile?.avatarUrl || account.avatarUrl} initials={profileInitials(displayName, account.id)} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="heading" lines={1}>
              {displayName}
            </Txt>
            <Txt variant="caption" lines={1}>
              {account.username ? `@${account.username} · ` : ''}
              {account.email}
            </Txt>
          </View>
          <Badge label={state.syncLoading ? 'Syncing' : 'Synced'} tone={state.syncLoading ? 'warning' : 'success'} />
        </View>
        {state.lastSync ? (
          <Txt variant="caption">
            {state.lastSync.likedCount} liked · {state.lastSync.historyCount} history · {state.lastSync.playlistCount} playlists in your cloud library.
          </Txt>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            label="Sync now"
            icon="refresh"
            variant="primary"
            size="sm"
            loading={state.syncLoading}
            disabled={state.accountLoading}
            onPress={() => controller.syncNow()}
            style={{ flex: 1 }}
          />
          <Button label="Edit profile" icon="pencil" size="sm" onPress={() => controller.openProfileEditor()} style={{ flex: 1 }} />
        </View>
        <Divider />
        <SectionHeader
          title="Playlist invites"
          action={
            <Button label="Refresh" size="sm" variant="ghost" loading={state.invitesLoading} onPress={() => controller.refreshPendingAccountInvites()} />
          }
        />
        {state.invites.length === 0 ? (
          <Txt variant="caption">No pending playlist invites.</Txt>
        ) : (
          state.invites.map((invite) => (
            <View key={invite.playlistId} style={{ gap: 8, paddingVertical: 4 }}>
              <View style={{ gap: 2 }}>
                <Txt variant="label" lines={1}>
                  {invite.playlistTitle}
                </Txt>
                <Txt variant="caption" lines={1}>
                  From {invite.ownerDisplayName || invite.ownerUsername || invite.ownerId}
                </Txt>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="Decline" size="sm" variant="outline" disabled={state.invitesLoading} onPress={() => void controller.rejectPendingPlaylistInvite(invite)} style={{ flex: 1 }} />
                <Button label="Accept" size="sm" variant="primary" disabled={state.invitesLoading} onPress={() => void controller.acceptPendingPlaylistInvite(invite)} style={{ flex: 1 }} />
              </View>
            </View>
          ))
        )}
        <Divider />
        <Button label="Sign out" icon="logOut" variant="danger" size="sm" onPress={() => controller.signOut()} />
      </Card>
    );
  }

  if (state.verification) {
    return (
      <Card>
        <SectionHeader title="Verify your email" description={`Enter the six-digit code sent to ${state.verification.email}. The code expires after 10 minutes.`} />
        <Input
          label="Verification code"
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          returnKeyType="done"
          monospace
          onSubmitEditing={() => void controller.submitEmailVerification(code)}
        />
        <Button
          label="Verify and sign in"
          icon="check"
          variant="primary"
          loading={state.accountLoading}
          disabled={code.length !== 6}
          onPress={() => void controller.submitEmailVerification(code)}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Resend code" variant="ghost" size="sm" disabled={state.accountLoading} onPress={() => void controller.resendEmailVerification()} style={{ flex: 1 }} />
          <Button label="Start again" variant="ghost" size="sm" disabled={state.accountLoading} onPress={() => controller.cancelEmailVerification()} style={{ flex: 1 }} />
        </View>
      </Card>
    );
  }

  const submit = () => {
    void controller.submitAccount(mode, email, password, username).then((ok) => {
      if (ok) setPassword('');
    });
  };
  return (
    <Card>
      <SectionHeader title="Spice account" description="Sync likes, history, and playlists with SPICE on desktop and the web." />
      <Segmented
        options={[
          { id: 'SignIn', label: 'Sign in' },
          { id: 'SignUp', label: 'Create account' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" returnKeyType="next" />
      {mode === 'SignUp' ? (
        <Input label="Username" value={username} onChangeText={setUsername} autoComplete="username" returnKeyType="next" helper="3-20 letters, numbers, or underscores." />
      ) : null}
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete={mode === 'SignUp' ? 'new-password' : 'password'}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Button
        label={mode === 'SignUp' ? 'Create account' : 'Sign in'}
        icon={mode === 'SignUp' ? 'userPlus' : 'logIn'}
        variant="primary"
        loading={state.accountLoading}
        onPress={submit}
      />
      <Txt variant="caption" style={{ color: theme.fgSubtle }}>
        Playback, search, and your local library work without an account.
      </Txt>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function PairingCodeField({ value, onChange, onSubmit }: { value: string; onChange: (value: string) => void; onSubmit: () => void }) {
  const theme = useTheme();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const controller = useController();
  const cells = value.padEnd(8, ' ').split('');
  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Pairing code" accessibilityHint="Enter the eight-character code">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        {cells.map((character, index) => {
          const active = focused && index === Math.min(value.length, 7);
          return (
            <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {index === 4 ? <Txt muted>–</Txt> : null}
              <View
                style={{
                  width: 34,
                  height: 44,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: active ? theme.accent : theme.input,
                  backgroundColor: theme.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Txt variant="heading" style={{ fontFamily: theme.font.mono }}>
                  {character.trim()}
                </Txt>
              </View>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(next) => onChange(controller.normalizePairingCode(next))}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={24}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        caretHidden
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
    </Pressable>
  );
}

function ConnectSection() {
  const controller = useController();
  const theme = useTheme();
  const state = useSpice((s) => ({
    enabled: s.spiceConnectEnabled,
    credential: s.pairedDeviceCredential,
    pairingLoading: s.pairingLoading,
    status: s.connectStatus,
    signedIn: s.accountSession !== null,
  }));
  const [code, setCode] = useState('');
  const claim = () => {
    void controller.claimPairingCode(code).then((ok) => {
      if (ok) setCode('');
    });
  };
  return (
    <Card>
      <SettingRow
        title="Spice Connect"
        description="Off by default. Turn it on to let this phone act as a receiver or control another Spice device."
        right={<Switch value={state.enabled} onChange={(value) => controller.setSpiceConnectEnabled(value)} label="Spice Connect" />}
      />
      {state.enabled && state.status ? <Txt variant="caption">{state.status}</Txt> : null}
      <Divider />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="smartphone" size={18} color={theme.fgMuted} />
        <Txt variant="heading">Secure phone pairing</Txt>
      </View>
      {state.credential ? (
        <>
          <View style={{ gap: 4 }}>
            <Txt variant="label">Paired as {state.credential.displayName}</Txt>
            <Txt variant="caption">Expires {new Date(state.credential.expiresAtEpochMs).toLocaleString()}</Txt>
          </View>
          <Txt variant="caption">
            This scoped credential is stored separately from your Spice account and is removed automatically if the server revokes or expires it.
          </Txt>
          <Button label="Remove pairing from this phone" icon="trash" variant="danger" size="sm" disabled={state.pairingLoading} onPress={() => controller.disconnectPairedDevice()} />
        </>
      ) : (
        <>
          <Txt variant="caption">
            {state.signedIn
              ? 'Already signed in, so Spice Connect works without pairing. Pairing is for phones that should not hold your account.'
              : 'Create a phone code on a signed-in Spice device, then enter it here. Codes expire after five minutes.'}
          </Txt>
          <PairingCodeField value={code} onChange={setCode} onSubmit={claim} />
          <Button label="Pair this phone" icon="link" variant="primary" loading={state.pairingLoading} disabled={code.length !== 8} onPress={claim} />
          <Txt variant="caption" style={{ color: theme.fgSubtle }}>
            {"Pairing grants only Spice Connect access for 30 days. It does not sign this phone into the owner's account."}
          </Txt>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function AppearanceSection() {
  const controller = useController();
  const theme = useTheme();
  const { accent, surface, provider } = useSpice((s) => ({ accent: s.accentTheme, surface: s.surfaceTheme, provider: s.searchProvider }));
  return (
    <Card>
      <SectionHeader title="Appearance" description="Your accent colors highlights, controls, and the player everywhere in the app." />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {ACCENT_THEMES.map((option) => {
          const selected = option.id === accent;
          return (
            <Pressable
              key={option.id}
              onPress={() => controller.setAccentTheme(option.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              style={{ alignItems: 'center', gap: 6, width: 72 }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: option.color,
                  borderWidth: selected ? 3 : 0,
                  borderColor: theme.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  outlineColor: option.color,
                  outlineWidth: selected ? 2 : 0,
                  outlineStyle: 'solid',
                }}
              >
                {selected ? <Icon name="check" size={18} color="#ffffff" strokeWidth={3} /> : null}
              </View>
              <Txt variant="caption" align="center" lines={2} color={selected ? theme.fg : undefined}>
                {option.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      <Divider />
      <Txt variant="label">Surface</Txt>
      <Segmented
        options={[
          { id: 'Midnight', label: 'Midnight' },
          { id: 'Daylight', label: 'Daylight' },
        ]}
        value={surface}
        onChange={(value) => controller.setSurfaceTheme(value)}
      />
      <Divider />
      <SectionHeader title="Search sources" description="Combine providers or keep searches on one of them." />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="YouTube + SoundCloud" selected={provider === 'All'} onPress={() => controller.setSearchProvider('All')} />
        <Chip label="YouTube" icon="youtube" selected={provider === 'YouTube'} onPress={() => controller.setSearchProvider('YouTube')} />
        <Chip label="SoundCloud" icon="cloud" selected={provider === 'SoundCloud'} onPress={() => controller.setSearchProvider('SoundCloud')} />
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function PlaybackSection() {
  const controller = useController();
  const { quality, smartQueue, crossfade } = useSpice((s) => ({
    quality: s.quality,
    smartQueue: s.smartQueueEnabled,
    crossfade: s.crossfadeDurationMs,
  }));
  return (
    <>
      <Card>
        <SectionHeader title="Audio quality" description="Choose the best available stream or save mobile data." />
        {STREAM_QUALITIES.map((option) => (
          <RadioRow
            key={option.id}
            title={option.label}
            description={option.detail}
            selected={quality === option.id}
            onPress={() => controller.setQuality(option.id)}
          />
        ))}
      </Card>
      <Card>
        <SettingRow
          title="Smart queue"
          description="Keep playing your Recommended Next mix after the queue ends."
          right={<Switch value={smartQueue} onChange={(value) => controller.setSmartQueueEnabled(value)} label="Smart queue" />}
        />
        <Divider />
        <SectionHeader
          title="Crossfade"
          description="Overlaps the end of one track with the next. Falls back to a clean cut for Spice Connect, repeat-one, unknown durations, or tracks that are not ready in time."
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CROSSFADE_OPTIONS_MS.map((duration) => (
            <Chip
              key={duration}
              label={duration === 0 ? 'Off' : `${duration / 1000}s`}
              selected={crossfade === duration}
              onPress={() => controller.setCrossfadeDurationMs(duration)}
            />
          ))}
        </View>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------

const TERMS = [
  'Use media providers only through your own rights, accounts, region access, and provider rules.',
  'Downloads are explicit actions for personal, offline listening where you have permission to keep a copy.',
  'Do not use Spice to bypass DRM, access controls, paywalls, bot checks, or copyright restrictions.',
  'Shared playlists show member names and playlist edits to invited members; only invite people you trust.',
  'This preview build comes without warranty, and resolvers can break when providers change.',
];

const LICENSES = [
  { name: 'NewPipe Extractor', license: 'GPL-3.0', purpose: 'Phone-side YouTube search and audio stream extraction.', url: 'https://github.com/TeamNewPipe/NewPipeExtractor' },
  { name: 'AndroidX Media3', license: 'Apache-2.0', purpose: 'ExoPlayer playback, media session, and lock-screen controls.', url: 'https://github.com/androidx/media' },
  { name: 'React Native & Expo', license: 'MIT', purpose: 'App framework and native modules.', url: 'https://github.com/expo/expo' },
  { name: 'Geist', license: 'SIL OFL 1.1', purpose: 'Interface typeface.', url: 'https://github.com/vercel/geist-font' },
  { name: 'Lucide', license: 'ISC', purpose: 'Icon geometry shared with the SPICE web app.', url: 'https://github.com/lucide-icons/lucide' },
];

function AboutSection() {
  const theme = useTheme();
  const version = Constants.expoConfig?.version ?? 'dev';
  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="heading">SPICE for Android</Txt>
            <Txt variant="caption">Version {version} · React Native preview</Txt>
          </View>
          <Badge label="Preview" tone="accent" />
        </View>
        <Txt variant="caption">
          This build runs next to the current Android app so you can compare them. Your data stays separate until the new app replaces the old one.
        </Txt>
      </Card>
      <Card>
        <SectionHeader title="Terms" description="Private sideload build for power users. No store distribution or provider endorsement is implied." />
        {TERMS.map((term) => (
          <View key={term} style={{ flexDirection: 'row', gap: 8 }}>
            <Txt muted>•</Txt>
            <Txt variant="caption" style={{ flex: 1 }}>
              {term}
            </Txt>
          </View>
        ))}
      </Card>
      <Card>
        <SectionHeader title="Licenses" description="Components this app is built on." />
        {LICENSES.map((entry) => (
          <Pressable key={entry.name} onPress={() => void Linking.openURL(entry.url)} style={{ gap: 2, paddingVertical: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt variant="label" style={{ flex: 1 }}>
                {entry.name}
              </Txt>
              <Badge label={entry.license} />
            </View>
            <Txt variant="caption">{entry.purpose}</Txt>
          </Pressable>
        ))}
        <Txt variant="caption" style={{ color: theme.accentText }}>
          Redistributing the APK means keeping these notices and making the matching source available for GPL components.
        </Txt>
      </Card>
    </>
  );
}
