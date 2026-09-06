import type { Metadata } from 'next';

import RuntimeHome from '@/app/runtime-home';
import { getRuntimeTarget } from '@/lib/runtime-target';

export const dynamic = 'force-static';

export const metadata: Metadata = getRuntimeTarget() === 'vercel'
  ? {
      title: 'SPICE Local Runtime Portal',
      description: 'The Vercel-hosted control plane for SPICE auth, sync, metadata, installs, and local runtime updates.',
    }
  : {
    title: 'SPICE Music',
    description: 'Search, stream, and play SPICE Music in the browser, on your PC, or from your private server.',
  };

export default function Home() {
  return <RuntimeHome />;
}
