import { useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react';

/** Focusable rows inside a floating tray or menu, in DOM order. */
export function trayItems(panel: HTMLElement | null, selector = '[data-tray-item]'): HTMLElement[] {
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>(selector)).filter((element) => !element.hasAttribute('disabled'));
}

/**
 * Roving arrow-key focus across `items`. Returns true when it handled the key.
 * `onLeaveStart` runs on ArrowUp from the first row (e.g. back to the search input).
 * Keys a child already handled (`defaultPrevented`, like the Tabs Home/End) are left alone.
 */
export function handleTrayArrowKeys(
  event: ReactKeyboardEvent<HTMLElement>,
  items: HTMLElement[],
  onLeaveStart?: () => void,
): boolean {
  const { key } = event;
  if (event.defaultPrevented || items.length === 0) return false;
  if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return false;

  const index = items.indexOf(document.activeElement as HTMLElement);
  let next: number;
  if (key === 'Home') next = 0;
  else if (key === 'End') next = items.length - 1;
  else if (key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length;
  else if (index <= 0 && onLeaveStart) {
    event.preventDefault();
    onLeaveStart();
    return true;
  } else next = index <= 0 ? items.length - 1 : index - 1;

  event.preventDefault();
  items[next]?.focus();
  return true;
}

const noopSubscribe = () => () => undefined;
const isApplePlatform = () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

/** "⌘K" on Apple platforms, "Ctrl K" elsewhere; hydration-safe. */
export function useCommandShortcutLabel() {
  const apple = useSyncExternalStore(noopSubscribe, isApplePlatform, () => false);
  return apple ? '⌘K' : 'Ctrl K';
}
