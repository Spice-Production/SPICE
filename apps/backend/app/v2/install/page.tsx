import type { Metadata } from 'next';

import InstallGuide from '../../install-guide';
import { AppShell, PageHeader } from '@/components/ui';
import { V2_NAV } from '../nav';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Install SPICE Local',
  description: 'Download, install, or run the portable SPICE local Windows runtime.',
};

/**
 * /v2/install — new frame around the shared InstallGuide island
 * (download links, commands, and checks live there, unchanged).
 */
export default function V2InstallPage() {
  return (
    <AppShell items={V2_NAV} active="home">
      <PageHeader
        kicker="SPICE ON YOUR PC"
        title="Install SPICE Local"
        lede="The full PC app: local playback, downloads, mini player, and offline updates."
      />
      <InstallGuide />
    </AppShell>
  );
}
