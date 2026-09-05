/**
 * Language option lists (CONTRACTS §1). Stands in for the `languages` export
 * that @sotto/core does not ship yet — swap for the core export when WS-1
 * lands it. Native names are data (proper nouns), not UI strings.
 */
import { getUiCatalog } from '../i18n/useT';

export type LanguageOption = {
  code: string;
  nativeName: string;
  localizedNames: Record<string, string>;
};

/** Learning/content locales (CONTRACTS §1); zh is one row, script picked separately. */
export const LEARNING_LANGUAGES: LanguageOption[] = [
  {
    code: 'en-US',
    nativeName: 'English',
    localizedNames: { en: 'English (US)', fr: 'Anglais (É.-U.)' },
  },
  {
    code: 'en-GB',
    nativeName: 'English (UK)',
    localizedNames: { en: 'English (UK)', fr: 'Anglais (R.-U.)' },
  },
  {
    code: 'es-419',
    nativeName: 'Español (Latinoamérica)',
    localizedNames: { en: 'Spanish (Latin America)', fr: 'Espagnol (Amérique latine)' },
  },
  {
    code: 'es-ES',
    nativeName: 'Español (España)',
    localizedNames: { en: 'Spanish (Spain)', fr: 'Espagnol (Espagne)' },
  },
  { code: 'fr-FR', nativeName: 'Français', localizedNames: { en: 'French', fr: 'Français' } },
  {
    code: 'pt-BR',
    nativeName: 'Português (Brasil)',
    localizedNames: { en: 'Portuguese (Brazil)', fr: 'Portugais (Brésil)' },
  },
  {
    code: 'pt-PT',
    nativeName: 'Português (Portugal)',
    localizedNames: { en: 'Portuguese (Portugal)', fr: 'Portugais (Portugal)' },
  },
  { code: 'it-IT', nativeName: 'Italiano', localizedNames: { en: 'Italian', fr: 'Italien' } },
  { code: 'zh', nativeName: '中文', localizedNames: { en: 'Chinese', fr: 'Chinois' } },
  {
    code: 'ro-RO',
    nativeName: 'Română',
    localizedNames: { en: 'Romanian (beta)', fr: 'Roumain (bêta)' },
  },
  {
    code: 'ca-ES',
    nativeName: 'Català',
    localizedNames: { en: 'Catalan (beta)', fr: 'Catalan (bêta)' },
  },
];

/** Region/script choice shown when the learning language is Chinese. */
export const SCRIPT_OPTIONS: LanguageOption[] = [
  {
    code: 'zh-CN',
    nativeName: '简体中文',
    localizedNames: { en: 'Simplified Chinese', fr: 'Chinois simplifié' },
  },
  {
    code: 'zh-TW',
    nativeName: '繁體中文',
    localizedNames: { en: 'Traditional Chinese', fr: 'Chinois traditionnel' },
  },
];

/** UI message catalogs (CONTRACTS §1: 9 catalogs). */
export const APP_LANGUAGES: LanguageOption[] = [
  { code: 'en', nativeName: 'English', localizedNames: { en: 'English', fr: 'Anglais' } },
  { code: 'es', nativeName: 'Español', localizedNames: { en: 'Spanish', fr: 'Espagnol' } },
  { code: 'fr', nativeName: 'Français', localizedNames: { en: 'French', fr: 'Français' } },
  { code: 'pt', nativeName: 'Português', localizedNames: { en: 'Portuguese', fr: 'Portugais' } },
  { code: 'it', nativeName: 'Italiano', localizedNames: { en: 'Italian', fr: 'Italien' } },
  {
    code: 'zh-Hans',
    nativeName: '简体中文',
    localizedNames: { en: 'Chinese (Simplified)', fr: 'Chinois (simplifié)' },
  },
  {
    code: 'zh-Hant',
    nativeName: '繁體中文',
    localizedNames: { en: 'Chinese (Traditional)', fr: 'Chinois (traditionnel)' },
  },
  { code: 'ro', nativeName: 'Română', localizedNames: { en: 'Romanian', fr: 'Roumain' } },
  { code: 'ca', nativeName: 'Català', localizedNames: { en: 'Catalan', fr: 'Catalan' } },
];

/** Explanation (gloss) locales shipped in packs (CONTRACTS §1: en, fr, es). */
export const EXPLANATION_LANGUAGES: LanguageOption[] = [
  { code: 'en', nativeName: 'English', localizedNames: { en: 'English', fr: 'Anglais' } },
  { code: 'fr', nativeName: 'Français', localizedNames: { en: 'French', fr: 'Français' } },
  { code: 'es', nativeName: 'Español', localizedNames: { en: 'Spanish', fr: 'Espagnol' } },
];

export function localizedName(option: LanguageOption, catalog = getUiCatalog()): string {
  return option.localizedNames[catalog] ?? option.localizedNames.en ?? option.nativeName;
}

export function languageNameFor(code: string, catalog = getUiCatalog()): string {
  const all = [...LEARNING_LANGUAGES, ...SCRIPT_OPTIONS, ...APP_LANGUAGES];
  const found = all.find((option) => option.code === code);
  return found ? found.nativeName : code;
}
