import { useCallback } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import type { Track } from '../../core/models';
import { useController, useSpice } from '../context';
import { Shelf } from '../media';
import { Chip, EmptyState, Txt } from '../primitives';
import { useTheme } from '../theme';

const QUICK_SEARCHES = ['Pop Hits', 'Lofi Chill', 'Workout'];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomeScreen({ bottomInset }: { bottomInset: number }) {
  const controller = useController();
  const theme = useTheme();
  const { sections, loading, history, name } = useSpice((state) => ({
    sections: state.homeSections,
    loading: state.homeLoading,
    history: state.historyTracks,
    name: state.profileSummary?.profile.displayName || state.accountSession?.account.displayName || '',
  }));
  const play = useCallback((track: Track, queue: Track[]) => controller.play(track, queue), [controller]);

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: 8, paddingBottom: bottomInset + 24, gap: 28 }}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={() => controller.retryHome()} tintColor={theme.accent} colors={[theme.accent]} />
      }
    >
      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Txt variant="display">{name ? `${greeting()}, ${name.split(' ')[0]}` : greeting()}</Txt>
          <Txt muted>Your mixes, recent plays, and fresh picks.</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {QUICK_SEARCHES.map((query) => (
            <Chip key={query} label={query} onPress={() => controller.search(query)} />
          ))}
        </View>
      </View>

      {history.length > 0 ? <Shelf title="Recently played" tracks={history.slice(0, 10)} onPlay={play} /> : null}

      {loading && sections.length === 0 ? (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {[0, 1].map((row) => (
            <View key={row} style={{ gap: 12 }}>
              <View style={{ width: 160, height: 18, borderRadius: 6, backgroundColor: theme.hover }} />
              <View style={{ flexDirection: 'row', gap: 14 }}>
                {[0, 1, 2].map((item) => (
                  <View key={item} style={{ width: 148, height: 148, borderRadius: theme.radius.lg, backgroundColor: theme.hover }} />
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : sections.length === 0 ? (
        <EmptyState
          icon="wifi"
          title="Home feed unavailable"
          body="Spice could not reach YouTube or SoundCloud from this phone. Check the connection and try again."
          actionLabel="Retry"
          onAction={() => controller.retryHome()}
        />
      ) : (
        sections.map((section) => <Shelf key={section.title} title={section.title} tracks={section.tracks} onPlay={play} />)
      )}
    </ScrollView>
  );
}
