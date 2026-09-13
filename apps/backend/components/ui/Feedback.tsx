'use client';

/** Pulse placeholder blocks for rails while a shelf loads. */
export function Skeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      <style>{`
        .spk-skel-row { display: flex; gap: 12px; overflow: hidden; }
        .spk-skel { width: 150px; aspect-ratio: 2 / 3; flex: none;
          border-radius: var(--spk-radius-md, 12px); background: var(--spk-surface-2, #17171d);
          animation: spk-pulse 1.4s ease-in-out infinite; }
        @keyframes spk-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .spk-skel { animation: none; opacity: 0.7; } }
      `}</style>
      <div className="spk-skel-row" aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="spk-skel" />
        ))}
      </div>
    </>
  );
}

/** Quiet error banner for failed loads. */
export function ErrorNote({ message }: { message: string }) {
  return (
    <>
      <style>{`
        .spk-error { border: 1px solid rgba(224, 101, 95, 0.45); background: rgba(224, 101, 95, 0.1);
          border-radius: var(--spk-radius-sm, 8px); padding: 12px 16px;
          color: #e89893; font-size: 0.85rem; line-height: 1.5;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
      `}</style>
      <p className="spk-error" role="alert">
        {message}
      </p>
    </>
  );
}

/** Muted one-liner for legitimately empty results. */
export function EmptyState({ message }: { message: string }) {
  return (
    <>
      <style>{`
        .spk-empty { color: var(--spk-text-2, #a3a7b5); font-size: 0.88rem; line-height: 1.6;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); margin: 0; }
      `}</style>
      <p className="spk-empty">{message}</p>
    </>
  );
}
