import ExpoModulesCore
import UIKit
import libtesseract
import kta_tesseract_swift

public class RnOcrProModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RnOcrPro")

    AsyncFunction("recognizeAsync") { (imageUri: String, options: [String: Any]) -> [String: Any] in
      try self.recognize(imageUri: imageUri, options: options)
    }
  }

  private func recognize(imageUri: String, options: [String: Any]) throws -> [String: Any] {
    let started = Date()

    let languages = (options["languages"] as? [String])?.filter { !$0.isEmpty }
      ?? ["fas", "pus", "eng"]
    let psm = (options["psm"] as? Int) ?? 3
    let oem = (options["oem"] as? Int) ?? 1
    let minConfidence = Float((options["minConfidence"] as? Double) ?? 0)

    let image = try loadImage(from: imageUri)
    let tessdataDir = try ensureTessdata(languages: languages)

    // SwiftyTesseract / kta-tesseract-swift: pathToTrainedData is the tessdata directory itself.
    let dataSource = DirectoryLanguageModelDataSource(path: tessdataDir.path)
    let recognitionLanguages: [RecognitionLanguage] = languages.map { .custom($0) }
    let engineMode: EngineMode
    switch oem {
    case 0: engineMode = .tesseractOnly
    case 2: engineMode = .tesseractLstmCombined
    default: engineMode = .lstmOnly
    }

    let tesseract = Tesseract(
      languages: recognitionLanguages,
      dataSource: dataSource,
      engineMode: engineMode
    ) {
      { api in
        TessBaseAPISetPageSegMode(api, TessPageSegMode(UInt32(psm)))
      }
    }

    let result = tesseract.recognizedBlocks(from: image, for: RIL_TEXTLINE)
    switch result {
    case .failure(let error):
      throw OcrException(error.localizedDescription)
    case .success(let (fullText, lineBlocks)):
      let filtered = lineBlocks.filter {
        $0.confidence >= minConfidence &&
          !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      }
      let lines: [[String: Any]] = filtered.map { block in
        [
          "text": block.text.trimmingCharacters(in: .whitespacesAndNewlines),
          "confidence": Double(block.confidence),
          "bbox": [
            "left": Double(block.boundingBox.left),
            "top": Double(block.boundingBox.top),
            "right": Double(block.boundingBox.right),
            "bottom": Double(block.boundingBox.bottom),
          ] as [String: Double],
        ]
      }

      let blockText = lines.map { $0["text"] as? String ?? "" }.joined(separator: "\n")
      let meanConfidence: Double
      if filtered.isEmpty {
        meanConfidence = 0
      } else {
        meanConfidence = Double(filtered.map(\.confidence).reduce(0, +)) / Double(filtered.count)
      }

      let left = filtered.map { Double($0.boundingBox.left) }.min() ?? 0
      let top = filtered.map { Double($0.boundingBox.top) }.min() ?? 0
      let right = filtered.map { Double($0.boundingBox.right) }.max() ?? 0
      let bottom = filtered.map { Double($0.boundingBox.bottom) }.max() ?? 0

      let blocks: [[String: Any]] = lines.isEmpty ? [] : [[
        "text": blockText,
        "confidence": meanConfidence,
        "bbox": [
          "left": left,
          "top": top,
          "right": right,
          "bottom": bottom,
        ] as [String: Double],
        "lines": lines,
      ]]

      let durationMs = Date().timeIntervalSince(started) * 1000
      return [
        "fullText": fullText.trimmingCharacters(in: .whitespacesAndNewlines),
        "blocks": blocks,
        "meanConfidence": meanConfidence,
        "engine": "tesseract",
        "languagesUsed": languages,
        "durationMs": durationMs,
      ]
    }
  }

  private func loadImage(from imageUri: String) throws -> UIImage {
    if let url = URL(string: imageUri), url.isFileURL,
       let data = try? Data(contentsOf: url),
       let image = UIImage(data: data) {
      return image
    }
    if imageUri.hasPrefix("/"), let image = UIImage(contentsOfFile: imageUri) {
      return image
    }
    if imageUri.hasPrefix("file://"),
       let url = URL(string: imageUri),
       let data = try? Data(contentsOf: url),
       let image = UIImage(data: data) {
      return image
    }
    throw OcrException("Could not load image at uri: \(imageUri)")
  }

  private func ensureTessdata(languages: [String]) throws -> URL {
    let fm = FileManager.default
    let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
      .appendingPathComponent("tesseract", isDirectory: true)
    let tessdataDir = base.appendingPathComponent("tessdata", isDirectory: true)

    if !fm.fileExists(atPath: tessdataDir.path) {
      try fm.createDirectory(at: tessdataDir, withIntermediateDirectories: true)
    }

    copyBundledTessdata(into: tessdataDir)

    // Consumer-added extras in main bundle tessdata/
    if let mainTess = Bundle.main.resourceURL?.appendingPathComponent("tessdata"),
       let files = try? fm.contentsOfDirectory(at: mainTess, includingPropertiesForKeys: nil) {
      for url in files where url.pathExtension == "traineddata" {
        let dest = tessdataDir.appendingPathComponent(url.lastPathComponent)
        if !fm.fileExists(atPath: dest.path) {
          try? fm.copyItem(at: url, to: dest)
        }
      }
    }

    let missing = languages.filter {
      !fm.fileExists(atPath: tessdataDir.appendingPathComponent("\($0).traineddata").path)
    }
    if !missing.isEmpty {
      throw OcrException(
        "Missing Tesseract language data for: \(missing.joined(separator: ", ")). " +
          "Add \(missing.map { "\($0).traineddata" }.joined(separator: ", ")) under tessdata."
      )
    }

    return tessdataDir
  }

  private func copyBundledTessdata(into tessdataDir: URL) {
    let fm = FileManager.default
    let candidates: [Bundle] = [
      Bundle(url: Bundle(for: RnOcrProModule.self).bundleURL.appendingPathComponent("RnOcrProTessdata.bundle")),
      Bundle(identifier: "org.cocoapods.RnOcrProTessdata"),
      Bundle(for: RnOcrProModule.self),
      Bundle.main,
    ].compactMap { $0 }

    for bundle in candidates {
      let urls =
        bundle.urls(forResourcesWithExtension: "traineddata", subdirectory: nil)
        ?? bundle.urls(forResourcesWithExtension: "traineddata", subdirectory: "tessdata")
        ?? []
      for url in urls {
        let dest = tessdataDir.appendingPathComponent(url.lastPathComponent)
        if !fm.fileExists(atPath: dest.path) {
          try? fm.copyItem(at: url, to: dest)
        }
      }
    }
  }
}

private final class OcrException: Exception {
  private let message: String
  init(_ message: String) {
    self.message = message
    super.init()
  }
  override var reason: String { message }
}

/// Points Tesseract at an absolute tessdata directory (SwiftyTesseract convention).
private struct DirectoryLanguageModelDataSource: LanguageModelDataSource {
  let path: String
  var pathToTrainedData: String { path }
}
