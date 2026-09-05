/**
 * Language detection over the content locales @sotto/core knows about: a
 * small stopword-frequency scorer (no external dep — this only needs to
 * be "good enough to pre-fill a picker the user can correct", per
 * IMPORT.md §3's "Modifier" affordance, not a production langid model).
 */
import { contentLocales, getLanguage } from '@sotto/core';

export interface DetectionResult {
  locale: string;
  confidence: number;
}

/** The base language each stopword list scores for, mapped to the content
 * locale returned when it wins (one representative region variant per base
 * language — the caller/UI lets the user pick the exact region). */
const BASE_LANGUAGE_DEFAULT_LOCALE: Record<string, string> = {
  en: 'en-US',
  es: 'es-419',
  fr: 'fr-FR',
  pt: 'pt-BR',
  it: 'it-IT',
  ro: 'ro-RO',
  ca: 'ca-ES',
};

// Short, high-frequency function-word lists per base language — the words
// most likely to appear regardless of subject matter, which is exactly
// what makes them useful stopword-frequency discriminators.
const STOPWORDS: Record<string, string[]> = {
  en: [
    'the',
    'and',
    'of',
    'to',
    'a',
    'in',
    'is',
    'that',
    'it',
    'was',
    'for',
    'on',
    'with',
    'as',
    'he',
    'she',
    'they',
    'you',
    'his',
    'her',
    'not',
    'be',
    'this',
    'have',
    'had',
    'but',
    'at',
  ],
  es: [
    'el',
    'la',
    'de',
    'que',
    'y',
    'en',
    'un',
    'una',
    'los',
    'las',
    'es',
    'por',
    'con',
    'para',
    'no',
    'se',
    'su',
    'lo',
    'como',
    'más',
    'pero',
    'sus',
    'le',
    'ya',
    'muy',
    'era',
  ],
  fr: [
    'le',
    'la',
    'de',
    'et',
    'un',
    'une',
    'les',
    'des',
    'est',
    'en',
    'que',
    'qui',
    'pour',
    'dans',
    'il',
    'elle',
    'ne',
    'pas',
    'se',
    'sur',
    'plus',
    'son',
    'sa',
    'avec',
    'ce',
    'au',
    "d'",
    "l'",
  ],
  pt: [
    'o',
    'a',
    'de',
    'que',
    'e',
    'do',
    'da',
    'em',
    'um',
    'uma',
    'os',
    'as',
    'para',
    'com',
    'não',
    'se',
    'na',
    'no',
    'por',
    'mais',
    'como',
    'mas',
    'foi',
    'ele',
    'ela',
    'seu',
    'sua',
  ],
  it: [
    'il',
    'la',
    'di',
    'che',
    'e',
    'un',
    'una',
    'gli',
    'le',
    'in',
    'per',
    'con',
    'non',
    'si',
    'del',
    'della',
    'era',
    'sono',
    'ma',
    'come',
    'suo',
    'sua',
    'più',
    'anche',
    'questo',
  ],
  ro: [
    'și',
    'de',
    'la',
    'un',
    'o',
    'în',
    'este',
    'că',
    'nu',
    'cu',
    'pe',
    'din',
    'se',
    'mai',
    'era',
    'său',
    'sale',
    'dar',
    'ce',
    'ca',
    'pentru',
    'sunt',
    'am',
    'lui',
  ],
  ca: [
    'el',
    'la',
    'de',
    'i',
    'que',
    'un',
    'una',
    'els',
    'les',
    'en',
    'per',
    'amb',
    'no',
    'es',
    'del',
    'era',
    'però',
    'com',
    'més',
    'seu',
    'seva',
    'aquest',
    "d'",
    "l'",
  ],
};

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/\p{L}+(?:['’]\p{L}+)?/gu);
  return matches ?? [];
}

/**
 * Scores `text` against every known stopword list and returns the best
 * match as a content locale + confidence in [0, 1]. Confidence is the
 * winner's share of total stopword hits across all languages — a clear
 * winner (one language's function words dominate) scores near 1; a close
 * call between two similar languages scores near 0.5.
 */
export function detectLanguage(text: string): DetectionResult {
  const tokens = tokenize(text.slice(0, 20_000)); // a sample is enough
  const scores: Record<string, number> = {};
  let total = 0;

  for (const [lang, words] of Object.entries(STOPWORDS)) {
    const set = new Set(words);
    let hits = 0;
    for (const token of tokens) {
      if (set.has(token)) hits += 1;
    }
    scores[lang] = hits;
    total += hits;
  }

  const available = new Set(
    contentLocales()
      .map((locale) => getLanguage(locale).baseLanguage)
      .filter((base) => base in STOPWORDS),
  );

  let bestLang = 'en';
  let bestScore = -1;
  for (const lang of available) {
    const score = scores[lang] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  const confidence = total > 0 ? bestScore / total : 0;
  return { locale: BASE_LANGUAGE_DEFAULT_LOCALE[bestLang] ?? 'en-US', confidence };
}
