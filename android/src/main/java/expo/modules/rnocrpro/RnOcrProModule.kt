package expo.modules.rnocrpro

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RnOcrProModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RnOcrPro")

    Constant("PI") {
      Math.PI
    }

    Function("hello") {
      "Hello world! 👋"
    }

    AsyncFunction("setValueAsync") { value: String ->
    }
  }
}
