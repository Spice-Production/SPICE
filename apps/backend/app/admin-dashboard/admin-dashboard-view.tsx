/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { localModeFeatureStatus, localModeOptionalFeatureStatus } from '@/lib/local-mode-feature-status';
import styles from './admin-dashboard.module.css';

const SPICE_RUNTIME_TARGET = process.env.NEXT_PUBLIC_SPICE_RUNTIME_TARGET === 'vercel' ? 'vercel' : 'local';

const services = [
  { name: 'SPICE Local Runtime', status: 'Local', owner: 'User PC', health: 'Port 3939', access: 'Localhost only' },
  { name: 'SPICE Cloud APIs', status: 'Cloud', owner: 'Vercel', health: 'Auth / sync / metadata', access: 'Signed-in users' },
  { name: 'Neon Postgres', status: 'Cloud', owner: 'Neon', health: 'Pooled serverless', access: 'Vercel env only' },
  { name: 'Install + Updates', status: 'Cached', owner: 'Vercel edge', health: '15 min manifest cache', access: 'Public metadata' },
  { name: 'Spice Anime', status: 'Shelved', owner: 'Frozen source', health: 'Placeholder route', access: 'Hidden from launch' },
  { name: 'Spice Movie', status: 'Shelved', owner: 'Frozen source', health: 'Placeholder route', access: 'Hidden from launch' },
];

const activity = [
  'Local runtime is the only lane for media scraping, streams, lyrics, and proxying',
  'Vercel stays limited to auth, sync, metadata, feedback, install, and update manifests',
  'Local Windows updater is throttled to one quiet manifest check every 12 hours by default',
  'Neon credentials stay in Vercel and are excluded from local packages',
  'Anime, Movie, and legacy Home surfaces are shelved until the local split stabilizes',
  'Last.fm and ListenBrainz stay opt-in profile sync, not search providers',
  'Listen Together is the first optional cloud QoL lane to pause if costs spike',
  'Use pg_stat_statements first if Neon network transfer or row volume rises',
];

const costGuardrails = [
  {
    label: 'Vercel free-tier posture',
    value: 'Thin',
    detail: 'No provider scraping or stream extraction should run in serverless functions.',
  },
  {
    label: 'Update traffic',
    value: 'Cached',
    detail: 'Manifest responses use edge caching; packaged clients throttle quiet checks.',
  },
  {
    label: 'Neon posture',
    value: 'Cloud only',
    detail: 'Local bundles must not include database secrets, Neon clients, or migrations.',
  },
] as const;

const liveServiceStatuses = new Set(['Local', 'Cloud', 'Cached']);

type AdminFeedback = {
  id: string;
  userId: string;
  email: string;
  category: string;
  content: string;
  rating: number | null;
  createdAt: string;
};

export default function AdminDashboardView() {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<AdminFeedback[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [savingUserIds, setSavingUserIds] = useState<Set<string>>(new Set());
  const [successUserIds, setSuccessUserIds] = useState<Set<string>>(new Set());
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  const [moderationDurationByUser, setModerationDurationByUser] = useState<Record<string, string>>({});
  const [moderationReasonByUser, setModerationReasonByUser] = useState<Record<string, string>>({});

  const [systemSettings, setSystemSettings] = useState<any>({
    emergencyAusterity: false,
    austerityThrottleRate: 50,
    disableSync: false,
    emergencyStop: false
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const loadFeedback = useCallback(async (authToken: string, silent = false) => {
    if (!silent) setFeedbackLoading(true);
    setFeedbackError(null);

    try {
      const response = await fetch(cloudApiPath('/admin/feedback'), {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Feedback could not be loaded.');
      }

      const payload = await response.json();
      setFeedback(Array.isArray(payload.feedback) ? payload.feedback : []);
    } catch (loadError) {
      setFeedbackError(loadError instanceof Error ? loadError.message : 'Feedback could not be loaded.');
    } finally {
      if (!silent) setFeedbackLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let feedbackTimer: number | undefined;

    const savedToken = localStorage.getItem('spice_cloud_token');
    setToken(savedToken);

    if (!savedToken) {
      setError('unsigned_in');
      setLoading(false);
      return;
    }
    const authToken = savedToken;

    async function initializeDashboard() {
      try {
        // 1. Verify current session
        const verifyRes = await fetch(cloudApiPath('/account/me'), {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        if (!verifyRes.ok) {
          throw new Error('verification_failed');
        }

        const verifyData = await verifyRes.json();
        const me = verifyData.account || verifyData.user;

        if (!me) {
          throw new Error('user_not_found');
        }

        if (me.accountRole !== 'admin') {
          setError('admin_required');
          setLoading(false);
          return;
        }

        setCurrentUser(me);

        // 2. Fetch all accounts
        const accountsRes = await fetch(cloudApiPath('/admin/accounts'), {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!accountsRes.ok) throw new Error('fetch_accounts_failed');
        const accountsData = await accountsRes.json();
        setAccounts(accountsData.accounts || []);

        // 3. Fetch system settings
        const settingsRes = await fetch(cloudApiPath('/admin/system'), {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (settingsData.settings) {
            setSystemSettings(settingsData.settings);
          }
        }

        // 4. Load the newest feedback and keep the inbox fresh while the dashboard is open.
        await loadFeedback(authToken);
        feedbackTimer = window.setInterval(() => {
          void loadFeedback(authToken, true);
        }, 30_000);
      } catch (err) {
        console.error(err);
        setError('connection_error');
      } finally {
        setLoading(false);
      }
    }

    void initializeDashboard();
    return () => {
      if (feedbackTimer !== undefined) window.clearInterval(feedbackTimer);
    };
  }, [loadFeedback]);

  const handleUpdate = async (
    userId: string,
    updates: {
      accountRole?: string;
      subscriptionTier?: string;
      subscriptionStatus?: string;
      moderationStatus?: string;
      moderationDurationHours?: number;
      moderationReason?: string;
    }
  ) => {
    if (!token) return;

    // Clear previous error
    setSaveErrors((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });

    // Mark as saving
    setSavingUserIds((prev) => {
      const next = new Set(prev);
      next.add(userId);
      return next;
    });

    try {
      const res = await fetch(cloudApiPath('/admin/accounts'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          ...updates,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to update account.');
      }

      const data = await res.json();
      if (data.success && data.account) {
        // Update local accounts state
        setAccounts((prev) =>
          prev.map((acc) => (acc.id === userId ? data.account : acc))
        );

        // Show transient success checkmark
        setSuccessUserIds((prev) => {
          const next = new Set(prev);
          next.add(userId);
          return next;
        });

        setTimeout(() => {
          setSuccessUserIds((prev) => {
            const next = new Set(prev);
            next.delete(userId);
            return next;
          });
        }, 2000);
      }
    } catch (err) {
      console.error(err);
      setSaveErrors((prev) => ({
        ...prev,
        [userId]: err instanceof Error ? err.message : 'Save failed',
      }));
    } finally {
      setSavingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const handleUpdateSettings = async (updates: any) => {
    const savedToken = token || localStorage.getItem('spice_cloud_token') || localStorage.getItem('spice_token');
    if (!savedToken) return;

    setSavingSettings(true);

    // Optimistic update
    setSystemSettings((prev: any) => ({ ...prev, ...updates }));

    try {
      const res = await fetch(cloudApiPath('/admin/system'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${savedToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error('Failed to update system settings');

      const data = await res.json();
      if (data.settings) {
        setSystemSettings(data.settings);
      }
    } catch (err) {
      console.error(err);
      // Fallback to fetch current state on error
      const settingsRes = await fetch(cloudApiPath('/admin/system'), {
        headers: { Authorization: `Bearer ${savedToken}` },
      });
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        if (settingsData.settings) {
          setSystemSettings(settingsData.settings);
        }
      }
    } finally {
      setSavingSettings(false);
    }
  };
  const getProfileInitials = () => {
    if (!currentUser?.email) return 'SA';
    return currentUser.email.slice(0, 2).toUpperCase();
  };

  const displayMetrics = [
    { label: 'Accounts', value: loading ? '...' : accounts.length.toString(), detail: `${accounts.filter((a) => a.accountRole === 'admin').length} admin accounts` },
    { label: 'Feedback', value: feedbackLoading ? '...' : feedback.length.toString(), detail: 'Latest submissions, refreshed every 30 seconds' },
    { label: 'Runtime split', value: 'Local', detail: 'Heavy media work on the user PC' },
    { label: 'Cloud lane', value: '4 APIs', detail: 'Auth, sync, metadata, feedback' },
  ];

  if (loading) {
    return (
      <main className={styles.shell}>
        <div className={styles.backdrop} aria-hidden="true" />
        <div className={styles.loadingContainer}>
          <div className={styles.spinner} />
          <p>Verifying admin permissions...</p>
        </div>
      </main>
    );
  }

  if (error === 'unsigned_in') {
    return (
      <main className={styles.shell}>
        <div className={styles.backdrop} aria-hidden="true" />
        <section className={styles.hero} style={{ gridTemplateColumns: '1fr', textAlign: 'center', padding: '100px 0' }}>
          <div>
            <span className={styles.kicker}>Developer Operations</span>
            <h1>Access Denied</h1>
            <p style={{ margin: '20px auto', maxWidth: '500px' }}>
              Please sign in with a verified SPICE admin account on the home page or in SPICE Music to access the operations dashboard.
            </p>
            <Link href="/" className={styles.primaryLinkButton} style={{ display: 'inline-block', marginTop: '20px' }}>
              Go to Home Screen
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (error === 'admin_required') {
    return (
      <main className={styles.shell}>
        <div className={styles.backdrop} aria-hidden="true" />
        <section className={styles.hero} style={{ gridTemplateColumns: '1fr', textAlign: 'center', padding: '100px 0' }}>
          <div>
            <span className={styles.kicker}>Access level</span>
            <h1>Admin Account Required</h1>
            <p style={{ margin: '20px auto', maxWidth: '500px' }}>
              Your account does not have operator privileges. Normal users are limited to profile, music, anime, and public services.
            </p>
            <Link href="/" className={styles.primaryLinkButton} style={{ display: 'inline-block', marginTop: '20px' }}>
              Go to Home Screen
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.shell}>
        <div className={styles.backdrop} aria-hidden="true" />
        <section className={styles.hero} style={{ gridTemplateColumns: '1fr', textAlign: 'center', padding: '100px 0' }}>
          <div>
            <span className={styles.kicker}>System Error</span>
            <h1>Something went wrong</h1>
            <p style={{ margin: '20px auto', maxWidth: '500px' }}>
              Could not load the developer dashboard due to a connection or database error.
            </p>
            <button onClick={() => window.location.reload()} className={styles.primaryLinkButton} style={{ display: 'inline-block', marginTop: '20px', border: 'none' }}>
              Try Again
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.backdrop} aria-hidden="true" />

      <header className={styles.header}>
        <div className={styles.brandLockup} aria-label="SPICE Admin">
          <span className={styles.logoMark}>
            <svg viewBox="0 0 48 48" role="img" aria-hidden="true">
              <path d="M24 4 42 14.4v19.2L24 44 6 33.6V14.4L24 4Z" />
              <path d="M17.5 30.5c4.7 3.3 12.3 1.6 14.2-3.2 1.3-3.4-.1-6.7-4.1-9.7L22 13.4v8.7l-3.1-2.2c-2.5-1.8-5.4-.1-5.4 2.9 0 1.3.7 2.6 1.9 3.4l4.4 3.1c1.4 1 3 .6 3.9-.7.8-1.2.5-2.8-.7-3.7l-3.8-2.7c-.3-.2-.4-.5-.2-.8.2-.3.6-.4.9-.2l6.2 4.4c1.7 1.2 2.2 2.7 1.5 4-.9 1.8-4.6 2.4-7.4.5l-4.2-2.9-3.2 4.4 4.7 3.3Z" />
            </svg>
          </span>
          <div>
            <span>SPICE Developer</span>
            <strong>Operations dashboard</strong>
          </div>
        </div>

        <div className={styles.profilePill} aria-label="Current admin account preview">
          <span>{getProfileInitials()}</span>
          <div>
            <strong>{currentUser?.email || 'Spice Admin'}</strong>
            <small>{currentUser?.accountRole === 'admin' ? 'Admin account' : 'Operator'}</small>
          </div>
        </div>
      </header>

      <section className={styles.hero} aria-label="Admin dashboard overview">
        <div>
          <span className={styles.kicker}>Local Mode Operations</span>
          <h1>Keep SPICE cheap, local-first, and leak-resistant.</h1>
          <p>
            This dashboard now tracks the split architecture: local media work on the user PC,
            Vercel as a thin control plane, and Neon restricted to cloud-only account and sync data.
          </p>
        </div>

        <aside className={styles.accessPanel}>
          <span>Operator scope</span>
          <strong>Admin account verified</strong>
          <p>You can manage account roles, subscriptions, emergency cloud controls, and local-mode launch readiness.</p>
        </aside>
      </section>

      <section className={styles.metricGrid} aria-label="Admin metrics">
        {displayMetrics.map((metric) => (
          <article key={metric.label} className={styles.metricCard}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className={styles.feedbackPanel} aria-label="User feedback inbox">
        <div className={styles.feedbackHeading}>
          <div className={styles.panelHeading}>
            <span>User feedback</span>
            <h2>Latest submissions</h2>
            <p>New feedback appears here automatically while this dashboard is open.</p>
          </div>
          <button
            type="button"
            className={styles.feedbackRefreshButton}
            disabled={feedbackLoading || !token}
            onClick={() => token && void loadFeedback(token)}
          >
            {feedbackLoading ? 'Refreshing...' : 'Refresh inbox'}
          </button>
        </div>

        {feedbackError && (
          <p className={styles.feedbackError} role="alert">{feedbackError}</p>
        )}

        <div className={styles.feedbackList}>
          {feedback.map((item) => (
            <article key={item.id} className={styles.feedbackCard}>
              <div className={styles.feedbackMeta}>
                <span className={styles.feedbackCategory}>{formatFeedbackCategory(item.category)}</span>
                <span className={styles.feedbackRating} aria-label={item.rating ? `${item.rating} out of 5 stars` : 'No rating'}>
                  {item.rating ? `${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)}` : 'No rating'}
                </span>
                <time dateTime={item.createdAt}>{formatFeedbackDate(item.createdAt)}</time>
              </div>
              <p className={styles.feedbackContent}>{item.content}</p>
              <div className={styles.feedbackAuthor}>
                <strong>{item.email}</strong>
                <span>{item.userId}</span>
              </div>
            </article>
          ))}

          {!feedbackLoading && feedback.length === 0 && !feedbackError && (
            <div className={styles.feedbackEmpty}>
              <strong>No feedback yet</strong>
              <p>Signed-in user submissions will appear here as soon as they arrive.</p>
            </div>
          )}
        </div>
      </section>

      <section className={styles.costGrid} aria-label="Runtime cost guardrails">
        {costGuardrails.map((item) => (
          <article key={item.label} className={styles.costCard}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </section>

      <section className={styles.dashboardGrid}>
        <div className={styles.servicePanel}>
          <div className={styles.panelHeading}>
            <span>Service controls</span>
            <h2>Launch status</h2>
          </div>

          <div className={styles.serviceList}>
            {services.map((service) => (
              <article key={service.name} className={styles.serviceRow}>
                <div>
                  <strong>{service.name}</strong>
                  <span>{service.owner}</span>
                </div>
                <p>{service.access}</p>
                <small className={liveServiceStatuses.has(service.status) ? styles.liveBadge : styles.plannedBadge}>
                  {service.status}
                </small>
                <small>{service.health}</small>
              </article>
            ))}
          </div>
        </div>

        <aside className={styles.queuePanel} aria-label="Admin activity queue">
          <div className={styles.panelHeading}>
            <span>Operator feed</span>
            <h2>Needs attention</h2>
          </div>
          <ul>
            {activity.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <a href="/api/runtime" className={styles.activeFeedButton}>
            View runtime endpoint
          </a>
        </aside>
      </section>

      <section className={styles.featureStatusPanel} aria-label="Features changed for local mode">
        <div className={styles.panelHeading}>
          <span>Feature ledger</span>
          <h2>What had to move, freeze, or be replaced</h2>
        </div>
        <div className={styles.featureStatusGrid}>
          {localModeFeatureStatus.map((item) => (
            <article key={item.feature} className={styles.featureStatusRow}>
              <div>
                <span>{item.status}</span>
                <strong>{item.feature}</strong>
              </div>
              <p>{item.reason}</p>
              <small>{item.replacement}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.featureStatusPanel} aria-label="Optional feature operating posture">
        <div className={styles.panelHeading}>
          <span>QoL and integrations</span>
          <h2>Keep, throttle, or leave removed</h2>
        </div>
        <div className={styles.featureStatusGrid}>
          {localModeOptionalFeatureStatus.map((item) => (
            <article key={item.feature} className={styles.featureStatusRow}>
              <div>
                <span>{item.status}</span>
                <strong>{item.feature}</strong>
              </div>
              <p>{item.reason}</p>
              <small>{item.operatingRule}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.systemPanel} aria-label="System Operations">
        <div className={styles.panelHeading}>
          <span>System Controls</span>
          <h2>Emergency Operations</h2>
        </div>

        <div className={styles.systemControls}>
          <div className={styles.controlRow}>
            <div>
              <strong>Global Emergency Stop</strong>
              <p>Immediately halt all API requests (except admin functions) with a 503 response.</p>
            </div>
            <button
              onClick={() => handleUpdateSettings({ emergencyStop: !systemSettings.emergencyStop })}
              disabled={savingSettings}
              className={systemSettings.emergencyStop ? styles.dangerButtonActive : styles.dangerButton}
            >
              {systemSettings.emergencyStop ? 'Disable Emergency Stop' : 'ENABLE EMERGENCY STOP'}
            </button>
          </div>

          <div className={styles.controlRow}>
            <div>
              <strong>Emergency Austerity Mode</strong>
              <p>Randomly throttle incoming requests with 429 Too Many Requests to reduce server load.</p>
            </div>
            <button
              onClick={() => handleUpdateSettings({ emergencyAusterity: !systemSettings.emergencyAusterity })}
              disabled={savingSettings || systemSettings.emergencyStop}
              className={systemSettings.emergencyAusterity ? styles.warningButtonActive : styles.warningButton}
            >
              {systemSettings.emergencyAusterity ? 'Disable Austerity Mode' : 'Enable Austerity Mode'}
            </button>
          </div>

          <div className={styles.controlRow} style={{ opacity: systemSettings.emergencyAusterity ? 1 : 0.5, pointerEvents: systemSettings.emergencyAusterity ? 'auto' : 'none' }}>
            <div>
              <strong>Austerity Throttle Rate</strong>
              <p>Percentage of requests to drop when Austerity Mode is enabled.</p>
            </div>
            <div className={styles.sliderContainer}>
              <input
                type="range"
                min="10"
                max="90"
                step="10"
                value={systemSettings.austerityThrottleRate || 50}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setSystemSettings((prev: any) => ({ ...prev, austerityThrottleRate: val }));
                }}
                onMouseUp={(e) => handleUpdateSettings({ austerityThrottleRate: parseInt((e.target as HTMLInputElement).value, 10) })}
                onTouchEnd={(e) => handleUpdateSettings({ austerityThrottleRate: parseInt((e.target as HTMLInputElement).value, 10) })}
                disabled={savingSettings || !systemSettings.emergencyAusterity}
              />
              <span>{systemSettings.austerityThrottleRate || 50}%</span>
            </div>
          </div>

          <div className={styles.controlRow} style={{ opacity: systemSettings.emergencyAusterity ? 1 : 0.5, pointerEvents: systemSettings.emergencyAusterity ? 'auto' : 'none' }}>
            <div>
              <strong>Disable Database Sync</strong>
              <p>Block cloud Neon sync operations to save connections while keeping local playback available.</p>
            </div>
            <button
              onClick={() => handleUpdateSettings({ disableSync: !systemSettings.disableSync })}
              disabled={savingSettings || !systemSettings.emergencyAusterity}
              className={systemSettings.disableSync ? styles.warningButtonActive : styles.warningButton}
            >
              {systemSettings.disableSync ? 'Enable Sync' : 'Disable Sync'}
            </button>
          </div>
        </div>
      </section>

      <section className={styles.accessTable} aria-label="Account Management Grid">
        <div className={styles.panelHeading}>
          <span>Account Governance</span>
          <h2>Manage accounts and subscriptions</h2>
        </div>

        <div className={styles.tableResponsive}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>User ID / Email</th>
                <th>Account Role</th>
                <th>Moderation</th>
                <th>Subscription Tier</th>
                <th>Subscription Status</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Sync Status</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => {
                const isSaving = savingUserIds.has(acc.id);
                const isSuccess = successUserIds.has(acc.id);
                const errorMsg = saveErrors[acc.id];
                const moderation = acc.moderation || { status: 'active', expiresAt: null, reason: null };
                const isBlocked = moderation.status === 'banned' || moderation.status === 'timeout';
                const duration = moderationDurationByUser[acc.id] || '24';
                const reason = moderationReasonByUser[acc.id] || '';

                return (
                  <tr key={acc.id} className={styles.adminTableRow}>
                    <td>
                      <div className={styles.userIdentity}>
                        <strong>{acc.email}</strong>
                        <small className={styles.userIdText}>{acc.id}</small>
                      </div>
                    </td>
                    <td>
                      <select
                        value={acc.accountRole}
                        disabled={isSaving}
                        onChange={(e) => handleUpdate(acc.id, { accountRole: e.target.value })}
                        className={styles.adminSelect}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      {isBlocked ? (
                        <div className={styles.moderationBlocked}>
                          <strong className={moderation.status === 'banned' ? styles.moderationBannedLabel : styles.moderationTimeoutLabel}>
                            {moderation.status === 'banned' ? 'Banned' : 'Timed out'}
                          </strong>
                          {moderation.expiresAt && (
                            <small>until {formatModerationDate(moderation.expiresAt)}</small>
                          )}
                          {moderation.reason && <small className={styles.moderationReasonText}>{moderation.reason}</small>}
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleUpdate(acc.id, { moderationStatus: 'active' })}
                            className={styles.moderationClearButton}
                          >
                            Unblock
                          </button>
                        </div>
                      ) : (
                        <div className={styles.moderationControls}>
                          <input
                            type="text"
                            placeholder="Reason (optional)"
                            value={reason}
                            maxLength={500}
                            disabled={isSaving}
                            onChange={(e) => setModerationReasonByUser((prev) => ({ ...prev, [acc.id]: e.target.value }))}
                            className={styles.moderationReasonInput}
                          />
                          <div className={styles.moderationActions}>
                            <select
                              value={duration}
                              disabled={isSaving}
                              onChange={(e) => setModerationDurationByUser((prev) => ({ ...prev, [acc.id]: e.target.value }))}
                              className={styles.adminSelect}
                            >
                              <option value="1">1 hour</option>
                              <option value="24">24 hours</option>
                              <option value="72">3 days</option>
                              <option value="168">7 days</option>
                            </select>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleUpdate(acc.id, {
                                moderationStatus: 'timeout',
                                moderationDurationHours: Number(duration),
                                moderationReason: reason || undefined,
                              })}
                              className={styles.moderationTimeoutButton}
                            >
                              Timeout
                            </button>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleUpdate(acc.id, {
                                moderationStatus: 'banned',
                                moderationReason: reason || undefined,
                              })}
                              className={styles.moderationBanButton}
                            >
                              Ban
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      <select
                        value={acc.subscription?.tier || 'free'}
                        disabled={isSaving}
                        onChange={(e) => handleUpdate(acc.id, { subscriptionTier: e.target.value })}
                        className={styles.adminSelect}
                      >
                        <option value="free">Free</option>
                        <option value="premium">Premium</option>
                        <option value="gold">Gold</option>
                        <option value="platinum">Platinum</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={acc.subscription?.status || 'inactive'}
                        disabled={isSaving}
                        onChange={(e) => handleUpdate(acc.id, { subscriptionStatus: e.target.value })}
                        className={styles.adminSelect}
                      >
                        <option value="inactive">Inactive</option>
                        <option value="trialing">Trialing</option>
                        <option value="active">Active</option>
                        <option value="past_due">Past Due</option>
                        <option value="canceled">Canceled</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <div className={styles.syncStateWrapper}>
                        {isSaving && <div className={styles.inlineSpinner} title="Saving to database..." />}
                        {isSuccess && <span className={styles.syncSuccess} title="Saved successfully!">&#x2714; Saved</span>}
                        {errorMsg && <span className={styles.syncError} title={errorMsg}>&#x26A0; Failed</span>}
                        {!isSaving && !isSuccess && !errorMsg && <span className={styles.syncIdle}>Synced</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#a1a1aa' }}>
                    No registered user accounts found in the database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function cloudApiPath(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return SPICE_RUNTIME_TARGET === 'vercel' ? `/api${normalizedPath}` : `/api/cloud${normalizedPath}`;
}

function formatFeedbackCategory(category: string) {
  const normalized = category.replace(/[-_]+/gu, ' ').trim();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : 'General';
}

function formatFeedbackDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatModerationDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
