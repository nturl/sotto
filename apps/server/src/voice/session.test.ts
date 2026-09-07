import { describe, expect, it, vi } from 'vitest';
import { VoiceSession, type Logger } from './session.js';
import type { Vad, VadEvent } from './vad.js';
import type { ServerMessage, SessionOptions } from './types.js';

// ---- Test doubles ----

/** A Vad whose speech_start/speech_end events are scripted per call to
 * `process()`, so tests can drive the session state machine deterministically
 * without simulating real audio energy/timing. */
class ScriptedVad implements Vad {
  readonly backend = 'energy' as const;
  private readonly queue: VadEvent[][] = [];

  push(events: VadEvent[]): void {
    this.queue.push(events);
  }
  process(): VadEvent[] {
    return this.queue.shift() ?? [];
  }
  reset(): void {}
}

const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

function sseChunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function sseStream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(sseChunk(e)));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

function textDelta(content: string): unknown {
  return { choices: [{ delta: { content } }] };
}

function pcmStream(byteLength: number): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(byteLength).fill(7));
      controller.close();
    },
  });
}

/** A PCM stream whose controller stays open until the caller closes it, or
 * errors itself when the given AbortSignal fires — for barge-in tests that
 * need to catch TTS mid-flight. */
function controllablePcmStream(signal?: AbortSignal): {
  stream: ReadableStream<Uint8Array>;
  close: () => void;
} {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  signal?.addEventListener('abort', () => {
    try {
      ctrl.error(new DOMException('The operation was aborted', 'AbortError'));
    } catch {
      // already closed/errored
    }
  });
  return {
    stream,
    close: () => {
      try {
        ctrl.close();
      } catch {
        // already closed/errored (e.g. by the abort listener above)
      }
    },
  };
}

function makeFetch(handlers: {
  stt?: () => Response;
  llm?: () => Response;
  tts?: (init?: RequestInit) => Response;
}): typeof fetch {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/audio/transcriptions')) return handlers.stt!();
    if (url.includes('/chat/completions')) return handlers.llm!();
    if (url.includes('/audio/speech')) return handlers.tts!(init);
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

const SESSION_OPTIONS: SessionOptions = {
  bookId: 'fr-petit-chaperon-rouge',
  chapterId: 'ch1',
  mode: 'read_to_me',
  learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en' },
  passage: {
    chapterTitle: 'Chapitre 1',
    sentences: [
      {
        id: 'b1.s1',
        text: 'Bonjour.',
        tokenIds: ['b1.s1.t1'],
        words: [{ id: 'b1.s1.t1', text: 'Bonjour' }],
      },
    ],
    positionTokenId: 'b1.s1.t1',
  },
  savedWords: [],
};

function makeSession(vad: Vad, fetchImpl: typeof fetch) {
  const sent: ServerMessage[] = [];
  const audioChunks: Uint8Array[] = [];
  const endedReasons: string[] = [];

  const session = new VoiceSession(
    'sess-1',
    SESSION_OPTIONS,
    {
      stt: { url: 'http://stt/v1', fetchImpl },
      llm: { url: 'http://llm/v1', model: 'test-model', fetchImpl },
      tts: { url: 'http://tts/v1', fetchImpl },
      limits: { maxMs: 1_200_000, idleMs: 90_000 },
    },
    vad,
    (msg) => sent.push(msg),
    (chunk) => audioChunks.push(chunk),
    silentLogger,
    (reason) => endedReasons.push(reason),
  );

  return { session, sent, audioChunks, endedReasons };
}

async function flushMicrotasks(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('VoiceSession', () => {
  it('starts in listening state on construction', () => {
    const vad = new ScriptedVad();
    const { session, sent } = makeSession(vad, makeFetch({}));
    expect(session.getState()).toBe('listening');
    expect(sent[0]).toEqual({ t: 'state', state: 'listening' });
  });

  // R-adversarial finding 9: nothing on the local path ever asked the LLM
  // for a turn before the learner spoke, even though prompt.ts's system
  // instruction has told it to "open the session with exactly one short
  // spoken sentence" since run7. Construction alone must stay silent
  // (`beginOpeningTurn` is a separate, explicit call — app.ts's websocket
  // handler makes it right after constructing the session) so this must
  // not fire on its own.
  it('does not speak on construction alone', () => {
    const vad = new ScriptedVad();
    const { sent } = makeSession(vad, makeFetch({}));
    expect(sent).toEqual([{ t: 'state', state: 'listening' }]);
  });

  it('beginOpeningTurn speaks the invitation and appears in the transcript', async () => {
    const vad = new ScriptedVad();
    const fetchImpl = makeFetch({
      llm: () => new Response(sseStream([textDelta('Bienvenue dans la forêt.')]), { status: 200 }),
      tts: () => new Response(pcmStream(4800), { status: 200 }),
    });
    const { session, sent, audioChunks } = makeSession(vad, fetchImpl);

    session.beginOpeningTurn();
    await flushMicrotasks();

    expect(sent).toContainEqual({
      t: 'caption',
      speaker: 'tutor',
      text: 'Bienvenue dans la forêt.',
      final: true,
    });
    expect(sent.some((m) => m.t === 'audio_start')).toBe(true);
    expect(audioChunks.length).toBeGreaterThan(0);
    // No learner turn was ever pushed for this — the opening call must
    // never invent a "learner" caption or a fake history entry.
    expect(sent.some((m) => m.t === 'caption' && m.speaker === 'learner')).toBe(false);
    expect(session.getState()).toBe('listening');
  });

  it('runs a full learner segment through STT -> LLM -> TTS and returns to listening', async () => {
    const vad = new ScriptedVad();
    vad.push([{ type: 'speech_start' }]);
    vad.push([{ type: 'speech_end' }]);

    const fetchImpl = makeFetch({
      stt: () => new Response(JSON.stringify({ text: 'Bonjour' }), { status: 200 }),
      llm: () => new Response(sseStream([textDelta('Salut'), textDelta(' !')]), { status: 200 }),
      tts: () => new Response(pcmStream(4800), { status: 200 }),
    });

    const { session, sent, audioChunks } = makeSession(vad, fetchImpl);

    await session.receiveAudioFrame(new Uint8Array(320));
    await session.receiveAudioFrame(new Uint8Array(320));
    await flushMicrotasks();

    expect(sent).toContainEqual({ t: 'caption', speaker: 'learner', text: 'Bonjour', final: true });
    expect(sent).toContainEqual({ t: 'caption', speaker: 'tutor', text: 'Salut !', final: true });
    expect(sent.some((m) => m.t === 'audio_start')).toBe(true);
    expect(sent.some((m) => m.t === 'audio_end' && !m.cancelled)).toBe(true);
    expect(audioChunks.length).toBeGreaterThan(0);
    expect(session.getState()).toBe('listening');
  });

  // R-adversarial finding 9: on the local path (the only path this Mac can
  // drive), the tutor was told the book's title was its id, e.g.
  // "fr-chevre-de-m-seguin" — `sessionOptionsSchema` (types.ts) never
  // declared `bookTitle`, so zod silently stripped it from every request
  // even though the client has sent the real title since run7/G.
  it("tells the LLM the book's real title, not its id, when the client sends one", async () => {
    const vad = new ScriptedVad();
    vad.push([{ type: 'speech_start' }]);
    vad.push([{ type: 'speech_end' }]);

    let llmRequestBody: string | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/audio/transcriptions')) {
        return new Response(JSON.stringify({ text: 'Bonjour' }), { status: 200 });
      }
      if (url.includes('/chat/completions')) {
        llmRequestBody = init?.body as string;
        return new Response(sseStream([textDelta('Salut !')]), { status: 200 });
      }
      if (url.includes('/audio/speech')) return new Response(pcmStream(4800), { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const sent: ServerMessage[] = [];
    const session = new VoiceSession(
      'sess-title',
      { ...SESSION_OPTIONS, bookId: 'fr-chevre-de-m-seguin', bookTitle: 'La Chèvre de M. Seguin' },
      {
        stt: { url: 'http://stt/v1', fetchImpl },
        llm: { url: 'http://llm/v1', model: 'test-model', fetchImpl },
        tts: { url: 'http://tts/v1', fetchImpl },
        limits: { maxMs: 1_200_000, idleMs: 90_000 },
      },
      vad,
      (msg) => sent.push(msg),
      () => {},
      silentLogger,
      () => {},
    );

    await session.receiveAudioFrame(new Uint8Array(320));
    await session.receiveAudioFrame(new Uint8Array(320));
    await flushMicrotasks();

    expect(llmRequestBody).toBeDefined();
    expect(llmRequestBody).toContain('La Chèvre de M. Seguin');
    expect(llmRequestBody).not.toContain('fr-chevre-de-m-seguin');
  });

  it('falls back to the book id when the client sends no bookTitle', async () => {
    const vad = new ScriptedVad();
    vad.push([{ type: 'speech_start' }]);
    vad.push([{ type: 'speech_end' }]);

    let llmRequestBody: string | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/audio/transcriptions')) {
        return new Response(JSON.stringify({ text: 'Bonjour' }), { status: 200 });
      }
      if (url.includes('/chat/completions')) {
        llmRequestBody = init?.body as string;
        return new Response(sseStream([textDelta('Salut !')]), { status: 200 });
      }
      if (url.includes('/audio/speech')) return new Response(pcmStream(4800), { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const session = new VoiceSession(
      'sess-no-title',
      { ...SESSION_OPTIONS, bookId: 'fr-chevre-de-m-seguin' },
      {
        stt: { url: 'http://stt/v1', fetchImpl },
        llm: { url: 'http://llm/v1', model: 'test-model', fetchImpl },
        tts: { url: 'http://tts/v1', fetchImpl },
        limits: { maxMs: 1_200_000, idleMs: 90_000 },
      },
      vad,
      () => {},
      () => {},
      silentLogger,
      () => {},
    );

    await session.receiveAudioFrame(new Uint8Array(320));
    await session.receiveAudioFrame(new Uint8Array(320));
    await flushMicrotasks();

    expect(llmRequestBody).toBeDefined();
    expect(llmRequestBody).toContain('fr-chevre-de-m-seguin');
  });

  it('barge-in: cancels in-flight TTS and sends audio_end cancelled:true, returning to listening', async () => {
    const vad = new ScriptedVad();
    vad.push([{ type: 'speech_start' }]); // learner's first utterance
    vad.push([{ type: 'speech_end' }]);
    vad.push([{ type: 'speech_start' }]); // the interrupting utterance

    const ttsCtrlBox: {
      current: { stream: ReadableStream<Uint8Array>; close: () => void } | null;
    } = { current: null };
    const fetchImpl = makeFetch({
      stt: () => new Response(JSON.stringify({ text: 'Lis-moi une phrase' }), { status: 200 }),
      llm: () =>
        new Response(sseStream([textDelta('Une longue phrase de lecture.')]), { status: 200 }),
      tts: (init) => {
        ttsCtrlBox.current = controllablePcmStream(init?.signal ?? undefined);
        return new Response(ttsCtrlBox.current.stream, { status: 200 });
      },
    });

    const { session, sent } = makeSession(vad, fetchImpl);

    await session.receiveAudioFrame(new Uint8Array(320));
    await session.receiveAudioFrame(new Uint8Array(320));

    // Wait until TTS has started streaming (audio_start sent) but is stalled
    // on the controllable stream, i.e. the tutor is genuinely "speaking".
    for (let i = 0; i < 50 && !sent.some((m) => m.t === 'audio_start'); i++) {
      await flushMicrotasks(1);
    }
    expect(sent.some((m) => m.t === 'audio_start')).toBe(true);
    expect(session.getState()).toBe('speaking');

    // Learner starts talking again mid-utterance -> barge-in.
    await session.receiveAudioFrame(new Uint8Array(320));

    const cancelledEnd = sent.find((m) => m.t === 'audio_end' && m.cancelled);
    expect(cancelledEnd).toBeDefined();
    expect(session.getState()).toBe('listening');

    ttsCtrlBox.current?.close();
    await flushMicrotasks();
  });

  it('relays a tool_call and blocks the next LLM call until tool_result arrives', async () => {
    const vad = new ScriptedVad();
    vad.push([{ type: 'speech_start' }]);
    vad.push([{ type: 'speech_end' }]);

    let llmCallCount = 0;
    const fetchImpl = makeFetch({
      stt: () => new Response(JSON.stringify({ text: 'Enregistre ce mot' }), { status: 200 }),
      llm: () => {
        llmCallCount++;
        if (llmCallCount === 1) {
          return new Response(
            sseStream([
              {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: 'call_1',
                          function: { name: 'save_vocabulary', arguments: '' },
                        },
                      ],
                    },
                  },
                ],
              },
              {
                choices: [
                  {
                    delta: {
                      tool_calls: [{ index: 0, function: { arguments: '{"tokenId":"b1.s1.t1"}' } }],
                    },
                  },
                ],
              },
            ]),
            { status: 200 },
          );
        }
        return new Response(sseStream([textDelta("C'est fait !")]), { status: 200 });
      },
      tts: () => new Response(pcmStream(100), { status: 200 }),
    });

    const { session, sent } = makeSession(vad, fetchImpl);

    await session.receiveAudioFrame(new Uint8Array(320));
    await session.receiveAudioFrame(new Uint8Array(320));

    for (let i = 0; i < 50 && !sent.some((m) => m.t === 'tool_call'); i++) {
      await flushMicrotasks(1);
    }
    const toolCallMsg = sent.find(
      (m): m is Extract<ServerMessage, { t: 'tool_call' }> => m.t === 'tool_call',
    );
    expect(toolCallMsg).toBeDefined();
    expect(toolCallMsg!.name).toBe('save_vocabulary');
    expect(toolCallMsg!.args).toEqual({ tokenId: 'b1.s1.t1' });

    // The server never fabricates a result: the second LLM call must not
    // have happened yet — it is blocked waiting on tool_result.
    expect(llmCallCount).toBe(1);

    await session.receiveMessage({
      t: 'tool_result',
      callId: toolCallMsg!.callId,
      ok: true,
      result: { savedWordId: 'sw1' },
    });

    for (let i = 0; i < 50 && llmCallCount < 2; i++) {
      await flushMicrotasks(1);
    }
    expect(llmCallCount).toBe(2);

    for (
      let i = 0;
      i < 50 && !sent.some((m) => m.t === 'caption' && m.speaker === 'tutor' && m.final);
      i++
    ) {
      await flushMicrotasks(1);
    }
    expect(sent).toContainEqual({
      t: 'caption',
      speaker: 'tutor',
      text: "C'est fait !",
      final: true,
    });
    expect(session.getState()).toBe('listening');
  });

  it('mute suppresses audio frames from reaching the VAD', async () => {
    const vad = new ScriptedVad();
    vad.push([{ type: 'speech_start' }]);

    const { session, sent } = makeSession(vad, makeFetch({}));
    await session.receiveMessage({ t: 'mute', muted: true });
    expect(session.getState()).toBe('muted');

    await session.receiveAudioFrame(new Uint8Array(320));
    // Muted: the frame must not have reached the VAD, so no speech_start/caption fired.
    expect(sent.some((m) => m.t === 'caption')).toBe(false);

    await session.receiveMessage({ t: 'mute', muted: false });
    expect(session.getState()).toBe('listening');
  });

  it('emits a recoverable error and returns to listening when STT fails', async () => {
    const vad = new ScriptedVad();
    vad.push([{ type: 'speech_start' }]);
    vad.push([{ type: 'speech_end' }]);

    const fetchImpl = makeFetch({
      stt: () => new Response('boom', { status: 500 }),
    });
    const { session, sent } = makeSession(vad, fetchImpl);

    await session.receiveAudioFrame(new Uint8Array(320));
    await session.receiveAudioFrame(new Uint8Array(320));
    await flushMicrotasks();

    const errorMsg = sent.find((m) => m.t === 'error');
    expect(errorMsg).toBeDefined();
    expect((errorMsg as Extract<ServerMessage, { t: 'error' }>).recoverable).toBe(true);
    expect(session.getState()).toBe('listening');
  });

  it('a typed "text" message behaves like a final learner caption and drives a turn', async () => {
    const vad = new ScriptedVad();
    const fetchImpl = makeFetch({
      llm: () => new Response(sseStream([textDelta('Bien sûr.')]), { status: 200 }),
      tts: () => new Response(pcmStream(100), { status: 200 }),
    });
    const { session, sent } = makeSession(vad, fetchImpl);

    await session.receiveMessage({ t: 'text', text: 'Traduis cette phrase' });
    await flushMicrotasks();

    expect(sent).toContainEqual({
      t: 'caption',
      speaker: 'learner',
      text: 'Traduis cette phrase',
      final: true,
    });
    expect(sent).toContainEqual({ t: 'caption', speaker: 'tutor', text: 'Bien sûr.', final: true });
  });
});
