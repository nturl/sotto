/**
 * Minimal message-catalog hook. WS-2 replaces this with the full catalog
 * loader for all 9 UI locales (planning/CONTRACTS.md §6); for now it only
 * reads en.json / fr.json so the tab bar and placeholder screens compile.
 */
import en from './en.json';
import fr from './fr.json';

type Catalog = typeof en;
type MessageKey = keyof Catalog;

const catalogs: Record<string, Catalog> = { en, fr };

/** Fixed for the WS-0 scaffold; WS-2 wires this to UserPreferences.interfaceLocale. */
const DEFAULT_CATALOG = 'en';

export function useT(): (key: MessageKey) => string {
  const catalog = catalogs[DEFAULT_CATALOG] ?? en;
  return (key: MessageKey) => catalog[key] ?? en[key] ?? key;
}
