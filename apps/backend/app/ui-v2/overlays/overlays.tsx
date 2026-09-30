'use client';

import { useSpiceUi } from '../context';
import { AccountBlocked } from './account-blocked';
import { ConfirmDialog } from './confirm-dialog';
import { FeedbackDialog } from './feedback-dialog';
import { ListenTogetherBanner, ListenTogetherDialog } from './listen-together';
import { LockScreen } from './lock-screen';
import {
  CreatePlaylistDialog,
  CreateSharedPlaylistDialog,
  DeletePlaylistConfirmDialog,
  EditPlaylistDialog,
  InvitePreviewDialog,
  PlaylistPickerDialog,
} from './playlist-dialogs';
import { CreateProfileDialog } from './profile-dialogs';
import { ReleaseDialog } from './release-dialog';
import { ShareDialog } from './share-dialog';
import { Toasts } from './toasts';

/**
 * Every overlay that floats above the routed page: toasts, the listen-together
 * pill and dialog, every standalone dialog, and the two full-screen blocking
 * states. Mounted once by the shell; each piece reads its own slice of model
 * state and renders nothing when that state is inactive.
 *
 * Order matters where two overlays can legitimately be open at once and share
 * the dialog z-index layer (e.g. the delete-playlist confirm reached from the
 * edit-playlist dialog): later entries paint on top.
 */
export function Overlays() {
  const m = useSpiceUi();

  return (
    <>
      <Toasts />
      <ListenTogetherBanner />

      <ReleaseDialog />
      <ShareDialog />
      <InvitePreviewDialog />
      <PlaylistPickerDialog />
      <CreatePlaylistDialog />
      <CreateSharedPlaylistDialog />
      <EditPlaylistDialog />
      <DeletePlaylistConfirmDialog />
      <CreateProfileDialog />
      <FeedbackDialog />
      {m.listenTogetherDialogOpen ? <ListenTogetherDialog /> : null}
      <ConfirmDialog />

      {m.isLocked ? <LockScreen /> : null}
      <AccountBlocked />
    </>
  );
}
