import CoreImage
import CoreImage.CIFilterBuiltins
import ExpoModulesCore
import UIKit
import libtesseract
import kta_tesseract_swift

public class RnAfIdentityOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RnAfIdentityOcr")

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
    let binarize = (options["binarize"] as? Bool) ?? true
    let maxDimension = (options["maxDimension"] as? Int) ?? 2000

    var image = try loadImage(from: imageUri)
    image = downscaleIfNeeded(image, maxDimension: maxDimension)
    if binarize {
      image = toBlackAndWhite(image)
    }

    let tessdataDir = try ensureTessdata(languages: languages)
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

  /// Grayscale + fixed threshold → black text on white.
  private func toBlackAndWhite(_ image: UIImage, threshold: CGFloat = 0.5) -> UIImage {
    guard let cgImage = image.cgImage else { return image }
    let ciImage = CIImage(cgImage: cgImage)
    let context = CIContext(options: nil)

    let mono = ciImage.applyingFilter("CIPhotoEffectMono")
    let controls = CIFilter.colorControls()
    controls.inputImage = mono
    controls.contrast = 1.4
    controls.brightness = 0.05
    guard let contrasted = controls.outputImage else { return image }

    // Manual threshold via CIColorMatrix-style path: use CIColorClamp after boosting contrast,
    // or pixel buffer. Pixel path is predictable for OCR.
    guard let cg = context.createCGImage(contrasted, from: contrasted.extent) else { return image }
    return thresholdBitmap(UIImage(cgImage: cg, scale: image.scale, orientation: image.imageOrientation), threshold: threshold)
  }

  private func thresholdBitmap(_ image: UIImage, threshold: CGFloat) -> UIImage {
    guard let cgImage = image.cgImage else { return image }
    let width = cgImage.width
    let height = cgImage.height
    let bytesPerPixel = 4
    let bytesPerRow = width * bytesPerPixel
    var pixels = [UInt8](repeating: 0, count: height * bytesPerRow)

    guard let ctx = CGContext(
      data: &pixels,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: bytesPerRow,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return image }

    ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    let cut = UInt8((threshold * 255).rounded())

    for y in 0..<height {
      for x in 0..<width {
        let i = y * bytesPerRow + x * bytesPerPixel
        let gray = UInt8((0.299 * Double(pixels[i]) + 0.587 * Double(pixels[i + 1]) + 0.114 * Double(pixels[i + 2])).rounded())
        let v: UInt8 = gray < cut ? 0 : 255
        pixels[i] = v
        pixels[i + 1] = v
        pixels[i + 2] = v
        pixels[i + 3] = 255
      }
    }

    guard let outCg = ctx.makeImage() else { return image }
    return UIImage(cgImage: outCg, scale: image.scale, orientation: image.imageOrientation)
  }

  private func downscaleIfNeeded(_ image: UIImage, maxDimension: Int) -> UIImage {
    guard maxDimension > 0 else { return image }
    let size = image.size
    let longest = max(size.width, size.height)
    guard longest > CGFloat(maxDimension) else { return image }
    let scale = CGFloat(maxDimension) / longest
    let newSize = CGSize(width: size.width * scale, height: size.height * scale)
    UIGraphicsBeginImageContextWithOptions(newSize, true, 1.0)
    image.draw(in: CGRect(origin: .zero, size: newSize))
    let scaled = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()
    return scaled ?? image
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
      Bundle(url: Bundle(for: RnAfIdentityOcrModule.self).bundleURL.appendingPathComponent("RnAfIdentityOcrTessdata.bundle")),
      Bundle(identifier: "org.cocoapods.RnAfIdentityOcrTessdata"),
      Bundle(for: RnAfIdentityOcrModule.self),
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

private struct DirectoryLanguageModelDataSource: LanguageModelDataSource {
  let path: String
  var pathToTrainedData: String { path }
}
