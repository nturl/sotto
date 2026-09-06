/**
 * BUGS-TUTOR-RUN5.md #1: forcing Whisper's `language` to the learner's
 * learning locale decodes any other spoken language as a paraphrase in that
 * locale instead of transcribing it (an English answer during a Spanish
 * book came back as Spanish). `language` must be opt-in only; the live path
 * (`transcribeWithFallback`) must leave it unset and bias decoding with a
 * `prompt` naming both locales instead of retrying a second forced decode.
 */
import { describe, expect, it, vi } from 'vitest';
import { transcribe, transcribeWithFallback } from './stt.js';

function textResponse(text: string): Response {
  return new Response(JSON.stringify({ text }), { status: 200 });
}

describe('transcribe()', () => {
  it('omits `language` by default and sends the optional prompt bias instead', async () => {
    let seenForm: FormData | null = null;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seenForm = init?.body as FormData;
      return textResponse('hi');
    }) as unknown as typeof fetch;

    await transcribe(
      new Uint8Array(10),
      16000,
      undefined,
      { url: 'http://127.0.0.1:9001/v1', fetchImpl },
      'The speaker may talk in es-419 or en.',
    );

    expect(seenForm!.has('language')).toBe(false);
    expect(seenForm!.get('prompt')).toBe('The speaker may talk in es-419 or en.');
  });

  it('still forces `language` when a caller explicitly opts in', async () => {
    let seenForm: FormData | null = null;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seenForm = init?.body as FormData;
      return textResponse('bonjour');
    }) as unknown as typeof fetch;

    await transcribe(new Uint8Array(10), 16000, 'fr-FR', {
      url: 'http://127.0.0.1:9001/v1',
      fetchImpl,
    });

    expect(seenForm!.get('language')).toBe('fr');
  });
});

describe('transcribeWithFallback()', () => {
  it('makes exactly one request, with no forced language and a prompt naming both locales', async () => {
    const calls: FormData[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init?.body as FormData);
      return textResponse('I have a question');
    }) as unknown as typeof fetch;

    const result = await transcribeWithFallback(new Uint8Array(10), 16000, 'es-419', 'en', {
      url: 'http://127.0.0.1:9001/v1',
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.has('language')).toBe(false);
    const prompt = calls[0]!.get('prompt') as string;
    expect(prompt).toContain('es-419');
    expect(prompt).toContain('en');
    expect(result.text).toBe('I have a question');
  });
});
