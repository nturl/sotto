/**
 * @sotto/core — domain models, language defs, tokenizers, review scheduler,
 * tutor prompt builder, tool schemas, export/import, theme tokens.
 * See planning/CONTRACTS.md §1-3, §5c, §7.
 */

export const SOTTO_CORE_VERSION = '0.1.0';

export * from './languages.ts';
export * from './models.ts';
export * from './tokenize.ts';
export * from './review.ts';
export * from './tools.ts';
export * from './prompt.ts';
export * from './export.ts';

export { colors, type, radius, space, shadow, motion, theme } from './theme.ts';
export type { ColorToken, TypeRoleName, Theme } from './theme.ts';
