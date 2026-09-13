import type { Metadata } from 'next';

import AdminDashboardView from '../../admin-dashboard/admin-dashboard-view';
import { AppShell, PageHeader } from '@/components/ui';
import { V2_NAV } from '../nav';

export const metadata: Metadata = {
  title: 'SPICE Admin Dashboard',
  description: 'Unlinked admin dashboard prototype for SPICE account and service operations.',
};

/**
 * /v2/admin-dashboard — new frame around the existing admin prototype
 * view (still unlinked, still a prototype — just no longer unstyled).
 */
export default function V2AdminDashboardPage() {
  return (
    <AppShell items={V2_NAV} active="home">
      <PageHeader kicker="SPICE INTERNAL" title="Admin Dashboard" lede="Account and service operations prototype." />
      <AdminDashboardView />
    </AppShell>
  );
}
