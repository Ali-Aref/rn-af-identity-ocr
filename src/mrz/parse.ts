import { parse, type Details, type FieldName, type ParseResult } from 'mrz';

import type { MrzField, MrzFieldKey, MrzWarning, PassportMrz } from '../RnAfIdentityOcr.types';
import { normalizeMrzText, type MrzCandidate, type MrzFormat } from './locate';

const LINE_LENGTH: Record<MrzFormat, number> = { TD1: 30, TD3: 44 };
const LINE_COUNT: Record<MrzFormat, number> = { TD1: 3, TD3: 2 };

const FIELD_MAP: { key: MrzFieldKey; mrz: FieldName; checkDigit?: FieldName }[] = [
  { key: 'documentNumber', mrz: 'documentNumber', checkDigit: 'documentNumberCheckDigit' },
  { key: 'surname', mrz: 'lastName' },
  { key: 'givenNames', mrz: 'firstName' },
  { key: 'nationality', mrz: 'nationality' },
  { key: 'dateOfBirth', mrz: 'birthDate', checkDigit: 'birthDateCheckDigit' },
  { key: 'sex', mrz: 'sex' },
  { key: 'dateOfExpiry', mrz: 'expirationDate', checkDigit: 'expirationDateCheckDigit' },
  { key: 'personalNumber', mrz: 'personalNumber', checkDigit: 'personalNumberCheckDigit' },
];

function detailFor(result: ParseResult, field: FieldName): Details | undefined {
  return result.details.find((detail) => detail.field === field);
}

/** ponytail: YYMMDD century heuristic; birth years in the future → 1900s. */
function mrzDateToIso(yymmdd: string, kind: 'birth' | 'expiry'): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const month = yymmdd.slice(2, 4);
  const day = yymmdd.slice(4, 6);
  const currentYY = new Date().getUTCFullYear() % 100;
  const year = kind === 'birth' && yy > currentYY ? 1900 + yy : 2000 + yy;
  return `${year}-${month}-${day}`;
}

function normalizeSex(value: string): string {
  if (value === 'male') return 'M';
  if (value === 'female') return 'F';
  return 'X';
}

function normalizeValue(key: MrzFieldKey, rawValue: string): string {
  if (key === 'dateOfBirth') return mrzDateToIso(rawValue, 'birth') ?? rawValue;
  if (key === 'dateOfExpiry') return mrzDateToIso(rawValue, 'expiry') ?? rawValue;
  if (key === 'sex') return normalizeSex(rawValue);
  return rawValue;
}

function fitLength(text: string, length: number): string {
  if (text.length === length) return text;
  if (text.length < length) return text.padEnd(length, '<');

  let t = text;
  while (t.length > length) {
    const idx = t.lastIndexOf('<');
    if (idx === -1) return t.slice(0, length);
    t = t.slice(0, idx) + t.slice(idx + 1);
  }
  return t.length < length ? t.padEnd(length, '<') : t;
}

function sanitizeLines(candidate: MrzCandidate): string[] {
  const expectedCount = LINE_COUNT[candidate.format];
  const expectedLength = LINE_LENGTH[candidate.format];
  const normalized = candidate.lines.map(normalizeMrzText).filter((line) => line.length > 0);

  if (normalized.length === expectedCount) {
    return normalized.map((line) => fitLength(line, expectedLength));
  }

  const compact = normalized.join('');
  if (compact.length >= expectedCount * expectedLength) {
    const lines: string[] = [];
    for (let i = 0; i < expectedCount; i += 1) {
      lines.push(compact.slice(i * expectedLength, (i + 1) * expectedLength));
    }
    return lines.map((line) => fitLength(line, expectedLength));
  }

  const padded = normalized.slice(-expectedCount);
  while (padded.length < expectedCount) padded.unshift('');
  return padded.map((line) => fitLength(line, expectedLength));
}

/** Never throws — bad zones return valid:false and empty fields. */
export function parseMrz(candidate: MrzCandidate): PassportMrz {
  const sanitizedLines = sanitizeLines(candidate);
  let result: ParseResult;
  try {
    result = parse(sanitizedLines, { autocorrect: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown parse error';
    return {
      format: candidate.format,
      valid: false,
      lines: sanitizedLines,
      fields: {},
      warnings: [
        {
          code: 'mrz_checksum_failed',
          message: `A machine-readable zone was located but could not be parsed: ${reason}`,
        },
      ],
      confidence: Math.min(0.6, Math.max(0.3, candidate.confidence || 0.4)),
    };
  }

  const fields: Partial<Record<MrzFieldKey, MrzField>> = {};
  const warnings: MrzWarning[] = [];

  for (const { key, mrz, checkDigit } of FIELD_MAP) {
    const detail = detailFor(result, mrz);
    // Prefer fields; fall back to detail.value when a failed check nulls the field.
    const rawValue = result.fields[mrz] ?? detail?.value;
    if (rawValue === null || rawValue === undefined || rawValue === '') continue;

    let confidence: number;
    if (checkDigit) {
      const checkValid = detailFor(result, checkDigit)?.valid ?? false;
      confidence = checkValid ? 0.97 : 0.45;
      if (!checkValid) {
        warnings.push({
          code: 'mrz_checksum_failed',
          message: `The check digit for ${key} did not validate; verify this value.`,
          field: key,
        });
      }
    } else {
      const fieldValid = detail?.valid ?? true;
      confidence = fieldValid ? 0.85 : 0.6;
    }

    const raw = String(rawValue);
    fields[key] = {
      rawValue: raw,
      normalizedValue: normalizeValue(key, raw),
      confidence,
    };
  }

  const confidence = result.valid
    ? Math.max(0.9, candidate.confidence)
    : Math.min(0.7, Math.max(0.45, candidate.confidence || 0.5));

  return {
    format: candidate.format,
    valid: result.valid,
    lines: sanitizedLines,
    fields,
    warnings,
    confidence,
  };
}
