/**
 * Lightweight Perso-Arabic cleanup for OCR output.
 * Focused on Persian / Pashto character consistency; optional ASCII digits.
 */
export function normalizePersoArabicText(
  text: string,
  options: { normalizeDigits?: boolean } = {}
): string {
  const { normalizeDigits = true } = options;

  let out = text.normalize('NFC');

  // Arabic → Persian letter forms commonly misread by OCR
  out = out
    .replace(/\u064A/g, '\u06CC') // ي → ی
    .replace(/\u0643/g, '\u06A9') // ك → ک
    .replace(/\u0629/g, '\u0647') // ة → ه (common Persian preference)
    .replace(/\u0640/g, ''); // remove tatweel

  if (normalizeDigits) {
    // Persian ۰-۹ and Arabic-Indic ٠-٩ → ASCII
    out = out.replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0));
    out = out.replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
  }

  // Collapse whitespace but keep newlines between blocks
  out = out
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return out;
}
