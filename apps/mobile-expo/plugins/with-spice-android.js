// Native Android settings the Expo config cannot express directly.
const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

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

module.exports = function withSpiceAndroid(config) {
  return withNetworkSecurityConfig(config);
};
