import { NativeModule, requireNativeModule } from 'expo';

import type { NativeOcrResult, OcrRecognizeOptions } from './RnOcrPro.types';

type NativeRecognizeOptions = {
  languages: string[];
  psm: number;
  oem: number;
  minConfidence: number;
};

declare class RnOcrProModule extends NativeModule {
  recognizeAsync(imageUri: string, options: NativeRecognizeOptions): Promise<NativeOcrResult>;
}

export default requireNativeModule<RnOcrProModule>('RnOcrPro');

export type { OcrRecognizeOptions };
