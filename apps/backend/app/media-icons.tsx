/**
 * Shared SVG pictograms for the browse surfaces (movies, shows, later
 * anime). Stroke inherits the surrounding text color so the same icon
 * works on posters, buttons, and the sidebar.
 */
function Base({
  size = 18,
  style,
  children,
  filled = false,
}: {
  size?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: 'none', verticalAlign: '-3px', ...(style ?? {}) }}
    >
      {children}
    </svg>
  );
}

export function FilmIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <Base size={size} style={style}>
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M3.5 8.5 21 4.7l.8 3.4-17.5 3.8z" />
      <path d="M7.5 12.5v8M12 12.5v8M16.5 12.5v8" strokeWidth={1.4} />
    </Base>
  );
}

export function TvIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <Base size={size} style={style}>
      <rect x="2.5" y="8" width="19" height="12.5" rx="2.5" />
      <path d="M8.5 3.5 12 8l3.5-4.5" />
    </Base>
  );
}

export function MusicIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <Base size={size} style={style}>
      <path d="M9 18.5V6l10-2.2V15" />
      <circle cx="6.5" cy="18.5" r="2.5" />
      <circle cx="16.5" cy="15" r="2.5" />
    </Base>
  );
}

export function UserIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <Base size={size} style={style}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20.5c1.2-3.8 4-5.6 7.5-5.6s6.3 1.8 7.5 5.6" />
    </Base>
  );
}

export function PlayIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <Base size={size} style={style} filled>
      <path d="M8 5.4v13.2c0 .8.9 1.3 1.6.9l10.4-6.6c.6-.4.6-1.4 0-1.8L9.6 4.5c-.7-.4-1.6.1-1.6.9z" />
    </Base>
  );
}

export function BellIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <Base size={size} style={style}>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15C4.5 15 6 13.5 6 9.5z" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </Base>
  );
}

export function AnimeIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <Base size={size} style={style}>
      <path d="M12 3l2.1 5.9L20 11l-5.9 2.1L12 19l-2.1-5.9L4 11l5.9-2.1z" />
      <path d="M19 4v3M17.5 5.5h3" strokeWidth={1.7} />
    </Base>
  );
}

export function SearchIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <Base size={size} style={style}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.8-3.8" />
    </Base>
  );
}

export function CloseIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <Base size={size} style={style}>
      <path d="M6 6l12 12M18 6l-12 12" />
    </Base>
  );
}

export function ChevronLeftIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <Base size={size} style={style}>
      <path d="M15 18l-6-6 6-6" />
    </Base>
  );
}

export function ShieldIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <Base size={size} style={style}>
      <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" />
      <path d="M9.5 12l1.8 1.8 3.5-3.8" />
    </Base>
  );
}
