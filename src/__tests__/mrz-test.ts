import type { NativeRecognizedLine } from '../RnAfIdentityOcr.types';
import { locateMrz } from '../mrz/locate';
import { parseMrz } from '../mrz/parse';

const TD3_PASSPORT = [
  'P<AFGAHMADI<<AHMAD<<<<<<<<<<<<<<<<<<<<<<<<<<',
  'OR12345677AFG9501016M3001019<<<<<<<<<<<<<<02',
];

/** Real AF e-Tazkira back specimen (Nematulla GHULAMI); TD1 3×30. */
const TD1_TAZKIRA_BACK = [
  'I<AFG13991204<573308<<<<<<<<<<',
  '9803215M3103119AFG<<<<<<<<<<<3',
  'GHULAMI<<NEMATULLA<<<<<<<<<<<<',
];

function linesFromMrz(
  mrzLines: string[],
  visible: string[] = ['PASSPORT']
): NativeRecognizedLine[] {
  const all = [...visible, ...mrzLines];
  return all.map((text, i) => ({
    text,
    confidence: 0.9,
    box: { x: 0.05, y: (i + 1) / (all.length + 1), width: 0.9, height: 0.05 },
  }));
}

describe('passport MRZ locate + parse', () => {
  it('extracts TD3 identity fields with valid check digits (af-identity-scanner specimen)', () => {
    const candidate = locateMrz({ lines: linesFromMrz(TD3_PASSPORT) });
    expect(candidate?.format).toBe('TD3');

    const parsed = parseMrz(candidate!);
    expect(parsed.valid).toBe(true);
    expect(parsed.fields.documentNumber?.normalizedValue).toBe('OR1234567');
    expect(parsed.fields.surname?.normalizedValue).toBe('AHMADI');
    expect(parsed.fields.givenNames?.normalizedValue).toBe('AHMAD');
    expect(parsed.fields.nationality?.normalizedValue).toBe('AFG');
    expect(parsed.fields.dateOfBirth?.normalizedValue).toBe('1995-01-01');
    expect(parsed.fields.dateOfExpiry?.normalizedValue).toBe('2030-01-01');
    expect(parsed.fields.sex?.normalizedValue).toBe('M');
    expect(parsed.warnings).toHaveLength(0);
  });

  it('splits a merged 88-char TD3 OCR line into two lines', () => {
    const merged = TD3_PASSPORT.join('');
    const candidate = locateMrz({
      lines: [
        {
          text: 'PASSPORT',
          confidence: 0.9,
          box: { x: 0.1, y: 0.2, width: 0.5, height: 0.05 },
        },
        {
          text: merged,
          confidence: 0.85,
          box: { x: 0.05, y: 0.85, width: 0.9, height: 0.08 },
        },
      ],
    });
    expect(candidate?.format).toBe('TD3');
    expect(candidate?.lines).toHaveLength(2);
    expect(parseMrz(candidate!).fields.documentNumber?.normalizedValue).toBe('OR1234567');
  });

  it('recovers TD3 from compacted OCR text when line counts are wrong', () => {
    const candidate = locateMrz({
      lines: [
        {
          text: `REPUBLIC OF AFGHANISTAN ${TD3_PASSPORT.join('')}`,
          confidence: 0.8,
          box: { x: 0.05, y: 0.7, width: 0.9, height: 0.1 },
        },
      ],
    });
    expect(candidate?.format).toBe('TD3');
    expect(parseMrz(candidate!).fields.surname?.normalizedValue).toBe('AHMADI');
  });

  it('extracts TD1 identity fields from e-Tazkira back specimen', () => {
    const candidate = locateMrz({ lines: linesFromMrz(TD1_TAZKIRA_BACK, ['NATIONAL IDENTITY']) });
    expect(candidate?.format).toBe('TD1');
    expect(candidate?.lines).toHaveLength(3);

    const parsed = parseMrz(candidate!);
    expect(parsed.valid).toBe(true);
    // ICAO TD1 stores first 9 of the 13-digit ID; remainder is optional1 → personalNumber.
    expect(parsed.fields.documentNumber?.normalizedValue).toBe('13991204');
    expect(parsed.fields.personalNumber?.normalizedValue).toBe('73308');
    expect(parsed.fields.surname?.normalizedValue).toBe('GHULAMI');
    expect(parsed.fields.givenNames?.normalizedValue).toBe('NEMATULLA');
    expect(parsed.fields.nationality?.normalizedValue).toBe('AFG');
    expect(parsed.fields.dateOfBirth?.normalizedValue).toBe('1998-03-21');
    expect(parsed.fields.dateOfExpiry?.normalizedValue).toBe('2031-03-11');
    expect(parsed.fields.sex?.normalizedValue).toBe('M');
    expect(parsed.warnings).toHaveLength(0);
  });

  it('returns null when no chevron MRZ lines exist', () => {
    expect(locateMrz({ lines: linesFromMrz([], ['HELLO', 'WORLD']) })).toBeNull();
  });

  it('recovers fields from OCR that used « and K for fillers (real AF passport sample)', () => {
    // Exact ML Kit lines from a scan that previously threw in parse → empty fields.
    const candidate = locateMrz({
      lines: linesFromMrz([
        'P<AFGMOHAMMADZADA<<ALI<ARE F<<<<<<«<<K<<<«KK<',
        'PO76810009AFG9806098M3402214<<<«<<««K««K<«06',
      ]),
    });
    expect(candidate?.format).toBe('TD3');
    expect(candidate!.lines[0]).toHaveLength(44);
    expect(candidate!.lines[1]).toHaveLength(44);
    // Trailing composite check digits must survive (old fitLength sliced them off).
    expect(candidate!.lines[1].endsWith('06')).toBe(true);

    const parsed = parseMrz(candidate!);
    expect(parsed.fields.documentNumber?.normalizedValue).toBe('PO7681000');
    expect(parsed.fields.surname?.normalizedValue).toBe('MOHAMMADZADA');
    expect(parsed.fields.givenNames?.normalizedValue).toBe('ALI AREF');
    expect(parsed.fields.nationality?.normalizedValue).toBe('AFG');
    expect(parsed.fields.dateOfBirth?.normalizedValue).toBe('1998-06-09');
    expect(parsed.fields.sex?.normalizedValue).toBe('M');
    expect(parsed.fields.dateOfExpiry?.normalizedValue).toBe('2034-02-21');
    // Doc-number check digit in OCR is wrong (expected 1, got 9) → valid:false but fields present.
    expect(parsed.valid).toBe(false);
    expect(parsed.warnings.some((w) => w.code === 'mrz_checksum_failed')).toBe(true);
  });

  it('sanitizes hidden Unicode chars before parse so fields are still recovered', () => {
    const parsed = parseMrz({
      format: 'TD3',
      confidence: 0.7,
      lines: [
        'P<AFGMOHAMMADZADA<<ALI<AREF<<<<<<<<<<<<<<<<<\u200E',
        'PO76810009AFG9806098M3402214<<<<<<<<<<<<<<06',
      ],
    });

    expect(parsed.lines[0]).toHaveLength(44);
    expect(parsed.lines[1]).toHaveLength(44);
    expect(parsed.fields.surname?.normalizedValue).toBe('MOHAMMADZADA');
    expect(parsed.fields.givenNames?.normalizedValue).toBe('ALI AREF');
    expect(parsed.fields.documentNumber?.normalizedValue).toBe('PO7681000');
    // Still invalid due bad OCR check digit, but no hard parse failure.
    expect(parsed.warnings.some((w) => w.message.includes('could not be parsed'))).toBe(false);
  });
});
