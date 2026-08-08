import { parse, type Details, type FieldName, type ParseResult } from 'mrz';

import type { MrzField, MrzFieldKey, MrzWarning, PassportMrz } from '../RnAfIdentityOcr.types';
import type { MrzCandidate } from './locate';

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

/** Never throws — bad zones return valid:false and empty fields. */
export function parseMrz(candidate: MrzCandidate): PassportMrz {
  let result: ParseResult;
  try {
    result = parse(candidate.lines, { autocorrect: true });
  } catch {
    return {
      format: candidate.format,
      valid: false,
      lines: candidate.lines,
      fields: {},
      warnings: [
        {
          code: 'mrz_checksum_failed',
          message: 'A machine-readable zone was located but could not be parsed.',
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
    lines: candidate.lines,
    fields,
    warnings,
    confidence,
  };
}
