import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../../src/import/detect.ts';

describe('detectLanguage', () => {
  it('detects French', () => {
    const text =
      'Le petit chat noir sort de la maison et court dans le jardin avec son ami le chien. ' +
      'Il fait beau et le soleil brille sur les fleurs.';
    const result = detectLanguage(text);
    expect(result.locale).toBe('fr-FR');
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it('detects Spanish', () => {
    const text =
      'El gato pequeño sale de la casa y corre por el jardín con su amigo el perro. ' +
      'Hace un día muy bonito y el sol brilla sobre las flores.';
    const result = detectLanguage(text);
    expect(result.locale).toBe('es-419');
  });

  it('detects English', () => {
    const text =
      'The small cat goes out of the house and runs in the garden with his friend the dog. ' +
      'It is a beautiful day and the sun shines on the flowers.';
    const result = detectLanguage(text);
    expect(result.locale).toBe('en-US');
  });

  it('returns zero confidence for text with no recognizable stopwords', () => {
    const result = detectLanguage('xyzzy plugh qwfp zzzz kkkk');
    expect(result.confidence).toBe(0);
  });
});
