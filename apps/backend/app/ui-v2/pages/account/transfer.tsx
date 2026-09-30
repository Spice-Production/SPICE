'use client';

import { useId, useState } from 'react';

import { useSpiceUi } from '../../context';
import { Icon, type IconName } from '../../icons';
import { Alert, Button, Card, Field, Input, SectionHeader, Textarea } from '../../primitives';
import s from '../account.module.css';

/** Playlist transfer: YouTube import, JSON backup export, and restore/merge. */
export function ImportAndBackup() {
  return (
    <section className={s.section} aria-labelledby="sx-account-transfer">
      <SectionHeader
        id="sx-account-transfer"
        title="Import & backup"
        description="Bring playlists in from YouTube, or move this profile between devices with a JSON backup."
      />
      <div className={s.transferGrid}>
        <YouTubeImport />
        <BackupExport />
        <BackupRestore />
      </div>
    </section>
  );
}

function CardTitle({ icon, title, description }: { icon: IconName; title: string; description: string }) {
  return (
    <div className={s.transferHeader}>
      <span className={s.transferIcon}>
        <Icon name={icon} size={16} />
      </span>
      <div className={s.transferHeaderText}>
        <h3 className={s.transferTitle}>{title}</h3>
        <p className={s.transferDescription}>{description}</p>
      </div>
    </div>
  );
}

function YouTubeImport() {
  const m = useSpiceUi();
  const linkId = useId();
  return (
    <Card className={s.transferCard}>
      <CardTitle
        icon="youtube"
        title="YouTube & YouTube Music"
        description="Transfer any public YouTube or YouTube Music playlist. SPICE fetches its tracks and saves it as a new playlist."
      />
      <form
        className={s.transferBody}
        onSubmit={(event) => {
          event.preventDefault();
          if (!m.isImportingPlaylist) void m.importYouTubePlaylist();
        }}
      >
        <Field label="Playlist link or ID" htmlFor={linkId}>
          <Input
            id={linkId}
            type="text"
            inputMode="url"
            icon="link"
            placeholder="https://music.youtube.com/playlist?list=PL..."
            value={m.ytPlaylistLink}
            onChange={(event) => m.setYtPlaylistLink(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        {m.playlistImportError ? <Alert variant="danger">{m.playlistImportError}</Alert> : null}
        {m.playlistImportSuccess ? <Alert variant="success">{m.playlistImportSuccess}</Alert> : null}
        <Button type="submit" icon="download" loading={m.isImportingPlaylist} className={s.transferAction}>
          {m.isImportingPlaylist ? 'Importing playlist...' : 'Fetch & import'}
        </Button>
      </form>
    </Card>
  );
}

function BackupExport() {
  const m = useSpiceUi();
  return (
    <Card className={s.transferCard}>
      <CardTitle
        icon="save"
        title="Back up this profile"
        description="Export playlists, likes, and history as a JSON payload to sync databases across devices by hand."
      />
      <div className={s.transferBody}>
        <div className={s.transferButtons}>
          <Button variant="outline" icon="download" onClick={m.downloadBackupFile}>
            Download .json
          </Button>
          <Button variant="outline" icon="clipboard" onClick={m.copyBackupToClipboard}>
            Copy to clipboard
          </Button>
        </div>
      </div>
    </Card>
  );
}

function BackupRestore() {
  const m = useSpiceUi();
  const textId = useId();
  const [attempted, setAttempted] = useState<string | null>(null);
  const hasText = m.jsonImportText.trim().length > 0;
  // A failed restore keeps the pasted text; the error clears once it is edited.
  const failed = m._jsonBackupStatus === 'error' && attempted !== null && attempted === m.jsonImportText;
  const restore = () => {
    setAttempted(m.jsonImportText);
    m.restoreBackupData();
  };

  return (
    <Card className={`${s.transferCard} ${s.transferWide}`}>
      <CardTitle
        icon="upload"
        title="Restore or merge a backup"
        description="Paste a SPICE JSON backup to merge its playlists, liked songs, and history into this profile."
      />
      <div className={s.transferBody}>
        <Field label="Backup JSON" htmlFor={textId}>
          <Textarea
            id={textId}
            className={s.jsonInput}
            placeholder="Paste backup JSON code..."
            value={m.jsonImportText}
            onChange={(event) => m.setJsonImportText(event.target.value)}
            spellCheck={false}
            rows={5}
          />
        </Field>
        {failed ? <Alert variant="danger">That backup could not be read. Check the JSON and try again.</Alert> : null}
        <div className={s.transferFooter}>
          <span className={s.mutedSmall}>Existing data is kept; matching playlists are skipped.</span>
          <Button icon="upload" onClick={restore} disabled={!hasText}>
            Restore backup
          </Button>
        </div>
      </div>
    </Card>
  );
}
