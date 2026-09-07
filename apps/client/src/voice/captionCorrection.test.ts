/**
 * Run 9 lane D directive 2: what STT heard is already shown as the learner
 * bubble, but Noel's run showed "you" (Whisper's silence hallucination)
 * with no way to say "that is not what I said". The newest final learner
 * caption gets a "Not what you said? Type it" affordance that prefills the
 * text fallback. Only where STT is local (browser cascade / local server) —
 * own-provider mode sends audio straight to the provider and the client
 * never sees a correctable local transcript.
 */
import { describe, expect, it } from 'vitest';
import { correctableCaptionId } from './captionCorrection';
import type { CaptionEntry } from '../state/types';

function caption(partial: Partial<CaptionEntry> & { id: string }): CaptionEntry {
  return {
    speaker: 'learner',
    text: 'you',
    final: true,
    createdAt: 0,
    ...partial,
  };
}

describe('correctableCaptionId', () => {
  it('marks the newest final learner caption on the browser cascade', () => {
    const captions = [
      caption({ id: 'a', text: 'hello' }),
      caption({ id: 'b', speaker: 'tutor', text: 'Hi there.' }),
      caption({ id: 'c', text: 'you' }),
    ];
    expect(correctableCaptionId(captions, 'browser')).toBe('c');
  });

  it('marks it on the local-server path too', () => {
    expect(correctableCaptionId([caption({ id: 'a' })], 'local')).toBe('a');
  });

  it('offers nothing in own-provider mode', () => {
    expect(correctableCaptionId([caption({ id: 'a' })], 'byok')).toBeNull();
  });

  it('offers nothing on the hosted cloud path', () => {
    expect(correctableCaptionId([caption({ id: 'a' })], 'cloud')).toBeNull();
  });

  it('offers nothing when the path is not resolved yet', () => {
    expect(correctableCaptionId([caption({ id: 'a' })], undefined)).toBeNull();
  });

  it('skips a partial caption — STT has not finished with it', () => {
    const captions = [caption({ id: 'a' }), caption({ id: 'b', final: false })];
    expect(correctableCaptionId(captions, 'browser')).toBe('a');
  });

  it('only ever marks the last learner turn, never an earlier one', () => {
    const captions = [caption({ id: 'a' }), caption({ id: 'b' })];
    expect(correctableCaptionId(captions, 'browser')).toBe('b');
  });

  it('offers nothing when the learner has not said anything yet', () => {
    expect(correctableCaptionId([caption({ id: 'a', speaker: 'tutor' })], 'browser')).toBeNull();
    expect(correctableCaptionId([], 'browser')).toBeNull();
  });
});
