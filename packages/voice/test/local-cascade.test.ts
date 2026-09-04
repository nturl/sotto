import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceEvent } from '../src/events.ts';
import type { SessionOptions } from '../src/provider.ts';
import { LocalCascadeProvider } from '../src/local-cascade.js';
import type { AudioAdapter } from '../src/transports/audio-adapter.js';

// ---- Fakes ----

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly CONNECTING = FakeWebSocket.CONNECTING;
  readonly OPEN = FakeWebSocket.OPEN;
  readonly CLOSING = FakeWebSocket.CLOSING;
  readonly CLOSED = FakeWebSocket.CLOSED;

  binaryType = 'arraybuffer';
  readyState: number = FakeWebSocket.CONNECTING;
  sent: Array<string | ArrayBuffer> = [];
  closeCalls = 0;

  private listeners = new Map<string, Array<(ev: unknown) => void>>();

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, cb: (ev: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(cb);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, cb: (ev: unknown) => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((l) => l !== cb),
    );
  }

  send(data: string | ArrayBuffer): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls++;
    this.simulateClose();
  }

  simulateOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatch('open', {});
  }

  simulateMessage(data: string | ArrayBuffer): void {
    this.dispatch('message', { data });
  }

  simulateClose(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close', {});
  }

  private dispatch(type: string, ev: unknown): void {
    for (const cb of this.listeners.get(type) ?? []) cb(ev);
  }
}

class FakeAudioAdapter implements AudioAdapter {
  onPcm16: ((buf: ArrayBuffer) => void) | null = null;
  played: Array<{ buf: ArrayBuffer; sampleRate: number }> = [];
  stopCaptureCalls = 0;
  stopPlaybackCalls = 0;

  async startCapture(onPcm16: (buf: ArrayBuffer) => void): Promise<void> {
    this.onPcm16 = onPcm16;
  }
  stopCapture(): void {
    this.stopCaptureCalls++;
  }
  playPcm(buf: ArrayBuffer, sampleRate: number): void {
    this.played.push({ buf, sampleRate });
  }
  stopPlayback(): void {
    this.stopPlaybackCalls++;
  }
}

function fakeFetch(sessionId = 'sess-1', wsUrl = 'ws://localhost:8790/voice/ws?session=sess-1') {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({
      sessionId,
      wsUrl,
      sampleRate: 16000,
      limits: { maxMs: 1_200_000, idleMs: 90_000 },
    }),
  })) as unknown as typeof fetch;
}

const SESSION_OPTIONS: SessionOptions = {
  bookId: 'fr-petit-chaperon-rouge',
  chapterId: 'ch1',
  mode: 'read_to_me',
  learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en' },
  passage: {
    chapterTitle: 'Chapitre 1',
    sentences: [{ id: 'b1.s1', text: 'Bonjour.', tokenIds: ['b1.s1.t1'] }],
    positionTokenId: null,
  },
  savedWords: [],
};

beforeEach(() => {
  FakeWebSocket.instances = [];
});

async function connectFixture() {
  const audio = new FakeAudioAdapter();
  const events: VoiceEvent[] = [];
  const provider = new LocalCascadeProvider({
    serverUrl: 'http://localhost:8790',
    audio,
    fetch: fakeFetch(),
    WebSocket: FakeWebSocket as unknown as typeof WebSocket,
  });
  provider.on((e) => events.push(e));
  const connectPromise = provider.connect(SESSION_OPTIONS);
  await connectPromise;
  const ws = FakeWebSocket.instances.at(-1)!;
  ws.simulateOpen();
  return { provider, audio, events, ws };
}

describe('LocalCascadeProvider', () => {
  it('creates a session over fetch and opens a WebSocket to the returned wsUrl', async () => {
    const { ws } = await connectFixture();
    expect(ws.url).toBe('ws://localhost:8790/voice/ws?session=sess-1');
  });

  it('starts audio capture on open and forwards captured PCM16 frames as binary WS sends', async () => {
    const { audio, ws } = await connectFixture();
    expect(audio.onPcm16).toBeTypeOf('function');
    const frame = new ArrayBuffer(4);
    audio.onPcm16!(frame);
    expect(ws.sent).toContain(frame);
  });

  it('maps server JSON events to VoiceEvent (state, caption, reading, limit, error)', async () => {
    const { ws, events } = await connectFixture();

    ws.simulateMessage(JSON.stringify({ t: 'state', state: 'listening' }));
    ws.simulateMessage(
      JSON.stringify({ t: 'caption', speaker: 'tutor', text: 'Bonjour', final: false }),
    );
    ws.simulateMessage(JSON.stringify({ t: 'reading', tokenIds: ['b1.s1.t1'] }));
    ws.simulateMessage(JSON.stringify({ t: 'limit', reason: 'idle' }));
    ws.simulateMessage(
      JSON.stringify({ t: 'error', code: 'stt_failed', message: 'boom', recoverable: true }),
    );

    expect(events).toContainEqual({ type: 'state', state: 'listening' });
    expect(events).toContainEqual({
      type: 'caption',
      speaker: 'tutor',
      text: 'Bonjour',
      final: false,
    });
    expect(events).toContainEqual({ type: 'reading', tokenIds: ['b1.s1.t1'] });
    expect(events).toContainEqual({ type: 'limit', reason: 'idle' });
    expect(events).toContainEqual({
      type: 'error',
      code: 'stt_failed',
      message: 'boom',
      recoverable: true,
    });
  });

  it('routes audio_start/binary/audio_end into AudioAdapter.playPcm at 24kHz', async () => {
    const { ws, audio } = await connectFixture();

    ws.simulateMessage(JSON.stringify({ t: 'audio_start', utteranceId: 'u1' }));
    const chunk = new ArrayBuffer(8);
    ws.simulateMessage(chunk);
    ws.simulateMessage(JSON.stringify({ t: 'audio_end', utteranceId: 'u1' }));

    expect(audio.played).toHaveLength(1);
    expect(audio.played[0]!.buf).toBe(chunk);
    expect(audio.played[0]!.sampleRate).toBe(24000);
  });

  it('stops playback when the server cancels an utterance for barge-in', async () => {
    const { ws, audio } = await connectFixture();
    ws.simulateMessage(JSON.stringify({ t: 'audio_start', utteranceId: 'u1' }));
    ws.simulateMessage(new ArrayBuffer(4));
    ws.simulateMessage(JSON.stringify({ t: 'audio_end', utteranceId: 'u1', cancelled: true }));

    expect(audio.stopPlaybackCalls).toBe(1);
  });

  it('relays a tool_call as a VoiceEvent and sends respondTool back as a tool_result message', async () => {
    const { ws, events, provider } = await connectFixture();

    ws.simulateMessage(
      JSON.stringify({
        t: 'tool_call',
        callId: 'call_1',
        name: 'save_vocabulary',
        args: { tokenId: 'b1.s1.t1' },
      }),
    );
    expect(events).toContainEqual({
      type: 'tool_call',
      callId: 'call_1',
      name: 'save_vocabulary',
      args: { tokenId: 'b1.s1.t1' },
    });

    provider.respondTool('call_1', { ok: true, savedWordId: 'sw1' });
    const last = ws.sent.at(-1);
    expect(typeof last).toBe('string');
    expect(JSON.parse(last as string)).toEqual({
      t: 'tool_result',
      callId: 'call_1',
      ok: true,
      result: { ok: true, savedWordId: 'sw1' },
    });
  });

  it('interrupt() stops local playback immediately and sends an interrupt message', async () => {
    const { ws, audio, provider } = await connectFixture();
    provider.interrupt();
    expect(audio.stopPlaybackCalls).toBe(1);
    const last = ws.sent.at(-1);
    expect(JSON.parse(last as string)).toEqual({ t: 'interrupt' });
  });

  it('reconnects once with backoff on an unexpected close, then gives up after a second', async () => {
    vi.useFakeTimers();
    try {
      const { ws, events } = await connectFixture();
      ws.simulateClose(); // unexpected — not from disconnect()

      expect(events.at(-1)).toEqual({ type: 'state', state: 'reconnecting' });

      await vi.advanceTimersByTimeAsync(1100);
      expect(FakeWebSocket.instances).toHaveLength(2);

      const ws2 = FakeWebSocket.instances.at(-1)!;
      ws2.simulateClose(); // second unexpected close — no further reconnect attempt

      expect(events.at(-1)).toEqual({ type: 'state', state: 'ended' });
      expect(FakeWebSocket.instances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reconnect after an intentional disconnect()', async () => {
    const { ws, provider, events } = await connectFixture();
    await provider.disconnect();
    expect(ws.closeCalls).toBe(1);
    ws.simulateClose();
    expect(events.filter((e) => e.type === 'state' && e.state === 'reconnecting')).toHaveLength(0);
  });
});
