/**
 * BrowserCascadeProvider driven by a fake worker shim — no real models, no
 * real Worker, no network. What matters here is that the provider is
 * interchangeable with LocalCascadeProvider: the same VoiceProvider surface
 * in, exactly the same VoiceEvent vocabulary out (CONTRACTS §5a).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceEvent } from '../src/events.ts';
import type { SessionOptions } from '../src/provider.ts';
import type { AudioAdapter } from '../src/transports/audio-adapter.ts';
import {
  BrowserCascadeProvider,
  downloadTutorModels,
  type WorkerLike,
} from '../src/browser-cascade/provider.ts';
import type { MainToWorker, WorkerToMain } from '../src/browser-cascade/protocol.ts';

class FakeWorker implements WorkerLike {
  static instances: FakeWorker[] = [];
  sent: MainToWorker[] = [];
  terminated = 0;
  onmessage: ((ev: { data: WorkerToMain }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: MainToWorker): void {
    this.sent.push(message);
  }

  terminate(): void {
    this.terminated += 1;
  }

  /** Simulate the worker replying. */
  emit(msg: WorkerToMain): void {
    this.onmessage?.({ data: msg });
  }
}

class FakeAudio implements AudioAdapter {
  onPcm: ((buf: ArrayBuffer) => void) | null = null;
  startCalls = 0;
  stopCaptureCalls = 0;
  stopPlaybackCalls = 0;
  played: Array<{ bytes: number; sampleRate: number }> = [];
  failWith: Error | null = null;

  async startCapture(onPcm16: (buf: ArrayBuffer) => void): Promise<void> {
    this.startCalls += 1;
    if (this.failWith) throw this.failWith;
    this.onPcm = onPcm16;
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

const OPTS: SessionOptions = {
  bookId: 'es-fabulas-samaniego',
  chapterId: 'ch1',
  mode: 'discuss',
  learner: { level: 'A1', learningLocale: 'es-419', explanationLocale: 'en' },
  passage: {
    chapterTitle: 'La cigarra y la hormiga',
    sentences: [
      {
        id: 'b1.s1',
        text: 'Durante el verano, una cigarra canta bajo el sol.',
        tokenIds: ['b1.s1.t1'],
        words: [{ id: 'b1.s1.t1', text: 'Durante' }],
      },
    ],
    positionTokenId: 'b1.s1.t1',
  },
  savedWords: [],
};

function setup() {
  const audio = new FakeAudio();
  const events: VoiceEvent[] = [];
  const provider = new BrowserCascadeProvider({
    audio,
    workerFactory: () => new FakeWorker(),
  });
  provider.on((e) => events.push(e));
  return { audio, events, provider };
}

function lastWorker(): FakeWorker {
  return FakeWorker.instances[FakeWorker.instances.length - 1]!;
}

beforeEach(() => {
  FakeWorker.instances = [];
});

describe('BrowserCascadeProvider connect', () => {
  it('spawns a worker, inits it without permission to download, and starts capture', async () => {
    const { audio, events, provider } = setup();
    await provider.connect(OPTS);

    expect(events[0]).toEqual({ type: 'state', state: 'connecting' });
    expect(audio.startCalls).toBe(1);

    const init = lastWorker().sent[0];
    expect(init?.t).toBe('init');
    if (init?.t !== 'init') throw new Error('expected init');
    expect(init.payload.allowDownload).toBe(false);
    expect(init.payload.stt.id).toBe('onnx-community/whisper-base');
    expect(init.payload.learner.learningLocale).toBe('es-419');
    expect(init.payload.passage.sentences[0]?.id).toBe('b1.s1');
  });

  it('forwards captured PCM frames to the worker as transferable audio messages', async () => {
    const { audio, provider } = setup();
    await provider.connect(OPTS);
    audio.onPcm?.(new ArrayBuffer(640));
    const audioMsg = lastWorker().sent.find((m) => m.t === 'audio');
    expect(audioMsg).toBeTruthy();
  });

  it('emits mic_unavailable + error state when capture fails, as the local provider does', async () => {
    const audio = new FakeAudio();
    audio.failWith = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const events: VoiceEvent[] = [];
    const provider = new BrowserCascadeProvider({ audio, workerFactory: () => new FakeWorker() });
    provider.on((e) => events.push(e));
    await provider.connect(OPTS);

    expect(events).toContainEqual({
      type: 'error',
      code: 'mic_unavailable',
      message: 'NotAllowedError: Permission denied',
      recoverable: false,
    });
    expect(events.at(-1)).toEqual({ type: 'state', state: 'error' });
  });
});

describe('BrowserCascadeProvider event translation', () => {
  it('re-emits every worker event in the CONTRACTS §5a vocabulary', async () => {
    const { events, provider } = setup();
    await provider.connect(OPTS);
    const worker = lastWorker();
    events.length = 0;

    worker.emit({ t: 'ready', stages: { stt: true, llm: false, tts: false } });
    worker.emit({ t: 'state', state: 'listening' });
    worker.emit({ t: 'caption', speaker: 'learner', text: 'la cigarra', final: true });
    worker.emit({ t: 'reading', tokenIds: ['b1.s1.t1'] });
    worker.emit({ t: 'tool_call', callId: 'c1', name: 'save_vocabulary', args: { tokenId: 'x' } });
    worker.emit({ t: 'error', code: 'stt_failed', message: 'boom', recoverable: true });

    expect(events).toEqual([
      { type: 'state', state: 'listening' },
      { type: 'caption', speaker: 'learner', text: 'la cigarra', final: true },
      { type: 'reading', tokenIds: ['b1.s1.t1'] },
      { type: 'tool_call', callId: 'c1', name: 'save_vocabulary', args: { tokenId: 'x' } },
      { type: 'error', code: 'stt_failed', message: 'boom', recoverable: true },
    ]);
    expect(provider.readiness).toEqual({ stt: true, llm: false, tts: false });
  });

  it('does not leak progress/metric/audio plumbing into VoiceEvents', async () => {
    const { audio, events, provider } = setup();
    await provider.connect(OPTS);
    const worker = lastWorker();
    events.length = 0;

    worker.emit({
      t: 'progress',
      progress: {
        modelId: 'x',
        fraction: 0.5,
        loadedBytes: 1,
        totalBytes: 2,
        phase: 'downloading',
      },
    });
    worker.emit({ t: 'metric', name: 'stt_ms', ms: 900 });
    worker.emit({ t: 'audio_start', utteranceId: 'u1' });
    worker.emit({ t: 'audio', utteranceId: 'u1', pcm: new ArrayBuffer(48), sampleRate: 24000 });
    worker.emit({ t: 'audio_end', utteranceId: 'u1' });

    expect(events).toEqual([]);
    expect(audio.played).toEqual([{ bytes: 48, sampleRate: 24000 }]);
  });

  it('stops playback when an utterance is cancelled (barge-in)', async () => {
    const { audio, provider } = setup();
    await provider.connect(OPTS);
    lastWorker().emit({ t: 'audio_end', utteranceId: 'u1', cancelled: true });
    expect(audio.stopPlaybackCalls).toBe(1);
  });

  it('goes to the error state only for unrecoverable worker errors', async () => {
    const { events, provider } = setup();
    await provider.connect(OPTS);
    events.length = 0;
    lastWorker().emit({ t: 'error', code: 'model_load_failed', message: 'x', recoverable: false });
    expect(events.at(-1)).toEqual({ type: 'state', state: 'error' });
  });
});

describe('BrowserCascadeProvider controls', () => {
  it('maps every control method onto a worker message', async () => {
    const { provider } = setup();
    await provider.connect(OPTS);
    const worker = lastWorker();
    worker.sent.length = 0;

    provider.setMode('pronunciation');
    provider.setMuted(true);
    provider.pushToTalk(true);
    provider.interrupt();
    provider.replayLast();
    provider.sendText('hola');
    provider.respondTool('c1', { ok: true });
    provider.respondTool('c2', { ok: false, error: 'unknown token' });

    expect(worker.sent).toEqual([
      { t: 'mode', mode: 'pronunciation' },
      { t: 'mute', muted: true },
      { t: 'ptt', active: true },
      { t: 'interrupt' },
      { t: 'replay' },
      { t: 'text', text: 'hola' },
      { t: 'tool_result', callId: 'c1', ok: true, result: { ok: true } },
      { t: 'tool_result', callId: 'c2', ok: false, error: 'unknown token' },
    ]);
  });

  it('disconnect ends the worker, stops audio and reports ended', async () => {
    const { audio, events, provider } = setup();
    await provider.connect(OPTS);
    const worker = lastWorker();
    await provider.disconnect();

    expect(worker.sent.at(-1)).toEqual({ t: 'end' });
    expect(worker.terminated).toBe(1);
    expect(audio.stopCaptureCalls).toBe(1);
    expect(events.at(-1)).toEqual({ type: 'state', state: 'ended' });
  });

  it('emits limit/idle and tears the session down when nothing is heard', async () => {
    vi.useFakeTimers();
    try {
      const audio = new FakeAudio();
      const events: VoiceEvent[] = [];
      const provider = new BrowserCascadeProvider({
        audio,
        workerFactory: () => new FakeWorker(),
        limits: { maxMs: 10_000, idleMs: 1_000 },
      });
      provider.on((e) => events.push(e));
      await provider.connect(OPTS);

      vi.advanceTimersByTime(1_001);
      expect(events).toContainEqual({ type: 'limit', reason: 'idle' });
      expect(events.at(-1)).toEqual({ type: 'state', state: 'ended' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a learner caption resets the idle clock', async () => {
    vi.useFakeTimers();
    try {
      const audio = new FakeAudio();
      const events: VoiceEvent[] = [];
      const provider = new BrowserCascadeProvider({
        audio,
        workerFactory: () => new FakeWorker(),
        limits: { maxMs: 10_000, idleMs: 1_000 },
      });
      provider.on((e) => events.push(e));
      await provider.connect(OPTS);

      vi.advanceTimersByTime(800);
      lastWorker().emit({ t: 'caption', speaker: 'learner', text: 'cigarra', final: true });
      vi.advanceTimersByTime(800);
      expect(events.some((e) => e.type === 'limit')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('downloadTutorModels', () => {
  it('asks the worker to download with allowDownload true and resolves on ready', async () => {
    const progress: number[] = [];
    const handle = downloadTutorModels({
      workerFactory: () => new FakeWorker(),
      onProgress: (p) => progress.push(p.fraction ?? -1),
    });
    const worker = lastWorker();

    const msg = worker.sent[0];
    expect(msg?.t).toBe('download');
    if (msg?.t !== 'download') throw new Error('expected download');
    expect(msg.payload.allowDownload).toBe(true);

    worker.emit({
      t: 'progress',
      progress: {
        modelId: 'onnx-community/whisper-base',
        fraction: 0.25,
        loadedBytes: 1,
        totalBytes: 4,
        phase: 'downloading',
      },
    });
    worker.emit({ t: 'ready', stages: { stt: true, llm: false, tts: false } });

    await handle.done;
    expect(progress).toEqual([0.25]);
    expect(worker.terminated).toBe(1);
  });

  it('rejects (and terminates) when the worker reports an error', async () => {
    const handle = downloadTutorModels({ workerFactory: () => new FakeWorker() });
    const worker = lastWorker();
    worker.emit({
      t: 'error',
      code: 'model_download_failed',
      message: 'offline',
      recoverable: false,
    });
    await expect(handle.done).rejects.toThrow('model_download_failed: offline');
    expect(worker.terminated).toBe(1);
  });
});
