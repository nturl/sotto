/**
 * The one gate every transcript passes through before it can become a
 * learner turn (run 9 lane A). Run 8's live session showed the failure this
 * exists to stop: Whisper's stock silence hallucination ("you") reached the
 * LLM as if the learner had said it, and the tutor answered a question
 * nobody asked.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyTranscript,
  measureSegment,
  MIN_SEGMENT_MS,
  NOT_CAUGHT_CAPTION,
  SPEECH_RMS_THRESHOLD,
} from '../src/browser-cascade/transcript-gate.ts';

const SAMPLE_RATE = 16000;

/** Loud enough that the VAD would call it speech (rms ~0.28). */
const LOUD_RMS = 0.28;
/** Room tone / a very distant voice: over the silence floor, under the VAD's speech threshold. */
const QUIET_RMS = 0.012;

function ok(text: string, over: Partial<Parameters<typeof classifyTranscript>[1]> = {}) {
  return classifyTranscript(text, { durationMs: 2000, rms: LOUD_RMS, ...over });
}

function tone(seconds: number, amplitude: number): Int16Array {
  const n = Math.round(SAMPLE_RATE * seconds);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.round(Math.sin((i / SAMPLE_RATE) * 2 * Math.PI * 220) * amplitude * 32767);
  }
  return out;
}

describe('measureSegment', () => {
  it('reports the segment duration in ms', () => {
    expect(measureSegment(tone(1.5, 0.4), SAMPLE_RATE).durationMs).toBeCloseTo(1500, 0);
  });

  it('is all zeros for an empty segment', () => {
    expect(measureSegment(new Int16Array(0), SAMPLE_RATE)).toEqual({
      durationMs: 0,
      meanRms: 0,
      peakRms: 0,
    });
  });

  it('reports zero energy for digital silence', () => {
    const stats = measureSegment(new Int16Array(SAMPLE_RATE), SAMPLE_RATE);
    expect(stats.meanRms).toBe(0);
    expect(stats.peakRms).toBe(0);
  });

  it('peak RMS exceeds mean RMS when the speech is a short burst in a long segment', () => {
    // 1.8s of near-silence with 0.2s of loud speech in the middle — the
    // shape of every real utterance once the 1.2s pre-roll and the 1s
    // end-of-speech hangover are included in the segment.
    const segment = new Int16Array(SAMPLE_RATE * 2);
    segment.set(tone(0.2, 0.5), SAMPLE_RATE);
    const stats = measureSegment(segment, SAMPLE_RATE);
    expect(stats.peakRms).toBeGreaterThan(stats.meanRms * 2);
    expect(stats.peakRms).toBeGreaterThan(SPEECH_RMS_THRESHOLD);
  });

  it('peak RMS of a real utterance clears the VAD speech threshold', () => {
    expect(measureSegment(tone(1, 0.4), SAMPLE_RATE).peakRms).toBeGreaterThan(
      SPEECH_RMS_THRESHOLD,
    );
  });
});

describe('classifyTranscript — real speech passes', () => {
  it('passes an ordinary question', () => {
    expect(ok('Tell me more about the gray husky dog.').verdict).toBe('ok');
  });

  it.each(['no', 'yes', 'why', 'the dog', 'Sí', '为什么'])(
    'passes the short real answer %j at normal speech energy',
    (text) => {
      expect(ok(text).verdict).toBe('ok');
    },
  );

  it('the stock-phrase list is unconditional, even at speech energy', () => {
    // A deliberate tradeoff, pinned so it is not accidental: a learner who
    // loudly says only "okay" loses that turn to a re-ask. Whisper emits
    // these phrases on silence far more often than a learner utters one
    // alone, and the cost of the wrong call is one extra "say that again"
    // rather than a fabricated question answered as fact.
    expect(ok('okay').verdict).toBe('hallucination');
  });
});

describe('classifyTranscript — hallucinations', () => {
  it.each([
    'you',
    'You.',
    ' YOU ',
    'thank you',
    'Thank you.',
    'thanks',
    'Thanks for watching!',
    'Thank you for watching.',
    'bye',
    'Bye.',
    'okay',
    'Okay.',
    'hmm',
    'Hmm...',
    'mm',
    'uh',
    '.',
    '…',
    'Subtitles by the Amara.org community',
    '[music]',
    '(Music)',
    '[BLANK_AUDIO]',
  ])('rejects Whisper stock silence output %j', (text) => {
    expect(classifyTranscript(text, { durationMs: 2000, rms: LOUD_RMS }).verdict).toBe(
      'hallucination',
    );
  });

  it('rejects a one- or two-word transcript when the segment never reached speech energy', () => {
    expect(classifyTranscript('dog', { durationMs: 2000, rms: QUIET_RMS }).verdict).toBe(
      'hallucination',
    );
    expect(classifyTranscript('the dog', { durationMs: 2000, rms: QUIET_RMS }).verdict).toBe(
      'hallucination',
    );
  });

  it('does not reject a longer transcript purely for low energy', () => {
    // A distant-but-real sentence is still a sentence; only the short ones
    // are ambiguous enough to be worth dropping on energy alone.
    expect(
      classifyTranscript('Tell me more about the gray husky dog.', {
        durationMs: 2000,
        rms: QUIET_RMS,
      }).verdict,
    ).toBe('ok');
  });

  it('folds in the degenerate repeated-token collapse (was isDegenerateTranscript)', () => {
    expect(ok('de de de de de de').verdict).toBe('hallucination');
    expect(ok('the the the the the the the the').verdict).toBe('hallucination');
  });

  it('gives a reason naming what fired', () => {
    expect(ok('you').reason).toBeTruthy();
    expect(ok('de de de de de de').reason).toContain('degenerate');
  });
});

describe('classifyTranscript — silence and short segments', () => {
  it('rejects an empty transcript as silent', () => {
    expect(ok('').verdict).toBe('silent');
    expect(ok('   ').verdict).toBe('silent');
  });

  it('rejects any transcript from a segment with essentially no energy', () => {
    expect(
      classifyTranscript('Tell me more about the dog.', { durationMs: 2000, rms: 0.0001 }).verdict,
    ).toBe('silent');
  });

  it(`rejects a segment shorter than ${MIN_SEGMENT_MS}ms as too_short`, () => {
    expect(classifyTranscript('dog', { durationMs: 200, rms: LOUD_RMS }).verdict).toBe('too_short');
    expect(classifyTranscript('dog', { durationMs: 249, rms: LOUD_RMS }).verdict).toBe('too_short');
    expect(classifyTranscript('dog', { durationMs: 250, rms: LOUD_RMS }).verdict).toBe('ok');
  });

  it('checks duration before anything else, so a clipped press is never mislabelled', () => {
    expect(classifyTranscript('you', { durationMs: 100, rms: QUIET_RMS }).verdict).toBe(
      'too_short',
    );
  });
});

describe('the learner-facing line', () => {
  it('is a single short English sentence pair, owned by this module', () => {
    expect(NOT_CAUGHT_CAPTION).toBe("I didn't catch that. Could you say it again?");
  });
});
