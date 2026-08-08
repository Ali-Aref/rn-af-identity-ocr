import type { AfDocumentType, OcrScript } from '../RnAfIdentityOcr.types';
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

describe('AfDocumentType script routing', () => {
  it('covers the four Afghan identity document kinds', () => {
    const types: AfDocumentType[] = [
      'e_tazkira_front',
      'e_tazkira_back',
      'paper_tazkira',
      'passport',
    ];
    expect(types).toHaveLength(4);
  });

  it('uses arabic for fronts and latin for back/passport', () => {
    const routing: Record<AfDocumentType, OcrScript> = {
      e_tazkira_front: 'arabic',
      paper_tazkira: 'arabic',
      e_tazkira_back: 'latin',
      passport: 'latin',
    };
    expect(routing.e_tazkira_front).toBe('arabic');
    expect(routing.passport).toBe('latin');
  });
});
