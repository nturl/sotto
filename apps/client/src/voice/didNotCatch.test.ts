/**
 * Run 9 lane D directive 4: lane A's STT gate posts one fixed English
 * caption from the worker when it rejects a segment (see
 * planning/run9/cards/A-stt-hygiene.md). The worker has no locale, so the
 * client recognises that exact line and renders the localized
 * `voice.didNotCatch` instead.
 */
import { describe, expect, it } from 'vitest';
import { DID_NOT_CATCH_CAPTION, isDidNotCatchCaption } from './didNotCatch';

describe('isDidNotCatchCaption', () => {
  it('recognises the constant lane A posts', () => {
    expect(isDidNotCatchCaption(DID_NOT_CATCH_CAPTION)).toBe(true);
  });

  it('ignores surrounding whitespace', () => {
    expect(isDidNotCatchCaption(`  ${DID_NOT_CATCH_CAPTION}\n`)).toBe(true);
  });

  it('matches whichever apostrophe the worker emitted', () => {
    expect(isDidNotCatchCaption('I didn’t catch that. Could you say it again?')).toBe(true);
  });

  it('leaves every other tutor line alone', () => {
    expect(isDidNotCatchCaption('The dog is unhappy but loyal.')).toBe(false);
    expect(isDidNotCatchCaption("I didn't catch that.")).toBe(false);
    expect(isDidNotCatchCaption('')).toBe(false);
  });
});
