// In-app update rules, ported from the Kotlin AppUpdateClient: only a newer,
// stable GitHub release with the exact signed Android asset is offered.

export const LATEST_RELEASE_URL = 'https://api.github.com/repos/Spice-Production/SPICE/releases/latest';
export const RELEASES_URL = 'https://github.com/Spice-Production/SPICE/releases';
const RELEASE_DOWNLOAD_PATHS = [
  '/Spice-Production/SPICE/releases/download/',
  '/Anti-Depressants-Dev-Team/SPICE/releases/download/',
];
const MAX_ANDROID_UPDATE_BYTES = 500 * 1024 * 1024;
const STABLE_VERSION = /^[vV]?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export type AppUpdateInfo = {
  version: string;
  releaseName: string;
  releaseNotes: string;
  assetName: string;
  downloadUrl: string;
  sizeBytes: number;
  releasePageUrl: string;
};

export function parseStableVersion(value: string): [number, number, number] | null {
  const match = STABLE_VERSION.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersions(left: [number, number, number], right: [number, number, number]): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isExpectedAssetUrl(urlValue: string, tagName: string, assetName: string): boolean {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname.toLowerCase() === 'github.com' &&
    RELEASE_DOWNLOAD_PATHS.some((path) => url.pathname === `${path}${tagName}/${assetName}`) &&
    url.search === '' &&
    url.hash === ''
  );
}

/** The update a GitHub `releases/latest` payload offers this install, if any. */
export function selectAndroidUpdate(release: unknown, currentVersion: string): AppUpdateInfo | null {
  const payload = release && typeof release === 'object' ? (release as Record<string, unknown>) : {};
  if (payload.draft === true || payload.prerelease === true) return null;
  const tagName = text(payload.tag_name);
  const releaseVersion = parseStableVersion(tagName);
  const installed = parseStableVersion(currentVersion);
  if (!releaseVersion || !installed || compareVersions(releaseVersion, installed) <= 0) return null;

  const expectedName = `Spice-Android-${tagName}-release-signed.apk`;
  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  const matches = assets.filter((asset) => text((asset as Record<string, unknown> | null)?.name) === expectedName);
  if (matches.length !== 1) return null;
  const asset = matches[0] as Record<string, unknown>;
  const sizeBytes = typeof asset.size === 'number' ? asset.size : -1;
  if (sizeBytes < 1 || sizeBytes > MAX_ANDROID_UPDATE_BYTES) return null;
  const contentType = text(asset.content_type).split(';')[0]!.trim().toLowerCase();
  if (!['application/vnd.android.package-archive', 'application/octet-stream'].includes(contentType)) return null;
  const downloadUrl = text(asset.browser_download_url);
  if (!isExpectedAssetUrl(downloadUrl, tagName, expectedName)) return null;

  return {
    version: tagName.replace(/^[vV]/, ''),
    releaseName: text(payload.name) || tagName,
    releaseNotes: text(payload.body),
    assetName: expectedName,
    downloadUrl,
    sizeBytes,
    releasePageUrl: `${RELEASES_URL}/tag/${tagName}`,
  };
}
