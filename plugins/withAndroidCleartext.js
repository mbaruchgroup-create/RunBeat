const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withAndroidCleartext(config) {
  return withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    application.$['android:usesCleartextTraffic'] = 'true';
    return config;
  });
};
