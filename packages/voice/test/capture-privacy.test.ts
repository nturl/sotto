import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserCascadeProvider, type WorkerLike } from '../src/browser-cascade/provider.ts';
import { OpenAIDirectProvider } from '../src/openai-direct/provider.ts';
import { LocalCascadeProvider } from '../src/local-cascade.ts';
import { WebAudioAdapter } from '../src/transports/web-audio.ts';
import type { SessionOptions } from '../src/provider.ts';

const options: SessionOptions = {
  bookId: 'test',
  chapterId: 'one',
  mode: 'discuss',
  turnDetection: 'push',
  learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en' },
  passage: { chapterTitle: 'Test', sentences: [], positionTokenId: null },
  savedWords: [],
};
afterEach(() => vi.unstubAllGlobals());

for (const path of ['browser', 'byok', 'cloud'] as const) {
  describe(`${path} capture boundaries`, () => {
    it('opens capture only during a hold; drops late frames after release, mute and end', async () => {
      let callback: ((pcm: ArrayBuffer) => void) | undefined;
      const audio = {
        startCapture: vi.fn(async (cb: (pcm: ArrayBuffer) => void) => {
          callback = cb;
        }),
        stopCapture: vi.fn(),
        playPcm: vi.fn(),
        stopPlayback: vi.fn(),
      };
      const frames: ArrayBuffer[] = [];
      const messages: unknown[] = [];
      const worker: WorkerLike = {
        postMessage: (m) => {
          messages.push(m);
          if (m.t === 'audio') frames.push(m.pcm);
        },
        terminate: vi.fn(),
        onmessage: null,
        onerror: null,
      };
      const fetcher = vi.fn(async (url: string) => {
        if (url.endsWith('/audio/transcriptions')) return new Response('{"text":"bonjour"}');
        return new Response('data: [DONE]\n\n');
      });
      class Socket {
        static instance: Socket;
        OPEN = 1;
        readyState = 1;
        binaryType = '';
        listeners = new Map<string, (event: unknown) => void>();
        constructor() {
          Socket.instance = this;
        }
        addEventListener(name: string, cb: (event: unknown) => void) {
          this.listeners.set(name, cb);
        }
        send(m: string | ArrayBuffer) {
          if (typeof m !== 'string') frames.push(m);
        }
        close() {
          this.readyState = 3;
          this.listeners.get('close')?.({});
        }
      }
      const provider =
        path === 'browser'
          ? new BrowserCascadeProvider({ audio, workerFactory: () => worker })
          : path === 'byok'
            ? new OpenAIDirectProvider({
                audio,
                apiKey: 'test-fixture',
                fetch: fetcher as unknown as typeof fetch,
              })
            : new LocalCascadeProvider({
                audio,
                serverUrl: 'https://fixture.invalid',
                WebSocket: Socket as unknown as typeof WebSocket,
                createSession: async () => ({
                  sessionId: 'test',
                  wsUrl: 'wss://fixture.invalid',
                  sampleRate: 16000,
                  limits: { maxMs: 10000, idleMs: 10000 },
                }),
              });
      await provider.connect(options);
      if (path === 'cloud') Socket.instance.listeners.get('open')?.({});
      expect(audio.startCapture).not.toHaveBeenCalled();
      provider.sendText('A typed question');
      expect(audio.startCapture).not.toHaveBeenCalled();
      provider.pushToTalk(true);
      expect(audio.startCapture).toHaveBeenCalledTimes(1);
      callback?.(new Int16Array(3200).buffer);
      const delivered = frames.length;
      if (path !== 'byok') expect(delivered).toBe(1);
      provider.pushToTalk(false);
      callback?.(new Int16Array(3200).buffer);
      expect(frames.length).toBe(delivered);
      expect(audio.stopCapture).toHaveBeenCalled();
      provider.setMuted(true);
      provider.pushToTalk(true);
      provider.setMode('pronunciation');
      provider.replayLast();
      expect(audio.startCapture).toHaveBeenCalledTimes(1);
      await provider.disconnect();
      callback?.(new Int16Array(3200).buffer);
      expect(frames.length).toBe(delivered);
      if (path === 'byok') {
        expect(
          fetcher.mock.calls.filter(([url]) => url.endsWith('/audio/transcriptions')),
        ).toHaveLength(1);
      }
    });
  });
}

it('stops a microphone granted after stopCapture without building an audio graph', async () => {
  let grant!: (stream: unknown) => void;
  const stopped = vi.fn();
  const context = vi.fn();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('AudioContext', context);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    },
  });
  const audio = new WebAudioAdapter();
  const connecting = audio.startCapture(vi.fn());
  audio.stopCapture();
  grant({ getTracks: () => [{ stop: stopped }] });
  await connecting;
  expect(stopped).toHaveBeenCalledOnce();
  expect(context).not.toHaveBeenCalled();
});
