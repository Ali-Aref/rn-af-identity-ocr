import CoreImage
import CoreImage.CIFilterBuiltins
import ExpoModulesCore
import UIKit
import Vision

public class RnAfIdentityOcrModule: Module {
  private var arabicEngine: ArabicOcrEngine?

  public func definition() -> ModuleDefinition {
    Name("RnAfIdentityOcr")

    AsyncFunction("recognizeAsync") { (imageUri: String, options: [String: Any]) -> [String: Any] in
      let started = Date()
      let script = (options["script"] as? String) ?? "latin"
      let binarize = (options["binarize"] as? Bool) ?? false
      let maxDimension = (options["maxDimension"] as? Int) ?? 2000

      let ocr: [String: Any]
      let engine: String
      let processedImageUri: String

      switch script {
      case "latin":
        // Match af-identity-scanner: full-res file + EXIF orientation into Vision.
        // Only apply our preprocess when caller opts into B&W.
        if binarize {
          var image = try self.loadImage(from: imageUri)
          image = self.downscaleIfNeeded(image, maxDimension: maxDimension)
          image = self.toBlackAndWhite(image)
          processedImageUri = try self.saveProcessedImage(image)
          ocr = try Self.recognizeLatin(image: image)
        } else {
          ocr = try Self.recognizeLatin(uri: imageUri)
          processedImageUri = imageUri
        }
        engine = "vision"
      case "arabic", "persian":
        // Paddle ships Persian/Pashto in arabic_PP-OCRv5_mobile_rec (no separate persian ONNX).
        var image = try self.loadImage(from: imageUri)
        image = self.downscaleIfNeeded(image, maxDimension: maxDimension)
        if binarize {
          image = self.toBlackAndWhite(image)
        }
        processedImageUri = try self.saveProcessedImage(image)
        if self.arabicEngine == nil {
          self.arabicEngine = try ArabicOcrEngine()
        }
        ocr = try self.arabicEngine!.recognize(image: image)
        engine = "ppocr"
      default:
        throw OcrException("Script \"\(script)\" is not supported. Use \"latin\", \"persian\", or \"arabic\".")
      }

      var result = ocr
      result["engine"] = engine
      result["scriptUsed"] = script
      result["processedImageUri"] = processedImageUri
      result["durationMs"] = Date().timeIntervalSince(started) * 1000
      return result
    }
  }

  /// Same path as af-identity-scanner Latin OCR.
  private static func recognizeLatin(uri: String) throws -> [String: Any] {
    guard let url = fileURL(from: uri) else {
      throw OcrException("Invalid image URI: \(uri)")
    }
    guard let image = UIImage(contentsOfFile: url.path), let cgImage = image.cgImage else {
      throw OcrException("Failed to load image at \(uri)")
    }
    return try recognizeLatin(cgImage: cgImage, orientation: CGImagePropertyOrientation(image.imageOrientation))
  }

  private static func recognizeLatin(image: UIImage) throws -> [String: Any] {
    guard let cgImage = image.cgImage else {
      throw OcrException("Failed to get CGImage for Latin OCR")
    }
    return try recognizeLatin(
      cgImage: cgImage,
      orientation: CGImagePropertyOrientation(image.imageOrientation)
    )
  }

  private static func recognizeLatin(
    cgImage: CGImage,
    orientation: CGImagePropertyOrientation
  ) throws -> [String: Any] {
    let (width, height) = orientedSize(
      width: cgImage.width,
      height: cgImage.height,
      orientation: orientation
    )

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    // Language correction invents vowels/spaces and corrupts MRZ / document numbers.
    request.usesLanguageCorrection = false

    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
    try handler.perform([request])

    let observations = request.results ?? []
    let lines: [[String: Any]] = observations.compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else {
        return nil
      }
      let box = observation.boundingBox
      return [
        "text": candidate.string,
        "confidence": Double(candidate.confidence),
        "box": [
          "x": Double(box.origin.x),
          "y": Double(1.0 - box.origin.y - box.height),
          "width": Double(box.width),
          "height": Double(box.height),
        ],
      ]
    }

    return [
      "lines": lines,
      "width": width,
      "height": height,
    ]
  }

  private static func fileURL(from uri: String) -> URL? {
    if uri.hasPrefix("file://") {
      return URL(string: uri)
    }
    if uri.hasPrefix("/") {
      return URL(fileURLWithPath: uri)
    }
    return URL(string: uri) ?? URL(fileURLWithPath: uri)
  }

  private static func orientedSize(
    width: Int,
    height: Int,
    orientation: CGImagePropertyOrientation
  ) -> (Int, Int) {
    switch orientation {
    case .left, .leftMirrored, .right, .rightMirrored:
      return (height, width)
    default:
      return (width, height)
    }
  }

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

    guard let cg = context.createCGImage(contrasted, from: contrasted.extent) else { return image }
    return thresholdBitmap(
      UIImage(cgImage: cg, scale: image.scale, orientation: image.imageOrientation),
      threshold: threshold
    )
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
        let gray = UInt8(
          (0.299 * Double(pixels[i]) + 0.587 * Double(pixels[i + 1]) + 0.114 * Double(pixels[i + 2]))
            .rounded()
        )
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

  private func saveProcessedImage(_ image: UIImage) throws -> String {
    guard let data = image.pngData() else {
      throw OcrException("Failed to encode processed OCR image")
    }
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("rn-af-identity-ocr-\(Int(Date().timeIntervalSince1970 * 1000)).png")
    try data.write(to: url, options: .atomic)
    return url.absoluteString
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
}

private final class OcrException: Exception {
  private let message: String
  init(_ message: String) {
    self.message = message
    super.init()
  }
  override var reason: String { message }
}

private extension CGImagePropertyOrientation {
  init(_ uiOrientation: UIImage.Orientation) {
    switch uiOrientation {
    case .up: self = .up
    case .upMirrored: self = .upMirrored
    case .down: self = .down
    case .downMirrored: self = .downMirrored
    case .left: self = .left
    case .leftMirrored: self = .leftMirrored
    case .right: self = .right
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}
