import { requireNativeModule } from 'expo';

import type {
  FaceValidationOptions,
  NativeFaceValidationResult,
  NativeOcrResult,
  NativeRecognizeOptions,
} from './RnAfIdentityOcr.types';

type RnAfIdentityOcrNativeModule = {
  recognizeAsync(imageUri: string, options: NativeRecognizeOptions): Promise<NativeOcrResult>;
  detectFaceAsync(
    imageUri: string,
    options?: FaceValidationOptions
  ): Promise<NativeFaceValidationResult>;
};

let nativeModule: RnAfIdentityOcrNativeModule | null = null;

export default function getRnAfIdentityOcrModule(): RnAfIdentityOcrNativeModule {
  if (!nativeModule) {
    nativeModule = requireNativeModule<RnAfIdentityOcrNativeModule>('RnAfIdentityOcr');
  }
  return nativeModule;
}
