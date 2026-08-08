package expo.modules.rnafidentityocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Rect
import android.net.Uri
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.nio.FloatBuffer
import java.util.Collections
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * On-device PP-OCRv5 (mobile det + arabic rec) via ONNX Runtime.
 *
 * ponytail: axis-aligned boxes from a thresholded probability map — no
 * OpenCV polygon unclip. Fine for upright card photos; upgrade path is
 * RapidOCR-style minAreaRect + unclip if skewed shots drop accuracy.
 */
internal class ArabicOcrEngine(context: Context) {
  private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
  private val detSession: OrtSession
  private val recSession: OrtSession
  private val charset: List<String>

  init {
    val assets = context.assets
    detSession = env.createSession(assets.open(DET_ASSET).readBytes())
    recSession = env.createSession(assets.open(REC_ASSET).readBytes())
    charset = buildCharset(assets.open(DICT_ASSET).bufferedReader().readText())
  }

  fun recognize(context: Context, uri: String): Map<String, Any> {
    val bitmap = loadBitmap(context, uri)
      ?: throw IllegalArgumentException("Failed to load image at $uri")
    return recognize(bitmap)
  }

  fun recognize(bitmap: Bitmap): Map<String, Any> {
    val width = bitmap.width
    val height = bitmap.height
    if (width <= 0 || height <= 0) {
      throw IllegalArgumentException("Image has invalid dimensions: ${width}x${height}")
    }

    val boxes = detect(bitmap)
    val lines = boxes.mapNotNull { box ->
      val crop = crop(bitmap, box) ?: return@mapNotNull null
      val (text, confidence) = recognizeLine(crop)
      if (text.isBlank()) return@mapNotNull null
      mapOf(
        "text" to text,
        "confidence" to confidence,
        "box" to mapOf(
          "x" to box.left.toDouble() / width,
          "y" to box.top.toDouble() / height,
          "width" to box.width().toDouble() / width,
          "height" to box.height().toDouble() / height
        )
      )
    }

    return mapOf(
      "lines" to lines,
      "width" to width,
      "height" to height
    )
  }

  fun close() {
    detSession.close()
    recSession.close()
  }

  private fun detect(bitmap: Bitmap): List<Rect> {
    val (tensor, scaleW, scaleH, netW, netH) = preprocessDet(bitmap)
    tensor.use { input ->
      detSession.run(Collections.singletonMap("x", input)).use { results ->
        @Suppress("UNCHECKED_CAST")
        val batch = results[0].value as Array<Array<Array<FloatArray>>>
        val map = batch[0][0] // [H][W]
        return boxesFromHeatmap(map, netW, netH, scaleW, scaleH, bitmap.width, bitmap.height)
      }
    }
  }

  private fun recognizeLine(crop: Bitmap): Pair<String, Double> {
    val tensor = preprocessRec(crop)
    tensor.use { input ->
      recSession.run(Collections.singletonMap("x", input)).use { results ->
        @Suppress("UNCHECKED_CAST")
        val logits = results[0].value as Array<Array<FloatArray>> // [1,T,C]
        return ctcGreedyDecode(logits[0])
      }
    }
  }

  private fun ctcGreedyDecode(steps: Array<FloatArray>): Pair<String, Double> {
    val blank = 0
    var prev = blank
    val sb = StringBuilder()
    var probSum = 0.0
    var kept = 0

    for (step in steps) {
      var bestIdx = 0
      var best = Float.NEGATIVE_INFINITY
      for (i in step.indices) {
        if (step[i] > best) {
          best = step[i]
          bestIdx = i
        }
      }
      var expSum = 0.0
      for (v in step) expSum += exp((v - best).toDouble())
      val prob = 1.0 / expSum

      if (bestIdx != blank && bestIdx != prev) {
        if (bestIdx in charset.indices) sb.append(charset[bestIdx])
        probSum += prob
        kept += 1
      }
      prev = bestIdx
    }
    val confidence = if (kept == 0) 0.0 else probSum / kept
    // PP-OCR rec scans LTR; Arabic-script lines need logical RTL order.
    // ponytail: whole-string reverse — upgrade path is Unicode bidi for mixed runs.
    val text = sb.toString().reversed()
    return text to confidence
  }

  private fun boxesFromHeatmap(
    map: Array<FloatArray>,
    netW: Int,
    netH: Int,
    scaleW: Float,
    scaleH: Float,
    imgW: Int,
    imgH: Int
  ): List<Rect> {
    val binary = Array(netH) { y -> BooleanArray(netW) { x -> map[y][x] > DET_THRESH } }
    val visited = Array(netH) { BooleanArray(netW) }
    val boxes = mutableListOf<Pair<Rect, Float>>()

    for (y in 0 until netH) {
      for (x in 0 until netW) {
        if (!binary[y][x] || visited[y][x]) continue
        var minX = x
        var maxX = x
        var minY = y
        var maxY = y
        var scoreSum = 0f
        var count = 0
        val stack = ArrayDeque<Pair<Int, Int>>()
        stack.add(x to y)
        visited[y][x] = true
        while (stack.isNotEmpty()) {
          val (cx, cy) = stack.removeLast()
          scoreSum += map[cy][cx]
          count += 1
          minX = min(minX, cx)
          maxX = max(maxX, cx)
          minY = min(minY, cy)
          maxY = max(maxY, cy)
          for (ny in max(0, cy - 1)..min(netH - 1, cy + 1)) {
            for (nx in max(0, cx - 1)..min(netW - 1, cx + 1)) {
              if (!visited[ny][nx] && binary[ny][nx]) {
                visited[ny][nx] = true
                stack.add(nx to ny)
              }
            }
          }
        }
        val score = scoreSum / count
        if (score < BOX_SCORE_THRESH) continue
        val bw = maxX - minX + 1
        val bh = maxY - minY + 1
        if (bw < MIN_BOX || bh < MIN_BOX) continue

        // Expand slightly (stand-in for unclip).
        val padX = (bw * 0.1f).roundToInt().coerceAtLeast(1)
        val padY = (bh * 0.15f).roundToInt().coerceAtLeast(1)
        val left = ((minX - padX) / scaleW).roundToInt().coerceIn(0, imgW - 1)
        val top = ((minY - padY) / scaleH).roundToInt().coerceIn(0, imgH - 1)
        val right = ((maxX + padX + 1) / scaleW).roundToInt().coerceIn(left + 1, imgW)
        val bottom = ((maxY + padY + 1) / scaleH).roundToInt().coerceIn(top + 1, imgH)
        boxes.add(Rect(left, top, right, bottom) to score)
      }
    }

    return boxes
      .sortedWith(compareBy({ it.first.top }, { it.first.left }))
      .map { it.first }
  }

  private data class DetInput(
    val tensor: OnnxTensor,
    val scaleW: Float,
    val scaleH: Float,
    val netW: Int,
    val netH: Int
  )

  private fun preprocessDet(bitmap: Bitmap): DetInput {
    val maxSide = 960
    val scale = min(1f, maxSide.toFloat() / max(bitmap.width, bitmap.height))
    var netW = (bitmap.width * scale / 32).roundToInt() * 32
    var netH = (bitmap.height * scale / 32).roundToInt() * 32
    netW = netW.coerceAtLeast(32)
    netH = netH.coerceAtLeast(32)
    val scaled = Bitmap.createScaledBitmap(bitmap, netW, netH, true)
    val scaleW = netW.toFloat() / bitmap.width
    val scaleH = netH.toFloat() / bitmap.height
    val buf = FloatBuffer.allocate(3 * netW * netH)
    val pixels = IntArray(netW * netH)
    scaled.getPixels(pixels, 0, netW, 0, 0, netW, netH)
    // NCHW RGB ImageNet normalize
    for (c in 0..2) {
      val mean = MEAN[c]
      val std = STD[c]
      for (i in pixels.indices) {
        val p = pixels[i]
        val channel = when (c) {
          0 -> ((p shr 16) and 0xff) / 255f
          1 -> ((p shr 8) and 0xff) / 255f
          else -> (p and 0xff) / 255f
        }
        buf.put((channel - mean) / std)
      }
    }
    buf.rewind()
    val tensor = OnnxTensor.createTensor(env, buf, longArrayOf(1, 3, netH.toLong(), netW.toLong()))
    return DetInput(tensor, scaleW, scaleH, netW, netH)
  }

  private fun preprocessRec(bitmap: Bitmap): OnnxTensor {
    val targetH = 48
    val ratio = bitmap.width.toFloat() / bitmap.height.toFloat()
    var targetW = (targetH * ratio).roundToInt().coerceIn(8, 320)
    // Width multiple of 8 helps some exported graphs.
    targetW = (targetW + 7) / 8 * 8
    val scaled = Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
    val canvasBmp = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
    Canvas(canvasBmp).drawBitmap(scaled, 0f, 0f, null)
    val buf = FloatBuffer.allocate(3 * targetW * targetH)
    val pixels = IntArray(targetW * targetH)
    canvasBmp.getPixels(pixels, 0, targetW, 0, 0, targetW, targetH)
    for (c in 0..2) {
      val mean = MEAN[c]
      val std = STD[c]
      for (i in pixels.indices) {
        val p = pixels[i]
        val channel = when (c) {
          0 -> ((p shr 16) and 0xff) / 255f
          1 -> ((p shr 8) and 0xff) / 255f
          else -> (p and 0xff) / 255f
        }
        buf.put((channel - mean) / std)
      }
    }
    buf.rewind()
    return OnnxTensor.createTensor(env, buf, longArrayOf(1, 3, targetH.toLong(), targetW.toLong()))
  }

  private fun crop(bitmap: Bitmap, box: Rect): Bitmap? {
    val w = box.width().coerceAtLeast(1)
    val h = box.height().coerceAtLeast(1)
    if (box.left < 0 || box.top < 0 || box.right > bitmap.width || box.bottom > bitmap.height) {
      return null
    }
    return Bitmap.createBitmap(bitmap, box.left, box.top, w, h)
  }

  private fun loadBitmap(context: Context, uri: String): Bitmap? {
    return try {
      val parsed = Uri.parse(uri)
      context.contentResolver.openInputStream(parsed)?.use { BitmapFactory.decodeStream(it) }
        ?: BitmapFactory.decodeFile(parsed.path)
    } catch (_: Exception) {
      null
    }
  }

  companion object {
    private const val DET_ASSET = "models/PP-OCRv5_mobile_det.onnx"
    private const val REC_ASSET = "models/arabic_PP-OCRv5_mobile_rec.onnx"
    private const val DICT_ASSET = "models/ppocrv5_arabic_dict.txt"
    private const val DET_THRESH = 0.3f
    private const val BOX_SCORE_THRESH = 0.5f
    private const val MIN_BOX = 3
    private val MEAN = floatArrayOf(0.485f, 0.456f, 0.406f)
    private val STD = floatArrayOf(0.229f, 0.224f, 0.225f)

    fun buildCharset(dictText: String): List<String> {
      val chars = dictText.lines().filter { it.isNotEmpty() }
      return listOf("") + chars + listOf(" ")
    }
  }
}
