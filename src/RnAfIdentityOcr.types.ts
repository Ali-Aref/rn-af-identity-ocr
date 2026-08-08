/** Writing system the native recognizer should use. */
export type OcrScript = 'latin' | 'arabic' | 'persian';

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
  script: OcrScript;
  binarize: boolean;
  maxDimension: number;
};

/** Normalized 0..1 box from native engines (top-left origin). */
export type NativeNormalizedBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NativeRecognizedLine = {
  text: string;
  confidence: number;
  box: NativeNormalizedBox;
};

export type NativeOcrResult = {
  lines: NativeRecognizedLine[];
  width: number;
  height: number;
  engine: 'mlkit' | 'vision' | 'ppocr';
  scriptUsed: OcrScript;
  durationMs: number;
  processedImageUri: string | null;
};

export type OcrResult = {
  fullText: string;
  blocks: OcrBlock[];
  meanConfidence: number;
  engine: 'mlkit' | 'vision' | 'ppocr';
  scriptUsed: OcrScript;
  durationMs: number;
  /** Local `file://` URI of the image actually sent to OCR (after downscale + optional B&W). */
  processedImageUri: string | null;
};

export type ScanResult = OcrResult & {
  documentType: AfDocumentType;
  /** Present on passport scans when an MRZ could be located (null if not found). */
  mrz?: PassportMrz | null;
};

export type MrzFieldKey =
  | 'documentNumber'
  | 'surname'
  | 'givenNames'
  | 'nationality'
  | 'dateOfBirth'
  | 'sex'
  | 'dateOfExpiry'
  | 'personalNumber';

export type MrzField = {
  rawValue: string;
  normalizedValue: string;
  /** 0..1 */
  confidence: number;
};

export type MrzWarning = {
  code: 'mrz_checksum_failed';
  message: string;
  field?: MrzFieldKey;
};

export type PassportMrz = {
  format: 'TD1' | 'TD3';
  valid: boolean;
  /** 0..1 */
  confidence: number;
  lines: string[];
  fields: Partial<Record<MrzFieldKey, MrzField>>;
  warnings: MrzWarning[];
};

/** Options shared by all document scanners. */
export type ScanOptions = {
  /** Native grayscale+threshold before OCR. Default `false`. */
  manipulateColors?: boolean;
};
