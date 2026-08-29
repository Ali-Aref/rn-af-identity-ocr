import { NativeModule, registerWebModule } from 'expo';

import type {
  FaceValidationOptions,
  NativeFaceValidationResult,
  NativeOcrResult,
  NativeRecognizeOptions,
} from './RnAfIdentityOcr.types';

class RnAfIdentityOcrModule extends NativeModule {
  async recognizeAsync(
    _imageUri: string,
    _options: NativeRecognizeOptions
  ): Promise<NativeOcrResult> {
    throw new Error(
      'rn-af-identity-ocr: on-device OCR is not available on web. Use iOS or Android.'
    );
  }

  async detectFaceAsync(
    _imageUri: string,
    _options?: FaceValidationOptions
  ): Promise<NativeFaceValidationResult> {
    throw new Error(
      'rn-af-identity-ocr: on-device face detection is not available on web. Use iOS or Android.'
    );
  }
}

const Native = registerWebModule(RnAfIdentityOcrModule, 'RnAfIdentityOcrModule');

export default function getRnAfIdentityOcrModule() {
  return Native;
}
