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
