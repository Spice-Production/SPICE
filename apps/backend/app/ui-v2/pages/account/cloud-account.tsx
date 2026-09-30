'use client';

import { useId, useState, type FormEvent } from 'react';

import type { CloudAccount, PendingInvite } from '../../../spice-app';
import { useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import type { SpiceUiModel } from '../../model';
import {
  Alert,
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  SettingsBlock,
  SettingsRow,
  SettingsSection,
  Spinner,
  cn,
  primitiveStyles,
  type BadgeVariant,
} from '../../primitives';
import s from '../account.module.css';
import { AuthPanel } from './auth-panel';
import { sanitizeUsername, seedProfileDraft } from './shared';

/** SPICE account & cloud sync: auth flows when signed out, account + sync when signed in. */
export function CloudAccountSection() {
  const m = useSpiceUi();
  const user = m.cloudUser;
  return (
    <SettingsSection
      id="sx-account-cloud"
      icon="cloud"
      title="SPICE account & sync"
      description={
        user
          ? 'Your playlists, liked songs, and history sync with this account.'
          : 'Sign in to back up this profile and use it across devices.'
      }
      action={
        user ? (
          <Badge variant="success" icon="check">
            Connected
          </Badge>
        ) : (
          <Badge variant="outline" icon="cloudOff">
            Not connected
          </Badge>
        )
      }
    >
      {user ? (
        <SignedInAccount user={user} />
      ) : (
        <SettingsBlock>
          <AuthPanel />
        </SettingsBlock>
      )}
    </SettingsSection>
  );
}

function SignedInAccount({ user }: { user: CloudAccount }) {
  const m = useSpiceUi();
  const isAdmin = Boolean(user.isAdmin || user.accountRole === 'admin');
  const subscriptionActive = Boolean(user.subscription?.isActive);
  const showInvites = Boolean(m.cloudUsername) && m.pendingInvites.length > 0;

  return (
    <>
      <SettingsBlock className={s.identityBlock}>
        <div className={s.identity}>
          <span className={s.identityIcon}>
            <Icon name="mail" size={18} />
          </span>
          <div className={s.identityText}>
            <span className={s.identityLabel}>Signed in as</span>
            <span className={s.identityEmailRow}>
              <span className={s.identityEmail}>{m.showSyncEmail ? user.email : m.getMaskedEmail(user.email)}</span>
              <IconButton
                icon={m.showSyncEmail ? 'eyeOff' : 'eye'}
                label={m.showSyncEmail ? 'Hide email' : 'Show email'}
                size="xs"
                className={s.trailingButton}
                aria-pressed={m.showSyncEmail}
                onClick={() => m.setShowSyncEmail(!m.showSyncEmail)}
              />
            </span>
            <span className={s.identityBadges}>
              <Badge variant={user.isAdmin ? 'warning' : 'secondary'} icon={user.isAdmin ? 'shield' : 'user'} className={s.capitalize}>
                {`${user.accountRole || 'user'} account`}
              </Badge>
              <Badge variant={subscriptionActive ? 'success' : 'secondary'} icon="sparkles" className={s.capitalize}>
                {`${user.subscription?.tier || 'free'} subscription`}
              </Badge>
            </span>
          </div>
          <Button variant="outline" size="sm" icon="logOut" className={s.identitySignOut} onClick={m.handleLogout}>
            Sign out
          </Button>
        </div>
      </SettingsBlock>

      {m.isLocalDbFallback || m.dbError ? (
        <SettingsBlock className={s.alertStack}>
          {m.isLocalDbFallback ? (
            <Alert variant="info" icon="database" title="Local file account">
              Signed in using backend local fallback storage. Syncing works locally; configure the cloud database connection on Vercel for
              hosted backup.
            </Alert>
          ) : null}
          {m.dbError ? (
            <Alert variant="danger" title="Cloud database unavailable">
              {m.dbError} Configure the backend cloud database connection and run migrations to enable full cloud backup.
            </Alert>
          ) : null}
        </SettingsBlock>
      ) : null}

      {m.cloudToken ? (
        // Remount (and close) the inline editor whenever the saved username,
        // the active profile, or the full profile editor changes underneath it.
        <UsernameRow key={`${m.activeProfileId}:${m.cloudUsername ?? ''}:${m.isEditingProfile ? 'dialog' : 'inline'}`} />
      ) : null}

      <SyncRow />

      {isAdmin ? (
        <SettingsRow label="Admin dashboard" description="Manage accounts, moderation, and service health.">
          <a
            href="/admin-dashboard"
            className={cn(primitiveStyles.button, primitiveStyles['button-outline'], primitiveStyles['button-sm'], s.adminLink)}
          >
            <Icon name="shield" size={14} />
            Open dashboard
          </a>
        </SettingsRow>
      ) : null}

      {showInvites ? <PendingInvites invites={m.pendingInvites} /> : null}
    </>
  );
}

const SYNC_BADGES: Record<'syncing' | 'success' | 'partial' | 'error', { variant: BadgeVariant; label: string }> = {
  syncing: { variant: 'info', label: 'Syncing' },
  success: { variant: 'success', label: 'Synced' },
  partial: { variant: 'warning', label: 'Partly synced' },
  error: { variant: 'danger', label: 'Sync failed' },
};

const IDLE_SYNC_MESSAGE = 'Merge playlists, liked songs, and listening history with your account.';

function syncMessage(m: SpiceUiModel) {
  switch (m.syncingStatus) {
    case 'syncing':
      return 'Merging your playlists, likes, and history with the database...';
    case 'success':
      return 'Synchronized successfully with the database!';
    case 'partial':
      return 'Some data could not sync. Retry to finish safely.';
    case 'error':
      if (!m.dbError) return 'Sync failed. Please check server logs.';
      return IDLE_SYNC_MESSAGE;
    default:
      return IDLE_SYNC_MESSAGE;
  }
}

function SyncRow() {
  const m = useSpiceUi();
  const status = m.syncingStatus && m.syncingStatus !== 'idle' ? SYNC_BADGES[m.syncingStatus] : null;
  const syncing = m.syncingStatus === 'syncing';
  const tone =
    m.syncingStatus === 'success'
      ? s.toneSuccess
      : m.syncingStatus === 'partial'
        ? s.toneWarning
        : m.syncingStatus === 'error'
          ? s.toneDanger
          : undefined;

  return (
    <SettingsRow
      label={
        <span className={s.rowLabel}>
          Cloud sync
          {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
        </span>
      }
      description={
        <span className={tone} role="status" aria-live="polite">
          {syncMessage(m)}
        </span>
      }
    >
      <Button icon="refresh" loading={syncing} disabled={syncing} onClick={() => void m.syncWithCloud()}>
        {syncing ? 'Syncing...' : 'Sync now'}
      </Button>
    </SettingsRow>
  );
}

/**
 * Inline username editor. Usernames are saved by the classic profile save
 * flow, so the draft is seeded from the active profile first. A successful
 * change remounts this row through its key; an unchanged submit closes it
 * here. Errors keep it open with the server message.
 */
function UsernameRow() {
  const m = useSpiceUi();
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const open = editing && !(submitted !== null && submitted === (m.cloudUsername ?? ''));

  const start = () => {
    seedProfileDraft(m, false);
    setSubmitted(null);
    setEditing(true);
  };

  const cancel = () => {
    m.setUsernameError(null);
    setSubmitted(null);
    setEditing(false);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    setSubmitted(m.editUsername.trim().toLowerCase());
    setSaving(true);
    try {
      await m.saveProfile(event);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <SettingsRow
        label="Spicer username"
        description={m.cloudUsername ? `@${m.cloudUsername} · how other listeners find you` : 'Pick a username so other listeners can find you.'}
      >
        <Button variant="outline" size="sm" icon="pencil" onClick={start}>
          {m.cloudUsername ? 'Change' : 'Set username'}
        </Button>
      </SettingsRow>
    );
  }

  return (
    <SettingsBlock>
      <form className={s.usernameForm} onSubmit={onSubmit}>
        <Field
          label="Spicer username"
          htmlFor={inputId}
          description="Lowercase letters, numbers, and underscores."
          error={m.usernameError}
          className={s.usernameField}
        >
          <Input
            id={inputId}
            type="text"
            icon="atSign"
            value={m.editUsername}
            invalid={Boolean(m.usernameError)}
            onChange={(event) => {
              m.setEditUsername(sanitizeUsername(event.target.value));
              m.setUsernameError(null);
            }}
            placeholder="sound_lover"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
          />
        </Field>
        <div className={s.usernameActions}>
          <Button variant="ghost" size="sm" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </SettingsBlock>
  );
}

function PendingInvites({ invites }: { invites: PendingInvite[] }) {
  const m = useSpiceUi();
  return (
    <SettingsBlock>
      <div className={s.invitesHeader}>
        <span className={s.rowLabel}>
          Playlist requests
          <Badge variant="accent">{invites.length}</Badge>
        </span>
        <span className={s.mutedSmall}>Listeners who asked you to join their playlists.</span>
      </div>
      {m.pendingInvitesLoading ? (
        <div className={s.inlineStatus}>
          <Spinner size={14} label="Loading requests" />
          <span>Loading requests...</span>
        </div>
      ) : (
        <ul className={s.inviteList}>
          {invites.map((invite) => (
            <li key={invite.playlistId} className={s.invite}>
              <span className={s.inviteIcon}>
                <Icon name="listMusic" size={16} />
              </span>
              <div className={s.inviteText}>
                <span className={s.inviteTitle}>{invite.playlistTitle}</span>
                <span className={s.mutedSmall}>
                  Requested by <strong className={s.strong}>{invite.ownerDisplayName}</strong> (@{invite.ownerUsername})
                </span>
              </div>
              <div className={s.inviteActions}>
                <Button size="sm" onClick={() => void m.handleAcceptInvite(invite.playlistId)} disabled={m.acceptingInvite}>
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void m.handleRejectInvite(invite.playlistId)}
                  disabled={m.acceptingInvite}
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsBlock>
  );
}
