'use client';

import { useId, useMemo, useRef, useState } from 'react';

import type { Track } from '../../spice-app';
import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { artistNames, Artwork, formatCount, PlaylistArtwork, TrackArtwork } from '../media';
import { Button, Dialog, Field, Input, Switch } from '../primitives';
import { LocalIcon } from './local-icons';
import s from './overlays.module.css';

/* ── Shared bits ────────────────────────────────────────────── */

/** Accent-color radio group shared by the edit-playlist and create-profile dialogs. */
export function GradientSwatches({ value, onChange }: { value: string; onChange: (gradient: string) => void }) {
  const m = useSpiceUi();
  return (
    <div className={s.swatches} role="radiogroup" aria-label="Accent color">
      {m.PRESET_GRADIENTS.map((gradient, index) => (
        <button
          key={gradient}
          type="button"
          role="radio"
          aria-checked={value === gradient}
          aria-label={`Accent color ${index + 1}`}
          className={s.swatch}
          style={{ background: gradient }}
          onClick={() => onChange(gradient)}
        />
      ))}
    </div>
  );
}

/* ── Invite preview ─────────────────────────────────────────── */

/** Preview a shared-playlist invite link before accepting it. */
export function InvitePreviewDialog() {
  const m = useSpiceUi();
  const invite = m.invitePreview;
  if (!invite) return null;
  const { playlist } = invite;
  const preview = playlist.tracks.slice(0, 3);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) m.setInvitePreview(null);
      }}
      title="Shared playlist invite"
      description={`${formatCount(playlist.tracks.length, 'track')} available from this shared playlist.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => m.setInvitePreview(null)}>
            Dismiss
          </Button>
          <Button
            loading={m.acceptingInvite}
            onClick={() => {
              if (m.cloudToken) {
                void m.acceptSharedPlaylistInvite();
                return;
              }
              m.setSelectedPlaylist(null);
              m.setSelectedUser(null);
              m.setCurrentPage('account');
              m.setInviteStatus('Sign in to SPICE, then accept this playlist invite.');
            }}
          >
            {m.acceptingInvite ? 'Accepting…' : m.cloudToken ? 'Accept playlist' : 'Sign in first'}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        <div className={s.mediaRow}>
          <PlaylistArtwork playlist={playlist} size={64} />
          <span className={s.mediaText}>
            <span className={s.mediaTitle}>{playlist.title}</span>
            <p className={s.mediaDescription}>{playlist.description || 'A shared SPICE playlist.'}</p>
            {invite.expiresAt ? <span className={s.hint}>Invite expires {new Date(invite.expiresAt).toLocaleDateString()}</span> : null}
          </span>
        </div>

        {preview.length > 0 ? (
          <ul className={s.listBox} aria-label="Playlist preview">
            {preview.map((track) => (
              <li key={`${track.sourceId ?? 'youtube_music'}:${track.id}`} className={s.listItem}>
                <span className={s.mediaText}>
                  <span className={s.listItemName}>{track.title}</span>
                  <span className={s.listItemHandle}>{artistNames(track) || 'Unknown artist'}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {m.inviteStatus ? (
          <p className={s.hint} role="status">
            {m.inviteStatus}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/* ── Edit playlist ──────────────────────────────────────────── */

/** Title, description, accent, cover, and visibility for an owned or shared playlist. */
export function EditPlaylistDialog() {
  const m = useSpiceUi();
  const playlist = m.selectedPlaylist;
  const formId = useId();
  const titleId = useId();
  const descId = useId();
  const coverUrlId = useId();
  const uploadRef = useRef<HTMLInputElement>(null);
  const visibilityId = useId();
  if (!m.showEditPlaylistDialog || !playlist) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) m.setShowEditPlaylistDialog(false);
      }}
      title="Edit playlist details"
      footer={
        <div className={s.footerSplit}>
          <Button variant="ghost" icon="trash" onClick={() => m.setShowDeleteConfirm(true)}>
            Delete
          </Button>
          <div className={s.footerGroup}>
            <Button variant="outline" onClick={() => m.setShowEditPlaylistDialog(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId}>
              Save changes
            </Button>
          </div>
        </div>
      }
    >
      <form id={formId} onSubmit={m.savePlaylistEdits} className={s.stack}>
        <Field label="Playlist name" htmlFor={titleId}>
          <Input
            id={titleId}
            value={m.editPlTitle}
            onChange={(event) => m.setEditPlTitle(event.target.value)}
            placeholder="Spicy compile title…"
            required
            autoFocus
          />
        </Field>

        <Field label="Description" htmlFor={descId} description="Optional">
          <Input id={descId} value={m.editPlDesc} onChange={(event) => m.setEditPlDesc(event.target.value)} placeholder="Description details…" />
        </Field>

        <Field label="Accent color">
          <GradientSwatches value={m.editPlGradient} onChange={m.setEditPlGradient} />
        </Field>

        <Field label="Cover image" htmlFor={coverUrlId}>
          <div className={s.stackTight}>
            <Input
              id={coverUrlId}
              value={m.editPlCoverUrl}
              onChange={(event) => m.setEditPlCoverUrl(event.target.value)}
              placeholder="Paste a custom image URL…"
            />
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              className={s.fileInput}
              tabIndex={-1}
              aria-label="Upload a cover image"
              onChange={m.handleCoverUpload}
            />
            {/* A real button (not a label) so keyboard users can open the file picker. */}
            <span>
              <Button type="button" variant="outline" size="sm" onClick={() => uploadRef.current?.click()}>
                <LocalIcon name="camera" size={14} />
                Choose image
              </Button>
            </span>
            {m.editPlCoverUrl ? (
              <div className={s.coverPreview}>
                <Artwork src={m.editPlCoverUrl} size={48} />
                <span className={s.hint}>Cover image set</span>
                <Button variant="ghost" size="sm" className={s.coverRemove} onClick={() => m.setEditPlCoverUrl('')}>
                  Remove
                </Button>
              </div>
            ) : null}
          </div>
        </Field>

        <div className={s.switchRow}>
          <span className={s.switchRowText}>
            <label htmlFor={visibilityId} className={s.switchRowLabel}>
              Public playlist
            </label>
            <span className={s.hint}>
              {m.editPlIsPublic ? 'Public playlists are visible to everyone via search.' : 'Private playlists are only visible to you.'}
            </span>
          </span>
          <Switch id={visibilityId} checked={m.editPlIsPublic} onCheckedChange={m.setEditPlIsPublic} />
        </div>
      </form>
    </Dialog>
  );
}

/* ── Delete playlist confirm ────────────────────────────────── */

/** Destructive confirmation reached from the edit-playlist dialog's Delete button. */
export function DeletePlaylistConfirmDialog() {
  const m = useSpiceUi();
  const playlist = m.selectedPlaylist;
  if (!m.showDeleteConfirm || !playlist) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) m.setShowDeleteConfirm(false);
      }}
      size="sm"
      title="Delete playlist?"
      footer={
        <>
          <Button variant="outline" onClick={() => m.setShowDeleteConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              void m.deletePlaylist(playlist.id);
              m.setShowDeleteConfirm(false);
              m.setShowEditPlaylistDialog(false);
            }}
          >
            Yes, delete
          </Button>
        </>
      }
    >
      <div className={s.confirmBody}>
        <span className={s.kindIcon} data-kind="danger">
          <Icon name="alertTriangle" size={16} />
        </span>
        <p className={s.muted}>Are you sure you want to delete &ldquo;{playlist.title}&rdquo;? This action cannot be undone.</p>
      </div>
    </Dialog>
  );
}

/* ── Playlist picker ────────────────────────────────────────── */

/** "Save to playlist" picker reached from any track's more menu. */
export function PlaylistPickerDialog() {
  const track = useSpiceUi().playlistPickerTrack;
  // The body holds the search query, so it must unmount with the dialog to start clean next time.
  return track ? <PlaylistPickerBody track={track} /> : null;
}

function PlaylistPickerBody({ track }: { track: Track }) {
  const m = useSpiceUi();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return m.allEditablePlaylists;
    return m.allEditablePlaylists.filter((playlist) => playlist.title.toLowerCase().includes(q));
  }, [m.allEditablePlaylists, query]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) m.setPlaylistPickerTrack(null);
      }}
      title="Save to playlist"
      description="Now playing"
    >
      <div className={s.stack}>
        <div className={s.mediaRow}>
          <TrackArtwork track={track} size={44} />
          <span className={s.mediaText}>
            <span className={s.mediaTitle}>{track.title}</span>
            <span className={s.mediaSubtitle}>{artistNames(track) || 'Unknown artist'}</span>
          </span>
        </div>

        {m.allEditablePlaylists.length > 5 ? (
          <Input
            icon="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a playlist"
            aria-label="Find a playlist"
          />
        ) : null}

        {m.allEditablePlaylists.length === 0 ? (
          <p className={s.pickerEmpty}>Create your first playlist, then this song will be one tap away from it.</p>
        ) : filtered.length === 0 ? (
          <p className={s.pickerEmpty}>No playlists match &ldquo;{query}&rdquo;.</p>
        ) : (
          <ul className={s.pickerList} role="list" aria-label="Playlists">
            {filtered.map((playlist) => {
              const alreadySaved = playlist.tracks.some((candidate) => candidate.id === track.id);
              const isSaving = m.playlistPickerSavingId === playlist.id;
              return (
                <li key={playlist.id}>
                  <button
                    type="button"
                    className={s.pickerItem}
                    data-saved={alreadySaved ? 'true' : undefined}
                    disabled={alreadySaved || m.playlistPickerSavingId !== null}
                    onClick={() => void m.savePlaylistPickerSelection(playlist.id)}
                  >
                    <PlaylistArtwork playlist={playlist} size={40} />
                    <span className={s.mediaText}>
                      <span className={s.mediaTitle}>{playlist.title}</span>
                      <span className={s.mediaSubtitle}>
                        {playlist.shared ? 'Shared playlist' : formatCount(playlist.tracks.length, 'song')}
                      </span>
                    </span>
                    <span className={s.pickerStatus} data-state={alreadySaved ? 'saved' : 'add'}>
                      {alreadySaved ? (
                        <>
                          <Icon name="check" size={12} /> Saved
                        </>
                      ) : isSaving ? (
                        'Saving…'
                      ) : (
                        'Add'
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          className={s.pickerItem}
          onClick={() => {
            m.setNewPlaylistSeedTrack(track);
            m.setPlaylistPickerTrack(null);
            m.setShowCreateDialog(true);
          }}
        >
          <span className={s.pickerCreateIcon}>
            <Icon name="plus" size={18} />
          </span>
          <span className={s.mediaTitle}>Create a new playlist</span>
        </button>
      </div>
    </Dialog>
  );
}

/* ── Create playlist ────────────────────────────────────────── */

/** New personal playlist, optionally seeded with a track from the picker. */
export function CreatePlaylistDialog() {
  const m = useSpiceUi();
  const formId = useId();
  const titleId = useId();
  const descId = useId();
  const visibilityId = useId();
  if (!m.showCreateDialog) return null;

  const close = () => {
    m.setShowCreateDialog(false);
    m.setNewPlaylistSeedTrack(null);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      size="sm"
      title="Create playlist"
      description={m.newPlaylistSeedTrack ? `“${m.newPlaylistSeedTrack.title}” will be added automatically.` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId}>
            Create
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={m.createPlaylist} className={s.stack}>
        <Field label="Playlist name" htmlFor={titleId}>
          <Input
            id={titleId}
            value={m.newPlTitle}
            onChange={(event) => m.setNewPlTitle(event.target.value)}
            placeholder="Spicy selection…"
            required
            autoFocus
          />
        </Field>
        <Field label="Description" htmlFor={descId} description="Optional">
          <Input id={descId} value={m.newPlDesc} onChange={(event) => m.setNewPlDesc(event.target.value)} placeholder="Late night vibe compiles…" />
        </Field>
        <div className={s.switchRow}>
          <span className={s.switchRowText}>
            <label htmlFor={visibilityId} className={s.switchRowLabel}>
              Public playlist
            </label>
            <span className={s.hint}>{m.newPlIsPublic ? 'Visible to everyone via search.' : 'Only visible to you.'}</span>
          </span>
          <Switch id={visibilityId} checked={m.newPlIsPublic} onCheckedChange={m.setNewPlIsPublic} />
        </div>
      </form>
    </Dialog>
  );
}

/* ── Create shared playlist ─────────────────────────────────── */

/** New collaborative playlist (always shared, owner role). */
export function CreateSharedPlaylistDialog() {
  const m = useSpiceUi();
  const formId = useId();
  const titleId = useId();
  const descId = useId();
  if (!m.showCreateSharedDialog) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) m.setShowCreateSharedDialog(false);
      }}
      size="sm"
      title="Create shared playlist"
      footer={
        <>
          <Button variant="outline" onClick={() => m.setShowCreateSharedDialog(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId}>
            Create
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={m.createSharedPlaylist} className={s.stack}>
        <Field label="Playlist name" htmlFor={titleId}>
          <Input
            id={titleId}
            value={m.newSharedPlTitle}
            onChange={(event) => m.setNewSharedPlTitle(event.target.value)}
            placeholder="Collaborative selection…"
            required
            autoFocus
          />
        </Field>
        <Field label="Description" htmlFor={descId} description="Optional">
          <Input
            id={descId}
            value={m.newSharedPlDesc}
            onChange={(event) => m.setNewSharedPlDesc(event.target.value)}
            placeholder="Let's build a vibe together…"
          />
        </Field>
      </form>
    </Dialog>
  );
}
