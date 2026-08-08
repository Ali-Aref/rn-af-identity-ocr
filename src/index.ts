import type {
  AfDocumentType,
  OcrBlock,
  OcrLine,
  OcrResult,
  ScanOptions,
  ScanResult,
} from './RnAfIdentityOcr.types';
import getRnAfIdentityOcrModule from './RnAfIdentityOcrModule';
import { DEFAULT_OCR_LANGUAGES } from './constants';
import { normalizePersoArabicText } from './normalizePersoArabic';

export * from './RnAfIdentityOcr.types';
export { DEFAULT_OCR_LANGUAGES } from './constants';
export { normalizePersoArabicText };

const DOC_LANGUAGES: Record<AfDocumentType, readonly string[]> = {
  e_tazkira_front: DEFAULT_OCR_LANGUAGES,
  e_tazkira_back: DEFAULT_OCR_LANGUAGES,
  paper_tazkira: DEFAULT_OCR_LANGUAGES,
  passport: ['eng', 'fas', 'pus'],
};

function mapText(text: string, normalize: boolean, normalizeDigits: boolean): string {
  return normalize ? normalizePersoArabicText(text, { normalizeDigits }) : text;
}

function mapBlock(block: OcrBlock, normalize: boolean, normalizeDigits: boolean): OcrBlock {
  return {
    ...block,
    text: mapText(block.text, normalize, normalizeDigits),
    lines: block.lines.map((line: OcrLine): OcrLine => ({
      ...line,
      text: mapText(line.text, normalize, normalizeDigits),
    })),
  };
}

/** Internal: native OCR + Perso-Arabic normalize. */
async function recognizeForDocument(
  imageUri: string,
  documentType: AfDocumentType,
  options: ScanOptions = {}
): Promise<ScanResult> {
  if (!imageUri || typeof imageUri !== 'string') {
    throw new Error('rn-af-identity-ocr: imageUri must be a non-empty string');
  }

  const manipulateColors = options.manipulateColors !== false;
  const languages = [...DOC_LANGUAGES[documentType]];
  const raw = await getRnAfIdentityOcrModule().recognizeAsync(imageUri, {
    languages,
    psm: 3,
    oem: 1,
    minConfidence: 0,
    binarize: manipulateColors,
    maxDimension: 2000,
  });

  const normalized: OcrResult = {
    ...raw,
    fullText: mapText(raw.fullText, true, true),
    blocks: raw.blocks.map((b) => mapBlock(b, true, true)),
  };

  return { ...normalized, documentType };
}

export function scanETazkiraFront(
  imageUri: string,
  options?: ScanOptions
): Promise<ScanResult> {
  return recognizeForDocument(imageUri, 'e_tazkira_front', options);
}

export function scanETazkiraBack(
  imageUri: string,
  options?: ScanOptions
): Promise<ScanResult> {
  return recognizeForDocument(imageUri, 'e_tazkira_back', options);
}

export function scanPaperTazkira(
  imageUri: string,
  options?: ScanOptions
): Promise<ScanResult> {
  return recognizeForDocument(imageUri, 'paper_tazkira', options);
}

export function scanPassport(
  imageUri: string,
  options?: ScanOptions
): Promise<ScanResult> {
  return recognizeForDocument(imageUri, 'passport', options);
}

const RnAfIdentityOcr = {
  scanETazkiraFront,
  scanETazkiraBack,
  scanPaperTazkira,
  scanPassport,
  normalizePersoArabicText,
  DEFAULT_OCR_LANGUAGES,
};

export default RnAfIdentityOcr;
