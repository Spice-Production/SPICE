'use client';

import { useMemo, useState } from 'react';

import type { DesktopOfflineLibraryEntry } from '../../../spice-app';
import { usePlayback } from '../../actions';
import { useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import { artistNames, formatCount, TrackList } from '../../media';
import { Badge, Button, Card, EmptyState, IconButton, type BadgeVariant } from '../../primitives';
import s from '../library.module.css';
import { formatMegabytes } from './helpers';

type BridgeState = 'checking' | 'available' | 'error' | 'unavailable';

const BRIDGE_STATUS: Record<BridgeState, { label: string; variant: BadgeVariant }> = {
  checking: { label: 'Detecting', variant: 'secondary' },
  available: { label: 'Connected', variant: 'success' },
  unavailable: { label: 'Unavailable', variant: 'outline' },
  error: { label: 'Error', variant: 'danger' },
};

/**
 * Desktop offline library: storage summary with the folder controls (only
 * when the desktop bridge is available) and the downloaded files, each with
 * play, show-in-folder, and a confirmed delete.
 */
export function DownloadsView() {
  const m = useSpiceUi();
  const { isActive } = usePlayback();
  const [refreshing, setRefreshing] = useState(false);
  const entries = m.offlineLibraryEntries;
  const tracks = useMemo(() => entries.map((entry) => entry.track), [entries]);
  const bridgeState = m.offlineLibraryBridgeState;
  const status = BRIDGE_STATUS[bridgeState] ?? BRIDGE_STATUS.unavailable;
  const folderText =
    m.offlineLibraryDirectory ||
    (bridgeState === 'checking'
      ? 'Detecting the Spice desktop library…'
      : bridgeState === 'error'
        ? 'The offline library could not be read. Try refreshing.'
        : 'Desktop library is unavailable in this browser.');
  // Retry is offered for a failed scan too; the classic bar only shows it once connected.
  const showFolderActions = bridgeState === 'available' || bridgeState === 'error';

  const refresh = () => {
    setRefreshing(true);
    m.refreshOfflineLibrary()
      .catch(() => false)
      .finally(() => setRefreshing(false));
  };

  const changeFolder = () => {
    void m
      .getSpiceDesktopOfflineLibraryBridge()
      ?.chooseDirectory()
      .then((result) => {
        if (!result.canceled) m.setOfflineLibraryDirectory(result.directory);
        return m.refreshOfflineLibrary();
      })
      .catch(() => false);
  };

  const openFolder = () => {
    void m.getSpiceDesktopOfflineLibraryBridge()?.show();
  };

  const confirmDelete = (entry: DesktopOfflineLibraryEntry) => {
    m.requestSpiceConfirm({
      title: 'Remove Offline Song?',
      message: `This deletes ${entry.fileName} from your chosen offline music folder.`,
      confirmLabel: 'Delete File',
      kind: 'danger',
      onConfirm: () => {
        void m
          .getSpiceDesktopOfflineLibraryBridge()
          ?.remove(entry.fileName)
          .then(
            () => m.refreshOfflineLibrary().catch(() => false),
            () => {
              m.showSpiceNotice(`Could not remove ${entry.fileName}.`, 'warning');
            },
          );
      },
    });
  };

  return (
    <div className={s.downloads}>
      <Card className={s.storageCard}>
        <div className={s.storageIcon}>
          <Icon name="hardDrive" size={18} />
        </div>
        <div className={s.storageText}>
          <div className={s.storageTitleRow}>
            <h2 className={s.storageTitle}>Offline music</h2>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className={s.storageMetrics}>
            <span>{formatCount(entries.length, 'downloaded track')}</span>
            <span aria-hidden="true">·</span>
            <span>{m.formatOfflineLibrarySize(m.offlineLibraryTotalBytes)} stored</span>
          </p>
          <p className={s.storageFolder} title={m.offlineLibraryDirectory || undefined}>
            {m.offlineLibraryDirectory ? <Icon name="folder" size={13} /> : null}
            <span className={s.truncate}>{folderText}</span>
          </p>
        </div>
        {showFolderActions ? (
          <div className={s.storageActions}>
            <Button variant="ghost" size="sm" icon="refresh" loading={refreshing} onClick={refresh}>
              Refresh
            </Button>
            {bridgeState === 'available' ? (
              <>
                <Button variant="ghost" size="sm" onClick={changeFolder}>
                  Change folder
                </Button>
                <Button variant="outline" size="sm" icon="folder" onClick={openFolder}>
                  Open folder
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </Card>

      {entries.length === 0 ? (
        <EmptyState
          icon="download"
          title={bridgeState === 'unavailable' ? 'Offline library unavailable' : 'No offline songs yet'}
          description={
            bridgeState === 'unavailable'
              ? 'Saving songs for offline listening needs the SPICE desktop app.'
              : 'Download a song or playlist, or copy supported audio files into the folder above.'
          }
        />
      ) : (
        <TrackList
          tracks={tracks}
          ariaLabel="Downloaded tracks"
          resetKey="library:downloads"
          showHeader
          getRowOptions={(track, index) => {
            const entry = entries[index];
            const active = isActive(track);
            const play = () => {
              void m.playOfflineLibraryEntry(entry);
            };
            const title = track.title || 'Untitled';
            return {
              active,
              playing: active && m.playerIsPlaying,
              onPlay: play,
              onTogglePlayback: active ? m.toggleReceiverPlayPause : play,
              subtitle: `${artistNames(track)} · ${formatMegabytes(entry.bytes)}`,
              trailing: (
                <>
                  <IconButton
                    icon="folder"
                    label={`Show ${title} in folder`}
                    size="sm"
                    onClick={() => {
                      void m.showOfflineLibraryEntry(entry);
                    }}
                  />
                  <IconButton
                    icon="trash"
                    label={`Delete ${title} offline file`}
                    size="sm"
                    className={s.dangerAction}
                    onClick={() => confirmDelete(entry)}
                  />
                </>
              ),
            };
          }}
        />
      )}
    </div>
  );
}
