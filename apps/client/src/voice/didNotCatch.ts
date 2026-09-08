/**
 * The one English caption lane A's STT gate posts from the worker when it
 * rejects a segment (run 9, planning/run9/cards/A-stt-hygiene.md: "the
 * caption text lives in the gate module as a constant so lane D can map it
 * to i18n later").
 *
 * The worker has no locale — it never sees `preferences.interfaceLocale` —
 * so it cannot localize the line itself. The client recognises this exact
 * text on a tutor caption and renders `voice.didNotCatch` instead.
 *
 * Matching is deliberately forgiving about the apostrophe (a straight `'`
 * and a typographic `’` both appear in the codebase's English strings) and
 * about surrounding whitespace, but nothing else: a tutor sentence that
 * merely resembles this line stays untranslated rather than being replaced
 * with a message the tutor never sent.
 */

/** Must stay byte-identical to the constant in lane A's gate module. */
export const DID_NOT_CATCH_CAPTION = "I didn't catch that. Could you say it again?";

function normalize(text: string): string {
  return text.trim().replace(/[‘’]/g, "'");
}

const NORMALIZED = normalize(DID_NOT_CATCH_CAPTION);

export function isDidNotCatchCaption(text: string): boolean {
  return normalize(text) === NORMALIZED;
}
