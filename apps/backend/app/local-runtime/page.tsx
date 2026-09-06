import type { Metadata } from 'next';
import Link from 'next/link';

import InstallGuide from '../install-guide';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'SPICE Local Runtime',
  description: 'Download, install, or run the portable SPICE local PC runtime, and open it once installed.',
};

export default function LocalRuntimePage() {
  return (
    <main
      style={{
        maxWidth: '880px',
        margin: '0 auto',
        padding: '48px 24px',
        fontFamily: 'Outfit, sans-serif',
        color: '#f5f5f5',
        background: '#000000',
        minHeight: '100vh',
      }}
    >
      <p style={{ color: '#a1a1a1', fontSize: '0.85rem', letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 12px 0' }}>
        SPICE on your PC
      </p>
      <h1 style={{ fontSize: '2.2rem', fontWeight: 800, margin: '0 0 12px 0' }}>Local Runtime</h1>
      <p style={{ color: '#a1a1a1', fontSize: '1rem', lineHeight: 1.6, margin: '0 0 32px 0', maxWidth: '600px' }}>
        Prefer the browser instead? The <Link href="/" style={{ color: '#ec4899' }}>web player</Link> needs
        nothing installed.
      </p>
      <InstallGuide />
    </main>
  );
}
