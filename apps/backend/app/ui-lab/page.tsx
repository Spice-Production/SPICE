'use client';

import { useState } from 'react';

import { Avatar, Badge, Button, Card, Dialog, Picker, Separator, Shelf, Switch, TextField, pushToast } from '@/components/ui';

const PROVIDERS = [
  { value: 'vidsrc', label: 'VidSrc' },
  { value: 'vidlink', label: 'VidLink' },
  { value: 'moviesapi', label: 'MoviesAPI' },
];

const RAIL = [
  { id: 'dune', title: 'Dune: Part Two', meta: '2024 · Sci-Fi' },
  { id: 'opp', title: 'Oppenheimer', meta: '2023 · Drama' },
  { id: 'spider', title: 'Across the Spider-Verse', meta: '2023 · Animation' },
  { id: 'poor', title: 'Poor Things', meta: '2023 · Comedy' },
  { id: 'zone', title: 'The Zone of Interest', meta: '2023 · History' },
];

/**
 * /ui-lab — interactive showcase for the experimental UI kit.
 * Deliberately unlinked from the nav; open it directly while iterating.
 */
export default function UiLabPage() {
  const [provider, setProvider] = useState('vidsrc');
  const [query, setQuery] = useState('');
  const [switchOn, setSwitchOn] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <style>{`
        .lab { min-height: 100vh; background: var(--spk-bg, #000); color: var(--spk-text, #e8eaf0);
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .lab-wrap { max-width: 920px; margin: 0 auto; padding: 56px 24px 96px;
          display: grid; gap: 40px; }
        .lab-hero { display: grid; gap: 14px; max-width: 620px; }
        .lab-kicker { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--spk-text-3, #6b6f7d); }
        .lab-title { margin: 0; font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; }
        .lab-lede { margin: 0; font-size: 0.95rem; line-height: 1.6; color: var(--spk-text-2, #a3a7b5); }
        .lab-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
        .lab-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
        .lab-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        .lab-muted { font-size: 0.85rem; line-height: 1.6; color: var(--spk-text-2, #a3a7b5); margin: 0; }
        .lab-poster { width: 148px; display: grid; gap: 8px; }
        .lab-poster-art { height: 200px; border-radius: var(--spk-radius-md, 12px);
          background: var(--spk-surface-2, #17171d);
          border: 1px solid var(--spk-line, rgba(255,255,255,0.09));
          display: flex; align-items: center; justify-content: center;
          font-size: 1.6rem; font-weight: 700; color: var(--spk-text-3, #6b6f7d); }
        .lab-poster-title { font-size: 0.82rem; font-weight: 600; }
        .lab-poster-meta { font-size: 0.74rem; color: var(--spk-text-3, #6b6f7d); }
      `}</style>
      <div className="lab">
        <div className="lab-wrap">
          <header className="lab-hero">
            <span className="lab-kicker">SPICE UI kit · lab</span>
            <h1 className="lab-title">Quiet by default.</h1>
            <p className="lab-lede">
              A minimal primitive set for the refresh experiment: flat
              surfaces, hairline borders, one accent. This page renders
              every primitive live — edit the kit, reload, compare.
            </p>
            <div className="lab-actions">
              <Button variant="primary">Primary action</Button>
              <Button>Quiet action</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
          </header>

          <Card title="Search + source" extra="movies-ready pattern">
            <div className="lab-grid">
              <TextField
                label="Search"
                placeholder="Films, shows, anime…"
                hint="Filters the rail below as you type."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Picker label="Stream provider" options={PROVIDERS} value={provider} onChange={setProvider} />
            </div>
          </Card>

          <Shelf
            title="Continue watching"
            action={`${RAIL.filter((r) => r.title.toLowerCase().includes(query.toLowerCase())).length} titles · ${PROVIDERS.find((p) => p.value === provider)?.label}`}
          >
            {RAIL.filter((r) => r.title.toLowerCase().includes(query.toLowerCase())).map((item) => (
              <div key={item.id} className="lab-poster">
                <div className="lab-poster-art" aria-hidden="true">
                  {item.title.charAt(0)}
                </div>
                <div>
                  <div className="lab-poster-title">{item.title}</div>
                  <div className="lab-poster-meta">{item.meta}</div>
                </div>
              </div>
            ))}
          </Shelf>

          <div className="lab-grid">
            <Card title="Buttons" extra="3 variants · 2 sizes">
              <div className="lab-row">
                <Button variant="primary" size="sm">Play</Button>
                <Button size="sm">Add to list</Button>
                <Button variant="ghost" size="sm">Not now</Button>
              </div>
            </Card>
            <Card title="States" extra="field errors">
              <TextField label="Display name" defaultValue="TeRiRi" hint="Shown on shared playlists." />
              <div style={{ height: 12 }} />
              <TextField label="Email" defaultValue="not-an-email" error="Enter a valid email address." />
            </Card>
          </div>

          <p className="lab-muted">
            Kit lives in <code>components/ui</code> — dependency-free files
            plus tokens. Copy any file into a movies, shows, or anime
            surface as-is; the <code>spk-</code> classes won&apos;t collide
            with existing styles.
          </p>

          <Card title="Bits" extra="avatar · badge · switch · dialog · toast">
            <div className="lab-row">
              <Avatar name="TeRiRi" size="sm" />
              <Avatar name="TeRiRi" />
              <Badge>12 tracks</Badge>
              <Badge tone="accent">Watching</Badge>
              <Badge tone="success">Synced</Badge>
              <Badge tone="danger">Failed</Badge>
            </div>
            <div style={{ height: 12 }} />
            <Separator />
            <div style={{ height: 12 }} />
            <div className="lab-row">
              <Switch label="Crossfade" checked={switchOn} onChange={setSwitchOn} />
              <Button size="sm" onClick={() => setDialogOpen(true)}>Open dialog</Button>
              <Button size="sm" variant="ghost" onClick={() => pushToast('Hello from the kit.', 'success')}>
                Push toast
              </Button>
            </div>
          </Card>
          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title="Delete playlist?"
            actions={
              <>
                <Button size="sm" variant="ghost" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={() => setDialogOpen(false)}>
                  Delete
                </Button>
              </>
            }
          >
            Destructive actions confirm here — backdrop click or Escape backs out.
          </Dialog>
        </div>
      </div>
    </>
  );
}
