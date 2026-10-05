'use client';

import { useSpiceUi } from '../context';
import { artistNames } from '../media';
import s from './retro-titlebar.module.css';

/**
 * Window chrome of the "C# guy" surface: a title strip with (decorative)
 * window buttons and a ticker that scrolls what is playing. Hidden from
 * assistive tech; the player bar already announces the track.
 */
export function RetroTitleBar() {
  const m = useSpiceUi();
  const title = m.playerTrack.id === 'placeholder' ? '' : m.playerTrack.title?.trim();
  const line = title
    ? `${m.playerIsPlaying ? 'NOW PLAYING' : 'PAUSED'}: ${title} - ${artistNames(m.playerTrack)}`
    : 'Welcome to SPICE. Nothing is playing yet -- pick a track to get started.';
  return (
    <div className={s.titleArea} aria-hidden="true">
      <div className={s.strip}>
        <span className={s.name}>SPICE.EXE</span>
        <span className={s.buttons}>
          <span>_</span>
          <span>&#9671;</span>
          <span>&times;</span>
        </span>
      </div>
      <div className={s.ticker}>
        {/* Keyed so a new track restarts the scroll from the right edge. */}
        <span className={s.tickerText} key={line}>
          {line}
        </span>
      </div>
    </div>
  );
}
