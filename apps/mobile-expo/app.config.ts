import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

// Android follows the unified root SPICE release version, exactly like the
// Kotlin client: versionCode = major * 1_000_000 + minor * 1_000 + patch.
const rootPackage = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version?: string };
const version = rootPackage.version ?? '0.0.0';
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!match) throw new Error(`The root SPICE version must be a stable semantic version, got "${version}"`);
const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];
if (minor > 999 || patch > 999) throw new Error('SPICE minor and patch versions must stay below 1000 for versionCode ordering');
const versionCode = major * 1_000_000 + minor * 1_000 + patch;

// The preview installs next to the current Kotlin app until it replaces it.
const applicationId = process.env.SPICE_ANDROID_APPLICATION_ID ?? 'xyz.spiceapp.mobile.next';
const appName = process.env.SPICE_ANDROID_APP_NAME ?? 'Spice Next';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appName,
  slug: 'spice-mobile',
  scheme: 'spice',
  version,
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#000000',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'xyz.spiceapp.mobile',
  },
  android: {
    package: applicationId,
    versionCode,
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: '#0c0911',
    },
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: 'resize',
    // The engine module declares what playback needs; downloads stay in app storage.
    permissions: [],
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.VIBRATE',
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        category: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'https', host: 'music.spice-app.xyz' }],
      },
    ],
  },
  plugins: [
    [
      'expo-font',
      {
        fonts: [
          './node_modules/@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf',
          './node_modules/@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf',
          './node_modules/@expo-google-fonts/geist/600SemiBold/Geist_600SemiBold.ttf',
          './node_modules/@expo-google-fonts/geist/700Bold/Geist_700Bold.ttf',
        ],
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 24,
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          // NewPipe Extractor is published through JitPack.
          extraMavenRepos: ['https://jitpack.io'],
        },
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 96,
        resizeMode: 'contain',
        backgroundColor: '#000000',
      },
    ],
    'expo-secure-store',
    './plugins/with-spice-android',
  ],
  extra: {
    spiceCloudBaseUrl: process.env.SPICE_CLOUD_BASE_URL ?? 'https://music.spice-app.xyz',
  },
});
