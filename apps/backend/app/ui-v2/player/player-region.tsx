'use client';

/**
 * Player surface entry point, rendered by the shell inside the "player" grid
 * area. Composes the bar, the expanded/mini view-mode switches, and the
 * queue/lyrics/diagnostics overlays — every one of them independent of
 * playerViewMode except the bar itself, exactly like the classic siblings at
 * app/spice-app.tsx ~19775-21321.
 */

import { useSpiceUi } from '../context';
import { Sheet } from '../primitives';
import { ConnectDiagnostics } from './connect-diagnostics';
import { useDockedSheet } from './docked-sheet';
import { LyricsHeader, LyricsView } from './lyrics-view';
import { MiniPlayer } from './mini-player';
import { NowPlaying } from './now-playing';
import { PlayerBar } from './player-bar';
import { QueueSheet } from './queue-panel';
import s from './player-region.module.css';

function LyricsSheet() {
  const m = useSpiceUi();
  const docked = useDockedSheet();
  return (
    <Sheet open={m.showBarLyrics} onOpenChange={m.setShowBarLyrics} title="Lyrics" bodyClassName={s.lyricsSheetBody} {...docked}>
      <LyricsHeader />
      <LyricsView className={s.lyricsSheetScroll} />
    </Sheet>
  );
}

export function PlayerRegion() {
  const m = useSpiceUi();
  return (
    <>
      {m.playerViewMode !== 'mini' ? (
        <section aria-label="Player" className={s.bar}>
          <PlayerBar />
        </section>
      ) : null}
      {m.playerViewMode === 'expanded' ? <NowPlaying /> : null}
      {m.playerViewMode === 'mini' ? <MiniPlayer /> : null}
      <QueueSheet />
      <LyricsSheet />
      <ConnectDiagnostics />
    </>
  );
}
