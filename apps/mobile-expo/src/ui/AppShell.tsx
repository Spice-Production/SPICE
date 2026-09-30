import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Animated, AppState, BackHandler, PermissionsAndroid, Platform, Pressable, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { profileInitials } from '../core/format';
import type { AppScreen, Playlist, Track } from '../core/models';
import { useController, useSpice } from './context';
import { Icon, SpiceMark, type IconName } from './icons';
import { MiniPlayer } from './player/MiniPlayer';
import { FullPlayer } from './player/FullPlayer';
import { DevicesSheet, LyricsSheet, PlaylistPickerSheet, QueueSheet, TrackActionsSheet } from './player/PlayerSheets';
import { Avatar, IconButton, Txt } from './primitives';
import { HomeScreen } from './screens/HomeScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { SearchScreen } from './screens/SearchScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AccountBlockScreen, NotificationsSheet, ProfileEditorSheet, ProfileSheet } from './sheets/AccountSheets';
import { InviteDialog, PlaylistSheet } from './sheets/PlaylistSheet';
import { useTheme } from './theme';

const TABS: { id: AppScreen; label: string; icon: IconName }[] = [
  { id: 'Home', label: 'Home', icon: 'home' },
  { id: 'Search', label: 'Search', icon: 'search' },
  { id: 'Library', label: 'Library', icon: 'library' },
  { id: 'Settings', label: 'Settings', icon: 'settings' },
];

const MINI_PLAYER_HEIGHT = 76;
const TAB_BAR_HEIGHT = 58;

async function ensureNotificationPermission() {
  if (Platform.OS !== 'android' || Platform.Version < 33) return;
  try {
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (!(await PermissionsAndroid.check(permission))) await PermissionsAndroid.request(permission);
  } catch {
    // Playback still works; only the media notification needs this.
  }
}

export function AppShell() {
  const controller = useController();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const state = useSpice((s) => ({
    screen: s.screen,
    blocked: s.accountBlock !== null,
    hasPlayer: s.currentTrack !== null || s.selectedPlaybackDeviceId !== '' || s.resolvingTrackId !== null,
    session: s.accountSession,
    profile: s.profileSummary?.profile ?? null,
    notificationDot: s.pendingAccountInvites.length > 0 || s.downloadTrackId !== null,
    lyricsOpen: s.lyricsTrackId !== null,
    pendingRemoteDownload: s.pendingRemoteDownloadTrack,
  }));
  const [playerOpen, setPlayerOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pickerTrack, setPickerTrack] = useState<Track | null>(null);
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);

  // Deep links: hosted playlist invites open inside the app.
  useEffect(() => {
    void Linking.getInitialURL().then((url) => controller.openPlaylistInviteFromUrl(url));
    const subscription = Linking.addEventListener('url', ({ url }) => controller.openPlaylistInviteFromUrl(url));
    return () => subscription.remove();
  }, [controller]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') controller.onForeground();
    });
    return () => subscription.remove();
  }, [controller]);

  // A receiver-side download request starts right away, as on the native app.
  useEffect(() => {
    if (state.pendingRemoteDownload) controller.approvePendingRemoteDownload();
  }, [state.pendingRemoteDownload, controller]);

  useEffect(() => {
    if (state.hasPlayer) void ensureNotificationPermission();
  }, [state.hasPlayer]);

  // Android back: leave secondary tabs before leaving the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (controller.store.get().screen !== 'Home') {
        controller.selectScreen('Home');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [controller]);

  const openPlaylist = useCallback((playlist: Playlist) => void controller.openPlaylistMembers(playlist), [controller]);
  const openSettings = useCallback(() => controller.selectScreen('Settings'), [controller]);

  if (state.blocked) return <AccountBlockScreen />;

  const bottomInset = (state.hasPlayer ? MINI_PLAYER_HEIGHT : 0) + 8;
  const account = state.session?.account;
  const displayName = state.profile?.displayName || account?.displayName || account?.email || '';

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 }}>
          <SpiceMark accent={theme.accent} size={28} />
          <View style={{ flex: 1 }}>
            <Txt variant="eyebrow">Spice Music</Txt>
          </View>
          <IconButton icon="bell" label="Notifications" badge={state.notificationDot} onPress={() => setNotificationsOpen(true)} />
          {state.session ? (
            <Pressable onPress={() => setProfileOpen(true)} accessibilityRole="button" accessibilityLabel="Profile" hitSlop={6}>
              <Avatar uri={state.profile?.avatarUrl || account?.avatarUrl} initials={profileInitials(displayName, account?.id)} size={34} />
            </Pressable>
          ) : (
            <IconButton icon="user" label="Profile" variant="surface" size={34} onPress={() => setProfileOpen(true)} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          {state.screen === 'Home' ? (
            <HomeScreen bottomInset={bottomInset} />
          ) : state.screen === 'Search' ? (
            <SearchScreen bottomInset={bottomInset} onTrackMenu={setMenuTrack} />
          ) : state.screen === 'Library' ? (
            <LibraryScreen bottomInset={bottomInset} onOpenPlaylist={openPlaylist} onTrackMenu={setMenuTrack} />
          ) : (
            <SettingsScreen bottomInset={bottomInset} />
          )}
          {state.hasPlayer ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
              <MiniPlayer onOpen={() => setPlayerOpen(true)} onDevices={() => setDevicesOpen(true)} />
            </View>
          ) : null}
          <Toast bottom={bottomInset} />
        </View>
      </SafeAreaView>
      <View
        style={{
          flexDirection: 'row',
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          backgroundColor: theme.bg,
        }}
      >
        {TABS.map((tab) => {
          const selected = state.screen === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => controller.selectScreen(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}
            >
              <Icon name={tab.icon} size={22} color={selected ? theme.fg : theme.fgSubtle} strokeWidth={selected ? 2.2 : 2} />
              <Txt variant="caption" color={selected ? theme.fg : theme.fgSubtle} style={{ fontSize: 10.5, lineHeight: 13 }}>
                {tab.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      <FullPlayer
        visible={playerOpen}
        onClose={() => setPlayerOpen(false)}
        onQueue={() => setQueueOpen(true)}
        onLyrics={() => controller.loadCurrentLyrics()}
        onDevices={() => setDevicesOpen(true)}
        onSaveToPlaylist={setPickerTrack}
      />
      <QueueSheet visible={queueOpen} onClose={() => setQueueOpen(false)} />
      <LyricsSheet visible={state.lyricsOpen} onClose={() => controller.dismissLyrics()} />
      <DevicesSheet visible={devicesOpen} onClose={() => setDevicesOpen(false)} />
      <PlaylistPickerSheet track={pickerTrack} onClose={() => setPickerTrack(null)} />
      <TrackActionsSheet track={menuTrack} onClose={() => setMenuTrack(null)} onSaveToPlaylist={setPickerTrack} />
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} onOpenSettings={openSettings} />
      <NotificationsSheet visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} onOpenSettings={openSettings} />
      <ProfileEditorSheet />
      <PlaylistSheet />
      <InviteDialog onOpenSettings={openSettings} />
    </View>
  );
}

function Toast({ bottom }: { bottom: number }) {
  const controller = useController();
  const theme = useTheme();
  const shown = useSpice((s) => s.message ?? (s.selectedPlaybackDeviceId ? null : s.player.error));
  const [opacity] = useState(() => new Animated.Value(0));
  // The message stays in the store until the fade-out finishes, then clears.
  useEffect(() => {
    if (!shown) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) controller.clearMessage();
      });
    }, 3600);
    return () => clearTimeout(timer);
  }, [shown, controller, opacity]);
  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 12, right: 12, bottom: bottom + 8, opacity, alignItems: 'center' }}
    >
      <Pressable
        onPress={() => controller.clearMessage()}
        style={{
          maxWidth: 480,
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.inverse,
        }}
      >
        <Txt variant="label" color={theme.onInverse} style={{ flex: 1 }} lines={3}>
          {shown}
        </Txt>
      </Pressable>
    </Animated.View>
  );
}
