import { describe, expect, it } from 'vitest';
import { stripMarkers } from './markers.js';

describe('stripMarkers', () => {
  it('strips a reading marker and extracts the token ids', () => {
    const result = stripMarkers('[[reading: b1.s1 b1.s2]] Bonjour, comment ça va ?');
    expect(result.text.trim()).toBe('Bonjour, comment ça va ?');
    expect(result.readingTokenIds).toEqual(['b1.s1', 'b1.s2']);
    expect(result.pace).toBeNull();
  });

  it('strips a pace marker and extracts the value', () => {
    const result = stripMarkers('[[pace: slow]] Écoutez bien.');
    expect(result.text.trim()).toBe('Écoutez bien.');
    expect(result.pace).toBe('slow');
    expect(result.readingTokenIds).toEqual([]);
  });

  it('strips both markers together', () => {
    const result = stripMarkers('[[reading: b1.s1]] [[pace: normal]] Le petit renard sort.');
    expect(result.text.trim()).toBe('Le petit renard sort.');
    expect(result.readingTokenIds).toEqual(['b1.s1']);
    expect(result.pace).toBe('normal');
  });

  it('leaves plain text untouched when no markers are present', () => {
    const result = stripMarkers('Just a normal sentence.');
    expect(result.text).toBe('Just a normal sentence.');
    expect(result.readingTokenIds).toEqual([]);
    expect(result.pace).toBeNull();
  });

  it('is case-insensitive on the marker keyword', () => {
    const result = stripMarkers('[[READING: b1.s1]] Bonjour.');
    expect(result.readingTokenIds).toEqual(['b1.s1']);
  });
});
