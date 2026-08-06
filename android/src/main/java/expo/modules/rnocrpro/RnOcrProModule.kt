package expo.modules.rnocrpro

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.net.Uri
import com.googlecode.tesseract.android.TessBaseAPI
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream

class RnOcrProModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RnOcrPro")

    AsyncFunction("recognizeAsync") { imageUri: String, options: Map<String, Any?> ->
      recognize(imageUri, options)
    }
  }

  private fun recognize(imageUri: String, options: Map<String, Any?>): Map<String, Any?> {
    val started = System.currentTimeMillis()

    @Suppress("UNCHECKED_CAST")
    val languages = (options["languages"] as? List<*>)?.mapNotNull { it as? String }
      ?.takeIf { it.isNotEmpty() }
      ?: listOf("fas", "pus", "eng")
    val psm = (options["psm"] as? Number)?.toInt() ?: TessBaseAPI.PageSegMode.PSM_AUTO
    val oem = (options["oem"] as? Number)?.toInt() ?: TessBaseAPI.OEM_LSTM_ONLY
    val minConfidence = (options["minConfidence"] as? Number)?.toFloat() ?: 0f

    val dataPath = ensureTessdata(languages)
    val bitmap = loadBitmap(imageUri)
      ?: throw IllegalArgumentException("Could not decode image at uri: $imageUri")

    val api = TessBaseAPI()
    try {
      val langString = languages.joinToString("+")
      if (!api.init(dataPath, langString, oem)) {
        throw IllegalStateException(
          "Failed to init Tesseract for languages=$langString. Ensure traineddata files exist."
        )
      }
      api.setPageSegMode(psm)
      api.setImage(bitmap)

      val fullText = api.getUTF8Text()?.trim().orEmpty()
      val meanConfidence = api.meanConfidence().toDouble()
      val blocks = extractBlocks(api, minConfidence)

      return mapOf(
        "fullText" to fullText,
        "blocks" to blocks,
        "meanConfidence" to meanConfidence,
        "engine" to "tesseract",
        "languagesUsed" to languages,
        "durationMs" to (System.currentTimeMillis() - started).toDouble()
      )
    } finally {
      api.recycle()
      if (!bitmap.isRecycled) {
        bitmap.recycle()
      }
    }
  }

  private fun extractBlocks(api: TessBaseAPI, minConfidence: Float): List<Map<String, Any?>> {
    val iterator = api.resultIterator ?: return emptyList()
    try {
      val lines = mutableListOf<Map<String, Any?>>()
      iterator.begin()
      do {
        val text = iterator.getUTF8Text(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE)
          ?.trim()
          .orEmpty()
        if (text.isEmpty()) continue
        val confidence = iterator.confidence(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE)
        if (confidence < minConfidence) continue
        val rect = iterator.getBoundingRect(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE)
          ?: Rect()
        lines.add(
          mapOf(
            "text" to text,
            "confidence" to confidence.toDouble(),
            "bbox" to mapOf(
              "left" to rect.left.toDouble(),
              "top" to rect.top.toDouble(),
              "right" to rect.right.toDouble(),
              "bottom" to rect.bottom.toDouble()
            )
          )
        )
      } while (iterator.next(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE))

      if (lines.isEmpty()) return emptyList()

      val blockText = lines.joinToString("\n") { it["text"] as String }
      val avgConf = lines.map { it["confidence"] as Double }.average()
      val left = lines.minOf { (it["bbox"] as Map<*, *>)["left"] as Double }
      val top = lines.minOf { (it["bbox"] as Map<*, *>)["top"] as Double }
      val right = lines.maxOf { (it["bbox"] as Map<*, *>)["right"] as Double }
      val bottom = lines.maxOf { (it["bbox"] as Map<*, *>)["bottom"] as Double }

      return listOf(
        mapOf(
          "text" to blockText,
          "confidence" to avgConf,
          "bbox" to mapOf(
            "left" to left,
            "top" to top,
            "right" to right,
            "bottom" to bottom
          ),
          "lines" to lines
        )
      )
    } finally {
      iterator.delete()
    }
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

  private fun ensureTessdata(languages: List<String>): String {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val base = File(context.filesDir, "tesseract")
    val tessdataDir = File(base, "tessdata")
    if (!tessdataDir.exists()) {
      tessdataDir.mkdirs()
    }

    val assetManager = context.assets
    val assetLangs = runCatching { assetManager.list("tessdata")?.toList().orEmpty() }
      .getOrDefault(emptyList())

    for (name in assetLangs) {
      if (!name.endsWith(".traineddata")) continue
      val outFile = File(tessdataDir, name)
      if (outFile.exists() && outFile.length() > 0L) continue
      assetManager.open("tessdata/$name").use { input ->
        FileOutputStream(outFile).use { output -> input.copyTo(output) }
      }
    }

    val missing = languages.filter { lang ->
      !File(tessdataDir, "$lang.traineddata").exists()
    }
    if (missing.isNotEmpty()) {
      throw IllegalStateException(
        "Missing Tesseract language data for: ${missing.joinToString(", ")}. " +
          "Add ${missing.joinToString(", ") { "$it.traineddata" }} under tessdata/ " +
          "(bundled assets or ${tessdataDir.absolutePath})."
      )
    }

    return base.absolutePath
  }
}
