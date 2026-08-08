import { requireNativeModule } from 'expo';

import type { NativeOcrResult, NativeRecognizeOptions } from './RnAfIdentityOcr.types';

type RnAfIdentityOcrNativeModule = {
  recognizeAsync(imageUri: string, options: NativeRecognizeOptions): Promise<NativeOcrResult>;
};

let nativeModule: RnAfIdentityOcrNativeModule | null = null;

export default function getRnAfIdentityOcrModule(): RnAfIdentityOcrNativeModule {
  if (!nativeModule) {
    nativeModule = requireNativeModule<RnAfIdentityOcrNativeModule>('RnAfIdentityOcr');
  }
  return nativeModule;
}
