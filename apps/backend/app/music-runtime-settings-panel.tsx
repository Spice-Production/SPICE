'use client';

import { useEffect, useState } from 'react';

interface RuntimeDevice {
  id: string;
  name: string;
}

interface RuntimeState {
  mode: 'local' | 'remote';
  remoteUrl: string;
  device: RuntimeDevice | null;
  hasToken: boolean;
}

interface RuntimeBridge {
  get: () => Promise<RuntimeState>;
  set: (patch: { mode?: 'local' | 'remote'; remoteUrl?: string }) => Promise<RuntimeState>;
  register: () => Promise<{ device?: RuntimeDevice; error?: string }>;
  testConnection: () => Promise<{ ok: boolean; version?: string; error?: string }>;
  unlink: () => Promise<{ ok: boolean }>;
}

function getRuntimeBridge(): RuntimeBridge | null {
  if (typeof window === 'undefined') return null;
  const scoped = window as Window & { spiceNativeShell?: { runtime?: RuntimeBridge } };
  return scoped.spiceNativeShell?.runtime ?? null;
}

const DEFAULT_REMOTE_URL = 'https://music.spice-app.xyz';

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--body-bg)',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  padding: '10px 12px',
  color: 'var(--text-primary)',
  font: 'inherit',
  fontSize: '0.85rem',
};

export default function MusicRuntimeSettingsPanel() {
  const [state, setState] = useState<RuntimeState>({
    mode: 'local',
    remoteUrl: DEFAULT_REMOTE_URL,
    device: null,
    hasToken: false,
  });
  const [urlDraft, setUrlDraft] = useState(DEFAULT_REMOTE_URL);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('Choose where SPICE Music runs.');
  const [failure, setFailure] = useState<'rejected' | 'unreachable' | null>(null);

  const refresh = async () => {
    const bridge = getRuntimeBridge();
    if (!bridge) {
      setStatus('Music runtime switching lives in the native desktop shell.');
      return;
    }
    try {
      const next = await bridge.get();
      setState((prev) => ({
        mode: next.mode ?? prev.mode,
        remoteUrl: next.remoteUrl ?? prev.remoteUrl,
        device: next.device !== undefined ? next.device : prev.device,
        hasToken: next.hasToken ?? prev.hasToken,
      }));
      setUrlDraft(next.remoteUrl || DEFAULT_REMOTE_URL);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not read runtime settings.');
    }
  };

  // Initial load lives in an async continuation (with unmount guard), never
  // as a synchronous setState in the effect body.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bridge = getRuntimeBridge();
      if (!bridge) {
        if (!cancelled) setStatus('Music runtime switching lives in the native desktop shell.');
        return;
      }
      try {
        const next = await bridge.get();
        if (cancelled) return;
        setState((prev) => ({
          mode: next.mode ?? prev.mode,
          remoteUrl: next.remoteUrl ?? prev.remoteUrl,
          device: next.device !== undefined ? next.device : prev.device,
          hasToken: next.hasToken ?? prev.hasToken,
        }));
        setUrlDraft(next.remoteUrl || DEFAULT_REMOTE_URL);
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Could not read runtime settings.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runAction = async (label: string, action: (bridge: RuntimeBridge) => Promise<void>) => {
    const bridge = getRuntimeBridge();
    if (!bridge) {
      setStatus('Music runtime switching lives in the native desktop shell.');
      return;
    }
    setBusy(label);
    setFailure(null);
    try {
      await action(bridge);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const classifyFailure = (message: string): 'rejected' | 'unreachable' | null => {
    if (/token|rejected|401|unauthorized/i.test(message)) return 'rejected';
    if (/unreachable|ECONN|ENOTFOUND|fetch failed|network|timeout/i.test(message)) return 'unreachable';
    return null;
  };

  const fail = (message: string) => {
    setFailure(classifyFailure(message));
    setStatus(message);
  };

  const switchMode = (mode: 'local' | 'remote') =>
    runAction('mode', async (bridge) => {
      await bridge.set({ mode });
      setStatus(mode === 'remote' ? 'Remote runtime selected. Link this PC to finish setup.' : 'Local PC runtime selected.');
    });

  const saveUrl = () =>
    runAction('url', async (bridge) => {
      const cleaned = urlDraft.trim().replace(/\/+$/, '');
      if (!/^https:\/\//i.test(cleaned)) {
        fail('Remote URL must start with https://');
        return;
      }
      await bridge.set({ remoteUrl: cleaned });
      setStatus('Remote URL saved.');
    });

  const linkDevice = () =>
    runAction('register', async (bridge) => {
      const result = await bridge.register();
      if (result?.error) {
        fail(result.error);
        return;
      }
      setStatus('Linked: ' + (result?.device?.name || 'this PC') + '.');
    });

  const testConnection = () =>
    runAction('test', async (bridge) => {
      const result = await bridge.testConnection();
      if (result?.ok) {
        setStatus(result.version ? 'Connected (version ' + result.version + ').' : 'Connected.');
        return;
      }
      fail(result?.error || 'Connection test failed.');
    });

  const unlinkDevice = () =>
    runAction('unlink', async (bridge) => {
      await bridge.unlink();
      setStatus('This PC is unlinked. The server token was revoked.');
    });

  const switchBackToLocal = () =>
    runAction('mode', async (bridge) => {
      await bridge.set({ mode: 'local' });
      setStatus('Switched back to the Local PC runtime.');
    });

  return (
    <div>
      <div role="radiogroup" aria-label="Music runtime mode" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="radio"
            name="music-runtime-mode"
            checked={state.mode === 'local'}
            disabled={busy !== null}
            onChange={() => void switchMode('local')}
            style={{ marginTop: '4px', accentColor: 'var(--accent)' }}
          />
          <span>
            <strong style={{ display: 'block', fontSize: '0.9rem' }}>Local PC (default)</strong>
            <small style={{ color: 'var(--text-secondary)' }}>Play everything on this computer with the installed runtime.</small>
          </span>
        </label>
        <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="radio"
            name="music-runtime-mode"
            checked={state.mode === 'remote'}
            disabled={busy !== null}
            onChange={() => void switchMode('remote')}
            style={{ marginTop: '4px', accentColor: 'var(--accent)' }}
          />
          <span>
            <strong style={{ display: 'block', fontSize: '0.9rem' }}>SPICE Cloud</strong>
            <small style={{ color: 'var(--text-secondary)' }}>Stream from your private server. Link this PC below to finish setup.</small>
          </span>
        </label>
      </div>

      {state.mode === 'remote' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label htmlFor="music-runtime-url" style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              SPICE Cloud URL
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="music-runtime-url"
                type="text"
                value={urlDraft}
                spellCheck={false}
                disabled={busy !== null}
                onChange={(event) => setUrlDraft(event.target.value)}
                placeholder="https://music.spice-app.xyz"
                style={inputStyle}
              />
              <button type="button" className="btn btn--ghost" disabled={busy !== null} onClick={() => void saveUrl()}>
                {busy === 'url' ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <div
            role="status"
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
            }}
          >
            {state.device ? 'Linked: ' + state.device.name + '.' : 'Not linked.'}
          </div>

          {failure === 'rejected' && (
            <div role="alert" style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              Remote token rejected — check Settings, Runtime
            </div>
          )}
          {failure === 'unreachable' && (
            <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-primary)' }}>SPICE Cloud unreachable</span>
              <span>
                <button type="button" className="btn btn--ghost" disabled={busy !== null} onClick={() => void switchBackToLocal()}>
                  Switch back to Local PC
                </button>
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--primary" disabled={busy !== null} onClick={() => void linkDevice()}>
              {busy === 'register' ? 'Linking...' : state.device ? 'Re-link this PC' : 'Link this PC'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy !== null} onClick={() => void testConnection()}>
              {busy === 'test' ? 'Testing...' : 'Test connection'}
            </button>
            {state.device && (
              <button type="button" className="btn btn--ghost" disabled={busy !== null} onClick={() => void unlinkDevice()}>
                {busy === 'unlink' ? 'Unlinking...' : 'Unlink'}
              </button>
            )}
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Linking signs this PC in with your SPICE account and stores a per-device token here. Unlinking revokes it
            server-side. A lost device stops working the moment you unlink it.
          </p>
        </div>
      )}

      <p role="status" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '14px 0 0 0' }}>
        {busy ? 'Working...' : status}
      </p>
    </div>
  );
}
