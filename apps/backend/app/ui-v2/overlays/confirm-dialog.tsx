'use client';

import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { Button, Dialog, type ButtonVariant } from '../primitives';
import { NOTICE_ICONS } from './toasts';
import s from './overlays.module.css';

/** Danger/warning confirmations get the destructive button; everything else stays primary. */
const CONFIRM_VARIANT: Record<string, ButtonVariant> = {
  danger: 'destructive',
  warning: 'destructive',
};

/** Generic yes/no confirmation driven by `requestSpiceConfirm` (delete, sign out, etc). */
export function ConfirmDialog() {
  const m = useSpiceUi();
  const confirm = m.spiceConfirm;
  if (!confirm) return null;
  const kind = confirm.kind ?? 'info';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) m.cancelSpiceConfirm();
      }}
      size="sm"
      title={confirm.title}
      footer={
        <>
          <Button variant="outline" onClick={m.cancelSpiceConfirm}>
            {confirm.cancelLabel || 'Cancel'}
          </Button>
          <Button
            variant={CONFIRM_VARIANT[kind] ?? 'default'}
            onClick={() => {
              const onConfirm = confirm.onConfirm;
              m.setSpiceConfirm(null);
              onConfirm();
            }}
          >
            {confirm.confirmLabel || 'Continue'}
          </Button>
        </>
      }
    >
      <div className={s.confirmBody}>
        <span className={s.kindIcon} data-kind={kind}>
          <Icon name={NOTICE_ICONS[kind]} size={16} />
        </span>
        <p className={s.muted}>{confirm.message}</p>
      </div>
    </Dialog>
  );
}
