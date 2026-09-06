/**
 * OpenAIDirectProvider (lane R4-B2): the bring-your-own-key tutor, driven
 * entirely through a mocked `fetch` so no test ever touches api.openai.com
 * or needs a key.
 *
 * What's covered: one full turn (STT -> streamed chat with a tool call ->
 * respondTool -> continuation -> TTS -> audio_end), barge-in aborting the
 * in-flight request, and the two error mappings the card names (401 ->
 * `byok_invalid_key`, not recoverable; 429 -> recoverable).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioAdapter } from '../src/transports/audio-adapter.ts';
import type { VoiceEvent } from '../src/events.ts';
import type { SessionOptions } from '../src/provider.ts';
import { OpenAIDirectProvider } from '../src/openai-direct/provider.ts';
import {
  byokError,
  OpenAIHttpError,
  pcm16ToWav,
  transcribe,
  validateOpenAIKey,
  voiceForLocale,
} from '../src/openai-direct/api.ts';

const KEY = 'test-key-not-a-real-credential';

const SESSION: SessionOptions = {
  bookId: 'es-fabulas-samaniego',
  chapterId: 'c1',
  mode: 'discuss',
  learner: { level: 'A1', learningLocale: 'es-419', explanationLocale: 'en' },
  passage: {
    chapterTitle: 'La cigarra y la hormiga',
    sentences: [
      {
        id: 'c1.s1',
        text: 'Cantando la cigarra pasó el verano entero.',
        tokenIds: ['c1.s1.t1', 'c1.s1.t2'],
        words: [
          { id: 'c1.s1.t1', text: 'Cantando' },
          { id: 'c1.s1.t2', text: 'cigarra' },
        ],
      },
    ],
    positionTokenId: 'c1.s1.t1',
  },
  savedWords: [],
};

class FakeAudio implements AudioAdapter {
  onPcm16: ((buf: ArrayBuffer) => void) | null = null;
  played: Array<{ bytes: number; sampleRate: number }> = [];
  stopPlaybackCalls = 0;
  stopCaptureCalls = 0;
  // run7/F1: optional on the real interface; left undefined unless a test
  // installs one, same as a native AudioAdapter that doesn't implement them.
  onPlaybackBlocked?: (cb: () => void) => void;
  resumePlayback?: () => Promise<void>;
  setOutputMuted?: (muted: boolean) => void;

  async startCapture(onPcm16: (buf: ArrayBuffer) => void): Promise<void> {
    this.onPcm16 = onPcm16;
  }
  stopCapture(): void {
    this.stopCaptureCalls += 1;
  }
  playPcm(buf: ArrayBuffer, sampleRate: number): void {
    this.played.push({ bytes: buf.byteLength, sampleRate });
  }
  stopPlayback(): void {
    this.stopPlaybackCalls += 1;
  }
}

/** One SSE frame per chunk, exactly as api.openai.com streams them —
 * including the `obfuscation` padding field the R4-B1 log found, which a
 * consumer must ignore. */
function sse(chunks: unknown[]): string {
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
}

function textChunk(content: string) {
  return { obfuscation: 'xxxxx', choices: [{ delta: { content } }] };
}

function toolChunk(name: string, args: string) {
  return {
    obfuscation: 'xxxxx',
    choices: [
      {
        delta: { tool_calls: [{ index: 0, id: 'call_abc', function: { name, arguments: args } }] },
      },
    ],
  };
}

function pcmResponse(samples = 2400): Response {
  // Headerless PCM16 at 24 kHz — what response_format 'pcm' returns.
  return new Response(new Int16Array(samples).buffer, {
    status: 200,
    headers: { 'content-type': 'audio/pcm' },
  });
}

describe('api helpers', () => {
  it('wraps PCM16 in a canonical 16 kHz mono WAV header', () => {
    const wav = pcm16ToWav(new Int16Array([1, -1, 2, -2]));
    const view = new DataView(wav);
    expect(String.fromCharCode(...new Uint8Array(wav, 0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...new Uint8Array(wav, 8, 4))).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(wav.byteLength).toBe(44 + 8);
  });

  it('maps 401/403 to a non-recoverable provider_rejected_setting and 429 to a recoverable one', () => {
    expect(byokError(new OpenAIHttpError(401, 'HTTP 401'))).toMatchObject({
      code: 'provider_rejected_setting',
      recoverable: false,
    });
    expect(byokError(new OpenAIHttpError(403, 'HTTP 403'))).toMatchObject({
      code: 'provider_rejected_setting',
      recoverable: false,
    });
    expect(byokError(new OpenAIHttpError(429, 'HTTP 429'))).toMatchObject({
      code: 'byok_rate_limited',
      recoverable: true,
    });
    // The opaque browser-CORS rejection a bad key produces on the inference
    // endpoints (R4-B1 phase 2) is not a readable status, so it stays
    // recoverable rather than being guessed at.
    expect(byokError(new TypeError('Failed to fetch'))).toMatchObject({
      code: 'byok_network_failed',
      recoverable: true,
    });
  });

  // run7/F1 directive 3: a 429 during speech synthesis gets its own code so
  // the caption's "not spoken" marker (provider.ts's speakSentence) pairs
  // with a message the learner can tell apart from a generic rate limit.
  it('maps a 429 during the speech stage to quota_exceeded', () => {
    expect(byokError(new OpenAIHttpError(429, 'HTTP 429'), { stage: 'speech' })).toMatchObject({
      code: 'quota_exceeded',
      recoverable: true,
    });
    // Every other stage (STT, LLM) keeps the generic code.
    expect(byokError(new OpenAIHttpError(429, 'HTTP 429'))).toMatchObject({
      code: 'byok_rate_limited',
      recoverable: true,
    });
  });

  // BUGS-TUTOR-RUN5.md #1: a forced `language` makes Whisper decode whatever
  // it hears into that locale, so English speech during a Spanish book came
  // back as a Spanish paraphrase, not English text. `language` must now be
  // opt-in only; the default (BYOK) path leaves it unset.
  it('transcribe() omits `language` by default and sends an optional prompt bias instead', async () => {
    let seenForm: FormData | null = null;
    const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      seenForm = init?.body as FormData;
      return new Response(JSON.stringify({ text: 'hi' }), { status: 200 });
    });
    await transcribe({
      apiKey: KEY,
      pcm: new Int16Array(10),
      prompt: 'The speaker may talk in es-419 or en.',
      fetch: fakeFetch as unknown as typeof fetch,
    });
    expect(seenForm!.has('language')).toBe(false);
    expect(seenForm!.get('prompt')).toBe('The speaker may talk in es-419 or en.');
  });

  it('transcribe() still forces `language` when a caller explicitly opts in', async () => {
    let seenForm: FormData | null = null;
    const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      seenForm = init?.body as FormData;
      return new Response(JSON.stringify({ text: 'hi' }), { status: 200 });
    });
    await transcribe({
      apiKey: KEY,
      pcm: new Int16Array(10),
      language: 'fr-FR',
      fetch: fakeFetch as unknown as typeof fetch,
    });
    expect(seenForm!.get('language')).toBe('fr');
  });

  it('picks one documented voice per language and falls back to alloy', () => {
    expect(voiceForLocale('es-419')).toBe('coral');
    expect(voiceForLocale('fr-FR')).toBe('ballad');
    expect(voiceForLocale('zh-Hans')).toBe('verse');
    expect(voiceForLocale('sw-KE')).toBe('alloy');
  });

  it('validates a key against GET /v1/models, the only readable 401', async () => {
    const calls: string[] = [];
    const ok = vi.fn(async (url: string) => {
      calls.push(url);
      return new Response('{"data":[]}', { status: 200 });
    });
    await expect(validateOpenAIKey(KEY, ok as unknown as typeof fetch)).resolves.toEqual({
      ok: true,
    });
    expect(calls[0]).toBe('https://api.openai.com/v1/models');

    const bad = vi.fn(
      async () =>
        new Response('{"error":{"code":"invalid_api_key"}}', {
          status: 401,
        }),
    );
    await expect(validateOpenAIKey('nope', bad as unknown as typeof fetch)).resolves.toMatchObject({
      ok: false,
      reason: 'invalid',
    });

    const limited = vi.fn(async () => new Response('', { status: 429 }));
    await expect(validateOpenAIKey(KEY, limited as unknown as typeof fetch)).resolves.toMatchObject(
      { ok: false, reason: 'rate_limited' },
    );
  });
});

describe('OpenAIDirectProvider', () => {
  let audio: FakeAudio;
  let events: VoiceEvent[];
  let diagnostics: string[];

  beforeEach(() => {
    audio = new FakeAudio();
    events = [];
    diagnostics = [];
    vi.spyOn(console, 'info').mockImplementation((msg?: unknown) => {
      diagnostics.push(String(msg));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function collect(provider: OpenAIDirectProvider): void {
    provider.on((e) => events.push(e));
  }

  it('runs one full turn: STT -> streamed tool call -> respondTool -> continuation -> TTS', async () => {
    const hosts: string[] = [];
    const chatBodies: string[] = [];
    let chatCalls = 0;

    const fakeFetch = vi.fn(async (input: string, init?: RequestInit) => {
      hosts.push(new URL(input).host);
      if (input.endsWith('/audio/transcriptions')) {
        expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
        // BUGS-TUTOR-RUN5.md #1: forcing `language` to the learning locale
        // decodes any other spoken language as a paraphrase in that locale
        // instead of transcribing it. Whisper must be left to auto-detect;
        // the two locales in play go in `prompt` as a soft bias only.
        const form = init?.body as FormData;
        expect(form.has('language')).toBe(false);
        const prompt = form.get('prompt');
        expect(prompt).toContain(SESSION.learner.learningLocale);
        expect(prompt).toContain(SESSION.learner.explanationLocale);
        return new Response(JSON.stringify({ text: '¿Qué significa cigarra?' }), { status: 200 });
      }
      if (input.endsWith('/chat/completions')) {
        chatCalls += 1;
        chatBodies.push(String(init?.body));
        if (chatCalls === 1) {
          // run7/G directive 1(c): connect() fires one opening turn before
          // the learner has said anything — an unremarkable reply so it
          // doesn't interfere with the scripted STT round trip below.
          return new Response(sse([textChunk('¡Bienvenido! ')]), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        if (chatCalls === 2) {
          return new Response(
            sse([
              textChunk('Buena pregunta. '),
              toolChunk('save_vocabulary', '{"tokenId":"c1.s1.t2","word":"cigarra"}'),
            ]),
            { status: 200, headers: { 'content-type': 'text/event-stream' } },
          );
        }
        return new Response(sse([textChunk('Lo guardé. Significa "cicada". ')]), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      if (input.endsWith('/audio/speech')) return pcmResponse();
      throw new Error(`unexpected request to ${input}`);
    });

    const provider = new OpenAIDirectProvider({
      apiKey: KEY,
      audio,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    collect(provider);
    provider.on((e) => {
      if (e.type === 'tool_call') {
        provider.respondTool(e.callId, { ok: true, savedWordId: 'w1' });
      }
    });

    await provider.connect(SESSION);
    expect(events.map((e) => (e.type === 'state' ? e.state : null))).toContain('listening');

    // Push-to-talk drives STT without depending on VAD thresholds.
    provider.pushToTalk(true);
    audio.onPcm16!(new Int16Array(3200).buffer); // 200 ms of silence-shaped PCM
    provider.pushToTalk(false);

    await vi.waitFor(() => {
      expect(diagnostics.some((d) => d.startsWith('[sotto-byok] audio_end'))).toBe(true);
    });

    // Every request went to api.openai.com and nowhere else.
    expect([...new Set(hosts)]).toEqual(['api.openai.com']);

    const captions = events.filter((e) => e.type === 'caption');
    expect(captions.some((c) => c.speaker === 'learner' && c.text.includes('cigarra'))).toBe(true);
    expect(captions.some((c) => c.speaker === 'tutor' && c.text.includes('Buena pregunta'))).toBe(
      true,
    );
    expect(captions.some((c) => c.speaker === 'tutor' && c.text.includes('Lo guardé'))).toBe(true);

    // The tool round trip actually reached the model: the third request
    // (after the automatic opening turn) carries the assistant tool_call
    // and our tool result.
    expect(chatCalls).toBe(3);
    expect(chatBodies[2]).toContain('"role":"tool"');
    expect(chatBodies[2]).toContain('savedWordId');
    // The turn's own tool definitions went out on the first request.
    expect(chatBodies[0]).toContain('save_vocabulary');

    // Speech played back at the hardcoded 24 kHz (the pcm response carries
    // no rate information at all — R4-B1 phase 2, fact 2).
    expect(audio.played.length).toBeGreaterThan(0);
    expect(audio.played.every((p) => p.sampleRate === 24000)).toBe(true);

    const states = events.filter((e) => e.type === 'state').map((e) => e.state);
    expect(states).toContain('thinking');
    expect(states).toContain('speaking');
    expect(states[states.length - 1]).toBe('listening');

    await provider.disconnect();
  });

  it('interrupt aborts the in-flight chat request and stops playback', async () => {
    let seenSignal: AbortSignal | null = null;
    const fakeFetch = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith('/chat/completions')) {
        seenSignal = init?.signal ?? null;
        // Never resolves on its own; only the abort ends it, exactly as a
        // real streaming fetch behaves under barge-in.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      throw new Error(`unexpected request to ${input}`);
    });

    const provider = new OpenAIDirectProvider({
      apiKey: KEY,
      audio,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    collect(provider);
    await provider.connect(SESSION);

    provider.sendText('hola');
    await vi.waitFor(() => expect(seenSignal).not.toBeNull());
    expect(seenSignal!.aborted).toBe(false);

    provider.interrupt();
    expect(seenSignal!.aborted).toBe(true);
    expect(audio.stopPlaybackCalls).toBeGreaterThan(0);
    // An aborted turn is not an error the learner has to see.
    expect(events.filter((e) => e.type === 'error')).toHaveLength(0);

    await provider.disconnect();
  });

  it('reports a 401 as provider_rejected_setting and does not keep listening', async () => {
    const fakeFetch = vi.fn(
      async () => new Response('{"error":{"message":"bad key"}}', { status: 401 }),
    );
    const provider = new OpenAIDirectProvider({
      apiKey: KEY,
      audio,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    collect(provider);
    await provider.connect(SESSION);

    provider.sendText('hola');
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'error')).toBe(true);
    });
    const error = events.find((e) => e.type === 'error')!;
    expect(error).toMatchObject({ code: 'provider_rejected_setting', recoverable: false });
    const states = events.filter((e) => e.type === 'state').map((e) => e.state);
    expect(states[states.length - 1]).toBe('error');

    await provider.disconnect();
  });

  // run7/F1 directive 1 — the failing-test-first case this lane's recon
  // named as the smoking gun (scout-T-tutor.md §2A): a transient TTS
  // failure (a 429, a network blip, any non-401/403 status) used to be
  // swallowed to a console-only diagnostic while the caption still fired
  // unconditionally, so the learner saw the tutor's reply as text with no
  // signal that nothing was spoken. Every speech failure must now emit an
  // `error` VoiceEvent, and the paired caption must carry `notSpoken: true`.
  it('a transient TTS failure emits an error event and marks the caption not-spoken', async () => {
    const fakeFetch = vi.fn(async (input: string) => {
      if (input.endsWith('/chat/completions')) {
        return new Response(sse([textChunk('Buena pregunta.')]), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      if (input.endsWith('/audio/speech')) {
        // A transient failure: not 401/403, so previously swallowed.
        return new Response('{"error":{"message":"server hiccup"}}', { status: 500 });
      }
      throw new Error(`unexpected request to ${input}`);
    });

    const provider = new OpenAIDirectProvider({
      apiKey: KEY,
      audio,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    collect(provider);
    await provider.connect(SESSION);

    provider.sendText('hola');
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'caption' && e.speaker === 'tutor')).toBe(true);
    });

    const error = events.find((e) => e.type === 'error');
    expect(error).toBeDefined();
    expect(error).toMatchObject({ code: 'byok_request_failed', recoverable: true });

    const tutorCaption = events.find((e) => e.type === 'caption' && e.speaker === 'tutor');
    expect(tutorCaption).toMatchObject({ text: 'Buena pregunta.', notSpoken: true });

    // Nothing was ever handed to the audio adapter for this sentence.
    expect(audio.played).toHaveLength(0);
    // The session stays alive — a failed sentence degrades to caption-only.
    const states = events.filter((e) => e.type === 'state').map((e) => e.state);
    expect(states[states.length - 1]).toBe('listening');

    await provider.disconnect();
  });

  it('reports a 429 during speech synthesis as quota_exceeded, not byok_rate_limited', async () => {
    const fakeFetch = vi.fn(async (input: string) => {
      if (input.endsWith('/chat/completions')) {
        return new Response(sse([textChunk('Hola.')]), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      if (input.endsWith('/audio/speech')) return new Response('{"error":{}}', { status: 429 });
      throw new Error(`unexpected request to ${input}`);
    });
    const provider = new OpenAIDirectProvider({
      apiKey: KEY,
      audio,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    collect(provider);
    await provider.connect(SESSION);

    provider.sendText('hola');
    await vi.waitFor(() => expect(events.some((e) => e.type === 'error')).toBe(true));
    expect(events.find((e) => e.type === 'error')).toMatchObject({
      code: 'quota_exceeded',
      recoverable: true,
    });

    await provider.disconnect();
  });

  // run7/F1 directive 5: mic permission denied vs. no microphone hardware
  // at all now get distinct codes instead of the single mic_unavailable
  // catch-all (packages/voice/src/mic-error.ts).
  it('classifies a denied mic permission as mic_denied', async () => {
    const denied = new FakeAudio();
    denied.startCapture = async () => {
      const err = new Error('denied');
      err.name = 'NotAllowedError';
      throw err;
    };
    const provider = new OpenAIDirectProvider({ apiKey: KEY, audio: denied });
    collect(provider);
    await provider.connect(SESSION);
    expect(events.find((e) => e.type === 'error')).toMatchObject({
      code: 'mic_denied',
      recoverable: false,
    });
  });

  it('classifies no microphone hardware as no_input_device', async () => {
    const noDevice = new FakeAudio();
    noDevice.startCapture = async () => {
      const err = new Error('nothing found');
      err.name = 'NotFoundError';
      throw err;
    };
    const provider = new OpenAIDirectProvider({ apiKey: KEY, audio: noDevice });
    collect(provider);
    await provider.connect(SESSION);
    expect(events.find((e) => e.type === 'error')).toMatchObject({
      code: 'no_input_device',
      recoverable: false,
    });
  });

  // run7/F1 directive 2: a blocked playback context now surfaces as a
  // recoverable `playback_blocked` error, and `resumePlayback()` is wired
  // through to the adapter's own resume action.
  it('surfaces a blocked AudioContext as playback_blocked and wires resumePlayback()', async () => {
    let blockedCb: (() => void) | null = null;
    let resumeCalls = 0;
    const blockableAudio = new FakeAudio();
    blockableAudio.onPlaybackBlocked = (cb: () => void) => {
      blockedCb = cb;
    };
    blockableAudio.resumePlayback = async () => {
      resumeCalls += 1;
    };

    const provider = new OpenAIDirectProvider({ apiKey: KEY, audio: blockableAudio });
    collect(provider);
    await provider.connect(SESSION);

    expect(blockedCb).not.toBeNull();
    blockedCb!();
    expect(events.find((e) => e.type === 'error')).toMatchObject({
      code: 'playback_blocked',
      recoverable: true,
    });

    provider.resumePlayback!();
    expect(resumeCalls).toBe(1);

    await provider.disconnect();
  });

  it('reports a 429 as a recoverable byok_rate_limited and stays listening', async () => {
    const fakeFetch = vi.fn(async () => new Response('{"error":{}}', { status: 429 }));
    const provider = new OpenAIDirectProvider({
      apiKey: KEY,
      audio,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    collect(provider);
    await provider.connect(SESSION);

    provider.sendText('hola');
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'error')).toBe(true);
    });
    expect(events.find((e) => e.type === 'error')).toMatchObject({
      code: 'byok_rate_limited',
      recoverable: true,
    });
    const states = events.filter((e) => e.type === 'state').map((e) => e.state);
    expect(states[states.length - 1]).toBe('listening');

    await provider.disconnect();
  });

  // run7/G directive 1(c): one grounded invitation before the learner has
  // said anything.
  it('connect() runs an automatic opening turn with no learner caption', async () => {
    let chatCalls = 0;
    const fakeFetch = vi.fn(async (input: string) => {
      if (input.endsWith('/chat/completions')) {
        chatCalls += 1;
        return new Response(sse([textChunk('¡Bienvenido a la fábula! ')]), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      if (input.endsWith('/audio/speech')) return pcmResponse();
      throw new Error(`unexpected request to ${input}`);
    });

    const provider = new OpenAIDirectProvider({
      apiKey: KEY,
      audio,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    collect(provider);
    await provider.connect(SESSION);

    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'caption')).toBe(true);
    });

    expect(chatCalls).toBe(1);
    const captions = events.filter((e) => e.type === 'caption');
    expect(captions.length).toBeGreaterThan(0);
    expect(captions.some((c) => c.text.includes('¡Bienvenido'))).toBe(true);
    // No synthetic learner turn — the transcript's only entries are the
    // tutor's (a per-sentence caption plus the aggregated final one, same
    // as any other turn — see the "runs one full turn" test above).
    expect(captions.every((c) => c.speaker === 'tutor')).toBe(true);
    expect(audio.played.length).toBeGreaterThan(0);

    await provider.disconnect();
  });

  // run7/G directive 1(d): the prompt's "Book:" line uses the real title
  // when SessionOptions carries one, falling back to the id otherwise.
  it('sends the real book title in the system instruction when present', async () => {
    let systemContent = '';
    const fakeFetch = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith('/chat/completions')) {
        const body = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        systemContent = body.messages.find((m) => m.role === 'system')?.content ?? '';
        return new Response(sse([textChunk('Hola. ')]), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      if (input.endsWith('/audio/speech')) return pcmResponse();
      throw new Error(`unexpected request to ${input}`);
    });

    const provider = new OpenAIDirectProvider({
      apiKey: KEY,
      audio,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    collect(provider);
    await provider.connect({ ...SESSION, bookTitle: 'La cigarra y la hormiga (fábula)' });

    await vi.waitFor(() => {
      expect(systemContent).toContain('Book:');
    });
    expect(systemContent).toContain('Book: La cigarra y la hormiga (fábula)');
    expect(systemContent).not.toContain(`Book: ${SESSION.bookId}`);

    await provider.disconnect();
  });

  // run7/G directive 1(a): the speaker/output toggle.
  it('setOutputMuted delegates to the audio adapter', async () => {
    const fakeFetch = vi.fn(async (input: string) => {
      if (input.endsWith('/chat/completions')) {
        return new Response(sse([textChunk('Hola. ')]), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      if (input.endsWith('/audio/speech')) return pcmResponse();
      throw new Error(`unexpected request to ${input}`);
    });
    const provider = new OpenAIDirectProvider({
      apiKey: KEY,
      audio,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    const calls: boolean[] = [];
    audio.setOutputMuted = (muted: boolean) => calls.push(muted);
    collect(provider);
    await provider.connect(SESSION);

    provider.setOutputMuted(true);
    provider.setOutputMuted(false);

    expect(calls).toEqual([true, false]);
    await provider.disconnect();
  });

  // run7/G directive 1(b): the Replay action on a `notSpoken` transcript turn.
  it('replaySentence() re-synthesizes and plays the given text without a new caption', async () => {
    const speechRequests: string[] = [];
    const fakeFetch = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith('/chat/completions')) {
        return new Response(sse([textChunk('Hola. ')]), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      if (input.endsWith('/audio/speech')) {
        const body = JSON.parse(String(init?.body)) as { input: string };
        speechRequests.push(body.input);
        return pcmResponse();
      }
      throw new Error(`unexpected request to ${input}`);
    });
    const provider = new OpenAIDirectProvider({
      apiKey: KEY,
      audio,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    collect(provider);
    await provider.connect(SESSION);
    await vi.waitFor(() => expect(audio.played.length).toBeGreaterThan(0));
    const captionsBefore = events.filter((e) => e.type === 'caption').length;
    const playedBefore = audio.played.length;

    provider.replaySentence('La cigarra cantó todo el verano.');

    await vi.waitFor(() => {
      expect(audio.played.length).toBeGreaterThan(playedBefore);
    });
    expect(speechRequests).toContain('La cigarra cantó todo el verano.');
    // No caption re-emitted — the text is already in the transcript.
    expect(events.filter((e) => e.type === 'caption').length).toBe(captionsBefore);

    await provider.disconnect();
  });
});
