import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import * as Crypto from 'expo-crypto';

import type { DownloadedTrack, ResolvedStream, Track } from '../core/models';
import { engine } from '../engine/engine';

export type DownloadProgress = { bytesWritten: number; totalBytes: number };

export type DownloadResult = { filePath: string; fileName: string; bytes: number; mimeType: string };

export type ActiveDownload = { cancel(): void; done: Promise<DownloadResult> };

const FLAG_GRANT_READ_URI_PERMISSION = 1;

function extensionFor(stream: ResolvedStream): { extension: string; mimeType: string } {
  const descriptor = `${stream.container} ${stream.contentType} ${stream.url}`.toLowerCase();
  if (descriptor.includes('mpeg') || descriptor.includes('mp3')) return { extension: 'mp3', mimeType: 'audio/mpeg' };
  if (descriptor.includes('m4a') || descriptor.includes('mp4') || descriptor.includes('aac')) {
    return { extension: 'm4a', mimeType: 'audio/mp4' };
  }
  if (descriptor.includes('webm')) return { extension: 'webm', mimeType: 'audio/webm' };
  if (descriptor.includes('opus')) return { extension: 'opus', mimeType: 'audio/opus' };
  if (descriptor.includes('ogg')) return { extension: 'ogg', mimeType: 'audio/ogg' };
  return { extension: 'audio', mimeType: 'audio/*' };
}

export function isSegmentedStream(stream: ResolvedStream): boolean {
  const descriptor = `${stream.protocol} ${stream.container} ${stream.contentType} ${stream.url}`.toLowerCase();
  return descriptor.includes('hls') || descriptor.includes('m3u8') || descriptor.includes('mpegurl');
}

function safeFileStem(track: Track): string {
  const stem = `${track.artist} - ${track.title}`
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return stem || 'Spice track';
}

function downloadsDirectory(): Directory {
  const directory = new Directory(Paths.document, 'Spice');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/** Saves a resolved direct audio stream into the app's private Spice folder. */
export function startTrackDownload(
  track: Track,
  stream: ResolvedStream,
  onProgress: (progress: DownloadProgress) => void,
): ActiveDownload {
  const { extension, mimeType } = extensionFor(stream);
  const directory = downloadsDirectory();
  const stem = safeFileStem(track);
  let fileName = `${stem}.${extension}`;
  for (let copy = 2; new File(directory, fileName).exists; copy += 1) fileName = `${stem} (${copy}).${extension}`;
  const destination = new File(directory, fileName);
  const task = File.createDownloadTask(stream.url, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => onProgress({ bytesWritten, totalBytes }),
  });
  const done = task.downloadAsync().then((file) => {
    if (!file) throw new Error('Download was cancelled.');
    return { filePath: file.uri, fileName, bytes: file.size ?? 0, mimeType };
  });
  return { cancel: () => task.cancel(), done };
}

/** Converts any resolved stream, segmented or not, into a tagged MP3 (Android). */
export function startMp3Download(
  track: Track,
  stream: ResolvedStream,
  onPercent: (percent: number | null) => void,
): ActiveDownload {
  const processId = `spice-download-${Crypto.randomUUID()}`;
  const done = engine
    .downloadAudio(`${track.artist} - ${track.title}`, stream.url, processId, downloadsDirectory().uri, onPercent)
    .then((result) => {
      if (result.exitCode !== 0 || !result.filePath) {
        throw new Error(result.errorOutput.trim().split('\n').pop() || 'The MP3 conversion did not finish.');
      }
      const filePath = result.filePath.startsWith('file://') ? result.filePath : `file://${result.filePath}`;
      return { filePath, fileName: result.fileName, bytes: result.bytes, mimeType: 'audio/mpeg' };
    });
  return { cancel: () => engine.cancelDownload(processId), done };
}

function isContentUri(path: string): boolean {
  return path.startsWith('content://');
}

export function downloadFileExists(download: DownloadedTrack): boolean {
  // Downloads the Kotlin app published to the shared Music folder.
  if (isContentUri(download.filePath)) return true;
  try {
    return new File(download.filePath).exists;
  } catch {
    return false;
  }
}

export function deleteDownloadFile(download: DownloadedTrack): void {
  try {
    const file = new File(download.filePath);
    if (file.exists) file.delete();
  } catch {
    // The record is removed even when the file is already gone.
  }
}

export async function openDownload(download: DownloadedTrack): Promise<void> {
  if (isContentUri(download.filePath)) {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: download.filePath,
      type: download.mimeType,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
    return;
  }
  const file = new File(download.filePath);
  if (!file.exists) throw new Error('That downloaded file is missing.');
  if (Platform.OS === 'android') {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: file.contentUri,
      type: download.mimeType,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
    return;
  }
  await Sharing.shareAsync(file.uri, { mimeType: download.mimeType });
}

export async function shareDownload(download: DownloadedTrack): Promise<void> {
  const file = new File(download.filePath);
  if (!file.exists) throw new Error('That downloaded file is missing.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('No app can share this download.');
  await Sharing.shareAsync(file.uri, { mimeType: download.mimeType, dialogTitle: 'Share audio' });
}
