'use client';

import { AppShell, Card, EmptyState } from '@/components/ui';
import { V2_NAV } from '../nav';
import { AccountHeader, AccountView, useAccount } from '../account';
import { ProfilesView } from '../music/profiles';
import { useMusicLibrary } from '../music/library';

/**
 * /v2/profile — identity, music profiles, and library stats in one
 * place. Same account endpoints as the original panel; the stats read
 * the same sync payloads as the music library.
 */
export default function V2ProfilePage() {
  const account = useAccount();
  const library = useMusicLibrary(account.token);

  return (
    <AppShell items={V2_NAV} active="profile">
      <AccountHeader />
      <AccountView hook={account} />
      {account.token && (
        <>
          <ProfilesView token={account.token} />
          <Card title="Library" extra="synced">
            {!library.loaded ? (
              <EmptyState message="Loading your library…" />
            ) : (
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.88rem', color: 'var(--spk-text-2, #a1a1aa)' }}>
                <span><strong style={{ color: 'var(--spk-text, #fafafa)' }}>{library.likes.size}</strong> likes</span>
                <span><strong style={{ color: 'var(--spk-text, #fafafa)' }}>{library.history.length}</strong> plays</span>
                <span><strong style={{ color: 'var(--spk-text, #fafafa)' }}>{library.playlists.length}</strong> playlists</span>
              </div>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
