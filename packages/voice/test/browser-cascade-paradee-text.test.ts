import { describe, expect, it } from 'vitest';
import { PARADEE_MAX_PHONEMES, paradeeIds, toMisaki } from '../src/browser-cascade/paradee-text.ts';

// Inputs are what kokoro-js 1.2.1's eSpeak phonemizer actually emits for
// these sentences (captured from the worker's tokenizer hook).
describe('toMisaki', () => {
  it('respells diphthongs and drops length marks', () => {
    expect(toMisaki('ðə dˈɑːɡ ɪz ʌnhˈæpi bˌʌt lˈɔɪəl.')).toBe('ðə dˈɑɡ ɪz ʌnhˈæpi bˌʌt lˈYᵊl.');
    expect(toMisaki('wiː mˈʌst kˈiːp mˈuːvɪŋ.')).toBe('wi mˈʌst kˈip mˈuvɪŋ.');
    expect(toMisaki('ɡˈoʊ hˈoʊm')).toBe('ɡˈO hˈOm');
    expect(toMisaki('maɪ haʊs')).toBe('mI hWs');
  });

  it('writes affricates, flaps and glottal stops the misaki way', () => {
    expect(toMisaki('dʒˈʌdʒ tʃˈɜːtʃ')).toBe('ʤˈʌʤ ʧˈɜɹʧ');
    expect(toMisaki('wˈɔːɾɚ')).toBe('wˈɔTəɹ');
    expect(toMisaki('bˈʌʔn̩')).toBe('bˈʌtn');
  });

  it('marks a word-final syllabic l, but only at a word end', () => {
    expect(toMisaki('nˈeɪvəl, ')).toBe('nˈAvᵊl, ');
    expect(toMisaki('əlˈaʊ')).toBe('əlˈW');
  });

  it('keeps ɐ only where it ends a word (the article "a")', () => {
    expect(toMisaki('ɐ bˈʊk')).toBe('ɐ bˈʊk');
    expect(toMisaki('ɐbˈaʊt')).toBe('əbˈWt');
  });
});

describe('paradeeIds', () => {
  it('pads with 0 at both ends and maps through the vocabulary', () => {
    expect(paradeeIds('hi.')).toEqual([0, 50, 51, 4, 0]);
  });

  it('drops characters outside the vocabulary', () => {
    expect(paradeeIds('h$i')).toEqual([0, 50, 51, 0]);
  });

  it('caps the sequence at the model’s 512 positions', () => {
    const ids = paradeeIds('a'.repeat(PARADEE_MAX_PHONEMES + 40));
    expect(ids).toHaveLength(PARADEE_MAX_PHONEMES + 2);
    expect(ids[0]).toBe(0);
    expect(ids.at(-1)).toBe(0);
  });
});
