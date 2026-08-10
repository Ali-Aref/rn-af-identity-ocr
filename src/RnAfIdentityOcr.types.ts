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
  /**
   * Present on passport (TD3) / e-Tazkira back (TD1) when an MRZ could be located.
   * Narrow with `mrz.format === 'TD1' | 'TD3'`.
   */
  mrz?: DocumentMrz | null;
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

/** Identity fields present on both TD1 (e-Tazkira back) and TD3 (passport). */
export type MrzIdentityFields = {
  documentNumber?: MrzField;
  surname?: MrzField;
  givenNames?: MrzField;
  nationality?: MrzField;
  dateOfBirth?: MrzField;
  sex?: MrzField;
  dateOfExpiry?: MrzField;
};

type MrzResultBase = {
  valid: boolean;
  /** 0..1 */
  confidence: number;
  warnings: MrzWarning[];
};

/**
 * e-Tazkira back — ICAO TD1 (3×30).
 * `personalNumber` is TD1 optional1: trailing digits of the 13-digit ID.
 */
export type Td1Mrz = MrzResultBase & {
  format: 'TD1';
  lines: [string, string, string];
  fields: MrzIdentityFields & {
    personalNumber?: MrzField;
  };
};

/**
 * Passport — ICAO TD3 (2×44).
 * `personalNumber` is the TD3 personal-number zone; often absent on AF passports.
 */
export type Td3Mrz = MrzResultBase & {
  format: 'TD3';
  lines: [string, string];
  fields: MrzIdentityFields & {
    personalNumber?: MrzField;
  };
};

/** Parsed MRZ for either supported document; discriminate on `format`. */
export type DocumentMrz = Td1Mrz | Td3Mrz;

/** @deprecated Prefer `DocumentMrz` (covers TD1 e-Tazkira back and TD3 passport). */
export type PassportMrz = DocumentMrz;

/** Options shared by all document scanners. */
export type ScanOptions = {
  /** Native grayscale+threshold before OCR. Default `false`. */
  manipulateColors?: boolean;
};
