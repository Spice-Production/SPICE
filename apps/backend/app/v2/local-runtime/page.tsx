import type { Metadata } from 'next';
import Link from 'next/link';

import InstallGuide from '../../install-guide';
import { AppShell, PageHeader } from '@/components/ui';
import { V2_NAV } from '../nav';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'SPICE Local Runtime',
  description: 'Download, install, or run the portable SPICE local PC runtime, and open it once installed.',
};

/**
 * /v2/local-runtime — new frame around the shared InstallGuide island,
 * keeping the escape hatch to the web player that needs nothing installed.
 */
export default function V2LocalRuntimePage() {
  return (
    <AppShell items={V2_NAV} active="home">
      <PageHeader
        kicker="SPICE ON YOUR PC"
        title="Local Runtime"
        lede="Prefer the browser instead? The web player needs nothing installed."
        actions={
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--spk-text-2, #a3a7b5)' }}>
              Open web player →
            </span>
          </Link>
        }
      />
      <InstallGuide />
    </AppShell>
  );
}
