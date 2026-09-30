'use client';

import { useSpiceUi } from '../context';
import { useIsMobile } from '../primitives';
import s from './docked-sheet.module.css';

/**
 * Sheet props for the queue and lyrics panels: non-modal and docked clear of
 * the player bar on desktop (playback stays controllable), modal on phones.
 */
export function useDockedSheet() {
  const m = useSpiceUi();
  const isMobile = useIsMobile();
  if (isMobile) return { modal: true, className: undefined };
  const barVisible = m.playerViewMode !== 'mini';
  const className = !barVisible ? undefined : m.playerPlacement === 'top' ? s.dockTop : s.dockBottom;
  return { modal: false, className };
}
