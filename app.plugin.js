/**
 * No-op config plugin kept so `plugins: ["rn-af-identity-ocr"]` remains valid.
 * ML Kit / ONNX resolve from Maven Central and CocoaPods — no JitPack needed.
 */
const { createRunOncePlugin } = require('@expo/config-plugins');

function withRnAfIdentityOcr(config) {
  return config;
}

module.exports = createRunOncePlugin(withRnAfIdentityOcr, 'rn-af-identity-ocr', '0.1.0');
