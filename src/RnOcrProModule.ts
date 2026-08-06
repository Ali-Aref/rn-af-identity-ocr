import { NativeModule, requireNativeModule } from 'expo';

declare class RnOcrProModule extends NativeModule<{}> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<RnOcrProModule>('RnOcrPro');
