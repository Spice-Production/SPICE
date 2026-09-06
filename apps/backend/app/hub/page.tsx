import type { Metadata } from 'next';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'SPICE',
  description: 'SPICE Music on the web, plus the local PC runtime. Pick where you want to listen.',
};

const MUSIC_ORIGIN = (process.env.SPICE_PUBLIC_ORIGIN || 'https://music.spice-app.xyz').replace(/\/+$/, '');

const cardStyle: React.CSSProperties = {
  background: 'var(--card-bg)',
  border: '1px solid var(--border-color)',
  borderRadius: '16px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const buttonStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'var(--accent)',
  color: '#fff',
  borderRadius: '10px',
  padding: '10px 18px',
  fontWeight: 700,
  fontSize: '0.9rem',
  textDecoration: 'none',
  width: 'fit-content',
};

const ghostStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'transparent',
  border: '1px solid var(--border-color)',
  color: 'var(--text-primary)',
};

export default function HubPage() {
  return (
    <main
      style={{
        maxWidth: '880px',
        margin: '0 auto',
        padding: '64px 24px',
        fontFamily: 'Outfit, sans-serif',
        color: 'var(--text-primary)',
      }}
    >
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 12px 0' }}>
        SPICE
      </p>
      <h1 style={{ fontSize: '2.6rem', fontWeight: 800, margin: '0 0 12px 0' }}>Your music, your way.</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6, margin: '0 0 32px 0', maxWidth: '600px' }}>
        Play in the browser right now, or install the full local runtime on your PC. Same account, same library.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Web Player</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Search, queue, and play right here in the browser. Nothing to install.
          </p>
          <a href={MUSIC_ORIGIN + '/'} style={buttonStyle}>
            Open Player
          </a>
        </div>
        <div style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Local Runtime</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            The full PC app: local playback, downloads, mini player, and offline updates.
          </p>
          <a href={MUSIC_ORIGIN + '/local-runtime'} style={ghostStyle}>
            Get Local Runtime
          </a>
        </div>
      </div>
    </main>
  );
}
