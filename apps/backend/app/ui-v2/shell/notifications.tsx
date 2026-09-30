'use client';

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { useSpiceUi } from '../context';
import { Button, IconButton, Portal, useAnchoredPosition, useDismiss } from '../primitives';
import s from './topbar.module.css';

/** `pendingListenInvites` is untyped (`any[]`) on the model; this is the
 * shape the classic notification tray actually reads off each entry. */
interface ListenTogetherInviteEntry {
  inviteId: string;
  hostDisplayName?: string;
  hostUsername: string;
}

/**
 * Bell → notifications tray: release notes, shared-playlist invites, and
 * Listen Together invites, mirroring `app-topbar__notification-tray`. No
 * legacy SpiceApp effect targets this tray directly, so it just dismisses
 * itself on outside click / Escape.
 */
export function NotificationsMenu() {
  const m = useSpiceUi();
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const listenInvites = m.pendingListenInvites as ListenTogetherInviteEntry[];
  useDismiss(m.notificationTrayOpen, [wrapRef, panelRef], () => m.setNotificationTrayOpen(false));
  const { style, measured } = useAnchoredPosition(wrapRef, panelRef, m.notificationTrayOpen, { side: 'bottom', align: 'end', offset: 8 });

  // The tray portals to the end of the document, so hand focus to it once it is
  // positioned (a hidden, still-measuring panel cannot take focus).
  useEffect(() => {
    if (m.notificationTrayOpen && measured) panelRef.current?.focus({ preventScroll: true });
  }, [m.notificationTrayOpen, measured]);

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    m.setNotificationTrayOpen(false);
    bellRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className={s.trayAnchor} ref={wrapRef}>
      <IconButton
        ref={bellRef}
        icon="bell"
        label={`Open notifications${m.notificationCount > 0 ? ` (${m.notificationCount} waiting)` : ''}`}
        aria-expanded={m.notificationTrayOpen}
        badge={m.notificationCount > 0 ? m.notificationCountLabel : undefined}
        active={m.notificationTrayOpen}
        onClick={() => {
          m.setNotificationTrayOpen((open) => !open);
          m.setTopbarSearchTrayOpen(false);
          m.setProfileMenuOpen(false);
        }}
      />

      {m.notificationTrayOpen ? (
        <Portal>
        <div
          ref={panelRef}
          className={s.tray}
          style={style}
          data-measuring={measured ? undefined : 'true'}
          role="region"
          aria-label="SPICE notifications"
          tabIndex={-1}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={onPanelKeyDown}
        >
          <div className={s.trayHeader}>
            <div className={s.trayHeaderText}>
              <span className={s.trayEyebrow}>Notifications</span>
              <span className={s.trayTitle}>{m.notificationCount > 0 ? `${m.notificationCount} waiting` : 'All caught up'}</span>
            </div>
            <div className={s.trayHeaderActions}>
              {m.unreadReleaseNotifications.length > 0 ? (
                <button type="button" className={s.linkBtn} onClick={m.markAllReleaseNotificationsAsRead}>
                  Mark all read
                </button>
              ) : null}
              <IconButton icon="x" size="sm" label="Close notifications" onClick={() => m.setNotificationTrayOpen(false)} />
            </div>
          </div>

          <div className={s.trayBody}>
            <div className={s.traySection}>
              <div className={s.traySectionTitle}>
                <span>Version updates</span>
              </div>
              {m.releaseNotifications.map((notification) => {
                const isUnread = !m.readReleaseNotificationIds.includes(notification.id);
                return (
                  <div key={notification.id} className={s.noticeItem} data-unread={isUnread ? 'true' : undefined}>
                    <div className={s.noticeCopy}>
                      <span className={s.noticeEyebrow}>{notification.version}</span>
                      <span className={s.noticeTitle}>{notification.title}</span>
                      <p className={s.noticeText}>{notification.summary}</p>
                    </div>
                    <div className={s.noticeActions}>
                      <Button variant="outline" size="sm" onClick={() => m.openReleaseNotification(notification)}>
                        View
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={s.traySection}>
              <div className={s.traySectionTitle}>
                <span>Shared playlist requests</span>
              </div>
              {m.pendingInvitesLoading && m.pendingInvites.length === 0 ? (
                <p className={s.trayEmpty}>Checking for playlist requests...</p>
              ) : m.pendingInvites.length > 0 ? (
                m.pendingInvites.map((invite) => (
                  <div key={invite.playlistId} className={s.noticeItem}>
                    <div className={s.noticeCopy}>
                      <span className={s.noticeEyebrow}>Join request</span>
                      <span className={s.noticeTitle}>{invite.playlistTitle}</span>
                      <p className={s.noticeText}>
                        {invite.ownerDisplayName} (@{invite.ownerUsername || 'unknown'}) invited you to join.
                      </p>
                    </div>
                    <div className={s.noticeActions}>
                      <Button variant="outline" size="sm" disabled={m.acceptingInvite} onClick={() => void m.handleRejectInvite(invite.playlistId)}>
                        Reject
                      </Button>
                      <Button variant="default" size="sm" disabled={m.acceptingInvite} onClick={() => void m.handleAcceptInvite(invite.playlistId)}>
                        Accept
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className={s.trayEmpty}>Playlist requests will appear here before anything joins your library.</p>
              )}
            </div>

            <div className={s.traySection}>
              <div className={s.traySectionTitle}>
                <span>Listen Together requests</span>
              </div>
              {listenInvites.length > 0 ? (
                listenInvites.map((invite) => (
                  <div key={invite.inviteId} className={s.noticeItem}>
                    <div className={s.noticeCopy}>
                      <span className={s.noticeEyebrow}>Listen together request</span>
                      <span className={s.noticeTitle}>Invite from {invite.hostDisplayName || 'User'}</span>
                      <p className={s.noticeText}>@{invite.hostUsername} invited you to listen together in a real-time session.</p>
                    </div>
                    <div className={s.noticeActions}>
                      <Button variant="outline" size="sm" onClick={() => void m.handleRespondToListenTogetherInvite(invite.inviteId, 'reject')}>
                        Reject
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          void m.handleRespondToListenTogetherInvite(invite.inviteId, 'accept');
                          m.setNotificationTrayOpen(false);
                        }}
                      >
                        Accept
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className={s.trayEmpty}>No pending Listen Together invitations.</p>
              )}
            </div>
          </div>
        </div>
        </Portal>
      ) : null}
    </div>
  );
}
