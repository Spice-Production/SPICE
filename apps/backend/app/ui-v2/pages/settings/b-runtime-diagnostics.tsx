'use client';

import { useCallback, useEffect, useState } from 'react';

import { collectRuntimeHealth, repairOfflineRuntime, type RuntimeHealthReport } from '@/lib/offline-runtime';
import { Icon } from '../../icons';
import { Badge, Button, SettingsBlock, SettingsRow, SettingsSection } from '../../primitives';
import s from './b-settings.module.css';

/** Section `offline-runtime`: v2 rebuild of RuntimeDiagnosticsPanel with identical behavior. */
export function OfflineRuntimeSection() {
  const [report, setReport] = useState<RuntimeHealthReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Run diagnostics to check the local runtime and offline shell.');

  const runDiagnostics = useCallback(async () => {
    setBusy(true);
    try {
      const nextReport = await collectRuntimeHealth();
      setReport(nextReport);
      setStatus(nextReport.issues.length === 0 ? 'All runtime checks passed.' : `${nextReport.issues.length} item(s) need attention.`);
    } finally {
      setBusy(false);
    }
  }, []);

  // Re-check whenever the browser goes online or offline, like the classic panel.
  useEffect(() => {
    const handleConnectionChange = () => void runDiagnostics();
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);
    return () => {
      window.removeEventListener('online', handleConnectionChange);
      window.removeEventListener('offline', handleConnectionChange);
    };
  }, [runDiagnostics]);

  const repair = async () => {
    setBusy(true);
    setStatus('Rebuilding the offline shell cache...');
    try {
      const nextReport = await repairOfflineRuntime();
      setReport(nextReport);
      setStatus(nextReport.issues.length === 0 ? 'Offline shell repaired.' : 'Repair finished; review the remaining items.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Offline repair failed.');
    } finally {
      setBusy(false);
    }
  };

  const healthy = Boolean(report && report.issues.length === 0);

  return (
    <SettingsSection
      id="offline-runtime"
      title="Offline shell & runtime"
      description="Keep the application shell available without a connection, inspect the local runtime, and rebuild stale caches safely."
    >
      <SettingsRow
        label="Runtime health and offline repair"
        description={
          <span role="status" aria-live="polite">
            {status}
          </span>
        }
      >
        <Badge variant={report ? (healthy ? 'success' : 'warning') : 'outline'}>
          {report ? (healthy ? 'Healthy' : 'Attention') : 'Not checked'}
        </Badge>
      </SettingsRow>

      {report ? (
        <SettingsBlock className={s.block}>
          <dl className={s.statGrid}>
            <RuntimeStat label="Connection" value={report.online ? 'Online' : 'Offline'} ok={report.online} />
            <RuntimeStat
              label="Runtime"
              value={report.runtimeReachable ? (report.runtimeTarget ?? 'Reachable') : 'Unreachable'}
              ok={report.runtimeReachable}
            />
            <RuntimeStat label="Version" value={report.runtimeVersion ?? 'Unknown'} />
            <RuntimeStat label="Offline shell" value={report.serviceWorkerRegistered ? 'Registered' : 'Missing'} ok={report.serviceWorkerRegistered} />
            <RuntimeStat label="Controlled" value={report.serviceWorkerControlled ? 'Yes' : 'After reload'} ok={report.serviceWorkerControlled} />
            <RuntimeStat label="SPICE caches" value={String(report.shellCacheNames.length)} />
          </dl>
          {report.issues.length > 0 ? (
            <ul className={s.issueList} aria-label="Items that need attention">
              {report.issues.map((issue) => (
                <li key={issue} className={s.issue}>
                  <Icon name="alertTriangle" size={14} />
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </SettingsBlock>
      ) : null}

      <SettingsBlock>
        <div className={s.actions}>
          <Button variant="outline" icon="activity" disabled={busy} onClick={() => void runDiagnostics()}>
            {busy ? 'Checking...' : 'Run diagnostics'}
          </Button>
          <Button icon="refresh" disabled={busy} onClick={() => void repair()}>
            Repair offline shell
          </Button>
        </div>
      </SettingsBlock>
    </SettingsSection>
  );
}

function RuntimeStat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className={s.statCard}>
      <dt className={s.statLabel}>{label}</dt>
      <dd className={s.statValue} data-tone={ok === undefined ? undefined : ok ? 'success' : 'warning'}>
        {ok !== undefined ? <span className={s.statDot} aria-hidden="true" /> : null}
        {value}
      </dd>
    </div>
  );
}
