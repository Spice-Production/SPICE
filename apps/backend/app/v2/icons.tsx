'use client';

/**
 * Sidebar icons for the rebuilt nav: minimal stroke glyphs in the quiet
 * style (no pictographic emoji anywhere near the nav). One component,
 * keyed by nav id, so the shell maps V2_NAV entries to icons.
 */
export type V2IconName =
  | 'music'
  | 'search'
  | 'library'
  | 'movies'
  | 'shows'
  | 'anime'
  | 'profile'
  | 'settings';

export function V2Icon({ name }: { name: V2IconName | string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  } as const;
  switch (name) {
    case 'music':
      return (
        <svg {...common}>
          <ellipse cx="7.5" cy="17" rx="3" ry="2.4" />
          <path d="M10.5 17V5l9-2.2V15" />
          <ellipse cx="19.5" cy="15" rx="2.4" ry="1.9" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M15.8 15.8 20.5 20.5" />
        </svg>
      );
    case 'library':
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M8 4.5v15M12 9.5h5M12 13h5" />
        </svg>
      );
    case 'movies':
      return (
        <svg {...common}>
          <rect x="3" y="5.5" width="18" height="13" rx="2" />
          <path d="M7.5 5.5v13M16.5 5.5v13M3 10h4.5M3 14h4.5M16.5 10H21M16.5 14H21" />
        </svg>
      );
    case 'shows':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="12.5" rx="2" />
          <path d="M9.5 21h5" />
        </svg>
      );
    case 'anime':
      return (
        <svg {...common}>
          <path d="M12 3.5 13.8 9.2 19.5 11 13.8 12.8 12 18.5 10.2 12.8 4.5 11 10.2 9.2Z" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M4.8 20c1.6-3.6 4.2-5.2 7.2-5.2s5.6 1.6 7.2 5.2" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <path d="M4 7.5h16M4 12h16M4 16.5h16" />
          <circle cx="9" cy="7.5" r="2" fill="var(--spk-bg, #09090b)" />
          <circle cx="15" cy="12" r="2" fill="var(--spk-bg, #09090b)" />
          <circle cx="8" cy="16.5" r="2" fill="var(--spk-bg, #09090b)" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
  }
}
