import { describe, expect, it, vi } from 'vitest';
import { synthesizeSpeech } from './tts.js';

function pcmResponse(): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4800));
        controller.close();
      },
    }),
  );
}

describe('synthesizeSpeech request body', () => {
  it('uses a valid OpenAI voice and omits lang_code for api.openai.com', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init!.body as string);
      return pcmResponse();
    }) as unknown as typeof fetch;

    await synthesizeSpeech('Hola', 'es-419', 1, { url: 'https://api.openai.com/v1', fetchImpl }, () => {});

    expect(capturedBody).toBeDefined();
    expect(capturedBody!.voice).toBe('alloy');
    expect(capturedBody).not.toHaveProperty('lang_code');
  });

  it('uses the locale-mapped Kokoro voice + lang_code for a non-OpenAI (local) endpoint', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init!.body as string);
      return pcmResponse();
    }) as unknown as typeof fetch;

    await synthesizeSpeech(
      'Hola',
      'es-419',
      1,
      { url: 'http://127.0.0.1:8880/v1', fetchImpl },
      () => {},
    );

    expect(capturedBody).toMatchObject({ voice: 'ef_dora', lang_code: 'e' });
  });
});
