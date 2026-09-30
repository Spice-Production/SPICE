import { FlatList, Keyboard, Pressable, View } from 'react-native';

import { SEARCH_PROVIDERS, type Track } from '../../core/models';
import { useController, useSpice } from '../context';
import { Icon } from '../icons';
import { TrackRow } from '../media';
import { EmptyState, IconButton, Input, Segmented, Spinner, Txt } from '../primitives';
import { useTheme } from '../theme';

const BROWSE = ['Pop Hits', 'Hip-Hop', 'Rock Charts', 'Lofi Chill', 'Electronic', 'Jazz Beats'];

export function SearchScreen({ bottomInset, onTrackMenu }: { bottomInset: number; onTrackMenu: (track: Track) => void }) {
  const controller = useController();
  const theme = useTheme();
  const state = useSpice((s) => ({
    query: s.searchQuery,
    results: s.searchResults,
    loading: s.searchLoading,
    provider: s.searchProvider,
    resolvingTrackId: s.resolvingTrackId,
    currentId: s.currentTrack?.id ?? null,
  }));

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <Input
        value={state.query}
        onChangeText={(value) => controller.setSearchQuery(value)}
        placeholder="Songs, artists, or albums"
        leadingIcon="search"
        returnKeyType="search"
        onSubmitEditing={() => {
          Keyboard.dismiss();
          controller.search();
        }}
        trailing={
          state.query ? (
            <IconButton icon="x" label="Clear search" size={28} onPress={() => controller.setSearchQuery('')} />
          ) : undefined
        }
      />
      <Segmented
        options={SEARCH_PROVIDERS.map((provider) => ({
          id: provider.id,
          label: provider.id === 'All' ? 'All sources' : provider.id,
        }))}
        value={state.provider}
        onChange={(provider) => {
          controller.setSearchProvider(provider);
          if (state.query.trim()) controller.search();
        }}
      />
    </View>
  );

  if (!state.query.trim() && state.results.length === 0) {
    return (
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 16 }}>
        {header}
        <Txt variant="heading">Browse</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {BROWSE.map((category) => (
            <Pressable
              key={category}
              onPress={() => controller.search(category)}
              style={({ pressed }) => ({
                width: '48%',
                flexGrow: 1,
                height: 72,
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: pressed ? theme.hover : theme.surface,
                padding: 14,
                justifyContent: 'space-between',
                flexDirection: 'row',
                alignItems: 'flex-end',
              })}
            >
              <Txt variant="label">{category}</Txt>
              <Icon name="arrowUpRight" size={16} color={theme.fgMuted} />
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <FlatList
      data={state.loading ? [] : state.results}
      keyExtractor={(track, index) => `${track.sourceId}:${track.id}:${index}`}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: bottomInset + 24 }}
      ListHeaderComponent={header}
      ListEmptyComponent={
        state.loading ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <Spinner size="large" />
          </View>
        ) : (
          <EmptyState icon="search" title="No tracks found" body="Try another title, artist, or source." />
        )
      }
      renderItem={({ item }) => (
        <TrackRow
          track={item}
          active={item.id === state.currentId}
          resolving={item.id === state.resolvingTrackId}
          onPress={() => {
            Keyboard.dismiss();
            controller.play(item, state.results);
          }}
          trailing={<IconButton icon="moreVertical" label={`More for ${item.title}`} size={32} onPress={() => onTrackMenu(item)} />}
        />
      )}
    />
  );
}
