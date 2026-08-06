import { registerWebModule, NativeModule } from 'expo';

// RnOcrProModule is not available on the web platform.
class RnOcrProModule extends NativeModule<{}> {}

export default registerWebModule(RnOcrProModule, 'RnOcrProModule');
