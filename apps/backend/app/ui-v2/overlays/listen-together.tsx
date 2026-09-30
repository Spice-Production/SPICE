'use client';

import { useId } from 'react';

import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import type { SpiceUiModel } from '../model';
import { Avatar, Badge, Button, Dialog, IconButton, Input, Portal, type BadgeVariant } from '../primitives';
import { playerOffset } from './toasts';
import s from './overlays.module.css';

/* ── Helpers ────────────────────────────────────────────────── */

/** Same link format the classic dialog shares. */
function sessionShareUrl(sessionId: string) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/?listenTogether=${sessionId}`;
}

async function copySessionLink(m: SpiceUiModel, sessionId: string) {
  const copied = await m.copyTextToClipboard(sessionShareUrl(sessionId));
  if (copied) m.showSpiceNotice('Session link copied to clipboard!', 'success');
}

interface InvitedListener {
  inviteId: string;
  displayName: string;
  username: string;
  status: string;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

/** `listenTogetherInvitesList` is untyped API data; read only the fields the dialog shows. */
function toInvitedListeners(list: readonly unknown[]): InvitedListener[] {
  return list.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    return [
      {
        inviteId: readString(record, 'inviteId') || `invite-${index}`,
        displayName: readString(record, 'invitedDisplayName'),
        username: readString(record, 'invitedUsername'),
        status: readString(record, 'status') || 'pending',
      },
    ];
  });
}

function inviteBadgeVariant(status: string): BadgeVariant {
  if (status === 'accepted') return 'success';
  if (status === 'rejected') return 'danger';
  return 'secondary';
}

function inviteStatusLabel(status: string) {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
}

/* ── Session pill ───────────────────────────────────────────── */

/** Floating status pill while hosting or listening in a Listen Together session. */
export function ListenTogetherBanner() {
  const m = useSpiceUi();
  const hosting = m.listenTogetherSession;
  if (!hosting && !m.listenTogetherHostSessionId) return null;

  const title = hosting ? 'Hosting session' : 'Listening together';
  const detail = hosting ? `ID ${hosting.id.slice(0, 8)}…` : `Host: ${m.listenTogetherHostName || 'Friend'}`;

  return (
    <Portal>
      <div
        className={s.bannerDock}
        data-sidebar={m.sidebarHidden ? 'collapsed' : 'expanded'}
        data-player={playerOffset(m.playerPlacement, m.playerViewMode)}
      >
        <aside className={s.banner} aria-label="Listen Together session">
          <span className={s.bannerDot} aria-hidden="true" />
          <span className={s.bannerText} role="status">
            <span className={s.bannerTitle}>{title}</span>
            <span className={s.bannerDetail} title={hosting ? hosting.id : undefined}>
              {detail}
            </span>
          </span>
          <span className={s.bannerActions}>
            {hosting ? (
              <IconButton icon="link" label="Copy session link" size="sm" onClick={() => void copySessionLink(m, hosting.id)} />
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => m.setListenTogetherDialogOpen(true)}>
              Manage
            </Button>
            <Button variant="ghost" size="sm" onClick={m.handleEndOrLeaveListenTogether}>
              {hosting ? 'End' : 'Leave'}
            </Button>
          </span>
        </aside>
      </div>
    </Portal>
  );
}

/* ── Dialog ─────────────────────────────────────────────────── */

function JoinSessionRow({ placeholder }: { placeholder: string }) {
  const m = useSpiceUi();
  const join = () => m.joinListenTogetherSession(m.listenTogetherJoinSessionId);
  return (
    <div className={s.row}>
      <Input
        wrapperClassName={s.grow}
        icon="hash"
        value={m.listenTogetherJoinSessionId}
        onChange={(event) => m.setListenTogetherJoinSessionId(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') join();
        }}
        placeholder={placeholder}
        aria-label="Session ID"
        autoComplete="off"
        spellCheck={false}
      />
      <Button variant="outline" onClick={join} disabled={!m.listenTogetherJoinSessionId.trim()}>
        Join
      </Button>
    </div>
  );
}

function HostingView({ sessionId }: { sessionId: string }) {
  const m = useSpiceUi();
  const id = useId();
  const invites = toInvitedListeners(m.listenTogetherInvitesList);
  const shareUrl = sessionShareUrl(sessionId);
  return (
    <div className={s.stack}>
      <div className={s.sessionCard}>
        <div className={s.stackTight}>
          <span>
            <Badge variant="accent" icon="radio">
              Session active
            </Badge>
          </span>
          <span className={s.sessionCode} title={sessionId}>
            {sessionId}
          </span>
        </div>
      </div>

      <div className={s.stackTight}>
        <p className={s.sectionLabel} id={`${id}-share`}>
          Share session link
        </p>
        <div className={s.row}>
          <Input
            wrapperClassName={s.grow}
            readOnly
            value={shareUrl}
            aria-labelledby={`${id}-share`}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
          <Button variant="outline" icon="copy" onClick={() => void copySessionLink(m, sessionId)}>
            Copy
          </Button>
        </div>
      </div>

      <div className={s.stackTight}>
        <p className={s.sectionLabel} id={`${id}-invite`}>
          Invite a Spicer
        </p>
        <div className={s.row}>
          <Input
            wrapperClassName={s.grow}
            icon="atSign"
            placeholder="ex @username#00000"
            value={m.listenTogetherInviteUsername}
            onChange={(event) => m.setListenTogetherInviteUsername(event.target.value)}
            onKeyDown={(event) => {
              // Enter mirrors the Invite button's own disabled states.
              if (event.key === 'Enter' && !m.isSendingListenTogetherInvite && m.listenTogetherInviteUsername.trim()) {
                void m.handleSendListenTogetherInvite();
              }
            }}
            aria-labelledby={`${id}-invite`}
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            loading={m.isSendingListenTogetherInvite}
            disabled={!m.listenTogetherInviteUsername.trim()}
            onClick={() => void m.handleSendListenTogetherInvite()}
          >
            {m.isSendingListenTogetherInvite ? 'Sending…' : 'Invite'}
          </Button>
        </div>
      </div>

      {invites.length > 0 ? (
        <div className={s.stackTight}>
          <p className={s.sectionLabel} id={`${id}-invited`}>
            Invited listeners
          </p>
          <ul className={s.listBox} aria-labelledby={`${id}-invited`}>
            {invites.map((invite) => (
              <li key={invite.inviteId} className={s.listItem}>
                <Avatar name={invite.displayName || invite.username} size={28} />
                <span className={s.mediaText}>
                  <span className={s.listItemName}>{invite.displayName || invite.username}</span>
                  {invite.username ? <span className={s.listItemHandle}>@{invite.username}</span> : null}
                </span>
                <Badge variant={inviteBadgeVariant(invite.status)}>{inviteStatusLabel(invite.status)}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ListenTogetherDialog() {
  const m = useSpiceUi();
  const close = () => m.setListenTogetherDialogOpen(false);
  const session = m.listenTogetherSession;
  const hostSessionId = m.listenTogetherHostSessionId;

  let content;
  let footer;
  if (session) {
    content = <HostingView sessionId={session.id} />;
    footer = (
      <>
        <Button variant="ghost" onClick={close}>
          Close
        </Button>
        <Button variant="destructive" icon="power" onClick={() => void m.handleEndListenTogetherSession()}>
          End session
        </Button>
      </>
    );
  } else if (hostSessionId) {
    content = (
      <div className={s.hero}>
        <span className={s.heroIcon} data-tone="accent">
          <Icon name="headphones" size={22} />
        </span>
        <h3 className={s.heroTitle}>Listening with {m.listenTogetherHostName || 'Host'}</h3>
        <p className={s.heroText}>Your player is synchronized with their playback.</p>
      </div>
    );
    footer = (
      <>
        <Button variant="ghost" onClick={close}>
          Close
        </Button>
        <Button icon="logOut" onClick={() => void m.handleLeaveListenTogetherSession()}>
          Leave session
        </Button>
      </>
    );
  } else if (!m.cloudToken) {
    content = (
      <div className={s.stack}>
        <div className={s.hero}>
          <span className={s.heroIcon}>
            <Icon name="key" size={22} />
          </span>
          <h3 className={s.heroTitle}>Join without signing in</h3>
          <p className={s.heroText}>
            Shared room links work without an account. Sign in only when you want to host or send username invites.
          </p>
        </div>
        <JoinSessionRow placeholder="Paste a session ID" />
      </div>
    );
    footer = (
      <Button
        icon="logIn"
        block
        onClick={() => {
          m.setListenTogetherDialogOpen(false);
          m.setCurrentPage('account');
        }}
      >
        Go to account sign-in
      </Button>
    );
  } else {
    content = (
      <div className={s.stack}>
        <div className={s.hero}>
          <span className={s.heroIcon}>
            <Icon name="users" size={22} />
          </span>
          <h3 className={s.heroTitle}>Share the vibe</h3>
          <p className={s.heroText}>
            Start a Listen Together session to broadcast your music to friends in real time, or join a friend&apos;s active session.
          </p>
        </div>
        <JoinSessionRow placeholder="Paste a session ID to join" />
        <div className={s.divider}>or host your own room</div>
        <Button
          icon="radio"
          block
          loading={m.isCreatingListenTogetherSession}
          onClick={() => void m.handleStartListenTogetherSession()}
        >
          {m.isCreatingListenTogetherSession ? 'Starting…' : 'Start a session'}
        </Button>
      </div>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={
        <span className={s.titleWithIcon}>
          <Icon name="headphones" size={18} />
          Listen Together
        </span>
      }
      footer={footer}
    >
      <div className={s.stack}>
        <div className={s.statusLine} role="status">
          <Icon name="activity" size={14} />
          <span>{m.listenTogetherStatus}</span>
        </div>
        {content}
      </div>
    </Dialog>
  );
}
