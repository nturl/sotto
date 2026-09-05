/**
 * Port of apps/server/src/voice/markers.test.ts for the browser worker's
 * copy (planning/BROWSER-TUTOR.md, Slice 2 checklist #2), plus coverage for
 * `safeReleaseIndex` (ported from apps/server/src/voice/session.ts) which
 * that server test file doesn't cover on its own.
 */
import { describe, expect, it } from 'vitest';
import { safeReleaseIndex, stripMarkers, stripThinking } from '../src/browser-cascade/markers.ts';

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

  it('strips a leaked <think> reasoning block (defense in depth against enable_thinking)', () => {
    const result = stripMarkers('<think>\nOkay, let me think about this.\n</think>Bonjour.');
    expect(result.text).toBe('Bonjour.');
  });
});

describe('stripThinking', () => {
  it('removes a complete <think> block', () => {
    expect(stripThinking('<think>reasoning here</think>Hola.')).toBe('Hola.');
  });

  it('leaves text with no think block untouched', () => {
    expect(stripThinking('Hola, ¿cómo estás?')).toBe('Hola, ¿cómo estás?');
  });
});

describe('safeReleaseIndex', () => {
  it('releases everything when there is no open marker', () => {
    expect(safeReleaseIndex('Bonjour le monde')).toBe('Bonjour le monde'.length);
  });

  it('holds back an unterminated marker', () => {
    const buf = 'Bonjour [[readi';
    expect(safeReleaseIndex(buf)).toBe(buf.indexOf('[['));
  });

  it('releases everything once the marker is closed', () => {
    const buf = 'Bonjour [[reading: b1.s1]] le monde';
    expect(safeReleaseIndex(buf)).toBe(buf.length);
  });

  it('holds back an unterminated <think> block', () => {
    const buf = 'Hola. <think>reasoning in progress';
    expect(safeReleaseIndex(buf)).toBe(buf.indexOf('<think>'));
  });

  it('releases everything once the <think> block is closed', () => {
    const buf = '<think>done</think>Hola.';
    expect(safeReleaseIndex(buf)).toBe(buf.length);
  });
});
