'use client';

import { Badge, Button, EmptyState } from '@/components/ui';
import { TrackRow } from './library';
import type { EngineTrack } from './engine';
import type { EngineRepeat } from './engine';

const REPEAT_LABEL: Record<EngineRepeat, string> = {
  none: 'Repeat off',
  all: 'Repeat all',
  one: 'Repeat one',
};

/**
 * Up Next queue: the engine's effective play order with the current
 * track pinned, tap-to-play, per-track remove, clear, shuffle, and
 * repeat cycling (same storage keys as the original player).
 */
export function QueueCard({
  order, currentId, shuffle, repeat, likedIds,
  onPlayAt, onRemove, onClear, onToggleShuffle, onCycleRepeat, onToggleLike,
}: {
  order: EngineTrack[];
  currentId: string | null;
  shuffle: boolean;
  repeat: EngineRepeat;
  likedIds: Set<string>;
  onPlayAt: (index: number) => void;
  onRemove: (trackId: string) => void;
  onClear: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleLike: ((track: EngineTrack) => void) | null;
}) {
  if (order.length === 0) return null;

  return (
    <>
      <style>{`
        .v2-queue-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
        .v2-queue-title { margin: 0; font-size: 0.85rem; font-weight: 650;
          color: var(--spk-text-2, #a1a1aa); letter-spacing: 0.04em; text-transform: uppercase;
          margin-right: auto; }
        .v2-mini-btn { border: 1px solid var(--spk-line, #26262c); background: transparent;
          color: var(--spk-text-2, #a1a1aa); border-radius: 6px; font-size: 0.74rem; font-weight: 650;
          height: 28px; padding: 0 10px; cursor: pointer; font-family: inherit; }
        .v2-mini-btn:hover { color: var(--spk-text, #fafafa); border-color: var(--spk-text-3, #71717a); }
        .v2-mini-btn[data-on="true"] { color: var(--spk-text, #fafafa);
          background: var(--spk-accent-soft, rgba(139,147,248,0.12)); border-color: transparent; }
      `}</style>
      <div>
        <div className="v2-queue-head">
          <h2 className="v2-queue-title">Up next</h2>
          <Badge>{order.length} tracks</Badge>
          <button type="button" data-on={shuffle ? 'true' : 'false'} className="v2-mini-btn" onClick={onToggleShuffle} aria-pressed={shuffle}>
            Shuffle
          </button>
          <button type="button" className="v2-mini-btn" onClick={onCycleRepeat} title={REPEAT_LABEL[repeat]}>
            {REPEAT_LABEL[repeat]}
          </button>
          <button type="button" className="v2-mini-btn" onClick={onClear}>
            Clear
          </button>
        </div>
        {order.length === 0 && <EmptyState message="Queue is empty — search something to play." />}
        <div style={{ display: 'grid', gap: 8 }}>
          {order.map((track, i) => (
            <TrackRow
              key={`${track.id}:${i}`}
              track={track}
              playing={currentId === track.id}
              liked={likedIds.has(track.id)}
              onPlay={() => onPlayAt(i)}
              onToggleLike={onToggleLike ? () => onToggleLike(track) : undefined}
              extra={
                <Button size="sm" variant="ghost" onClick={() => onRemove(track.id)}>
                  Remove
                </Button>
              }
            />
          ))}
        </div>
      </div>
    </>
  );
}
