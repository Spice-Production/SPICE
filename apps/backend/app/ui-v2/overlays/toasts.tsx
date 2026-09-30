'use client';

import { useMemo } from 'react';

import type { SpiceNoticeKind } from '../../spice-app';
import { useSpiceUi } from '../context';
import { Icon, type IconName } from '../icons';
import { IconButton, Portal } from '../primitives';
import s from './overlays.module.css';

/** Shared by the confirm dialog so both surfaces color the same kind identically. */
export const NOTICE_ICONS: Record<SpiceNoticeKind, IconName> = {
  success: 'checkCircle',
  info: 'info',
  warning: 'alertTriangle',
  danger: 'alertCircle',
};

/** Where the stack sits relative to the player (bar at the bottom, at the top, or collapsed). */
export function playerOffset(placement: 'bottom' | 'top', mode: 'bar' | 'expanded' | 'mini') {
  if (mode === 'mini') return 'hidden';
  return placement === 'top' ? 'top' : 'bottom';
}

/**
 * SpiceApp notices as a bottom-right toast stack (newest on top). The live
 * region stays mounted so screen readers announce each new notice.
 */
export function Toasts() {
  const m = useSpiceUi();
  const notices = useMemo(() => [...m.spiceNotices].reverse(), [m.spiceNotices]);
  const bannerVisible = Boolean(m.listenTogetherSession || m.listenTogetherHostSessionId);

  return (
    <Portal>
      <section
        className={s.toastRegion}
        aria-label="Notifications"
        data-player={playerOffset(m.playerPlacement, m.playerViewMode)}
        data-banner={bannerVisible ? 'true' : undefined}
      >
        <ol className={s.toastList} aria-live="polite" aria-relevant="additions text">
          {notices.map((notice) => (
            <li key={notice.id} className={s.toast} data-kind={notice.kind}>
              <span className={s.toastIcon}>
                <Icon name={NOTICE_ICONS[notice.kind] ?? 'info'} size={16} />
              </span>
              <p className={s.toastMessage}>{notice.message}</p>
              <IconButton icon="x" label="Dismiss notification" size="sm" onClick={() => m.dismissSpiceNotice(notice.id)} />
            </li>
          ))}
        </ol>
      </section>
    </Portal>
  );
}
