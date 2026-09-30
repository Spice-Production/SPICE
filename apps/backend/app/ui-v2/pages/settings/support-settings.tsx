'use client';

import { memo, useEffect, useId, useMemo, useRef } from 'react';

import { useNavigation } from '../../actions';
import { useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Select,
  SettingsBlock,
  SettingsRow,
  SettingsSection,
  Spinner,
  Switch,
  Textarea,
  cn,
  type SelectOption,
} from '../../primitives';
import { OfflineRuntimeSection } from './b-runtime-diagnostics';
import { clearLocalStorage, persistLocal } from './b-storage';
import s from './b-settings.module.css';

/**
 * Group `support`: sections `offline-library`, `offline-runtime`,
 * `feedback-support`, `storage-safety`, and `system-diagnostics`.
 */
export function SupportSettings() {
  return (
    <div className={s.group}>
      <DownloadsFolderSection />
      <OfflineRuntimeSection />
      <FeedbackSection />
      <StorageSafetySection />
      <SystemDiagnosticsSection />
    </div>
  );
}

/* ── Downloads folder ───────────────────────────────────────── */

function DownloadsFolderSection() {
  const m = useSpiceUi();
  const state = m.offlineLibraryBridgeState;

  const chooseFolder = () =>
    void m
      .getSpiceDesktopOfflineLibraryBridge()
      ?.chooseDirectory()
      .then((result) => {
        m.setOfflineLibraryDirectory(result.directory);
        return m.refreshOfflineLibrary();
      });

  return (
    <SettingsSection
      id="offline-library"
      icon="folder"
      title="Downloads folder"
      description="Songs download to your system Downloads folder by default. In SPICE Desktop or Native, choose another folder here whenever you want; supported audio files in it appear in Library → Downloads."
      action={state === 'available' ? <Badge variant="outline">Desktop</Badge> : null}
    >
      {state === 'available' ? (
        <SettingsBlock className={s.block}>
          <div className={s.fieldStack}>
            <span className={s.fieldLabel}>Current folder</span>
            <div className={s.pathRow}>
              <code className={s.pathField} title={m.offlineLibraryDirectory || undefined}>
                {m.offlineLibraryDirectory || 'Loading offline folder…'}
              </code>
              <div className={s.actions}>
                <Button variant="secondary" icon="folder" className={s.touch} onClick={chooseFolder}>
                  Choose folder
                </Button>
                <Button variant="ghost" icon="externalLink" className={s.touch} onClick={() => void m.getSpiceDesktopOfflineLibraryBridge()?.show()}>
                  Open folder
                </Button>
              </div>
            </div>
          </div>
        </SettingsBlock>
      ) : (
        <SettingsBlock>
          {state === 'checking' ? (
            <div className={s.inlineStatus} role="status">
              <Spinner size={14} label="Checking for folder access" />
              <span>Checking for SPICE Desktop folder access…</span>
            </div>
          ) : (
            <Alert variant="neutral" icon="download">
              This web browser controls where downloads are saved. Change its Downloads location in the browser settings, or open SPICE
              Desktop/Native to choose the folder here.
            </Alert>
          )}
        </SettingsBlock>
      )}
    </SettingsSection>
  );
}

/* ── Feedback ───────────────────────────────────────────────── */

type FeedbackCategory = 'general' | 'bug' | 'suggestion' | 'other';

const FEEDBACK_CATEGORIES: ReadonlyArray<SelectOption<FeedbackCategory>> = [
  { value: 'general', label: 'General Feedback' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'suggestion', label: 'Feature Suggestion' },
  { value: 'other', label: 'Other' },
];

const FEEDBACK_MAX_LENGTH = 1000;
const RATING_STEPS = [1, 2, 3, 4, 5] as const;

function FeedbackSection() {
  const m = useSpiceUi();
  const { goTo } = useNavigation();
  const categoryId = useId();
  const ratingId = useId();
  const messageId = useId();
  const statusSucceeded = m.feedbackStatus.includes('successfully');

  return (
    <SettingsSection
      id="feedback-support"
      icon="messageSquare"
      title="Share your feedback"
      description="Help us make SPICE crazier and better! Submit bug reports, feature suggestions, or general feedback directly to the developers."
    >
      {!m.cloudToken ? (
        <SettingsBlock>
          <div className={s.signInPrompt}>
            <span>A signed-in SPICE account is required to submit feedback. Please log in or register.</span>
            <Button variant="outline" size="sm" icon="logIn" className={s.touch} onClick={() => goTo('account')}>
              Go to account
            </Button>
          </div>
        </SettingsBlock>
      ) : (
        <SettingsBlock>
          <form className={s.form} onSubmit={(event) => void m.handleFeedbackSubmit(event)}>
            <div className={s.feedbackGrid}>
              <Field label="Category" htmlFor={categoryId}>
                <Select
                  id={categoryId}
                  value={m.feedbackCategory as FeedbackCategory}
                  onChange={(value) => m.setFeedbackCategory(value)}
                  options={FEEDBACK_CATEGORIES}
                />
              </Field>
              <div className={s.fieldStack}>
                <span className={s.fieldLabelStrong} id={ratingId}>
                  Rate your experience
                </span>
                <div className={s.stars} role="group" aria-labelledby={ratingId}>
                  {RATING_STEPS.map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={s.star}
                      data-filled={m.feedbackRating >= star ? 'true' : undefined}
                      aria-pressed={m.feedbackRating === star}
                      aria-label={`${star} out of 5`}
                      onClick={() => m.setFeedbackRating(star)}
                    >
                      <Icon name="star" size={18} filled={m.feedbackRating >= star} />
                    </button>
                  ))}
                  <span className={s.ratingValue} aria-hidden="true">
                    {m.feedbackRating}/5
                  </span>
                </div>
              </div>
            </div>

            <Field label="Your message" htmlFor={messageId}>
              <Textarea
                id={messageId}
                value={m.feedbackText}
                onChange={(event) => m.setFeedbackText(event.target.value)}
                placeholder="What would you like to share with the developers?..."
                rows={4}
                maxLength={FEEDBACK_MAX_LENGTH}
                required
              />
              <span className={s.charCount} aria-hidden="true">
                {m.feedbackText.length}/{FEEDBACK_MAX_LENGTH}
              </span>
            </Field>

            <div className={s.formFooter}>
              <span className={s.status} role="status" aria-live="polite" data-tone={m.feedbackStatus ? (statusSucceeded ? 'success' : 'danger') : undefined}>
                {m.feedbackStatus}
              </span>
              <Button type="submit" icon="messageSquare" loading={m.isSubmittingFeedback} disabled={!m.feedbackText.trim()}>
                {m.isSubmittingFeedback ? 'Submitting...' : 'Submit feedback'}
              </Button>
            </div>
          </form>
        </SettingsBlock>
      )}
    </SettingsSection>
  );
}

/* ── Storage & safety ───────────────────────────────────────── */

function StorageSafetySection() {
  const m = useSpiceUi();

  const confirmResetRegistry = () =>
    m.requestSpiceConfirm({
      title: 'Reset Local Database?',
      message: 'All custom settings will revert to default and the app will reload.',
      confirmLabel: 'Reset Registry',
      kind: 'danger',
      onConfirm: () => {
        clearLocalStorage();
        m.showSpiceNotice('Local database caches cleared. Reloading...', 'success');
        window.setTimeout(() => window.location.reload(), 650);
      },
    });

  const confirmPurgeHistory = () =>
    m.requestSpiceConfirm({
      title: 'Purge Playback History?',
      message: 'This clears the active profile listening history logs.',
      confirmLabel: 'Purge Logs',
      kind: 'warning',
      onConfirm: () => {
        m.setHistory([]);
        m.updateActiveProfileData({ history: [] });
        m.showSpiceNotice('Active history logs cleared.', 'success');
      },
    });

  return (
    <SettingsSection
      id="storage-safety"
      icon="shield"
      title="Caches & system integrity"
      description="Reset local session states, clear playback history logs, or completely purge LocalStorage profile registries with a single command."
    >
      <SettingsRow label="Purge playback history logs" description="Clears the listening history of the active profile. Your playlists and likes stay.">
        <Button variant="outline" size="sm" icon="history" className={s.touch} onClick={confirmPurgeHistory}>
          Purge history
        </Button>
      </SettingsRow>
      <SettingsRow
        label="Reset local database registry"
        description="Reverts every custom setting on this device to its default and reloads SPICE."
      >
        <Button variant="destructive" size="sm" icon="trash" className={s.touch} onClick={confirmResetRegistry}>
          Reset registry
        </Button>
      </SettingsRow>
    </SettingsSection>
  );
}

/* ── System diagnostics & live terminal ─────────────────────── */

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface DiagnosticCard {
  key: string;
  label: string;
  value: string;
  tone: Tone;
  dot: boolean;
  pulse?: boolean;
}

type TestResult = 'passed' | 'failed' | 'disabled' | null;

function testCard(
  key: string,
  label: string,
  running: boolean,
  result: TestResult,
  labels: { running: string; passed: string; failed: string; disabled?: string },
): DiagnosticCard {
  if (running) return { key, label, value: labels.running, tone: 'warning', dot: true, pulse: true };
  if (result === 'passed') return { key, label, value: labels.passed, tone: 'success', dot: true };
  if (result === 'failed') return { key, label, value: labels.failed, tone: 'danger', dot: true };
  if (result === 'disabled' && labels.disabled) return { key, label, value: labels.disabled, tone: 'warning', dot: true };
  return { key, label, value: 'Untested', tone: 'muted', dot: true };
}

const LOG_CATEGORY_PATTERN = /\]\s*\[(SYSTEM|PLAYER|STREAM|DATABASE|AUTH|DIAGNOSTICS|ERROR)\]/i;

interface ParsedLogLine {
  timestamp: string;
  category: string;
  message: string;
}

/** Same parsing as the classic terminal: "[time] [CATEGORY] message". */
function parseLogLine(log: string): ParsedLogLine {
  const timestampMatch = log.match(/^\[(.*?)\]/);
  const categoryMatch = log.match(LOG_CATEGORY_PATTERN);
  let timestamp = '';
  let category = 'SYSTEM';
  let message = log;
  if (timestampMatch) {
    timestamp = timestampMatch[0];
    message = message.substring(timestampMatch[0].length).trim();
  }
  if (categoryMatch) {
    category = categoryMatch[1].toUpperCase();
    message = message.replace(`[${categoryMatch[1]}]`, '').trim();
  }
  return { timestamp, category, message };
}

function SystemDiagnosticsSection() {
  const m = useSpiceUi();
  const { selfTestRunning: running, selfTestResults: results, streamProtocol } = m;

  const cards = useMemo<DiagnosticCard[]>(() => {
    const latency = results.latency;
    return [
      testCard('api', 'InnerTube API', running, results.api, { running: 'Attuning', passed: 'Online (200)', failed: 'Error / ban' }),
      testCard('db', 'Neon Cloud Sync', running, results.db, {
        running: 'Connecting',
        passed: 'Connected',
        failed: 'Sync error',
        disabled: 'Local PWA',
      }),
      {
        key: 'ping',
        label: 'Diagnostic ping',
        value: latency ? `${latency} ms` : '-- ms',
        tone: !latency ? 'muted' : latency < 250 ? 'success' : latency < 600 ? 'warning' : 'danger',
        dot: false,
      },
      {
        key: 'transport',
        label: 'Active transport',
        value: streamProtocol === 'proxy' ? 'Proxy' : streamProtocol === 'web' ? 'Attestation' : 'Embed',
        tone: 'info',
        dot: false,
      },
      testCard('embed', 'Embed Player API', running, results.embed, { running: 'Loading', passed: 'Ready', failed: 'Blocked' }),
    ];
  }, [results, running, streamProtocol]);

  return (
    <SettingsSection
      id="system-diagnostics"
      icon="terminal"
      title="System diagnostics & live terminal"
      description="Check the music APIs, cloud sync, and stream transport, and inspect the live debug log."
      action={
        <Badge variant="outline" className={s.versionBadge}>
          {m.SPICE_MEDIA_CORE_LABEL}
        </Badge>
      }
    >
      <SettingsBlock className={s.block}>
        <dl className={s.statGrid} aria-busy={running || undefined}>
          {cards.map((card) => (
            <div key={card.key} className={s.statCard}>
              <dt className={s.statLabel}>{card.label}</dt>
              <dd className={s.statValue} data-tone={card.tone}>
                {card.dot ? <span className={s.statDot} data-pulse={card.pulse ? 'true' : undefined} aria-hidden="true" /> : null}
                {card.value}
              </dd>
            </div>
          ))}
        </dl>

        <DebugTerminal running={running} streamProtocol={streamProtocol} />
      </SettingsBlock>
    </SettingsSection>
  );
}

/**
 * The self-test trigger, log toolbar, and live terminal. Split out of
 * `SystemDiagnosticsSection` so its own hook/state analysis (debug log
 * filtering, the terminal scroll anchor) stays isolated from the section's
 * unrelated fields.
 */
function DebugTerminal({ running, streamProtocol }: { running: boolean; streamProtocol: string }) {
  const m = useSpiceUi();
  const autoScrollId = useId();
  // Destructured one binding per line: the model mixes plain state with many
  // RefObject fields, and reading a field straight off `m` inline confuses
  // the compiler's ref-during-render analysis for this component.
  const { debugLogs } = m;
  const { terminalFilter } = m;
  const { logsCopied } = m;
  const { terminalAutoScroll } = m;
  const { terminalEndRef } = m;
  const { streamProtocolRef } = m;

  const lines = useMemo(() => {
    const filter = terminalFilter.toLowerCase();
    return debugLogs.filter((log) => log.toLowerCase().includes(filter)).map(parseLogLine);
  }, [debugLogs, terminalFilter]);

  const terminalRef = useRef<HTMLDivElement>(null);

  // The shell's auto-scroll effect calls terminalEndRef.scrollIntoView() on every new log line,
  // which would also drag the page down to the terminal while you read another section. Keep
  // that scroll inside the terminal box, and open it on the newest lines.
  useEffect(() => {
    const end = terminalEndRef.current;
    const box = terminalRef.current;
    if (!end || !box) return;
    box.scrollTop = box.scrollHeight;
    end.scrollIntoView = (arg?: boolean | ScrollIntoViewOptions) => {
      const smooth = typeof arg === 'object' && arg.behavior === 'smooth';
      box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    };
    return () => {
      Reflect.deleteProperty(end, 'scrollIntoView');
    };
  }, [terminalEndRef]);

  const copyLogs = () => {
    // navigator.clipboard is missing on non-secure origins; only report success when it copied.
    void navigator.clipboard
      ?.writeText(debugLogs.join('\n'))
      .then(() => {
        m.setLogsCopied(true);
        setTimeout(() => m.setLogsCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  const forceProxyMode = () => {
    m.setStreamProtocol('proxy');
    streamProtocolRef.current = 'proxy';
    persistLocal('spice_stream_protocol', 'proxy');
    m.logDebug('system', 'Switched stream endpoint back to direct proxy from diagnostics panel.');
  };

  return (
    <>
      <div className={s.toolbar}>
        <div className={s.toolbarGroup}>
          <Button size="sm" icon="activity" className={s.touch} loading={running} onClick={() => void m.runSelfTest()}>
            {running ? 'Running attestation...' : 'Run full diagnostics'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={logsCopied ? 'check' : 'copy'}
            className={cn(s.touch, logsCopied && s.successText)}
            onClick={copyLogs}
          >
            {logsCopied ? 'Copied logs' : 'Copy logs'}
          </Button>
          <Button variant="ghost" size="sm" icon="trash" className={s.touch} onClick={() => m.setDebugLogs([])}>
            Clear
          </Button>
          {streamProtocol === 'embed' ? (
            <Button variant="outline" size="sm" icon="server" className={s.touch} onClick={forceProxyMode}>
              Force proxy mode
            </Button>
          ) : null}
        </div>
        <div className={s.toolbarGroup}>
          <div className={s.switchLabel}>
            <Switch id={autoScrollId} checked={terminalAutoScroll} onCheckedChange={m.setTerminalAutoScroll} />
            <label htmlFor={autoScrollId}>Auto-scroll</label>
          </div>
          <Input
            type="search"
            size="sm"
            icon="filter"
            placeholder="Filter logs..."
            aria-label="Filter logs"
            value={terminalFilter}
            onChange={(event) => m.setTerminalFilter(event.target.value)}
            wrapperClassName={s.filterInput}
          />
        </div>
      </div>

      <div ref={terminalRef} className={s.terminal} role="log" aria-live="off" aria-label="Debug log" tabIndex={0}>
        {lines.length === 0 ? (
          <div className={s.logEmpty}>-- No matching trace logs. Console active and waiting. --</div>
        ) : (
          <LogLines lines={lines} />
        )}
        <div ref={terminalEndRef} className={s.prompt} aria-hidden="true">
          <span>spice-core@diagnostics ~ %</span>
          <span className={s.promptCaret} />
        </div>
      </div>
      <p className={s.note}>
        {lines.length === debugLogs.length
          ? `${debugLogs.length.toLocaleString()} log line${debugLogs.length === 1 ? '' : 's'}`
          : `${lines.length.toLocaleString()} of ${debugLogs.length.toLocaleString()} log lines match the filter`}
      </p>
    </>
  );
}

/** Memoized so the ~4x/s playback re-renders don't reconcile the whole log. */
const LogLines = memo(function LogLines({ lines }: { lines: ParsedLogLine[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <div key={index} className={s.logLine}>
          {line.timestamp ? <span className={s.logTime}>{line.timestamp}</span> : null}
          <span className={s.logCategory} data-category={line.category}>
            [{line.category}]
          </span>
          <span className={s.logMessage} data-error={line.category === 'ERROR' ? 'true' : undefined}>
            {line.message}
          </span>
        </div>
      ))}
    </>
  );
});
