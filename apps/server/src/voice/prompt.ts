/**
 * Re-export shim. The tutor system-instruction builder moved to
 * `@sotto/core` (packages/core/src/prompt.ts) so the local-server cascade
 * and the in-browser `BrowserCascadeProvider` share one copy of the rules
 * instead of drifting apart — see planning/BROWSER-TUTOR.md. Nothing else
 * in apps/server changed: `session.ts` still imports these two names from
 * here, and `prompt.test.ts` still exercises them through this path.
 *
 * The server's zod `PassageContext` (types.ts) is structurally assignable
 * to core's `TutorPassageContext`, so callers need no conversion.
 */
export {
  buildModeChangeInstruction,
  buildSystemInstruction,
  type PromptContext,
} from '@sotto/core';
