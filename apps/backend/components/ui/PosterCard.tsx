'use client';

export interface SpkPosterCardProps {
  href: string;
  title: string;
  meta?: string | null;
  posterUrl?: string | null;
}

/**
 * Poster tile: 2:3 art, title, one meta line. Fixed 150px width so rails
 * and grids share one shape. Missing art shows the initial, never blank.
 */
export function PosterCard({ href, title, meta, posterUrl }: SpkPosterCardProps) {
  return (
    <>
      <style>{`
        .spk-poster { display: block; width: 150px; text-decoration: none; color: inherit;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .spk-poster-art { width: 150px; aspect-ratio: 2 / 3; object-fit: cover; display: block;
          border-radius: var(--spk-radius-md, 12px);
          border: 1px solid var(--spk-line, rgba(255,255,255,0.09)); background: var(--spk-surface-2, #17171d); }
        .spk-poster-fallback { width: 150px; aspect-ratio: 2 / 3; display: grid; place-items: center;
          border-radius: var(--spk-radius-md, 12px);
          border: 1px solid var(--spk-line, rgba(255,255,255,0.09)); background: var(--spk-surface-2, #17171d);
          font-size: 2rem; font-weight: 700; color: var(--spk-text-3, #6b6f7d); }
        .spk-poster-title { font-weight: 650; font-size: 0.82rem; line-height: 1.35; margin-top: 8px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--spk-text, #e8eaf0); }
        .spk-poster-meta { font-size: 0.74rem; margin-top: 2px; color: var(--spk-text-3, #6b6f7d); }
      `}</style>
      <a className="spk-poster" href={href}>
        {posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="spk-poster-art" src={posterUrl} alt={`${title} poster`} loading="lazy" />
        ) : (
          <div className="spk-poster-fallback" aria-hidden="true">
            {title.charAt(0)}
          </div>
        )}
        <div className="spk-poster-title" title={title}>
          {title}
        </div>
        {meta && <div className="spk-poster-meta">{meta}</div>}
      </a>
    </>
  );
}
