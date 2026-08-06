import { NativeModule, registerWebModule } from 'expo';

import type { NativeOcrResult } from './RnOcrPro.types';

type NativeRecognizeOptions = {
  languages: string[];
  psm: number;
  oem: number;
  minConfidence: number;
};

class RnOcrProModule extends NativeModule {
  async recognizeAsync(
    _imageUri: string,
    _options: NativeRecognizeOptions
  ): Promise<NativeOcrResult> {
    throw new Error('rn-ocr-pro: on-device OCR is not available on web. Use iOS or Android.');
  }
}

export default registerWebModule(RnOcrProModule, 'RnOcrProModule');
