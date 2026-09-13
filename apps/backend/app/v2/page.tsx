import type { Metadata } from 'next';

import { HomeView } from './home';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'SPICE',
  description: 'Welcome back — your listening week, playlists, and recent plays.',
};

export default function V2HomePage() {
  return <HomeView />;
}
