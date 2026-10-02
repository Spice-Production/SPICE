import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

import { LATEST_RELEASE_URL, selectAndroidUpdate, type AppUpdateInfo } from '../core/update';

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const APK_MIME_TYPE = 'application/vnd.android.package-archive';

/** In-app updates install an APK, so they only apply to Android. */
export const appUpdatesSupported = Platform.OS === 'android';

export const installedVersion = Constants.expoConfig?.version ?? '0.0.0';

export async function findLatestUpdate(): Promise<AppUpdateInfo | null> {
  const response = await fetch(LATEST_RELEASE_URL, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status} while checking for an update.`);
  return selectAndroidUpdate(await response.json(), installedVersion);
}

function updatesDirectory(): Directory {
  const directory = new Directory(Paths.cache, 'updates');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/** Downloads the release APK into the cache, replacing any earlier download. */
export async function downloadUpdate(update: AppUpdateInfo, onPercent: (percent: number) => void): Promise<File> {
  const directory = updatesDirectory();
  for (const entry of directory.list()) {
    if (entry instanceof File) entry.delete();
  }
  const destination = new File(directory, update.assetName);
  const task = File.createDownloadTask(update.downloadUrl, destination, {
    onProgress: ({ bytesWritten }) => onPercent(Math.min(100, Math.floor((bytesWritten / update.sizeBytes) * 100))),
  });
  const file = await task.downloadAsync();
  if (!file) throw new Error('The update download was cancelled.');
  if ((file.size ?? 0) !== update.sizeBytes) {
    file.delete();
    throw new Error('The downloaded update did not match the published size. Try again.');
  }
  return file;
}

/**
 * Hands the APK to Android's installer. Android itself refuses a package that
 * is not signed with this app's key or is not a newer version.
 */
export async function installUpdate(file: File): Promise<void> {
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: file.contentUri,
    type: APK_MIME_TYPE,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}
