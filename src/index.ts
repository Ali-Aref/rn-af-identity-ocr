import type {
  AfDocumentType,
  FaceValidationOptions,
  FaceValidationResult,
  NativeOcrResult,
  NativeRecognizedLine,
  OcrBlock,
  OcrLine,
  OcrResult,
  OcrScript,
  DocumentMrz,
  ScanOptions,
  ScanResult,
} from './RnAfIdentityOcr.types';
import getRnAfIdentityOcrModule from './RnAfIdentityOcrModule';
import { locateMrz } from './mrz/locate';
import { parseMrz } from './mrz/parse';
import { normalizePersoArabicText } from './normalizePersoArabic';

export * from './RnAfIdentityOcr.types';
export { normalizePersoArabicText };
export { locateMrz, normalizeMrzText } from './mrz/locate';
export { parseMrz } from './mrz/parse';

const DOC_SCRIPT: Record<AfDocumentType, OcrScript> = {
  e_tazkira_front: 'persian',
  paper_tazkira: 'persian',
  e_tazkira_back: 'latin',
  passport: 'latin',
};

function mapText(text: string, script: OcrScript): string {
  // Keep Latin / MRZ output untouched (matches af-identity-scanner recognize).
  if (script === 'latin') return text;
  return normalizePersoArabicText(text, { normalizeDigits: true });
}

function toPixelLine(
  line: NativeRecognizedLine,
  width: number,
  height: number,
  script: OcrScript
): OcrLine {
  const left = line.box.x * width;
  const top = line.box.y * height;
  const right = (line.box.x + line.box.width) * width;
  const bottom = (line.box.y + line.box.height) * height;
  return {
    text: mapText(line.text, script),
    confidence: line.confidence * (line.confidence <= 1 ? 100 : 1),
    bbox: { left, top, right, bottom },
  };
}

function nativeToOcrResult(raw: NativeOcrResult): OcrResult {
  const lines = raw.lines.map((line) => toPixelLine(line, raw.width, raw.height, raw.scriptUsed));
  const meanConfidence =
    lines.length === 0 ? 0 : lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length;

  const block: OcrBlock | null =
    lines.length === 0
      ? null
      : {
          text: lines.map((l) => l.text).join('\n'),
          confidence: meanConfidence,
          bbox: {
            left: Math.min(...lines.map((l) => l.bbox.left)),
            top: Math.min(...lines.map((l) => l.bbox.top)),
            right: Math.max(...lines.map((l) => l.bbox.right)),
            bottom: Math.max(...lines.map((l) => l.bbox.bottom)),
          },
          lines,
        };

  return {
    fullText: lines.map((l) => l.text).join('\n'),
    blocks: block ? [block] : [],
    meanConfidence,
    engine: raw.engine,
    scriptUsed: raw.scriptUsed,
    durationMs: raw.durationMs,
    processedImageUri: raw.processedImageUri ?? null,
  };
}

function extractMrz(raw: NativeOcrResult): DocumentMrz | null {
  // Same entry as af-identity-scanner: locateMrz(recognition) → parseMrz(candidate).
  // Passport = TD3 (2×44); e-Tazkira back = TD1 (3×30).
  const candidate = locateMrz({ lines: raw.lines });
  if (!candidate) return null;
  return parseMrz(candidate);
}

const MRZ_DOCUMENTS = new Set<AfDocumentType>(['passport', 'e_tazkira_back']);

/** Internal: optional BW preprocess + scripted OCR + Perso-Arabic normalize. */
async function recognizeForDocument(
  imageUri: string,
  documentType: AfDocumentType,
  options: ScanOptions = {}
): Promise<ScanResult> {
  if (!imageUri || typeof imageUri !== 'string') {
    throw new Error('rn-af-identity-ocr: imageUri must be a non-empty string');
  }

  const manipulateColors = options.manipulateColors === true;
  const script = DOC_SCRIPT[documentType];
  const raw = await getRnAfIdentityOcrModule().recognizeAsync(imageUri, {
    script,
    binarize: manipulateColors,
    maxDimension: 2000,
  });

  const base: ScanResult = { ...nativeToOcrResult(raw), documentType };
  if (MRZ_DOCUMENTS.has(documentType)) {
    base.mrz = extractMrz(raw);
  }
  return base;
}

export function scanETazkiraFront(imageUri: string, options?: ScanOptions): Promise<ScanResult> {
  return recognizeForDocument(imageUri, 'e_tazkira_front', options);
}

export function scanETazkiraBack(imageUri: string, options?: ScanOptions): Promise<ScanResult> {
  return recognizeForDocument(imageUri, 'e_tazkira_back', options);
}

export function scanPaperTazkira(imageUri: string, options?: ScanOptions): Promise<ScanResult> {
  return recognizeForDocument(imageUri, 'paper_tazkira', options);
}

export function scanPassport(imageUri: string, options?: ScanOptions): Promise<ScanResult> {
  return recognizeForDocument(imageUri, 'passport', options);
}

export async function validateLivePhotoFace(
  imageUri: string,
  options?: FaceValidationOptions
): Promise<FaceValidationResult> {
  if (!imageUri || typeof imageUri !== 'string') {
    throw new Error('rn-af-identity-ocr: imageUri must be a non-empty string');
  }

  return getRnAfIdentityOcrModule().detectFaceAsync(imageUri, options ?? {});
}

const RnAfIdentityOcr = {
  scanETazkiraFront,
  scanETazkiraBack,
  scanPaperTazkira,
  scanPassport,
  validateLivePhotoFace,
  normalizePersoArabicText,
};

export default RnAfIdentityOcr;
