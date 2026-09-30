'use client';

/**
 * Up-next queue, shared by the queue sheet (bar/expanded trigger) and the
 * mini player's inline queue toggle. Mirrors the classic queue drawer and
 * "Up Next Queue" expanded tab (app/spice-app.tsx ~19775-19861 /
 * ~20533-20575) exactly, including the local-queue-only remove/clear/smart
 * mix behavior — those stay disabled while a Spice Connect receiver owns
 * playback, since only the receiver can mutate its own remote queue.
 */

import { useRef } from 'react';

import { ScrollContainerContext, useSpiceUi } from '../context';
import { artistNames, NowPlayingBars, TrackArtwork, TrackList } from '../media';
import { Button, cn, EmptyState, IconButton, Sheet } from '../primitives';
import { useDockedSheet } from './docked-sheet';
import s from './queue-panel.module.css';

/** Full "Now playing" + "Up next" body, used inside the Queue sheet. */
export function QueueContent() {
  const m = useSpiceUi();
  const scrollRef = useRef<HTMLDivElement>(null);
  const canRemove = !m.isControllingRemoteReceiver && m.queue.length > 1;
  const resetKey = `${m.isControllingRemoteReceiver ? m.selectedRemoteDeviceId : m.activeProfileId}:queue:${m.trackListFingerprint(m.playerQueue)}`;

  const removeFromQueue = (index: number) => {
    const nextQueue = [...m.queue];
    nextQueue.splice(index, 1);
    if (index === m.queueIndex) {
      const nextIndex = Math.min(index, nextQueue.length - 1);
      m.startTrackOnActiveReceiver(nextQueue[nextIndex], nextQueue, m.playlistQueueOriginRef.current ?? undefined);
    } else {
      m.setQueue(nextQueue);
      if (index < m.queueIndex) m.setQueueIndex(m.queueIndex - 1);
    }
  };

  const clearQueue = () => {
    const suppressedRef = m.personalizedQueueContinuationSuppressedRef;
    const originRef = m.playlistQueueOriginRef;
    suppressedRef.current = m.playbackTrackKey(m.currentTrack);
    originRef.current = null;
    m.setQueue([m.currentTrack]);
    m.setQueueIndex(0);
  };

  return (
    <div className={s.content}>
      <div className={s.nowPlaying}>
        <TrackArtwork track={m.playerTrack} size={44} />
        <div className={s.nowPlayingText}>
          <span className={s.nowPlayingLabel}>
            <NowPlayingBars paused={!m.playerIsPlaying} />
            Now playing
          </span>
          <span className={s.nowPlayingTitle}>{m.playerTrack.title}</span>
          <span className={s.nowPlayingArtist}>{artistNames(m.playerTrack)}</span>
        </div>
      </div>

      <div className={s.listHeader}>
        <span>Up next</span>
        <div className={s.listActions}>
          <Button
            variant="ghost"
            size="sm"
            disabled={m.isControllingRemoteReceiver || !m.activePlaybackProfile?.smartQueue.enabled}
            onClick={m.rebuildSmartQueue}
          >
            Smart mix
          </Button>
          <Button variant="ghost" size="sm" disabled={m.isControllingRemoteReceiver} onClick={clearQueue}>
            {m.isControllingRemoteReceiver ? 'Remote queue' : 'Clear queue'}
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className={s.scroll}>
        {m.playerQueue.length === 0 ? (
          <EmptyState
            icon="listMusic"
            title="Queue is empty"
            description={m.isControllingRemoteReceiver ? `${m.receiverLabel} has no visible queue yet.` : undefined}
            plain
          />
        ) : (
          <ScrollContainerContext.Provider value={scrollRef}>
            <TrackList
              tracks={m.playerQueue}
              ariaLabel="Play queue"
              dense
              showIndex={false}
              showDuration={false}
              focusIndex={m.playerQueueIndex}
              resetKey={resetKey}
              getRowOptions={(track, index) => ({
                active: index === m.playerQueueIndex,
                playing: index === m.playerQueueIndex && m.playerIsPlaying,
                onPlay: () => m.startTrackOnActiveReceiver(track, m.playerQueue),
                trailing: canRemove ? (
                  <IconButton
                    icon="x"
                    label={`Remove ${track.title} from queue`}
                    size="sm"
                    className={s.removeBtn}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeFromQueue(index);
                    }}
                  />
                ) : undefined,
              })}
            />
          </ScrollContainerContext.Provider>
        )}
      </div>
    </div>
  );
}

/** Sheet wrapper bound to showQueueDrawer, for the bar/expanded triggers. */
export function QueueSheet() {
  const m = useSpiceUi();
  const docked = useDockedSheet();
  return (
    <Sheet open={m.showQueueDrawer} onOpenChange={m.setShowQueueDrawer} title="Queue" bodyClassName={s.sheetBody} {...docked}>
      <QueueContent />
    </Sheet>
  );
}

/** Compact next-five preview for the mini player's inline queue toggle. */
export function MiniQueueList({ className }: { className?: string }) {
  const m = useSpiceUi();
  const upcoming = m.playerQueue.slice(m.playerQueueIndex + 1, m.playerQueueIndex + 6);
  if (upcoming.length === 0) {
    return <p className={s.miniEmpty}>No upcoming tracks in queue</p>;
  }
  return (
    <div className={cn(s.miniList, className)}>
      {upcoming.map((track, index) => (
        <button
          key={`${track.id}-${m.playerQueueIndex + 1 + index}`}
          type="button"
          className={s.miniRow}
          onClick={() => m.startTrackOnActiveReceiver(track, m.playerQueue)}
        >
          <TrackArtwork track={track} size={24} />
          <span className={s.miniRowText}>
            <span className={s.miniRowTitle}>{track.title}</span>
            <span className={s.miniRowArtist}>{artistNames(track)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
