'use client';

export interface SpkAvatarProps {
  name?: string | null;
  src?: string | null;
  size?: 'sm' | 'md';
}

/** Circle avatar: photo when available, initial letter otherwise. */
export function Avatar({ name, src, size = 'md' }: SpkAvatarProps) {
  const initial = (name?.trim().charAt(0) ?? '?').toUpperCase();
  return (
    <>
      <style>{`
        .spk-avatar { border-radius: var(--spk-radius-full, 9999px); flex: none;
          display: inline-grid; place-items: center; overflow: hidden;
          background: var(--spk-surface-2, #18181d); color: var(--spk-text-2, #a1a1aa);
          border: 1px solid var(--spk-line, #26262c);
          font-family: var(--spk-font, Inter, system-ui, sans-serif); font-weight: 700; }
        .spk-avatar[data-size="sm"] { width: 28px; height: 28px; font-size: 0.72rem; }
        .spk-avatar[data-size="md"] { width: 40px; height: 40px; font-size: 1rem; }
        .spk-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
      `}</style>
      <span className="spk-avatar" data-size={size} aria-hidden={!name}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={name ?? 'Profile'} />
        ) : (
          initial
        )}
      </span>
    </>
  );
}
