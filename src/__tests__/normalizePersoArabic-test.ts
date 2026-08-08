import type { AfDocumentType } from '../RnAfIdentityOcr.types';
import { DEFAULT_OCR_LANGUAGES } from '../constants';
import { normalizePersoArabicText } from '../normalizePersoArabic';

describe('normalizePersoArabicText', () => {
  it('maps Arabic yeh/kaf to Persian forms', () => {
    expect(normalizePersoArabicText('يك')).toBe('یک');
  });

  it('removes tatweel and collapses whitespace', () => {
    expect(normalizePersoArabicText('سـلام   دنیا')).toBe('سلام دنیا');
  });

  it('converts Persian and Arabic-Indic digits to ASCII by default', () => {
    expect(normalizePersoArabicText('۰۱۲ و ٠١٢')).toBe('012 و 012');
  });

  it('can keep native digits when disabled', () => {
    expect(normalizePersoArabicText('سال ۱۴۰۳', { normalizeDigits: false })).toBe('سال ۱۴۰۳');
  });

  it('NFC-normalizes input', () => {
    const composed = normalizePersoArabicText('ا\u0650');
    expect(composed.normalize('NFC')).toBe(composed);
  });
});

describe('DEFAULT_OCR_LANGUAGES', () => {
  it('prioritizes Persian and Pashto with English', () => {
    expect([...DEFAULT_OCR_LANGUAGES]).toEqual(['fas', 'pus', 'eng']);
  });
});

describe('AfDocumentType', () => {
  it('covers the four Afghan identity document kinds', () => {
    const types: AfDocumentType[] = [
      'e_tazkira_front',
      'e_tazkira_back',
      'paper_tazkira',
      'passport',
    ];
    expect(types).toHaveLength(4);
  });
});
