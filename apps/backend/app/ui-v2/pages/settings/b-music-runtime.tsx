'use client';

import { useEffect, useId, useState } from 'react';

import type { SpiceNativeShellBridge } from '../../../spice-app';
import { Alert, Button, Input, SettingsBlock, SettingsSection } from '../../primitives';
import s from './b-settings.module.css';

type RuntimeBridge = SpiceNativeShellBridge['runtime'];
type RuntimeMode = 'local' | 'remote';

interface RuntimeState {
  mode: RuntimeMode;
  remoteUrl: string;
  device: { id: string; name: string } | null;
  hasToken: boolean;
}

/** Same lookup as the classic panel: the runtime API lives on the Native shell bridge. */
function getRuntimeBridge(): RuntimeBridge | null {
  if (typeof window === 'undefined') return null;
  const scoped = window as Window & { spiceNativeShell?: { runtime?: RuntimeBridge } };
  return scoped.spiceNativeShell?.runtime ?? null;
}

const DEFAULT_REMOTE_URL = 'https://music.spice-app.xyz';
const NO_BRIDGE_STATUS = 'Music runtime switching lives in the native desktop shell.';

function mergeRuntimeState(prev: RuntimeState, next: RuntimeState): RuntimeState {
  return {
    mode: next.mode ?? prev.mode,
    remoteUrl: next.remoteUrl ?? prev.remoteUrl,
    device: next.device !== undefined ? next.device : prev.device,
    hasToken: next.hasToken ?? prev.hasToken,
  };
}

function classifyFailure(message: string): 'rejected' | 'unreachable' | null {
  if (/token|rejected|401|unauthorized/i.test(message)) return 'rejected';
  if (/unreachable|ECONN|ENOTFOUND|fetch failed|network|timeout/i.test(message)) return 'unreachable';
  return null;
}

const MODE_OPTIONS: ReadonlyArray<{ value: RuntimeMode; label: string; description: string }> = [
  { value: 'local', label: 'Local PC (default)', description: 'Play everything on this computer with the installed runtime.' },
  { value: 'remote', label: 'SPICE Cloud', description: 'Stream from your private server. Link this PC below to finish setup.' },
];

/** Section `music-runtime`: v2 rebuild of MusicRuntimeSettingsPanel with identical behavior. */
export function MusicRuntimeSection() {
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
  const urlId = useId();
  const groupName = useId();

  const refresh = async () => {
    const bridge = getRuntimeBridge();
    if (!bridge) {
      setStatus(NO_BRIDGE_STATUS);
      return;
    }
    try {
      const next = await bridge.get();
      setState((prev) => mergeRuntimeState(prev, next));
      setUrlDraft(next.remoteUrl || DEFAULT_REMOTE_URL);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not read runtime settings.');
    }
  };

  // Initial load runs in an async continuation with an unmount guard.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const bridge = getRuntimeBridge();
      if (!bridge) {
        if (!cancelled) setStatus(NO_BRIDGE_STATUS);
        return;
      }
      try {
        const next = await bridge.get();
        if (cancelled) return;
        setState((prev) => mergeRuntimeState(prev, next));
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
      setStatus(NO_BRIDGE_STATUS);
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

  const fail = (message: string) => {
    setFailure(classifyFailure(message));
    setStatus(message);
  };

  const switchMode = (mode: RuntimeMode) =>
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

  const locked = busy !== null;

  return (
    <SettingsSection
      id="music-runtime"
      title="Music runtime"
      description="Choose where SPICE Music runs. Local PC plays everything on this computer. SPICE Cloud streams from your private server."
    >
      <SettingsBlock>
        <fieldset className={s.radioGroup} role="radiogroup" aria-label="Music runtime mode">
          {MODE_OPTIONS.map((option) => {
            const checked = state.mode === option.value;
            return (
              <label
                key={option.value}
                className={s.radioCard}
                data-checked={checked ? 'true' : undefined}
                data-disabled={locked ? 'true' : undefined}
              >
                <input
                  type="radio"
                  name={groupName}
                  className={s.radioInput}
                  checked={checked}
                  disabled={locked}
                  onChange={() => void switchMode(option.value)}
                />
                <span className={s.radioIndicator} aria-hidden="true" />
                <span className={s.optionText}>
                  <span className={s.optionLabel}>{option.label}</span>
                  <span className={s.optionDescription}>{option.description}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </SettingsBlock>

      {state.mode === 'remote' ? (
        <SettingsBlock className={s.block}>
          <div className={s.fieldStack}>
            <label htmlFor={urlId} className={s.fieldLabel}>
              SPICE Cloud URL
            </label>
            <div className={s.pathRow}>
              <Input
                id={urlId}
                type="text"
                value={urlDraft}
                spellCheck={false}
                disabled={locked}
                onChange={(event) => setUrlDraft(event.target.value)}
                placeholder="https://music.spice-app.xyz"
                wrapperClassName={s.grow}
                className={s.mono}
              />
              <Button variant="outline" disabled={locked} loading={busy === 'url'} onClick={() => void saveUrl()}>
                {busy === 'url' ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>

          <dl className={s.kvList}>
            <div className={s.kvItem} role="status">
              <dt className={s.kvLabel}>This PC</dt>
              <dd className={s.kvValue} data-accent={state.device ? 'true' : undefined}>
                {state.device ? 'Linked: ' + state.device.name + '.' : 'Not linked.'}
              </dd>
            </div>
          </dl>

          {failure === 'rejected' ? (
            <Alert variant="danger" title="Remote token rejected — check Settings, Runtime" />
          ) : null}
          {failure === 'unreachable' ? (
            <Alert
              variant="warning"
              title="SPICE Cloud unreachable"
              action={
                <Button size="sm" variant="outline" disabled={locked} onClick={() => void switchBackToLocal()}>
                  Switch back to Local PC
                </Button>
              }
            />
          ) : null}

          <div className={s.actions}>
            <Button icon="link" disabled={locked} loading={busy === 'register'} onClick={() => void linkDevice()}>
              {busy === 'register' ? 'Linking...' : state.device ? 'Re-link this PC' : 'Link this PC'}
            </Button>
            <Button variant="outline" icon="activity" disabled={locked} loading={busy === 'test'} onClick={() => void testConnection()}>
              {busy === 'test' ? 'Testing...' : 'Test connection'}
            </Button>
            {state.device ? (
              <Button variant="ghost" disabled={locked} loading={busy === 'unlink'} onClick={() => void unlinkDevice()}>
                {busy === 'unlink' ? 'Unlinking...' : 'Unlink'}
              </Button>
            ) : null}
          </div>

          <p className={s.note}>
            Linking signs this PC in with your SPICE account and stores a per-device token here. Unlinking revokes it server-side. A lost
            device stops working the moment you unlink it.
          </p>
        </SettingsBlock>
      ) : null}

      <SettingsBlock>
        <p role="status" className={s.status} data-tone={failure ? 'danger' : undefined}>
          {busy ? 'Working...' : status}
        </p>
      </SettingsBlock>
    </SettingsSection>
  );
}
