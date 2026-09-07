/**
 * Streaming sentence chunker — a direct port of apps/server/src/voice/chunker.ts
 * for the in-browser worker (planning/BROWSER-TUTOR.md, Slice 2 checklist #2).
 * Feed it text deltas as they arrive from the LLM stream, get back complete
 * sentences as soon as a boundary is seen, so TTS can start on sentence 1
 * before the model has finished the reply. Kept byte-for-byte identical to
 * the server version so the two pipelines chunk speech the same way.
 */

const BOUNDARY_RE = /[.!?…]+[\s]+|\n+/;

/**
 * Title abbreviations whose full stop is *not* a sentence boundary. Without
 * this the French books' commonest name — "M. Seguin" — chunked as two
 * "sentences", so TTS spoke a lone "M." and the transcript rendered it as
 * its own caption bubble (run7 H2, seen live in the audible probe).
 * Deliberately narrow: only titles and initials, never "etc." or "p.",
 * which really do end sentences often enough that splitting is the safer
 * default there.
 */
const TITLE_ABBREVIATIONS = new Set([
  'm',
  'mm',
  'mme',
  'mmes',
  'mlle',
  'mlles',
  'mr',
  'mrs',
  'ms',
  'dr',
  'drs',
  'pr',
  'prof',
  'st',
  'ste',
  'sr',
  'jr',
]);

/** True when the boundary this match found is really an abbreviation's full
 * stop (a title, or a single-letter initial like "A. Daudet") rather than
 * the end of a sentence. Only a lone "." can be one — "!", "?", "…" and
 * runs like "..." always end a sentence. */
function isAbbreviationBoundary(buffer: string, index: number, matched: string): boolean {
  if (!/^\.\s+$/.test(matched)) return false;
  const word = /(\p{L}+)$/u.exec(buffer.slice(0, index))?.[1];
  if (!word) return false;
  if (word.length === 1 && word === word.toUpperCase()) return true;
  return TITLE_ABBREVIATIONS.has(word.toLowerCase());
}

export class SentenceChunker {
  private buffer = '';

  /** Feed a text delta in; returns any complete sentences it produced. */
  push(delta: string): string[] {
    this.buffer += delta;
    const sentences: string[] = [];
    for (;;) {
      let searchFrom = 0;
      let cut = -1;
      for (;;) {
        const match = BOUNDARY_RE.exec(this.buffer.slice(searchFrom));
        if (!match) break;
        const at = searchFrom + match.index;
        if (isAbbreviationBoundary(this.buffer, at, match[0])) {
          searchFrom = at + match[0].length;
          continue;
        }
        cut = at + match[0].length;
        break;
      }
      if (cut < 0) break;
      const sentence = this.buffer.slice(0, cut).trim();
      this.buffer = this.buffer.slice(cut);
      if (sentence) sentences.push(sentence);
    }
    return sentences;
  }

  /** Call at end of stream to flush any trailing partial sentence. */
  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = '';
    return rest ? [rest] : [];
  }
}
