/**
 * Message-catalog hook (WS-2, extended WS-6).
 *
 * Catalogs are flat maps with dotted keys (CONTRACTS §6), one JSON file per
 * UI catalog (CONTRACTS §1: en, es, fr, pt, it, zh-Hans, zh-Hant, ro, ca).
 * Loaded via Metro's `require.context` (opt-in in metro.config.js via
 * `transformer.unstable_allowRequireContext`) instead of static imports so
 * a catalog file that has not landed yet (the seven non-en/fr catalogs were
 * still being drafted by a concurrent worker when this file was written)
 * simply is not in the map at bundle time, rather than breaking the build —
 * `useT()` and `resolveCatalogCode` both fall back to `en` for any catalog
 * name that is not present.
 *
 * Supports {var} interpolation and a minimal ICU plural form:
 *   "{count, plural, one {# mot} other {# mots}}"
 */
import { useSyncExternalStore } from 'react';
import { catalogFor } from '@sotto/core';
import en from './en.json';
import { useSottoStore } from '../state/store';

type Catalog = typeof en;
export type MessageKey = keyof Catalog;
export type MessageValues = Record<string, string | number>;

// Metro's require.context (see metro.config.js) — not in the default RN/web
// require() type, so it's declared narrowly here rather than pulled in from
// @types/webpack-env (this project has no webpack dependency).
declare const require: {
  context: (
    directory: string,
    useSubdirectories: boolean,
    regExp: RegExp,
  ) => { keys(): string[]; (key: string): unknown };
};

function loadCatalogs(): Record<string, Catalog> {
  const catalogs: Record<string, Catalog> = { en };
  // require.context is unavailable outside Metro (e.g. a vitest run that
  // imports this module directly); en is still loaded as a static import
  // above, so useT()'s per-render `catalogs[name] ?? en` fallback keeps
  // that environment working with just the base catalog.
  if (typeof require === 'undefined' || typeof require.context !== 'function') return catalogs;
  const ctx = require.context('./', false, /^\.\/(en|es|fr|pt|it|zh-Hans|zh-Hant|ro|ca)\.json$/);
  for (const key of ctx.keys()) {
    const match = /^\.\/(.+)\.json$/.exec(key);
    const name = match?.[1];
    if (!name) continue;
    const mod = ctx(key) as Catalog | { default: Catalog };
    catalogs[name] =
      'default' in (mod as { default?: Catalog })
        ? (mod as { default: Catalog }).default
        : (mod as Catalog);
  }
  return catalogs;
}

const catalogs: Record<string, Catalog> = loadCatalogs();

/** Resolves either a catalog code (e.g. "es") or a full content locale
 * (e.g. "es-419", via `catalogFor` from @sotto/core) to a loaded catalog
 * name, falling back to "en" when the target isn't a known/loaded catalog. */
export function resolveCatalogCode(code: string): string {
  if (code in catalogs) return code;
  try {
    const viaLocale = catalogFor(code);
    if (viaLocale in catalogs) return viaLocale;
  } catch {
    // `code` wasn't a content locale catalogFor recognizes either.
  }
  return 'en';
}

let currentCatalog = resolveCatalogCode('fr');
const listeners = new Set<() => void>();

// Single source of truth: preferences.interfaceLocale (CONTRACTS §4/§6)
// drives the active catalog. Synced once for whatever's in the store right
// now (covers a store already hydrated before this module ran) and again
// on every change (covers hydration finishing after this module ran, and
// the app-language / onboarding screens' setPreference calls).
setUiCatalog(useSottoStore.getState().preferences.interfaceLocale);
useSottoStore.subscribe((state, prevState) => {
  if (state.preferences.interfaceLocale !== prevState.preferences.interfaceLocale) {
    setUiCatalog(state.preferences.interfaceLocale);
  }
});

export function getUiCatalog(): string {
  return currentCatalog;
}

/** Sets the active catalog. Accepts either a catalog code or a content
 * locale (resolved via `catalogFor`); unresolvable codes fall back to en. */
export function setUiCatalog(catalog: string): void {
  const resolved = resolveCatalogCode(catalog);
  if (resolved === currentCatalog) return;
  currentCatalog = resolved;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const PLURAL_RE = /\{(\w+),\s*plural,\s*one\s*\{([^{}]*)\}\s*other\s*\{([^{}]*)\}\}/g;
const VAR_RE = /\{(\w+)\}/g;

function formatMessage(message: string, values?: MessageValues): string {
  if (!values) return message;
  const withPlurals = message.replace(
    PLURAL_RE,
    (_match, name: string, one: string, other: string) => {
      const raw = values[name];
      const form = Number(raw) === 1 ? one : other;
      return form.replace(/#/g, String(raw ?? ''));
    },
  );
  return withPlurals.replace(VAR_RE, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export function useT(): (key: MessageKey, values?: MessageValues) => string {
  const catalogName = useSyncExternalStore(subscribe, getUiCatalog);
  const catalog = catalogs[catalogName] ?? en;
  return (key: MessageKey, values?: MessageValues) =>
    formatMessage(catalog[key] ?? en[key] ?? key, values);
}
