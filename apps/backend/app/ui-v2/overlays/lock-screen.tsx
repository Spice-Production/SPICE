'use client';

import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { useSpiceUi } from '../context';
import { Avatar, Button, Portal, VisuallyHidden } from '../primitives';
import { LocalIcon } from './local-icons';
import s from './overlays.module.css';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const PASSCODE_LENGTH = 4;

/** Keeps Tab inside a full-screen overlay (the app behind it stays unreachable). */
export function trapTabWithin(event: ReactKeyboardEvent<HTMLElement>, root: HTMLElement | null) {
  if (event.key !== 'Tab' || !root) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

/** Full-screen passcode prompt for a protected profile. */
export function LockScreen() {
  const m = useSpiceUi();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const profile = m.activeProfile;
  const entered = m.passcodeInput.length;
  const hasError = Boolean(m.passcodeError);

  const removeLastDigit = () => {
    m.setPasscodeError(null);
    m.setPasscodeInput((current) => current.slice(0, -1));
  };

  // Hardware keyboards type digits and Backspace like the keypad.
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keyHandlerRef.current = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        m.handlePasscodeKey(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        removeLastDigit();
      }
    };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => keyHandlerRef.current(event);
    document.addEventListener('keydown', onKeyDown);
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <Portal>
      <div className={s.lock}>
        <div
          ref={panelRef}
          className={s.lockPanel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={(event) => trapTabWithin(event, panelRef.current)}
        >
          <Avatar key={profile.id} src={profile.avatarUrl} name={profile.displayName} gradient={profile.gradient} size={80} />
          <h2 id={titleId} className={s.lockTitle}>
            Profile locked
          </h2>
          <p className={s.lockSubtitle}>
            Enter passcode to unlock <strong>{profile.displayName}</strong>
          </p>

          <div className={s.dots} data-error={hasError ? 'true' : undefined} aria-hidden="true">
            {Array.from({ length: PASSCODE_LENGTH }, (_, index) => (
              <span key={index} className={s.dot} data-filled={entered > index ? 'true' : undefined} />
            ))}
          </div>
          <span aria-live="polite">
            <VisuallyHidden>{`${entered} of ${PASSCODE_LENGTH} digits entered`}</VisuallyHidden>
          </span>

          <p className={s.lockError} role="alert">
            {m.passcodeError ?? ''}
          </p>

          <div className={s.keypad} role="group" aria-label="Passcode keypad">
            {DIGITS.map((digit) => (
              <button key={digit} type="button" className={s.key} onClick={() => m.handlePasscodeKey(digit)}>
                {digit}
              </button>
            ))}
            <button type="button" className={`${s.key} ${s.keyMuted}`} onClick={m.clearPasscode} aria-label="Clear passcode">
              Clear
            </button>
            <button type="button" className={s.key} onClick={() => m.handlePasscodeKey('0')}>
              0
            </button>
            <button
              type="button"
              className={`${s.key} ${s.keyMuted}`}
              onClick={removeLastDigit}
              disabled={entered === 0}
              aria-label="Delete last digit"
              title="Delete last digit"
            >
              <LocalIcon name="backspace" size={22} />
            </button>
          </div>

          <div className={s.lockFooter}>
            <Button variant="ghost" icon="users" onClick={m.handleCancelPasscode} title="Return to the last unlocked profile">
              Switch profile
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
