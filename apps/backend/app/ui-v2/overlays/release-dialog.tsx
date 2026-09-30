'use client';

import { useSpiceUi } from '../context';
import { Badge, Dialog } from '../primitives';
import s from './overlays.module.css';

/** Detail view for a single release notification, opened from the notification tray. */
export function ReleaseDialog() {
  const m = useSpiceUi();
  const notification = m.selectedReleaseNotification;
  if (!notification) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) m.setSelectedReleaseNotification(null);
      }}
      title={
        <span className={s.titleWithIcon}>
          <Badge variant="accent">{notification.version}</Badge>
          {notification.title}
        </span>
      }
      description={notification.summary}
    >
      <p className={s.eyebrow}>
        <span className={s.eyebrowTitle}>{m.SPICE_MEDIA_CORE_LABEL}</span>
      </p>
      <div className={s.prose}>
        {notification.body.map((paragraph, index) => (
          <p key={`${index}:${paragraph}`}>{paragraph}</p>
        ))}
      </div>
    </Dialog>
  );
}
