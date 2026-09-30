'use client';

import { useState } from 'react';

import { useSpiceUi } from '../context';
import { TrackArtwork } from '../media';
import { Button, Dialog, Input } from '../primitives';
import s from './overlays.module.css';

/** Share sheet for a single song: copyable link, download, source, native share. */
export function ShareDialog() {
  const m = useSpiceUi();
  const dialog = m.songShareDialog;
  // Lazy-initialized so the navigator check runs once on mount, not as an effect side effect.
  const [canNativeShare] = useState(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function');

  if (!dialog) return null;
  const { track, shareUrl } = dialog;
  const downloading = m.offlineDownloadTrackId !== null;

  // Opens the device share sheet directly (Copy stays the primary action and only
  // falls back to the sheet when the clipboard is unavailable, as in the classic UI).
  const shareViaDevice = async () => {
    try {
      await navigator.share({ title: track.title, text: `${track.title} - ${m.profileArtistName(track)}`, url: shareUrl });
      m.showSpiceNotice('Song link opened in your share sheet.', 'success');
      m.setSongShareDialog(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      m.showSpiceNotice('Could not open the share sheet on this device.', 'warning');
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) m.setSongShareDialog(null);
      }}
      size="sm"
      title="Share song"
    >
      <div className={s.stack}>
        <div className={s.mediaRow}>
          <TrackArtwork track={track} size={48} />
          <span className={s.mediaText}>
            <span className={s.mediaTitle}>{track.title}</span>
            <span className={s.mediaSubtitle}>
              {m.profileArtistName(track)} · {m.trackSourceLabel(track)}
            </span>
          </span>
        </div>

        <div className={s.row}>
          <Input
            wrapperClassName={s.grow}
            readOnly
            value={shareUrl}
            aria-label="Song share link"
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
          <Button icon="clipboard" onClick={() => void m.copySongShareLink()}>
            Copy
          </Button>
        </div>

        <div className={s.actionRow}>
          <Button variant="outline" icon="download" disabled={downloading} onClick={() => void m.downloadSharedSong()}>
            {downloading ? 'Downloading…' : 'Download audio'}
          </Button>
          <Button variant="outline" icon="globe" onClick={m.openSongSource}>
            Source
          </Button>
          {canNativeShare ? (
            <Button variant="outline" icon="share" onClick={() => void shareViaDevice()}>
              Share
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
