/**
 * Port of apps/server/src/voice/markers.test.ts for the browser worker's
 * copy (planning/BROWSER-TUTOR.md, Slice 2 checklist #2), plus coverage for
 * `safeReleaseIndex` (ported from apps/server/src/voice/session.ts) which
 * that server test file doesn't cover on its own.
 */
import { describe, expect, it } from 'vitest';
import {
  safeReleaseIndex,
  stripMarkers,
  stripThinking,
  stripToolBlock,
} from '../src/browser-cascade/markers.ts';

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

  it('strips a fenced ```tool block from the JSON-tool fallback protocol', () => {
    const result = stripMarkers(
      'La palabra es "cigarra".\n```tool\n{"name": "save_vocabulary", "arguments": {}}\n```\n¿Quieres que te lo repita?',
    );
    expect(result.text).toBe('La palabra es "cigarra".\n¿Quieres que te lo repita?');
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

describe('stripToolBlock', () => {
  it('removes a complete fenced tool block', () => {
    expect(stripToolBlock('Antes.\n```tool\n{"name": "x"}\n```\nDespués.')).toBe(
      'Antes.\nDespués.',
    );
  });

  it('leaves text with no tool block untouched', () => {
    expect(stripToolBlock('Hola, ¿cómo estás?')).toBe('Hola, ¿cómo estás?');
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

  it('holds back an unterminated fenced tool block', () => {
    const buf = 'La palabra es "cigarra".\n```tool\n{"name": "save_vocabulary"';
    expect(safeReleaseIndex(buf)).toBe(buf.indexOf('```tool'));
  });

  it('releases everything once the fenced tool block is closed', () => {
    const buf = '```tool\n{"name": "save_vocabulary"}\n```Listo.';
    expect(safeReleaseIndex(buf)).toBe(buf.length);
  });

  it('holds back a bare trailing "```" that might grow into the tool fence', () => {
    // The exact split observed live: "```" and "tool" arrive as separate
    // stream deltas (docs/evidence/browser-tutor-slice5-2026-09-05.log).
    const buf = 'La palabra es "cigarra". ```';
    expect(safeReleaseIndex(buf)).toBe(buf.indexOf('```'));
  });

  it('never leaks the tool fence to captions one delta at a time', () => {
    // Simulates llm-turn.ts's actual per-delta pipeline (TutorTurnRunner.run):
    // each delta is appended to the raw buffer, the safe prefix is sliced
    // out, and THAT release is what gets stripMarkers'd and shown as a
    // caption — the rest stays in the buffer for the next delta. The exact
    // split observed live: "```" and "tool" arriving as separate stream
    // deltas (docs/evidence/browser-tutor-slice5-2026-09-05.log).
    const deltas = ['Listo. ', '``', '`', 'to', 'ol\n{"name": "x"}\n', '```', ' Hecho.'];
    let buffer = '';
    let shownToLearner = '';
    for (const delta of deltas) {
      buffer += delta;
      const idx = safeReleaseIndex(buffer);
      const release = buffer.slice(0, idx);
      buffer = buffer.slice(idx);
      shownToLearner += stripMarkers(release).text;
    }
    shownToLearner += stripMarkers(buffer).text; // stream ended: flush the rest
    expect(shownToLearner).not.toContain('```tool');
    expect(shownToLearner).toBe('Listo.  Hecho.');
  });
});
