import { requireNativeModule } from 'expo';

import type { NativeOcrResult } from './RnOcrPro.types';

type NativeRecognizeOptions = {
  languages: string[];
  psm: number;
  oem: number;
  minConfidence: number;
};

type RnOcrProNativeModule = {
  recognizeAsync(imageUri: string, options: NativeRecognizeOptions): Promise<NativeOcrResult>;
};

// Lazy: avoid evaluating the native binding at import time during Metro/HMR setup.
let nativeModule: RnOcrProNativeModule | null = null;

export default function getRnOcrProModule(): RnOcrProNativeModule {
  if (!nativeModule) {
    nativeModule = requireNativeModule<RnOcrProNativeModule>('RnOcrPro');
  }
  return nativeModule;
}
