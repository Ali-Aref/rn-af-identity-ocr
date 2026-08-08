import type { NativeRecognizedLine } from '../RnAfIdentityOcr.types';

export type MrzFormat = 'TD1' | 'TD3';

export type MrzCandidate = {
  format: MrzFormat;
  /** Normalized and fitted to the format's fixed line length. */
  lines: string[];
  /** Mean OCR confidence of the source lines, 0..1. */
  confidence: number;
};

const LINE_LENGTH: Record<MrzFormat, number> = { TD1: 30, TD3: 44 };
const LINE_COUNT: Record<MrzFormat, number> = { TD1: 3, TD3: 2 };

/** Uppercase, strip noise, keep MRZ charset. O/0 confusions left for check-digit autocorrect. */
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

/**
 * Finds the MRZ among OCR lines by chevrons + bottom placement.
 * Expects native normalized boxes (y in 0..1) and confidence in 0..1.
 */
export function locateMrz(lines: NativeRecognizedLine[]): MrzCandidate | null {
  const ordered = [...lines]
    .sort((a, b) => a.box.y - b.box.y)
    .map((line) => ({ text: normalizeMrzText(line.text), confidence: line.confidence }))
    .filter((line) => isMrzLike(line.text));

  if (ordered.length === 0) return null;

  const maxLength = Math.max(...ordered.map((line) => line.text.length));
  const format: MrzFormat = maxLength >= 38 ? 'TD3' : 'TD1';
  const count = LINE_COUNT[format];
  const length = LINE_LENGTH[format];

  if (ordered.length < count) return null;

  const chosen = ordered.slice(-count);
  const confidence = chosen.reduce((sum, line) => sum + line.confidence, 0) / chosen.length;

  return {
    format,
    lines: chosen.map((line) => fitLength(line.text, length)),
    confidence,
  };
}
