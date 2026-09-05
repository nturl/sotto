/**
 * A1 fast-path defaults (OVERNIGHT-2.md Lane A): detects the browser's
 * language on web (expo-localization is not installed, so native/non-web
 * environments and any detection failure fall back to `en`), then proposes
 * an interface language, a learning language, and an explanation language
 * without asking the learner anything.
 */

/** The nine shipped UI message catalogs (CONTRACTS §1 / src/i18n/*.json). */
const APP_CATALOGS = ['en', 'es', 'fr', 'pt', 'it', 'zh-Hans', 'zh-Hant', 'ro', 'ca'] as const;
export type AppCatalog = (typeof APP_CATALOGS)[number];

function isAppCatalog(code: string): code is AppCatalog {
  return (APP_CATALOGS as readonly string[]).includes(code);
}

/** Maps one BCP-47 browser tag (e.g. "fr-CA", "zh-Hant-TW", "pt") onto a
 * loaded UI catalog code, or null if it doesn't match any of the nine. */
function mapTagToCatalog(tag: string): AppCatalog | null {
  const lower = tag.toLowerCase();
  if (lower.startsWith('zh')) {
    return lower.includes('hant') ||
      lower.includes('-tw') ||
      lower.includes('-hk') ||
      lower.includes('-mo')
      ? 'zh-Hant'
      : 'zh-Hans';
  }
  const primary = lower.split('-')[0] ?? lower;
  return isAppCatalog(primary) ? primary : null;
}

/** `navigator.languages`/`navigator.language` on web; `en` everywhere else
 * (native has no `navigator`, and expo-localization is intentionally not a
 * dependency here). */
export function detectBrowserLanguage(): AppCatalog {
  const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } })
    .navigator;
  const candidates = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
  for (const tag of candidates) {
    const mapped = mapTagToCatalog(tag);
    if (mapped) return mapped;
  }
  return 'en';
}

export type FastPathDefaults = {
  interfaceLocale: AppCatalog;
  explanationLocale: AppCatalog;
  /** A content locale from packages/content/packs (CONTRACTS §2b), not a
   * catalog code — this is what `preferences.learningLocale` expects. */
  learningLocale: 'fr-FR' | 'es-419';
  level: 'A1';
};

/** French by default; Spanish when the detected interface language is
 * French itself (OVERNIGHT-2.md A1: "learning language = French if the
 * detected language is not French else Spanish"). Explanation mirrors the
 * interface language. */
export function fastPathDefaultsFor(interfaceLocale: AppCatalog): FastPathDefaults {
  return {
    interfaceLocale,
    explanationLocale: interfaceLocale,
    learningLocale: interfaceLocale === 'fr' ? 'es-419' : 'fr-FR',
    level: 'A1',
  };
}
