/**
 * Message-catalog hook (WS-2).
 *
 * Catalogs are flat maps with dotted keys (CONTRACTS §6). French is the
 * seeded default per DESIGN.md; `setUiCatalog` lets the app-language setting
 * switch live until WS-4 wires UserPreferences.interfaceLocale to it.
 *
 * Supports {var} interpolation and a minimal ICU plural form:
 *   "{count, plural, one {# mot} other {# mots}}"
 */
import { useSyncExternalStore } from 'react';
import en from './en.json';
import fr from './fr.json';

type Catalog = typeof en;
export type MessageKey = keyof Catalog;
export type MessageValues = Record<string, string | number>;

const catalogs: Record<string, Catalog> = { en, fr };

let currentCatalog = 'fr';
const listeners = new Set<() => void>();

export function getUiCatalog(): string {
  return currentCatalog;
}

export function setUiCatalog(catalog: string): void {
  if (!catalogs[catalog] || catalog === currentCatalog) return;
  currentCatalog = catalog;
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
  const withPlurals = message.replace(PLURAL_RE, (_match, name: string, one: string, other: string) => {
    const raw = values[name];
    const form = Number(raw) === 1 ? one : other;
    return form.replace(/#/g, String(raw ?? ''));
  });
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
