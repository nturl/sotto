/**
 * run7/G directive 1(a): `WebAudioAdapter.setOutputMuted` silences tutor
 * playback (a standing toggle) without touching capture or the barge-in
 * `stopPlayback` path. This exercises just the playback graph — a minimal
 * fake `AudioContext` (no jsdom Web Audio implementation exists) that
 * records the gain node `playPcm` creates, so the test can assert on its
 * `gain.value` without reaching into `WebAudioAdapter`'s private fields.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAudioAdapter } from '../src/transports/web-audio.ts';

class FakeGainNode {
  gain = { value: 1 };
  connect(): void {}
}

class FakeBufferSourceNode {
  buffer: FakeAudioBuffer | null = null;
  startedAt: number | null = null;
  onended: (() => void) | null = null;
  connect(): void {}
  start(when?: number): void {
    this.startedAt = when ?? 0;
  }
  stop(): void {}
}

class FakeAudioBuffer {
  // One retained channel, so a test can read back what `playPcm` wrote.
  // (A fresh array per call would silently discard the conversion.)
  private channel: Float32Array;
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.channel = new Float32Array(length);
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(): Float32Array {
    return this.channel;
  }
}

let lastContext: FakeAudioContext | null = null;
function recordContext(ctx: FakeAudioContext): void {
  lastContext = ctx;
}

class FakeAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'running';
  currentTime = 0;
  destination = {};
  gainNodes: FakeGainNode[] = [];

  constructor() {
    recordContext(this);
  }
  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.gainNodes.push(node);
    return node;
  }
  sources: FakeBufferSourceNode[] = [];
  buffers: FakeAudioBuffer[] = [];
  createBufferSource(): FakeBufferSourceNode {
    const node = new FakeBufferSourceNode();
    this.sources.push(node);
    return node;
  }
  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    const buf = new FakeAudioBuffer(channels, length, sampleRate);
    this.buffers.push(buf);
    return buf;
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

describe('WebAudioAdapter.setOutputMuted', () => {
  beforeEach(() => {
    lastContext = null;
    // playPcm/startCapture both early-return outside a browser (`typeof
    // window === 'undefined'`) — this suite runs under vitest's default
    // 'node' environment (no jsdom), so stand in a minimal `window` too.
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  });

  it('zeroes the playback gain node when muted, restores it when unmuted', () => {
    const adapter = new WebAudioAdapter();
    const pcm = new Int16Array([0, 1000, -1000]).buffer;

    // Called before any playback exists yet — must still apply once the
    // playback graph is built by the first playPcm.
    adapter.setOutputMuted(true);
    adapter.playPcm(pcm, 24000);

    expect(lastContext).not.toBeNull();
    expect(lastContext!.gainNodes).toHaveLength(1);
    expect(lastContext!.gainNodes[0]!.gain.value).toBe(0);

    adapter.setOutputMuted(false);
    expect(lastContext!.gainNodes[0]!.gain.value).toBe(1);

    // A second playPcm reuses the same gain node rather than building a new
    // one per sentence.
    adapter.playPcm(pcm, 24000);
    expect(lastContext!.gainNodes).toHaveLength(1);
  });

  it('defaults to unmuted', () => {
    const adapter = new WebAudioAdapter();
    const pcm = new Int16Array([0, 1000, -1000]).buffer;
    adapter.playPcm(pcm, 24000);
    expect(lastContext!.gainNodes[0]!.gain.value).toBe(1);
  });
});

/**
 * Run 9, lane C (card output 4). `speakSentence` converts Kokoro's
 * Float32 output to Int16 with `floatToPcm16` (negatives scaled by 0x8000,
 * positives by 0x7fff) and ships it at `TUTOR_SAMPLE_RATE` = 24000.
 * `playPcm` has to be the exact inverse, and it has to declare 24 kHz to
 * `createBuffer` rather than letting the AudioContext's own rate (48 kHz on
 * every Mac this ships to) be assumed — a 24 kHz buffer read as 48 kHz plays
 * at double speed, which is a very good imitation of gibberish. Nothing
 * checked either of those before this test.
 */
describe('WebAudioAdapter.playPcm conversion', () => {
  beforeEach(() => {
    lastContext = null;
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  });

  it('inverts floatToPcm16 exactly, including both full-scale endpoints', () => {
    // Mirrors worker.ts's floatToPcm16 so the round trip is the real one.
    const floats = new Float32Array([0, 1, -1, 0.5, -0.5, 0.001]);
    const pcm16 = new Int16Array(floats.length);
    for (let i = 0; i < floats.length; i++) {
      const s = Math.max(-1, Math.min(1, floats[i]!));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const adapter = new WebAudioAdapter();
    adapter.playPcm(pcm16.buffer as ArrayBuffer, 24000);

    const channel = lastContext!.buffers[0]!.getChannelData();
    expect(channel).toHaveLength(floats.length);
    expect(channel[0]).toBe(0);
    expect(channel[1]).toBe(1); // +full scale survives as exactly +1
    expect(channel[2]).toBe(-1); // -full scale survives as exactly -1
    for (let i = 0; i < floats.length; i++) {
      expect(Math.abs(channel[i]! - floats[i]!)).toBeLessThan(1 / 0x7fff);
    }
  });

  it('declares the tutor rate on the buffer, not the context rate', () => {
    const adapter = new WebAudioAdapter();
    adapter.playPcm(new Int16Array(2400).buffer as ArrayBuffer, 24000);
    const buf = lastContext!.buffers[0]!;
    expect(buf.sampleRate).toBe(24000);
    expect(buf.numberOfChannels).toBe(1);
    expect(buf.length).toBe(2400);
    expect(buf.duration).toBeCloseTo(0.1, 6);
  });

  it('queues consecutive chunks back to back at 24 kHz timing', () => {
    const adapter = new WebAudioAdapter();
    adapter.playPcm(new Int16Array(2400).buffer as ArrayBuffer, 24000); // 100 ms
    adapter.playPcm(new Int16Array(2400).buffer as ArrayBuffer, 24000);
    const [a, b] = lastContext!.sources;
    expect(a!.startedAt).toBe(0);
    expect(b!.startedAt).toBeCloseTo(0.1, 6);
  });
});

describe('WebAudioAdapter playback recovery', () => {
  it('reports an interrupted context that stays unavailable after a resume attempt', async () => {
    class InterruptedContext extends FakeAudioContext {
      state = 'interrupted' as unknown as 'running';
      resume(): Promise<void> {
        return Promise.resolve();
      }
    }
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = InterruptedContext;

    const adapter = new WebAudioAdapter();
    const blocked = vi.fn();
    adapter.onPlaybackBlocked(blocked);
    adapter.playPcm(new Int16Array(2400).buffer as ArrayBuffer, 24000);

    await Promise.resolve();
    expect(blocked).toHaveBeenCalledOnce();
    await expect(adapter.resumePlayback()).resolves.toBe(false);
    expect(blocked).toHaveBeenCalledOnce();
  });

  it('returns true only after a blocked context becomes running', async () => {
    class DelayedResumeContext extends FakeAudioContext {
      state = 'suspended' as unknown as 'running';
      private attempts = 0;
      resume(): Promise<void> {
        this.attempts += 1;
        if (this.attempts > 1) this.state = 'running';
        return Promise.resolve();
      }
    }
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = DelayedResumeContext;

    const adapter = new WebAudioAdapter();
    const blocked = vi.fn();
    adapter.onPlaybackBlocked(blocked);
    adapter.playPcm(new Int16Array(2400).buffer as ArrayBuffer, 24000);
    await Promise.resolve();
    expect(blocked).toHaveBeenCalledOnce();

    await expect(adapter.resumePlayback()).resolves.toBe(true);
  });
});
