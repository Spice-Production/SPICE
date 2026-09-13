import type { Metadata } from 'next';

import { AppShell, Button, Card, PageHeader } from '@/components/ui';
import { V2_NAV } from './nav';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'SPICE',
  description: 'SPICE Music on the web, plus the local PC runtime. Pick where you want to listen.',
};

export default function V2HomePage() {
  return (
    <AppShell items={V2_NAV} active="home">
      <PageHeader
        kicker="SPICE"
        title="Your music, your way."
        lede="Play in the browser right now, or install the full local runtime on your PC. Same account, same library."
        actions={
          <>
            <a href="/v2/music" style={{ textDecoration: 'none' }}>
              <Button variant="primary">Open Player</Button>
            </a>
            <a href="/v2/local-runtime" style={{ textDecoration: 'none' }}>
              <Button>Get Local Runtime</Button>
            </a>
          </>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <Card title="Movies" extra="in browser">
          <p style={{ margin: '0 0 14px', fontSize: '0.88rem', lineHeight: 1.55, color: 'var(--spk-text-2, #a3a7b5)' }}>
            Search the catalog and watch right here. Nothing to install.
          </p>
          <a href="/v2/movie" style={{ textDecoration: 'none' }}>
            <Button size="sm">Browse Movies</Button>
          </a>
        </Card>
        <Card title="Shows" extra="in browser">
          <p style={{ margin: '0 0 14px', fontSize: '0.88rem', lineHeight: 1.55, color: 'var(--spk-text-2, #a3a7b5)' }}>
            Series, seasons, and episodes with continue-watching.
          </p>
          <a href="/v2/shows" style={{ textDecoration: 'none' }}>
            <Button size="sm">Browse Shows</Button>
          </a>
        </Card>
        <Card title="Anime" extra="in browser">
          <p style={{ margin: '0 0 14px', fontSize: '0.88rem', lineHeight: 1.55, color: 'var(--spk-text-2, #a3a7b5)' }}>
            A dedicated home for anime, separate from films and TV.
          </p>
          <a href="/v2/anime" style={{ textDecoration: 'none' }}>
            <Button size="sm">Browse Anime</Button>
          </a>
        </Card>
      </div>
    </AppShell>
  );
}
