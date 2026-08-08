package expo.modules.rnafidentityocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Rect
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.roundToInt

class RnAfIdentityOcrModule : Module() {
  private val latinRecognizer by lazy {
    TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  }

  private val arabicExecutor = Executors.newSingleThreadExecutor()
  private var arabicEngine: ArabicOcrEngine? = null

  private fun arabic(): ArabicOcrEngine {
    val existing = arabicEngine
    if (existing != null) return existing
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    return ArabicOcrEngine(context).also { arabicEngine = it }
  }

  override fun definition() = ModuleDefinition {
    Name("RnAfIdentityOcr")

    OnDestroy {
      arabicEngine?.close()
      arabicEngine = null
      arabicExecutor.shutdownNow()
    }

    AsyncFunction("recognizeAsync") { imageUri: String, options: Map<String, Any?>, promise: Promise ->
      val script = options["script"] as? String ?: "latin"
      val binarize = options["binarize"] as? Boolean ?: false
      val maxDimension = (options["maxDimension"] as? Number)?.toInt() ?: 2000
      val started = System.currentTimeMillis()

      val prepared = try {
        prepareBitmap(imageUri, binarize, maxDimension)
      } catch (e: Exception) {
        promise.reject("ERR_IMAGE_LOAD", e.message ?: "Failed to load image", e)
        return@AsyncFunction
      }

      when (script) {
        "latin" -> recognizeLatin(prepared, started, promise)
        "arabic" -> {
          arabicExecutor.execute {
            try {
              val ocr = arabic().recognize(prepared.bitmap)
              if (!prepared.bitmap.isRecycled) prepared.bitmap.recycle()
              promise.resolve(withMeta(ocr, "ppocr", "arabic", prepared.processedImageUri, started))
            } catch (e: Exception) {
              if (!prepared.bitmap.isRecycled) prepared.bitmap.recycle()
              promise.reject("ERR_OCR", "Arabic text recognition failed: ${e.message}", e)
            }
          }
        }
        else -> {
          if (!prepared.bitmap.isRecycled) prepared.bitmap.recycle()
          promise.reject(
            "ERR_UNSUPPORTED_SCRIPT",
            "Script \"$script\" is not supported. Use \"latin\" or \"arabic\".",
            null
          )
        }
      }
    }
  }

  private data class PreparedImage(
    val bitmap: Bitmap,
    val processedImageUri: String
  )

  private fun prepareBitmap(imageUri: String, binarize: Boolean, maxDimension: Int): PreparedImage {
    var bitmap = loadBitmap(imageUri)
      ?: throw IllegalArgumentException("Could not decode image at uri: $imageUri")
    bitmap = downscaleIfNeeded(bitmap, maxDimension)
    if (binarize) {
      val processed = toBlackAndWhite(bitmap)
      if (processed !== bitmap) {
        bitmap.recycle()
        bitmap = processed
      }
    }
    val uri = saveProcessedBitmap(bitmap)
    return PreparedImage(bitmap, uri)
  }

  private fun recognizeLatin(prepared: PreparedImage, started: Long, promise: Promise) {
    val image = InputImage.fromBitmap(prepared.bitmap, 0)
    val width = image.width
    val height = image.height
    if (width <= 0 || height <= 0) {
      if (!prepared.bitmap.isRecycled) prepared.bitmap.recycle()
      promise.reject("ERR_IMAGE_LOAD", "Image has invalid dimensions: ${width}x${height}", null)
      return
    }

    latinRecognizer
      .process(image)
      .addOnSuccessListener { visionText ->
        if (!prepared.bitmap.isRecycled) prepared.bitmap.recycle()
        val lines = visionText.textBlocks.flatMap { it.lines }.map { line ->
          mapOf(
            "text" to line.text,
            "confidence" to lineConfidence(line),
            "box" to normalizeBox(line.boundingBox, width, height)
          )
        }
        promise.resolve(
          withMeta(
            mapOf("lines" to lines, "width" to width, "height" to height),
            "mlkit",
            "latin",
            prepared.processedImageUri,
            started
          )
        )
      }
      .addOnFailureListener { e ->
        if (!prepared.bitmap.isRecycled) prepared.bitmap.recycle()
        promise.reject("ERR_OCR", "Latin text recognition failed: ${e.message}", e)
      }
  }

  private fun withMeta(
    ocr: Map<String, Any>,
    engine: String,
    scriptUsed: String,
    processedImageUri: String,
    started: Long
  ): Map<String, Any?> {
    return ocr + mapOf(
      "engine" to engine,
      "scriptUsed" to scriptUsed,
      "processedImageUri" to processedImageUri,
      "durationMs" to (System.currentTimeMillis() - started).toDouble()
    )
  }

  private fun lineConfidence(line: Text.Line): Double {
    val elements = line.elements
    if (elements.isEmpty()) return 0.0
    return elements.map { it.confidence.toDouble() }.average()
  }

  private fun normalizeBox(rect: Rect?, width: Int, height: Int): Map<String, Double> {
    if (rect == null) {
      return mapOf("x" to 0.0, "y" to 0.0, "width" to 0.0, "height" to 0.0)
    }
    return mapOf(
      "x" to rect.left.toDouble() / width,
      "y" to rect.top.toDouble() / height,
      "width" to rect.width().toDouble() / width,
      "height" to rect.height().toDouble() / height
    )
  }

  private fun toBlackAndWhite(source: Bitmap, threshold: Int = 128): Bitmap {
    val width = source.width
    val height = source.height
    val pixels = IntArray(width * height)
    source.getPixels(pixels, 0, width, 0, 0, width, height)
    for (i in pixels.indices) {
      val c = pixels[i]
      val gray = (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)).roundToInt()
      val v = if (gray < threshold) 0 else 255
      pixels[i] = Color.rgb(v, v, v)
    }
    val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    out.setPixels(pixels, 0, width, 0, 0, width, height)
    return out
  }

  private fun downscaleIfNeeded(source: Bitmap, maxDimension: Int): Bitmap {
    if (maxDimension <= 0) return source
    val longest = max(source.width, source.height)
    if (longest <= maxDimension) return source
    val scale = maxDimension.toFloat() / longest
    val w = (source.width * scale).roundToInt().coerceAtLeast(1)
    val h = (source.height * scale).roundToInt().coerceAtLeast(1)
    return Bitmap.createScaledBitmap(source, w, h, true)
  }

  private fun saveProcessedBitmap(bitmap: Bitmap): String {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val file = File(context.cacheDir, "rn-af-identity-ocr-${System.currentTimeMillis()}.png")
    FileOutputStream(file).use { out ->
      if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
        throw IllegalStateException("Failed to write processed OCR image")
      }
    }
    return Uri.fromFile(file).toString()
  }

  private fun loadBitmap(imageUri: String): Bitmap? {
    val context = appContext.reactContext ?: return null
    val stream: InputStream? = when {
      imageUri.startsWith("content://") || imageUri.startsWith("file://") -> {
        context.contentResolver.openInputStream(Uri.parse(imageUri))
      }
      imageUri.startsWith("/") -> FileInputStream(File(imageUri))
      else -> {
        context.contentResolver.openInputStream(Uri.parse(imageUri))
          ?: runCatching { FileInputStream(File(imageUri)) }.getOrNull()
      }
    }
    return stream?.use { BitmapFactory.decodeStream(it) }
  }
}
