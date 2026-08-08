const {
  createRunOncePlugin,
  withProjectBuildGradle,
  withSettingsGradle,
} = require('@expo/config-plugins');

const JITPACK = "maven { url 'https://jitpack.io' }";

function ensureJitpack(contents) {
  if (contents.includes('jitpack.io')) {
    return contents;
  }
  if (contents.includes('mavenCentral()')) {
    return contents.replace('mavenCentral()', `mavenCentral()\n        ${JITPACK}`);
  }
  if (/repositories\s*\{/.test(contents)) {
    return contents.replace(/repositories\s*\{/, `repositories {\n        ${JITPACK}`);
  }
  return contents;
}

/**
 * Ensures JitPack is available so Tesseract4Android can resolve.
 */
function withRnAfIdentityOcr(config) {
  config = withSettingsGradle(config, (cfg) => {
    cfg.modResults.contents = ensureJitpack(cfg.modResults.contents);
    return cfg;
  });

  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language === 'groovy') {
      cfg.modResults.contents = ensureJitpack(cfg.modResults.contents);
    }
    return cfg;
  });

  return config;
}

module.exports = createRunOncePlugin(withRnAfIdentityOcr, 'rn-af-identity-ocr', '0.1.0');
