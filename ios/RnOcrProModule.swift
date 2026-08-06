import ExpoModulesCore

public class RnOcrProModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RnOcrPro")

    Constant("PI") {
      Double.pi
    }

    Function("hello") {
      return "Hello world! 👋"
    }

    AsyncFunction("setValueAsync") { (value: String) in
    }
  }
}
