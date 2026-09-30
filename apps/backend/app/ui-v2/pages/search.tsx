'use client';

import { useSpiceUi } from '../context';
import { PageHeader, Tabs, type TabItem } from '../primitives';
import { ForYouToggle, ProviderSelect, TrackSearchInput, UserSearchInput } from './search/search-controls';
import { TrackSearchResults } from './search/track-results';
import { UserSearchResults } from './search/user-results';
import s from './search.module.css';

type SearchTab = 'tracks' | 'users';

const TAB_ITEMS: ReadonlyArray<TabItem<SearchTab>> = [
  { value: 'tracks', label: 'Tracks', icon: 'music' },
  { value: 'users', label: 'Users', icon: 'users' },
];

export function SearchPage() {
  const m = useSpiceUi();
  const tab = m.searchTab;
  const tracks = tab === 'tracks';

  return (
    <div className={s.page}>
      <PageHeader
        title="Search"
        description={
          tracks
            ? 'Find songs on YouTube and SoundCloud, or paste a link and press Enter to open it in SPICE.'
            : 'Find other SPICE listeners by username or display name.'
        }
      />

      <div className={s.controls}>
        {tracks ? <TrackSearchInput key="tracks" /> : <UserSearchInput key="users" />}
        <div className={s.toolbar}>
          <Tabs label="Search for" value={tab} onValueChange={m.setSearchTab} items={TAB_ITEMS} className={s.tabs} />
          {tracks ? (
            <div className={s.filters}>
              <ProviderSelect />
              {m.privateTasteProfile.isReady ? <ForYouToggle /> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div role="tabpanel" aria-label={tracks ? 'Track results' : 'Listener results'} className={s.body}>
        {tracks ? <TrackSearchResults /> : <UserSearchResults />}
      </div>
    </div>
  );
}
