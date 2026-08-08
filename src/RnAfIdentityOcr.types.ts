/** Tesseract language codes. Primary: fas (Persian), pus (Pashto), eng (English). */
export type OcrLanguageCode = string;

export type AfDocumentType = 'e_tazkira_front' | 'e_tazkira_back' | 'paper_tazkira' | 'passport';

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

/** Internal native recognize options (not the public scan API). */
export type NativeRecognizeOptions = {
  languages: string[];
  psm: number;
  oem: number;
  minConfidence: number;
  binarize: boolean;
  maxDimension: number;
};

export type OcrResult = {
  fullText: string;
  blocks: OcrBlock[];
  meanConfidence: number;
  engine: 'tesseract';
  languagesUsed: OcrLanguageCode[];
  durationMs: number;
};

export type ScanResult = OcrResult & {
  documentType: AfDocumentType;
};

/** Options shared by all document scanners. */
export type ScanOptions = {
  /** Native grayscale+threshold before OCR. Default `true`. */
  manipulateColors?: boolean;
};

export type NativeOcrResult = OcrResult;
