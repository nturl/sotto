/**
 * run7/G directive 1(a): `WebAudioAdapter.setOutputMuted` silences tutor
 * playback (a standing toggle) without touching capture or the barge-in
 * `stopPlayback` path. This exercises just the playback graph — a minimal
 * fake `AudioContext` (no jsdom Web Audio implementation exists) that
 * records the gain node `playPcm` creates, so the test can assert on its
 * `gain.value` without reaching into `WebAudioAdapter`'s private fields.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { WebAudioAdapter } from '../src/transports/web-audio.ts';

class FakeGainNode {
  gain = { value: 1 };
  connect(): void {}
}

class FakeBufferSourceNode {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect(): void {}
  start(): void {}
  stop(): void {}
}

class FakeAudioBuffer {
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {}
  getChannelData(): Float32Array {
    return new Float32Array(this.length);
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
  createBufferSource(): FakeBufferSourceNode {
    return new FakeBufferSourceNode();
  }
  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(channels, length, sampleRate);
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
