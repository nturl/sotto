/**
 * Language definitions for every learning/content locale Sotto ships or
 * plans to ship (planning/CONTRACTS.md §1).
 */

/** The 9 UI message-catalog locales. A content locale maps to exactly one. */
export type UiCatalog = 'en' | 'es' | 'fr' | 'pt' | 'it' | 'zh-Hans' | 'zh-Hant' | 'ro' | 'ca';

export type Script = 'Latn' | 'Hans' | 'Hant';
export type Stability = 'stable' | 'beta';
export type TokenizerStrategy = 'latin' | 'presegmented';
export type Typography = 'latin' | 'cjk';
export type PronunciationGuide = 'none' | 'pinyin';

export interface LanguageDefinition {
  /** BCP 47 content locale, e.g. "fr-FR". */
  locale: string;
  /** ISO 639-1 base language code, e.g. "fr". */
  baseLanguage: string;
  region?: string;
  script: Script;
  /** The language's own name, in its own script (with a region qualifier when needed to disambiguate). */
  nativeName: string;
  /** The base language's name as shown in each of the 9 UI catalogs. */
  localizedNames: Record<UiCatalog, string>;
  direction: 'ltr';
  stability: Stability;
  tokenizer: TokenizerStrategy;
  typography: Typography;
  pronunciationGuide: PronunciationGuide;
  /** 2-3 sentences for the tutor prompt: dialect/pronunciation conventions the model should follow. */
  tutorNotes: string;
  /** Kokoro voice id, or null when no TTS voice is available for this locale (ro, ca). */
  ttsVoice: string | null;
  /** Kokoro lang_code, or null alongside a null ttsVoice. */
  ttsLangCode: string | null;
  /** ISO 639-1 code passed to STT. */
  sttLanguage: string;
  catalog: UiCatalog;
}

// Base-language display names translated into each of the 9 catalogs.
// Reused across regional variants that share a base language (en, es, pt, zh).
const NAMES = {
  en: {
    en: 'English',
    es: 'inglés',
    fr: 'anglais',
    pt: 'inglês',
    it: 'inglese',
    'zh-Hans': '英语',
    'zh-Hant': '英語',
    ro: 'engleză',
    ca: 'anglès',
  },
  es: {
    en: 'Spanish',
    es: 'español',
    fr: 'espagnol',
    pt: 'espanhol',
    it: 'spagnolo',
    'zh-Hans': '西班牙语',
    'zh-Hant': '西班牙語',
    ro: 'spaniolă',
    ca: 'espanyol',
  },
  fr: {
    en: 'French',
    es: 'francés',
    fr: 'français',
    pt: 'francês',
    it: 'francese',
    'zh-Hans': '法语',
    'zh-Hant': '法語',
    ro: 'franceză',
    ca: 'francès',
  },
  pt: {
    en: 'Portuguese',
    es: 'portugués',
    fr: 'portugais',
    pt: 'português',
    it: 'portoghese',
    'zh-Hans': '葡萄牙语',
    'zh-Hant': '葡萄牙語',
    ro: 'portugheză',
    ca: 'portuguès',
  },
  it: {
    en: 'Italian',
    es: 'italiano',
    fr: 'italien',
    pt: 'italiano',
    it: 'italiano',
    'zh-Hans': '意大利语',
    'zh-Hant': '意大利語',
    ro: 'italiană',
    ca: 'italià',
  },
  zh: {
    en: 'Chinese',
    es: 'chino',
    fr: 'chinois',
    pt: 'chinês',
    it: 'cinese',
    'zh-Hans': '中文',
    'zh-Hant': '中文',
    ro: 'chineză',
    ca: 'xinès',
  },
  ro: {
    en: 'Romanian',
    es: 'rumano',
    fr: 'roumain',
    pt: 'romeno',
    it: 'rumeno',
    'zh-Hans': '罗马尼亚语',
    'zh-Hant': '羅馬尼亞語',
    ro: 'română',
    ca: 'romanès',
  },
  ca: {
    en: 'Catalan',
    es: 'catalán',
    fr: 'catalan',
    pt: 'catalão',
    it: 'catalano',
    'zh-Hans': '加泰罗尼亚语',
    'zh-Hant': '加泰羅尼亞語',
    ro: 'catalană',
    ca: 'català',
  },
} satisfies Record<string, Record<UiCatalog, string>>;

export const languages: Record<string, LanguageDefinition> = {
  'en-US': {
    locale: 'en-US',
    baseLanguage: 'en',
    region: 'US',
    script: 'Latn',
    nativeName: 'English (US)',
    localizedNames: NAMES.en,
    direction: 'ltr',
    stability: 'stable',
    tokenizer: 'latin',
    typography: 'latin',
    pronunciationGuide: 'none',
    tutorNotes:
      'General American pronunciation: rhotic (pronounce r everywhere), flapped t/d between vowels ("water" sounds like "wader"). Prefer American vocabulary and spelling ("apartment", "color") over British forms.',
    ttsVoice: 'af_heart',
    ttsLangCode: 'a',
    sttLanguage: 'en',
    catalog: 'en',
  },
  'en-GB': {
    locale: 'en-GB',
    baseLanguage: 'en',
    region: 'GB',
    script: 'Latn',
    nativeName: 'English (UK)',
    localizedNames: NAMES.en,
    direction: 'ltr',
    stability: 'stable',
    tokenizer: 'latin',
    typography: 'latin',
    pronunciationGuide: 'none',
    tutorNotes:
      'Received Pronunciation as the reference accent: non-rhotic (r is silent except before a vowel), broad "a" in words like "bath" and "class". Prefer British vocabulary and spelling ("flat", "colour") over American forms.',
    ttsVoice: 'bf_emma',
    ttsLangCode: 'b',
    sttLanguage: 'en',
    catalog: 'en',
  },
  'es-419': {
    locale: 'es-419',
    baseLanguage: 'es',
    region: '419',
    script: 'Latn',
    nativeName: 'español (Latinoamérica)',
    localizedNames: NAMES.es,
    direction: 'ltr',
    stability: 'stable',
    tokenizer: 'latin',
    typography: 'latin',
    pronunciationGuide: 'none',
    tutorNotes:
      'Latin American Spanish: seseo (c/z and s share one sound, no English "th"), and "ustedes" for the plural "you" in both formal and informal address — "vosotros" is not used. Vocabulary favors pan-Latin American forms over Peninsular ones.',
    ttsVoice: 'ef_dora',
    ttsLangCode: 'e',
    sttLanguage: 'es',
    catalog: 'es',
  },
  'es-ES': {
    locale: 'es-ES',
    baseLanguage: 'es',
    region: 'ES',
    script: 'Latn',
    nativeName: 'español (España)',
    localizedNames: NAMES.es,
    direction: 'ltr',
    stability: 'stable',
    tokenizer: 'latin',
    typography: 'latin',
    pronunciationGuide: 'none',
    tutorNotes:
      'Peninsular Spanish: distinción (c before e/i and z are a "th" sound, distinct from s), and "vosotros" as the informal plural "you", reserving "ustedes" for formal address. Vocabulary favors Peninsular forms over Latin American ones.',
    ttsVoice: 'ef_dora',
    ttsLangCode: 'e',
    sttLanguage: 'es',
    catalog: 'es',
  },
  'fr-FR': {
    locale: 'fr-FR',
    baseLanguage: 'fr',
    region: 'FR',
    script: 'Latn',
    nativeName: 'français',
    localizedNames: NAMES.fr,
    direction: 'ltr',
    stability: 'stable',
    tokenizer: 'latin',
    typography: 'latin',
    pronunciationGuide: 'none',
    tutorNotes:
      'Standard Metropolitan French pronunciation: nasal vowels (an, en, in, on, un), the front-rounded u, and mostly silent final consonants except where liaison applies. Elision merges short function words into the next word ("l\'", "d\'", "qu\'") — treat these as normal clitics, not separate words.',
    ttsVoice: 'ff_siwis',
    ttsLangCode: 'f',
    sttLanguage: 'fr',
    catalog: 'fr',
  },
  'pt-BR': {
    locale: 'pt-BR',
    baseLanguage: 'pt',
    region: 'BR',
    script: 'Latn',
    nativeName: 'português (Brasil)',
    localizedNames: NAMES.pt,
    direction: 'ltr',
    stability: 'stable',
    tokenizer: 'latin',
    typography: 'latin',
    pronunciationGuide: 'none',
    tutorNotes:
      'Brazilian Portuguese: open vowels, "de"/"te" palatalized toward "dji"/"tchi" before i/final e, and "você" as the everyday second person rather than "tu". Vocabulary and spelling follow Brazilian norms, distinct from European Portuguese.',
    ttsVoice: 'pf_dora',
    ttsLangCode: 'p',
    sttLanguage: 'pt',
    catalog: 'pt',
  },
  'pt-PT': {
    locale: 'pt-PT',
    baseLanguage: 'pt',
    region: 'PT',
    script: 'Latn',
    nativeName: 'português (Portugal)',
    localizedNames: NAMES.pt,
    direction: 'ltr',
    stability: 'stable',
    tokenizer: 'latin',
    typography: 'latin',
    pronunciationGuide: 'none',
    tutorNotes:
      'European Portuguese: reduced/closed unstressed vowels (often nearly dropped), consonant-cluster-heavy rhythm compared to Brazilian Portuguese, and "tu" as the everyday informal second person. Vocabulary and spelling follow European norms.',
    ttsVoice: 'pf_dora',
    ttsLangCode: 'p',
    sttLanguage: 'pt',
    catalog: 'pt',
  },
  'it-IT': {
    locale: 'it-IT',
    baseLanguage: 'it',
    region: 'IT',
    script: 'Latn',
    nativeName: 'italiano',
    localizedNames: NAMES.it,
    direction: 'ltr',
    stability: 'stable',
    tokenizer: 'latin',
    typography: 'latin',
    pronunciationGuide: 'none',
    tutorNotes:
      'Standard Italian pronunciation: every vowel is pronounced clearly and consistently, double consonants are held noticeably longer than single ones, and stress usually falls on the second-to-last syllable. Elision before a vowel (e.g. "un\'amica") behaves like a normal clitic.',
    ttsVoice: 'if_sara',
    ttsLangCode: 'i',
    sttLanguage: 'it',
    catalog: 'it',
  },
  'zh-CN': {
    locale: 'zh-CN',
    baseLanguage: 'zh',
    region: 'CN',
    script: 'Hans',
    nativeName: '中文（简体）',
    localizedNames: NAMES.zh,
    direction: 'ltr',
    stability: 'stable',
    tokenizer: 'presegmented',
    typography: 'cjk',
    pronunciationGuide: 'pinyin',
    tutorNotes:
      'Mandarin as spoken in mainland China, written in Simplified characters. Tones carry meaning (mā/má/mǎ/mà) — always name and correct the tone, not just the syllable. Pinyin is a pronunciation aid only; the learner reads characters.',
    ttsVoice: 'zf_xiaoxiao',
    ttsLangCode: 'z',
    sttLanguage: 'zh',
    catalog: 'zh-Hans',
  },
  'zh-TW': {
    locale: 'zh-TW',
    baseLanguage: 'zh',
    region: 'TW',
    script: 'Hant',
    nativeName: '中文（繁體）',
    localizedNames: NAMES.zh,
    direction: 'ltr',
    stability: 'stable',
    tokenizer: 'presegmented',
    typography: 'cjk',
    pronunciationGuide: 'pinyin',
    tutorNotes:
      'Taiwan Mandarin, written in Traditional characters. Pronunciation and vocabulary differ in places from mainland Mandarin (e.g. retroflex sounds are often softened); prefer Taiwan usage when it diverges. Tones still carry meaning — correct the tone, not just the syllable.',
    ttsVoice: 'zf_xiaoxiao',
    ttsLangCode: 'z',
    sttLanguage: 'zh',
    catalog: 'zh-Hant',
  },
  'ro-RO': {
    locale: 'ro-RO',
    baseLanguage: 'ro',
    region: 'RO',
    script: 'Latn',
    nativeName: 'română',
    localizedNames: NAMES.ro,
    direction: 'ltr',
    stability: 'beta',
    tokenizer: 'latin',
    typography: 'latin',
    pronunciationGuide: 'none',
    tutorNotes:
      'Standard Romanian: five extra letters beyond the base Latin alphabet (ă, â, î, ș, ț) each mark a distinct sound — never approximate ș/ț as plain s/t. No TTS voice is available yet, so lean on written models and phonetic description in text.',
    ttsVoice: null,
    ttsLangCode: null,
    sttLanguage: 'ro',
    catalog: 'ro',
  },
  'ca-ES': {
    locale: 'ca-ES',
    baseLanguage: 'ca',
    region: 'ES',
    script: 'Latn',
    nativeName: 'català',
    localizedNames: NAMES.ca,
    direction: 'ltr',
    stability: 'beta',
    tokenizer: 'latin',
    typography: 'latin',
    pronunciationGuide: 'none',
    tutorNotes:
      'Central Catalan (Barcelona-area) as the reference variety: open/closed e and o are meaningfully distinct, and word-final consonants often devoice. Elision before a vowel ("l\'", "m\'", "d\'") behaves like a normal clitic. No TTS voice is available yet.',
    ttsVoice: null,
    ttsLangCode: null,
    sttLanguage: 'ca',
    catalog: 'ca',
  },
};

export function getLanguage(locale: string): LanguageDefinition {
  const def = languages[locale];
  if (!def) {
    throw new Error(`unknown locale: ${locale}`);
  }
  return def;
}

export function catalogFor(locale: string): UiCatalog {
  return getLanguage(locale).catalog;
}

/**
 * A learning/explanation locale pair is valid when they name different base
 * languages, unless immersion mode is on (in which case explanations are
 * shown in the learning language itself, so equality is expected and fine).
 * `explanation` is a base-language/catalog code (e.g. "en", "fr", "es"),
 * `learning` is a full content locale (e.g. "fr-FR") — compare by base
 * language so "fr-FR" vs "fr" is correctly treated as the same language.
 */
export function isValidPair(learning: string, explanation: string, immersion = false): boolean {
  if (immersion) return true;
  return getLanguage(learning).baseLanguage !== explanation;
}

export function contentLocales(): string[] {
  return Object.keys(languages);
}
