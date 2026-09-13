import type { Metadata } from 'next';

import AdminDashboardView from '../../admin-dashboard/admin-dashboard-view';
import { PageHeader } from '@/components/ui';

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
    <>
      <PageHeader kicker="SPICE INTERNAL" title="Admin Dashboard" lede="Account and service operations prototype." />
      <AdminDashboardView />
    </>
  );
}
