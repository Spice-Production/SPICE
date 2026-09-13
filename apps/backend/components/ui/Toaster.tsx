'use client';

import { useEffect, useState } from 'react';

export type ToastTone = 'info' | 'success' | 'danger';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

type Listener = (items: ToastItem[]) => void;

let nextId = 1;
let items: ToastItem[] = [];
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  for (const listener of listeners) listener([...items]);
}

/** Push a toast from anywhere. The Toaster host renders it. */
export function pushToast(message: string, tone: ToastTone = 'info'): void {
  const id = nextId++;
  items = [...items.slice(-3), { id, message, tone }];
  emit();
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      items = items.filter((item) => item.id !== id);
      emit();
    }, 4000),
  );
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  items = items.filter((item) => item.id !== id);
  emit();
}

/** Fixed bottom-right toast stack. Mount once per app (the v2 layout does). */
export function Toaster() {
  const [visible, setVisible] = useState<ToastItem[]>(items);

  useEffect(() => {
    const listener: Listener = (next) => setVisible(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (visible.length === 0) return null;

  return (
    <>
      <style>{`
        .spk-toasts { position: fixed; z-index: 70; right: 16px; bottom: 16px; display: grid; gap: 8px;
          width: min(340px, calc(100vw - 32px)); font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .spk-toast { background: var(--spk-surface, #111114); border: 1px solid var(--spk-line, #26262c);
          border-radius: var(--spk-radius-sm, 6px); padding: 10px 12px; font-size: 0.82rem; line-height: 1.5;
          color: var(--spk-text, #fafafa); cursor: pointer; text-align: left; }
        .spk-toast[data-tone="success"] { border-color: rgba(80,180,110,0.5); }
        .spk-toast[data-tone="danger"] { border-color: rgba(224,101,95,0.5); }
      `}</style>
      <div className="spk-toasts" aria-live="polite">
        {visible.map((item) => (
          <button key={item.id} type="button" data-tone={item.tone} className="spk-toast" onClick={() => dismissToast(item.id)}>
            {item.message}
          </button>
        ))}
      </div>
    </>
  );
}
