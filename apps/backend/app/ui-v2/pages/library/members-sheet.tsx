'use client';

import { useId, type FormEvent } from 'react';

import type { Playlist, PlaylistMember } from '../../../spice-app';
import { useSpiceUi } from '../../context';
import { Avatar, Badge, Button, EmptyState, IconButton, Input, Label, Sheet, Skeleton, useIsMobile } from '../../primitives';
import s from '../playlist.module.css';

function MemberRow({
  member,
  detail,
  badge,
  onRemove,
}: {
  member: PlaylistMember;
  detail: string;
  badge?: 'pending';
  onRemove?: () => void;
}) {
  const name = member.displayName || member.username || 'Spicer';
  return (
    <li className={s.memberRow}>
      <Avatar src={member.avatarUrl} name={name} size={36} className={s.memberAvatar} />
      <div className={s.memberText}>
        <span className={s.memberName}>
          <span className={s.truncate}>{name}</span>
          {badge === 'pending' ? <Badge variant="warning">Pending</Badge> : null}
        </span>
        <span className={s.memberDetail}>
          {member.username ? `@${member.username} · ` : ''}
          {detail}
        </span>
      </div>
      {onRemove ? (
        <Button variant="ghost" size="sm" className={s.memberRemove} onClick={onRemove} aria-label={`Remove ${name}`}>
          Remove
        </Button>
      ) : null}
    </li>
  );
}

function LoadingRows() {
  return (
    <div className={s.memberSkeletons} role="status" aria-label="Loading spicers">
      {[0, 1, 2].map((row) => (
        <div key={row} className={s.memberSkeletonRow}>
          <Skeleton width={36} height={36} radius={999} />
          <div className={s.memberSkeletonText}>
            <Skeleton width="45%" height={12} />
            <Skeleton width="30%" height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The classic "Playlist Spicers" panel as a sheet: owner and members with
 * their status, refresh, owner-only invite by username and remove, and the
 * member action status line.
 */
export function MembersSheet({ playlist }: { playlist: Playlist }) {
  const m = useSpiceUi();
  const isMobile = useIsMobile();
  const inputId = useId();
  const isOwner = Boolean(m.isPlaylistOwner);
  const list = m.membersList;
  const canInvite = !m.invitingMember && Boolean(m.inviteUsername.trim());

  const submitInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canInvite) return;
    void m.inviteMember(playlist.id);
  };

  const status = m.memberActionStatus ? (
    <p className={s.memberStatus} role="status">
      {m.memberActionStatus}
    </p>
  ) : null;

  return (
    <Sheet
      open={m.showMembersPanel}
      onOpenChange={(open) => {
        if (!open) m.setShowMembersPanel(false);
      }}
      side={isMobile ? 'bottom' : 'right'}
      width={400}
      title="Members"
      description={`Spicers with access to ${playlist.title || 'this playlist'}`}
      headerActions={
        <IconButton
          icon="refresh"
          label="Refresh Spicers"
          size="sm"
          loading={m.membersLoading}
          onClick={() => {
            void m.fetchPlaylistMembers(playlist.id);
          }}
        />
      }
      footer={
        isOwner ? (
          <form className={s.inviteForm} onSubmit={submitInvite}>
            <Label htmlFor={inputId}>Add a Spicer by username</Label>
            <div className={s.inviteRow}>
              <Input
                id={inputId}
                type="text"
                placeholder="e.g. @sound_lover"
                autoComplete="off"
                spellCheck={false}
                value={m.inviteUsername}
                onChange={(event) => m.setInviteUsername(event.target.value)}
                wrapperClassName={s.inviteInput}
              />
              <Button type="submit" icon="userPlus" loading={m.invitingMember} disabled={!canInvite}>
                {m.invitingMember ? 'Inviting…' : 'Invite'}
              </Button>
            </div>
            {status}
          </form>
        ) : undefined
      }
    >
      <div className={s.membersBody}>
        {m.membersLoading ? (
          <LoadingRows />
        ) : list ? (
          <ul className={s.memberList} aria-label="Playlist members">
            {list.owner ? <MemberRow member={list.owner} detail="Owner" /> : null}
            {(list.members ?? []).map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                detail={member.status === 'pending' ? `Join request pending (${member.role})` : `Spicer (${member.role})`}
                badge={member.status === 'pending' ? 'pending' : undefined}
                onRemove={
                  isOwner
                    ? () => {
                        void m.removeMember(playlist.id, member.userId);
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            plain
            icon="users"
            title="No member details yet"
            description="Refresh to load the Spicers on this playlist."
            action={
              <Button
                variant="outline"
                icon="refresh"
                onClick={() => {
                  void m.fetchPlaylistMembers(playlist.id);
                }}
              >
                Refresh
              </Button>
            }
          />
        )}
        {!isOwner ? status : null}
      </div>
    </Sheet>
  );
}
