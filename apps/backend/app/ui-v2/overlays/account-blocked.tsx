'use client';

import { useEffect, useId, useRef } from 'react';

import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { Button, Portal } from '../primitives';
import { trapTabWithin } from './lock-screen';
import s from './overlays.module.css';

/** Full-screen blocking notice when the signed-in account is timed out or banned. */
export function AccountBlocked() {
  const m = useSpiceUi();
  const block = m.accountBlock;
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!block) return;
    panelRef.current?.focus({ preventScroll: true });
  }, [block]);

  if (!block) return null;
  const banned = block.status === 'banned';

  return (
    <Portal>
      <div className={s.blocked} role="alert" aria-live="assertive">
        <div
          ref={panelRef}
          className={s.blockedCard}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={(event) => trapTabWithin(event, panelRef.current)}
        >
          <span className={s.blockedIcon} data-status={banned ? 'banned' : undefined}>
            <Icon name={banned ? 'ban' : 'clock'} size={22} />
          </span>
          <h2 id={titleId} className={s.blockedTitle}>
            {banned ? 'Account banned' : 'Account temporarily timed out'}
          </h2>
          <p className={s.blockedText}>
            {banned
              ? 'This account has been banned and can no longer sign in or use SPICE services.'
              : 'This account is temporarily timed out. SPICE services will be restored when the timeout ends.'}
          </p>
          {block.reason || block.expiresAt ? (
            <dl className={s.blockedDetails}>
              {block.reason ? (
                <div className={s.blockedDetail}>
                  <dt>Reason</dt>
                  <dd>{block.reason}</dd>
                </div>
              ) : null}
              {block.expiresAt ? (
                <div className={s.blockedDetail}>
                  <dt>Access returns</dt>
                  <dd>{new Date(block.expiresAt).toLocaleString()}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <div className={s.blockedAction}>
            <Button variant="outline" onClick={m.handleLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
