import type { NativeRecognizedLine } from '../RnAfIdentityOcr.types';
import { locateMrz } from '../mrz/locate';
import { parseMrz } from '../mrz/parse';

const TD3_PASSPORT = [
  'P<AFGAHMADI<<AHMAD<<<<<<<<<<<<<<<<<<<<<<<<<<',
  'OR12345677AFG9501016M3001019<<<<<<<<<<<<<<02',
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

  it('returns null when no chevron MRZ lines exist', () => {
    expect(locateMrz({ lines: linesFromMrz([], ['HELLO', 'WORLD']) })).toBeNull();
  });
});
