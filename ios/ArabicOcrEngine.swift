import ExpoModulesCore
import UIKit

/**
 On-device PP-OCRv5 (mobile det + arabic rec) via ONNX Runtime (Objective-C bridge).

 Spike note: Microsoft's install docs ask for `use_frameworks!`. Expo apps
 already use `use_frameworks! :linkage => :static`, which satisfies the pod
 without forcing dynamic frameworks on consuming apps.

 ponytail: axis-aligned boxes from a thresholded probability map — no OpenCV
 polygon unclip. Upgrade path is minAreaRect + unclip if skewed shots suffer.
 */
final class ArabicOcrEngine {
  private let runner: AfOrtRunner
  private let charset: [String]

  private static let detThresh: Float = 0.3
  private static let boxScoreThresh: Float = 0.5
  private static let minBox = 3
  private static let mean: [Float] = [0.485, 0.456, 0.406]
  private static let std: [Float] = [0.229, 0.224, 0.225]

  init() throws {
    guard
      let detPath = Self.resourcePath(name: "PP-OCRv5_mobile_det", ext: "onnx"),
      let recPath = Self.resourcePath(name: "arabic_PP-OCRv5_mobile_rec", ext: "onnx"),
      let dictPath = Self.resourcePath(name: "ppocrv5_arabic_dict", ext: "txt")
    else {
      throw Exception(
        name: "ERR_OCR",
        description: "Bundled PP-OCR models are missing from the RnAfIdentityOcr pod.",
        code: "ERR_OCR"
      )
    }

    let runner: AfOrtRunner
    do {
      runner = try AfOrtRunner(detPath: detPath, recPath: recPath)
    } catch {
      throw Exception(
        name: "ERR_OCR",
        description: error.localizedDescription,
        code: "ERR_OCR"
      )
    }
    self.runner = runner
    let dictText = try String(contentsOfFile: dictPath, encoding: .utf8)
    charset = Self.buildCharset(dictText)
  }

  func recognize(uri: String) throws -> [String: Any] {
    guard let url = Self.fileURL(from: uri) else {
      throw Exception(name: "ERR_IMAGE_LOAD", description: "Invalid image URI: \(uri)", code: "ERR_IMAGE_LOAD")
    }
    guard let image = UIImage(contentsOfFile: url.path) else {
      throw Exception(name: "ERR_IMAGE_LOAD", description: "Failed to load image at \(uri)", code: "ERR_IMAGE_LOAD")
    }
    return try recognize(image: image)
  }

  func recognize(image: UIImage) throws -> [String: Any] {
    let (rgb, width, height) = try Self.rgbaBytes(from: image)
    let boxes = try detect(rgb: rgb, width: width, height: height)
    var lines: [[String: Any]] = []
    for box in boxes {
      guard let crop = Self.crop(rgb: rgb, width: width, height: height, box: box) else { continue }
      let (text, confidence) = try recognizeLine(rgb: crop.bytes, width: crop.width, height: crop.height)
      if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
      lines.append([
        "text": text,
        "confidence": confidence,
        "box": [
          "x": Double(box.minX) / Double(width),
          "y": Double(box.minY) / Double(height),
          "width": Double(box.width) / Double(width),
          "height": Double(box.height) / Double(height),
        ],
      ])
    }
    return ["lines": lines, "width": width, "height": height]
  }

  private struct Box {
    var minX: Int
    var minY: Int
    var maxX: Int
    var maxY: Int
    var width: Int { maxX - minX }
    var height: Int { maxY - minY }
  }

  private func detect(rgb: [UInt8], width: Int, height: Int) throws -> [Box] {
    let maxSide = 960
    let scale = min(1.0, Double(maxSide) / Double(max(width, height)))
    var netW = Int((Double(width) * scale / 32.0).rounded()) * 32
    var netH = Int((Double(height) * scale / 32.0).rounded()) * 32
    netW = max(32, netW)
    netH = max(32, netH)
    let scaleW = Float(netW) / Float(width)
    let scaleH = Float(netH) / Float(height)

    let nchw = Self.makeNchw(rgb: rgb, srcW: width, srcH: height, dstW: netW, dstH: netH)
    let heatmap: Data
    do {
      heatmap = try runner.runDet(withNchw: nchw, height: Int32(netH), width: Int32(netW))
    } catch {
      throw Exception(name: "ERR_OCR", description: error.localizedDescription, code: "ERR_OCR")
    }

    let count = netW * netH
    var floats = [Float](repeating: 0, count: count)
    heatmap.copyBytes(to: UnsafeMutableBufferPointer(start: &floats, count: count))
    // Det output is [1,1,H,W] — skip leading ones if the buffer is larger.
    if heatmap.count / MemoryLayout<Float>.size > count {
      let all = [Float](unsafeUninitializedCapacity: heatmap.count / MemoryLayout<Float>.size) { buf, initCount in
        heatmap.copyBytes(to: buf)
        initCount = heatmap.count / MemoryLayout<Float>.size
      }
      floats = Array(all.suffix(count))
    }

    return Self.boxesFromHeatmap(
      floats: floats,
      netW: netW,
      netH: netH,
      scaleW: scaleW,
      scaleH: scaleH,
      imgW: width,
      imgH: height
    )
  }

  private func recognizeLine(rgb: [UInt8], width: Int, height: Int) throws -> (String, Double) {
    let targetH = 48
    let ratio = Double(width) / Double(max(1, height))
    var targetW = Int((Double(targetH) * ratio).rounded())
    targetW = max(8, min(320, targetW))
    targetW = (targetW + 7) / 8 * 8

    let nchw = Self.makeNchw(rgb: rgb, srcW: width, srcH: height, dstW: targetW, dstH: targetH)
    var timeSteps: Int32 = 0
    var classes: Int32 = 0
    let logitsData: Data
    do {
      logitsData = try runner.runRec(
        withNchw: nchw,
        height: Int32(targetH),
        width: Int32(targetW),
        outTimeSteps: &timeSteps,
        outClasses: &classes
      )
    } catch {
      throw Exception(name: "ERR_OCR", description: error.localizedDescription, code: "ERR_OCR")
    }

    let t = Int(timeSteps)
    let c = Int(classes)
    var floats = [Float](repeating: 0, count: t * c)
    logitsData.copyBytes(to: UnsafeMutableBufferPointer(start: &floats, count: t * c))

    var steps: [[Float]] = []
    steps.reserveCapacity(t)
    for i in 0..<t {
      let base = i * c
      steps.append(Array(floats[base..<(base + c)]))
    }
    return Self.ctcGreedyDecode(steps: steps, charset: charset)
  }

  private static func resourcePath(name: String, ext: String) -> String? {
    let bundles: [Bundle] = [Bundle(for: ArabicOcrEngine.self), Bundle.main]
    for bundle in bundles {
      if let path = bundle.path(forResource: name, ofType: ext) {
        return path
      }
      if let path = bundle.path(forResource: name, ofType: ext, inDirectory: "models") {
        return path
      }
    }
    return nil
  }

  private static func buildCharset(_ dictText: String) -> [String] {
    let chars = dictText.split(whereSeparator: \.isNewline).map(String.init).filter { !$0.isEmpty }
    return [""] + chars + [" "]
  }

  private static func ctcGreedyDecode(steps: [[Float]], charset: [String]) -> (String, Double) {
    let blank = 0
    var prev = blank
    var text = ""
    var probSum = 0.0
    var kept = 0
    for step in steps {
      guard let bestIdx = step.indices.max(by: { step[$0] < step[$1] }) else { continue }
      let best = step[bestIdx]
      var expSum = 0.0
      for v in step { expSum += exp(Double(v - best)) }
      let prob = 1.0 / expSum
      if bestIdx != blank && bestIdx != prev {
        if bestIdx < charset.count { text += charset[bestIdx] }
        probSum += prob
        kept += 1
      }
      prev = bestIdx
    }
    // PP-OCR rec scans LTR; Arabic-script lines need logical RTL order.
    // ponytail: whole-string reverse — upgrade path is Unicode bidi for mixed runs.
    let logical = text.count > 1 ? String(text.reversed()) : text
    return (logical, kept == 0 ? 0 : probSum / Double(kept))
  }

  private static func boxesFromHeatmap(
    floats: [Float],
    netW: Int,
    netH: Int,
    scaleW: Float,
    scaleH: Float,
    imgW: Int,
    imgH: Int
  ) -> [Box] {
    func at(_ x: Int, _ y: Int) -> Float { floats[y * netW + x] }
    var visited = [Bool](repeating: false, count: netW * netH)
    var boxes: [(Box, Float)] = []

    for y in 0..<netH {
      for x in 0..<netW {
        let idx = y * netW + x
        if visited[idx] || at(x, y) <= detThresh { continue }
        var minX = x, maxX = x, minY = y, maxY = y
        var scoreSum: Float = 0
        var count = 0
        var stack = [(x, y)]
        visited[idx] = true
        while let (cx, cy) = stack.popLast() {
          scoreSum += at(cx, cy)
          count += 1
          minX = min(minX, cx); maxX = max(maxX, cx)
          minY = min(minY, cy); maxY = max(maxY, cy)
          for ny in max(0, cy - 1)...min(netH - 1, cy + 1) {
            for nx in max(0, cx - 1)...min(netW - 1, cx + 1) {
              let nidx = ny * netW + nx
              if !visited[nidx] && at(nx, ny) > detThresh {
                visited[nidx] = true
                stack.append((nx, ny))
              }
            }
          }
        }
        let score = scoreSum / Float(count)
        if score < boxScoreThresh { continue }
        let bw = maxX - minX + 1
        let bh = maxY - minY + 1
        if bw < minBox || bh < minBox { continue }
        let padX = max(1, Int((Float(bw) * 0.1).rounded()))
        let padY = max(1, Int((Float(bh) * 0.15).rounded()))
        let left = max(0, min(imgW - 1, Int((Float(minX - padX) / scaleW).rounded())))
        let top = max(0, min(imgH - 1, Int((Float(minY - padY) / scaleH).rounded())))
        let right = max(left + 1, min(imgW, Int((Float(maxX + padX + 1) / scaleW).rounded())))
        let bottom = max(top + 1, min(imgH, Int((Float(maxY + padY + 1) / scaleH).rounded())))
        boxes.append((Box(minX: left, minY: top, maxX: right, maxY: bottom), score))
      }
    }

    return boxes.sorted { a, b in
      if a.0.minY != b.0.minY { return a.0.minY < b.0.minY }
      return a.0.minX < b.0.minX
    }.map(\.0)
  }

  private static func makeNchw(rgb: [UInt8], srcW: Int, srcH: Int, dstW: Int, dstH: Int) -> Data {
    var floats = [Float](repeating: 0, count: 3 * dstW * dstH)
    for y in 0..<dstH {
      let sy = min(srcH - 1, Int((Double(y) + 0.5) * Double(srcH) / Double(dstH)))
      for x in 0..<dstW {
        let sx = min(srcW - 1, Int((Double(x) + 0.5) * Double(srcW) / Double(dstW)))
        let si = (sy * srcW + sx) * 4
        for c in 0..<3 {
          let channel = Float(rgb[si + c]) / 255.0
          floats[c * dstW * dstH + y * dstW + x] = (channel - mean[c]) / std[c]
        }
      }
    }
    return floats.withUnsafeBufferPointer { Data(buffer: $0) }
  }

  private static func crop(rgb: [UInt8], width: Int, height: Int, box: Box) -> (bytes: [UInt8], width: Int, height: Int)? {
    let w = max(1, box.width)
    let h = max(1, box.height)
    if box.minX < 0 || box.minY < 0 || box.maxX > width || box.maxY > height { return nil }
    var out = [UInt8](repeating: 0, count: w * h * 4)
    for y in 0..<h {
      for x in 0..<w {
        let si = ((box.minY + y) * width + (box.minX + x)) * 4
        let di = (y * w + x) * 4
        out[di] = rgb[si]
        out[di + 1] = rgb[si + 1]
        out[di + 2] = rgb[si + 2]
        out[di + 3] = 255
      }
    }
    return (out, w, h)
  }

  private static func rgbaBytes(from image: UIImage) throws -> ([UInt8], Int, Int) {
    let width = Int(image.size.width.rounded())
    let height = Int(image.size.height.rounded())
    guard width > 0, height > 0 else {
      throw Exception(name: "ERR_IMAGE_LOAD", description: "Image has invalid dimensions.", code: "ERR_IMAGE_LOAD")
    }
    UIGraphicsBeginImageContextWithOptions(CGSize(width: width, height: height), true, 1.0)
    defer { UIGraphicsEndImageContext() }
    image.draw(in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let upright = UIGraphicsGetImageFromCurrentImageContext()?.cgImage else {
      throw Exception(name: "ERR_IMAGE_LOAD", description: "Failed to normalize image orientation.", code: "ERR_IMAGE_LOAD")
    }

    var bytes = [UInt8](repeating: 0, count: width * height * 4)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(
      data: &bytes,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: width * 4,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
      throw Exception(name: "ERR_IMAGE_LOAD", description: "Failed to create image buffer.", code: "ERR_IMAGE_LOAD")
    }
    ctx.draw(upright, in: CGRect(x: 0, y: 0, width: width, height: height))
    return (bytes, width, height)
  }

  private static func fileURL(from uri: String) -> URL? {
    if uri.hasPrefix("file://") { return URL(string: uri) }
    if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
    return URL(string: uri) ?? URL(fileURLWithPath: uri)
  }
}
