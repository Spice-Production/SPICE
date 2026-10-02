// Native Android settings the Expo config cannot express directly.
const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

// Cleartext stays off except for loopback, which the optional SPICE local
// runtime fallback (adb reverse tcp:3939) and Metro in debug builds use.
const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
    </domain-config>
</network-security-config>
`;

function withNetworkSecurityConfig(config) {
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const directory = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'network_security_config.xml'), NETWORK_SECURITY_CONFIG);
      return modConfig;
    },
  ]);
  return withAndroidManifest(config, (modConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return modConfig;
  });
}

// Release builds sign with the SPICE upload key when CI provides it (the same
// variables the Kotlin app used), so the app installs over the existing one.
// Without them the template's debug key is kept for local test builds.
const SIGNING_CONFIG = `
        spiceRelease {
            def spiceStore = System.getenv("SPICE_ANDROID_SIGNING_STORE_FILE")
            if (spiceStore) {
                storeFile file(spiceStore)
                storePassword System.getenv("SPICE_ANDROID_SIGNING_STORE_PASSWORD")
                keyAlias System.getenv("SPICE_ANDROID_SIGNING_KEY_ALIAS")
                keyPassword System.getenv("SPICE_ANDROID_SIGNING_KEY_PASSWORD")
            }
        }`;

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    let gradle = modConfig.modResults.contents;
    if (gradle.includes('spiceRelease')) return modConfig;
    const signingBlock = /signingConfigs \{/;
    const releaseSigning = /(release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!signingBlock.test(gradle) || !releaseSigning.test(gradle)) {
      throw new Error('with-spice-android: the app build.gradle signing blocks were not found.');
    }
    gradle = gradle.replace(signingBlock, (match) => `${match}${SIGNING_CONFIG}`);
    gradle = gradle.replace(
      releaseSigning,
      '$1signingConfig System.getenv("SPICE_ANDROID_SIGNING_STORE_FILE") ? signingConfigs.spiceRelease : signingConfigs.debug',
    );
    modConfig.modResults.contents = gradle;
    return modConfig;
  });
}

module.exports = function withSpiceAndroid(config) {
  return withReleaseSigning(withNetworkSecurityConfig(config));
};
