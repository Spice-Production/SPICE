import type { Metadata } from 'next';

import { Button, Card, PageHeader } from '@/components/ui';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Spice Anime',
  description: 'The new home for anime on SPICE. The catalog is still being wired up.',
};

/**
 * /v2/anime — launchpad, not a fake catalog. There is no anime discovery
 * backend yet (no TMDB anime lists, no provider anime paths), so this page
 * says so plainly and points at the libraries that work today instead of
 * rendering a dead end. The real surface needs backend first — tracked in
 * docs/ui-rebuild.md.
 */
export default function V2AnimePage() {
  return (
    <>
      <PageHeader
        kicker="SPICE ANIME"
        title="Anime is moving in."
        lede="A dedicated anime catalog — seasonal charts, studio shelves, and episode continue-watching — is still being wired up. Meanwhile, everything that plays today lives here:"
        actions={
          <>
            <a href="/v2/movie" style={{ textDecoration: 'none' }}>
              <Button>Browse Movies</Button>
            </a>
            <a href="/v2/shows" style={{ textDecoration: 'none' }}>
              <Button>Browse Shows</Button>
            </a>
          </>
        }
      />
      <Card title="What the anime surface needs" extra="backend first">
        <p style={{ margin: '0 0 8px', fontSize: '0.88rem', lineHeight: 1.65, color: 'var(--spk-text-2, #a3a7b5)' }}>
          TMDB anime discovery lists, provider anime embed paths, and a verified watch-progress flow for the anime
          kind. The account system already accepts the anime kind — the catalog is the missing piece.
        </p>
        <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.65, color: 'var(--spk-text-2, #a3a7b5)' }}>
          Your existing movie and show lists are untouched and keep syncing.
        </p>
      </Card>
    </>
  );
}
