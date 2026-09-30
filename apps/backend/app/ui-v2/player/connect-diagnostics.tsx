'use client';

/**
 * Spice Connect transport trace, gated by remoteTransportDiagnosticsEnabled.
 * Mirrors app/spice-app.tsx ~21252-21321 exactly (same storage key on close).
 */

import { useSpiceUi } from '../context';
import { IconButton, Portal } from '../primitives';
import s from './connect-diagnostics.module.css';

export function ConnectDiagnostics() {
  const m = useSpiceUi();
  if (!m.remoteTransportDiagnosticsEnabled) return null;

  const route = m.selectedRemoteDeviceId
    ? m.selectedRemoteDeviceUsesLan
      ? 'Local network direct'
      : 'Cloud server fallback'
    : 'No receiver selected';
  const lanLatency = m.selectedRemoteDeviceId ? m.remoteLanLatencyMsByDevice[m.selectedRemoteDeviceId] : undefined;
  const diagnostic = m.remoteTransportDiagnostic;

  return (
    <Portal>
      <aside aria-label="Spice Connect transport diagnostics" className={s.panel}>
        <div className={s.head}>
          <span className={s.title}>Spice Connect trace</span>
          <IconButton
            icon="x"
            label="Hide Spice Connect transport diagnostics"
            title="Hide diagnostics (Ctrl+Shift+Alt+L)"
            size="xs"
            onClick={() => {
              m.setRemoteTransportDiagnosticsEnabled(false);
              try {
                localStorage.setItem(m.SPICE_CONNECT_TRANSPORT_DIAGNOSTICS_STORAGE_KEY, 'false');
              } catch {
                // Best-effort persistence only.
              }
            }}
          />
        </div>
        <div className={s.body}>
          <div className={s.route}>
            Route: <strong>{route}</strong>
          </div>
          {lanLatency !== undefined ? <div>LAN round trip: {lanLatency} ms</div> : null}
          <div>
            {diagnostic
              ? `${diagnostic.direction === 'sent' ? 'Sent' : 'Received'} ${diagnostic.command} via ${diagnostic.transport === 'lan' ? 'local network' : 'cloud server'}${diagnostic.latencyMs !== undefined ? ` (${diagnostic.latencyMs} ms)` : ''}`
              : 'No playback command observed yet.'}
          </div>
          {diagnostic ? (
            <div className={s.meta}>
              Peer {diagnostic.peerDeviceId.slice(0, 18)} · {new Date(diagnostic.observedAt).toLocaleTimeString()}
            </div>
          ) : null}
        </div>
      </aside>
    </Portal>
  );
}
