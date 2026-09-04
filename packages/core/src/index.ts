/**
 * @sotto/core — domain models, language defs, tokenizers, review scheduler,
 * tutor prompt builder, tool schemas, export/import.
 *
 * WS-0 scaffold only: this package is a skeleton. WS-1 fills in the real
 * implementations described in planning/CONTRACTS.md §1-3, §5c. Placeholder
 * exports below exist only so downstream packages have something to import
 * against while the workspace comes online.
 */

export const SOTTO_CORE_VERSION = '0.1.0';

/** Placeholder — WS-1 replaces with the real LanguageDefinition (CONTRACTS §1). */
export type LanguageDefinitionPlaceholder = {
  locale: string;
  baseLanguage: string;
};

/** Placeholder — WS-1 replaces with the real domain models (CONTRACTS §3). */
export type BookPlaceholder = {
  bookId: string;
};

export { colors, type, radius, space, shadow, motion, theme } from './theme.js';
export type { ColorToken, TypeRoleName, Theme } from './theme.js';
