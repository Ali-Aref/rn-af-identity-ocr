/** Tesseract language codes. Primary: fas (Persian), pus (Pashto), eng (English). */
export type OcrLanguageCode = string;

export type OcrBoundingBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type OcrLine = {
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
};

export type OcrBlock = {
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
  lines: OcrLine[];
};

export type OcrRecognizeOptions = {
  /**
   * Tesseract language codes, joined with `+` for multi-language.
   * Defaults to `['fas', 'pus', 'eng']`.
   */
  languages?: OcrLanguageCode[];
  /**
   * Tesseract page segmentation mode (0–13). Default: 3 (auto).
   * @see https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html#page-segmentation-method
   */
  psm?: number;
  /**
   * Tesseract OCR engine mode. Default: 1 (LSTM only).
   * Use 1 with tessdata_fast / tessdata_best models.
   */
  oem?: number;
  /** Drop blocks/lines below this confidence (0–100). Default: 0. */
  minConfidence?: number;
  /**
   * Normalize Perso-Arabic characters (ی/ي, ک/ك, digits, whitespace).
   * Default: true.
   */
  normalizePersoArabic?: boolean;
};

export type OcrResult = {
  fullText: string;
  blocks: OcrBlock[];
  meanConfidence: number;
  engine: 'tesseract';
  languagesUsed: OcrLanguageCode[];
  durationMs: number;
};

/** Raw result returned from native before optional JS normalization. */
export type NativeOcrResult = OcrResult;
