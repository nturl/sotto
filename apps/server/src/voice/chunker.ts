/**
 * Streaming sentence chunker: feed it text deltas as they arrive from the
 * LLM stream, get back complete sentences as soon as a boundary is seen, so
 * TTS can start on sentence 1 before the model has finished the reply.
 */

const BOUNDARY_RE = /[.!?…]+[\s]+|\n+/;

export class SentenceChunker {
  private buffer = '';

  /** Feed a text delta in; returns any complete sentences it produced. */
  push(delta: string): string[] {
    this.buffer += delta;
    const sentences: string[] = [];
    for (;;) {
      const match = BOUNDARY_RE.exec(this.buffer);
      if (!match) break;
      const cut = match.index + match[0].length;
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
