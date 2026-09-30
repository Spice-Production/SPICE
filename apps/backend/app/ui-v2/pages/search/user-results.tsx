'use client';

import { useId, useMemo } from 'react';

import { useNavigation } from '../../actions';
import { useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import { formatCount } from '../../media';
import { Avatar, Badge, EmptyState, SectionHeader, Skeleton, VisuallyHidden } from '../../primitives';
import { toListenerRows, type ListenerRow } from './listeners';
import s from '../search.module.css';

/** Users tab body: listener results, searching, no-match and intro states. */
export function UserSearchResults() {
  const m = useSpiceUi();
  const rows = useMemo(() => toListenerRows(m.userSearchResults), [m.userSearchResults]);
  const headingId = useId();
  const query = m.userSearchQuery.trim();

  if (rows.length > 0) {
    return (
      <section className={s.section} aria-labelledby={headingId} aria-busy={m.isSearchingUsers || undefined}>
        <SectionHeader id={headingId} title="Listeners" description={formatCount(rows.length, 'listener')} />
        <ul className={s.listenerList}>
          {rows.map((row) => (
            <ListenerResult key={row.view.key} row={row} />
          ))}
        </ul>
      </section>
    );
  }

  if (m.isSearchingUsers) {
    return (
      <section className={s.section} aria-labelledby={headingId} aria-busy="true">
        <SectionHeader id={headingId} title="Listeners" description="Searching listeners…" />
        <div className={s.listenerList} role="status">
          <VisuallyHidden>Searching listeners</VisuallyHidden>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={s.listenerSkeleton} aria-hidden="true">
              <Skeleton width={44} height={44} radius="999px" />
              <div className={s.skeletonText}>
                <Skeleton width={`${36 - (index % 2) * 10}%`} height={12} />
                <Skeleton width={`${22 + (index % 3) * 4}%`} height={10} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (query) {
    return (
      <EmptyState
        icon="search"
        title="No listeners found"
        description={`No users found matching “${m.userSearchQuery}”. Try their exact username or display name.`}
      />
    );
  }

  return (
    <EmptyState
      icon="users"
      title="Find other SPICE listeners"
      description="Search up your friends by their username or display name to check out their profiles and playlists."
    />
  );
}

function ListenerResult({ row }: { row: ListenerRow }) {
  const m = useSpiceUi();
  const { openUser } = useNavigation();
  const { view } = row;
  const isSelf = Boolean(view.id) && view.id === m.cloudUser?.id;
  return (
    <li>
      <button type="button" className={s.listenerRow} onClick={() => openUser(row.source)}>
        <Avatar src={view.avatarUrl} name={view.displayName} gradient={view.gradient ?? 'var(--sx-accent-gradient)'} size={44} />
        <span className={s.listenerText}>
          <span className={s.listenerName}>
            <span className={s.listenerNameText}>{view.displayName}</span>
            {isSelf ? <Badge variant="accent">You</Badge> : null}
          </span>
          <span className={s.listenerMeta}>
            <span className={s.listenerHandle}>@{view.username}</span>
            <span aria-hidden="true">·</span>
            {view.isPrivate ? (
              <span className={s.listenerPrivate}>
                <Icon name="lock" size={12} />
                Private profile
              </span>
            ) : (
              <span>{formatCount(view.songsPlayed, 'song')}</span>
            )}
          </span>
        </span>
        <span className={s.listenerCta} aria-hidden="true">
          <span className={s.listenerCtaText}>View profile</span>
          <Icon name="chevronRight" size={16} />
        </span>
      </button>
    </li>
  );
}
