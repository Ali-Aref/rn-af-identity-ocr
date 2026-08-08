import type { NativeRecognizedLine } from '../RnAfIdentityOcr.types';

export type MrzFormat = 'TD1' | 'TD3';

export type MrzCandidate = {
  format: MrzFormat;
  /** Normalized and fitted to the format's fixed line length. */
  lines: string[];
  /** Mean OCR confidence of the source lines, 0..1. */
  confidence: number;
};

/** Same shape as af-identity-scanner RecognitionResult (lines only). */
export type MrzRecognition = {
  lines: NativeRecognizedLine[];
};

const LINE_LENGTH: Record<MrzFormat, number> = { TD1: 30, TD3: 44 };
const LINE_COUNT: Record<MrzFormat, number> = { TD1: 3, TD3: 2 };

/**
 * Uppercases, drops whitespace, maps a few unambiguous chevron lookalikes, and
 * strips anything outside the MRZ charset. Letter/digit confusions (O/0, I/1)
 * are deliberately left for the check-digit-guided autocorrect in the parser,
 * since fixing them here without context would corrupt names.
 */
export function normalizeMrzText(text: string): string {
  return text
    .toUpperCase()
    .replace(/«/g, '<<')
    .replace(/[‹＜]/g, '<')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9<]/g, '');
}

function isMrzLike(text: string): boolean {
  return text.length >= 20 && text.includes('<');
}

function fitLength(text: string, length: number): string {
  if (text.length === length) return text;
  if (text.length > length) return text.slice(0, length);
  return text.padEnd(length, '<');
}

function conf01(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0.5;
  return confidence > 1 ? confidence / 100 : confidence;
}

/**
 * OCR often merges both TD3 lines into one ~88-char string (or TD1 into ~90).
 * Split those before the bottom-block picker runs.
 */
function expandMergedLines(
  lines: { text: string; confidence: number }[]
): { text: string; confidence: number }[] {
  const out: { text: string; confidence: number }[] = [];
  for (const line of lines) {
    const t = line.text;
    if (t.length >= 80 && t.length <= 92 && t.startsWith('P')) {
      // Merged TD3 (2×44).
      out.push({ text: t.slice(0, 44), confidence: line.confidence });
      out.push({ text: t.slice(44, 88), confidence: line.confidence });
      continue;
    }
    if (
      t.length >= 85 &&
      t.length <= 95 &&
      (t.startsWith('I') || t.startsWith('A') || t.startsWith('C'))
    ) {
      // Merged TD1 (3×30).
      out.push({ text: t.slice(0, 30), confidence: line.confidence });
      out.push({ text: t.slice(30, 60), confidence: line.confidence });
      out.push({ text: t.slice(60, 90), confidence: line.confidence });
      continue;
    }
    out.push(line);
  }
  return out;
}

/**
 * OCR may also spit the whole zone into the compacted full string. Prefer
 * explicit line picks first; this is a fallback when line segmentation fails.
 */
function locateFromCompactText(compact: string, confidence: number): MrzCandidate | null {
  const passportIdx = compact.search(/P<[A-Z0-9<]{42}/);
  if (passportIdx >= 0 && compact.length >= passportIdx + 88) {
    const slice = compact.slice(passportIdx, passportIdx + 88);
    return {
      format: 'TD3',
      lines: [slice.slice(0, 44), slice.slice(44, 88)],
      confidence,
    };
  }
  return null;
}

function pickCandidate(ordered: { text: string; confidence: number }[]): MrzCandidate | null {
  const mrzLike = ordered.filter((line) => isMrzLike(line.text));
  if (mrzLike.length === 0) return null;

  const maxLength = Math.max(...mrzLike.map((line) => line.text.length));
  const format: MrzFormat = maxLength >= 38 ? 'TD3' : 'TD1';
  const count = LINE_COUNT[format];
  const length = LINE_LENGTH[format];

  if (mrzLike.length < count) return null;

  // Same as af-identity-scanner: MRZ is the bottom-most block of chevron lines.
  const chosen = mrzLike.slice(-count);
  const confidence = chosen.reduce((sum, line) => sum + line.confidence, 0) / chosen.length;

  return {
    format,
    lines: chosen.map((line) => fitLength(line.text, length)),
    confidence,
  };
}

/**
 * Finds the MRZ among recognized lines by shape and position: chevron filler,
 * minimum length, and bottom-of-document placement.
 *
 * Core algorithm matches af-identity-scanner. Also splits merged ~88-char TD3
 * (or ~90-char TD1) OCR lines, and falls back to scraping `P<…` from compacted text.
 */
export function locateMrz(
  recognition: MrzRecognition | NativeRecognizedLine[]
): MrzCandidate | null {
  const lines = Array.isArray(recognition) ? recognition : recognition.lines;

  let ordered = [...lines]
    .sort((a, b) => (a.box?.y ?? 0) - (b.box?.y ?? 0))
    .map((line) => ({
      text: normalizeMrzText(line.text),
      confidence: conf01(line.confidence),
    }))
    .filter((line) => line.text.length > 0);

  ordered = expandMergedLines(ordered);

  const picked = pickCandidate(ordered);
  if (picked) return picked;

  const compact = ordered.map((l) => l.text).join('');
  const meanConf =
    ordered.length === 0 ? 0.5 : ordered.reduce((s, l) => s + l.confidence, 0) / ordered.length;
  return locateFromCompactText(compact, meanConf);
}
