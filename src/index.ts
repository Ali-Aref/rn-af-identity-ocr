import type { OcrBlock, OcrLine, OcrRecognizeOptions, OcrResult } from './RnOcrPro.types';
import getRnOcrProModule from './RnOcrProModule';
import { DEFAULT_OCR_LANGUAGES } from './constants';
import { normalizePersoArabicText } from './normalizePersoArabic';

export * from './RnOcrPro.types';
export { DEFAULT_OCR_LANGUAGES } from './constants';
export { normalizePersoArabicText };

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

/**
 * Recognize text in an image URI (file:// or content://).
 * Fully on-device via Tesseract. No network calls.
 */
export async function recognizeAsync(
  imageUri: string,
  options: OcrRecognizeOptions = {}
): Promise<OcrResult> {
  if (!imageUri || typeof imageUri !== 'string') {
    throw new Error('rn-ocr-pro: imageUri must be a non-empty string');
  }

  const languages = options.languages?.length ? options.languages : [...DEFAULT_OCR_LANGUAGES];
  const normalize = options.normalizePersoArabic !== false;

  const raw = await getRnOcrProModule().recognizeAsync(imageUri, {
    languages,
    psm: options.psm ?? 3,
    oem: options.oem ?? 1,
    minConfidence: options.minConfidence ?? 0,
  });

  if (!normalize) {
    return raw;
  }

  return {
    ...raw,
    fullText: mapText(raw.fullText, true, true),
    blocks: raw.blocks.map((b) => mapBlock(b, true, true)),
  };
}

const RnOcrPro = {
  recognizeAsync,
  normalizePersoArabicText,
  DEFAULT_OCR_LANGUAGES,
};

export default RnOcrPro;
