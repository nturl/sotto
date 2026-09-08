import { describe, expect, it } from 'vitest';
import { LEARNING_LANGUAGES, SCRIPT_OPTIONS } from '../ui/languages';
import {
  defaultVariantFor,
  familyForCode,
  familyIdFor,
  languageFamilies,
  shortVariantName,
} from './languageFamilies';

const families = languageFamilies(LEARNING_LANGUAGES, 'en');

/**
 * Run 10 lane A. The learning step showed eleven rows for eight languages,
 * three of them doubled by region, and the Continue button sat below them.
 * Grouping is what buys the room back — so it has to be a regrouping and
 * nothing more: same codes in, same codes out.
 */
describe('languageFamilies', () => {
  it('shows one row per language, in the source list order', () => {
    expect(families.map((family) => family.id)).toEqual([
      'en',
      'es',
      'fr',
      'pt',
      'it',
      'zh',
      'ro',
      'ca',
    ]);
  });

  it('names a family without the region its variants disambiguate', () => {
    const spanish = families.find((family) => family.id === 'es')!;
    expect(spanish.nativeName).toBe('Español');
    expect(spanish.localizedName).toBe('Spanish');
    expect(families.find((family) => family.id === 'pt')!.nativeName).toBe('Português');
  });

  it('keeps a single-code language exactly as the list has it, beta mark included', () => {
    const romanian = families.find((family) => family.id === 'ro')!;
    expect(romanian.nativeName).toBe('Română');
    expect(romanian.localizedName).toBe('Romanian (beta)');
    expect(families.find((family) => family.id === 'ca')!.localizedName).toBe('Catalan (beta)');
  });

  it('invents no locale: every code in, every code out, none added', () => {
    const grouped = families.flatMap((family) => family.variants.map((variant) => variant.code));
    expect(grouped).toEqual(LEARNING_LANGUAGES.map((option) => option.code));
  });

  it('keeps the regional pairs together and leaves the rest alone', () => {
    const sizes = Object.fromEntries(families.map((family) => [family.id, family.variants.length]));
    expect(sizes).toEqual({ en: 2, es: 2, fr: 1, pt: 2, it: 1, zh: 1, ro: 1, ca: 1 });
  });
});

describe('familyIdFor and familyForCode', () => {
  it('reads the base subtag of a stored code', () => {
    expect(familyIdFor('en-GB')).toBe('en');
    expect(familyIdFor('es-419')).toBe('es');
    expect(familyIdFor('zh')).toBe('zh');
  });

  it('finds the row a stored preference should arrive selected on', () => {
    expect(familyForCode(families, 'pt-PT')!.id).toBe('pt');
    expect(familyForCode(families, 'de-DE')).toBeUndefined();
  });
});

describe('defaultVariantFor', () => {
  it('keeps the proposed code when it belongs to the family', () => {
    const spanish = familyForCode(families, 'es-ES')!;
    expect(defaultVariantFor(spanish, 'es-ES')).toBe('es-ES');
  });

  it('falls back to the family first code when the proposal is another language', () => {
    const portuguese = familyForCode(families, 'pt-BR')!;
    expect(defaultVariantFor(portuguese, 'fr-FR')).toBe('pt-BR');
    expect(defaultVariantFor(familyForCode(families, 'en-US')!, 'fr-FR')).toBe('en-US');
  });
});

describe('shortVariantName', () => {
  it('labels a region variant with the region alone', () => {
    const english = familyForCode(families, 'en-US')!;
    expect(english.variants.map((variant) => shortVariantName(variant, 'en'))).toEqual([
      'US',
      'UK',
    ]);
    expect(
      familyForCode(families, 'es-419')!.variants.map((variant) => shortVariantName(variant, 'en')),
    ).toEqual(['Latin America', 'Spain']);
  });

  it('labels the Chinese scripts with their native names, having no region', () => {
    expect(SCRIPT_OPTIONS.map((option) => shortVariantName(option, 'en'))).toEqual([
      '简体中文',
      '繁體中文',
    ]);
  });
});
