import { describe, expect, it } from 'vitest';
import { chunk, GLOSS_FILL_BATCH_SIZE, isLlmReachable } from '../src/gloss-fill.ts';

describe('chunk', () => {
  it('splits an array into chunks of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when the array is smaller than the chunk size', () => {
    expect(chunk([1, 2], 40)).toEqual([[1, 2]]);
  });

  it('returns an empty array for empty input', () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it('respects the documented gloss-fill batch size', () => {
    const words = Array.from({ length: 95 }, (_, i) => i);
    const chunks = chunk(words, GLOSS_FILL_BATCH_SIZE);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(GLOSS_FILL_BATCH_SIZE);
    expect(chunks.at(-1)).toHaveLength(95 - 2 * GLOSS_FILL_BATCH_SIZE);
  });
});

describe('isLlmReachable', () => {
  it('returns false quickly for a URL nothing is listening on', async () => {
    const reachable = await isLlmReachable('http://127.0.0.1:1', 300);
    expect(reachable).toBe(false);
  });
});
