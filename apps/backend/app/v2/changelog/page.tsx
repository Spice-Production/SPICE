import type { Metadata } from 'next';

import ChangelogView from '../../changelog/changelog-view';
import { getChangelogPayload } from '../../changelog/changelog-data';
import { AppShell, PageHeader } from '@/components/ui';
import { V2_NAV } from '../nav';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'SPICE Changelog',
  description: 'Release notes for SPICE Music and the wider SPICE service stack.',
};

/**
 * /v2/changelog — new frame around the shared changelog data + view
 * (payload shape and rendering live there, unchanged).
 */
export default async function V2ChangelogPage() {
  const initialPayload = await getChangelogPayload('user');

  return (
    <AppShell items={V2_NAV} active="home">
      <PageHeader kicker="SPICE" title="Changelog" lede="Release notes for SPICE Music and the wider SPICE service stack." />
      <ChangelogView initialPayload={initialPayload} />
    </AppShell>
  );
}
