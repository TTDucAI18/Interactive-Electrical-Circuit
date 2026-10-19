import { describe, expect, it } from 'vitest';
import { translate, type Language } from './i18n';

describe('interface translations', () => {
  it('translates the primary editor actions and errors in all supported languages', () => {
    const languages: Language[] = ['vi', 'en', 'ru'];
    for (const language of languages) {
      expect(translate(language, 'canvasTitle').length).toBeGreaterThan(0);
      expect(translate(language, 'toolWire').length).toBeGreaterThan(0);
      expect(translate(language, 'groundMissing').length).toBeGreaterThan(0);
      expect(translate(language, 'exportPdf').length).toBeGreaterThan(0);
    }
    expect(new Set(languages.map((language) => translate(language, 'toolWire'))).size).toBe(3);
  });

  it('substitutes numeric report and image parameters', () => {
    expect(translate('en', 'partsCount', { count: 12 })).toBe('12 parts');
    expect(translate('vi', 'workerError', { status: 502 })).toContain('502');
    expect(translate('ru', 'items', { count: 4 })).toContain('4');
  });
});
