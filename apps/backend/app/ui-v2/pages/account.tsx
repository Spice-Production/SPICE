'use client';

import { PageHeader } from '../primitives';
import s from './account.module.css';
import { CloudAccountSection } from './account/cloud-account';
import { LocalProfiles } from './account/local-profiles';
import { ProfileEditorDialog } from './account/profile-editor';
import { ProfileOverview } from './account/profile-overview';
import { ProfileSettings } from './account/profile-settings';
import { ImportAndBackup } from './account/transfer';

/**
 * Account: the active profile, every profile on this device, the SPICE cloud
 * account and sync, profile customization, and playlist import/backup.
 */
export function AccountPage() {
  return (
    <div className={s.page}>
      <PageHeader title="Account" description="Manage your profiles, your SPICE account and sync, and backups of your library." />
      <div className={s.sections}>
        <ProfileOverview />
        <LocalProfiles />
        <CloudAccountSection />
        <ProfileSettings />
        <ImportAndBackup />
      </div>
      <ProfileEditorDialog />
    </div>
  );
}
