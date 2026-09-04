/**
 * Browser AudioAdapter: captures the microphone via getUserMedia + an
 * AudioWorklet that downsamples to 16 kHz mono PCM16, and plays 24 kHz mono
 * PCM16 tutor audio through an AudioContext with a simple queue.
 *
 * Safe to import from Node (e.g. LocalCascadeProvider unit tests run under
 * vitest/Node): every browser API access is guarded behind `typeof window`.
 */
import type { AudioAdapter } from './audio-adapter.js';

const CAPTURE_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;

// Runs inside the AudioWorkletGlobalScope — has no access to anything above.
// Downsamples the render-quantum input (at the context's native sample rate)
// to 16 kHz mono PCM16 and posts each resulting frame back to the main thread.
const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${CAPTURE_SAMPLE_RATE};
    this.carry = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;
    const outLength = Math.floor((input.length - this.carry) / this.ratio) + 1;
    const out = new Int16Array(Math.max(0, outLength));
    let outIdx = 0;
    let pos = this.carry;
    while (pos < input.length) {
      const idx = Math.floor(pos);
      const sample = input[Math.min(idx, input.length - 1)];
      const clamped = Math.max(-1, Math.min(1, sample));
      out[outIdx++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      pos += this.ratio;
    }
    this.carry = pos - input.length;
    if (outIdx > 0) {
      const trimmed = out.slice(0, outIdx);
      this.port.postMessage(trimmed.buffer, [trimmed.buffer]);
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
`;

export class WebAudioAdapter implements AudioAdapter {
  private context: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private workletUrl: string | null = null;

  private playbackContext: AudioContext | null = null;
  private playbackQueueEndAt = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  async startCapture(onPcm16: (buf: ArrayBuffer) => void): Promise<void> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      throw new Error('WebAudioAdapter.startCapture requires a browser environment');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.context = new AudioContext();

    const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
    this.workletUrl = URL.createObjectURL(blob);
    await this.context.audioWorklet.addModule(this.workletUrl);

    this.sourceNode = this.context.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.context, 'capture-processor');
    this.workletNode.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => onPcm16(ev.data);
    this.sourceNode.connect(this.workletNode);
  }

  stopCapture(): void {
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.workletUrl) URL.revokeObjectURL(this.workletUrl);
    this.workletNode = null;
    this.sourceNode = null;
    this.stream = null;
    this.workletUrl = null;
    void this.context?.close();
    this.context = null;
  }

  playPcm(buf: ArrayBuffer, sampleRate: number = PLAYBACK_SAMPLE_RATE): void {
    if (typeof window === 'undefined') return;
    if (!this.playbackContext) {
      this.playbackContext = new AudioContext();
      this.playbackQueueEndAt = this.playbackContext.currentTime;
    }
    const ctx = this.playbackContext;

    const int16 = new Int16Array(buf);
    const audioBuffer = ctx.createBuffer(1, int16.length, sampleRate);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) channel[i] = int16[i]! / (int16[i]! < 0 ? 0x8000 : 0x7fff);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, this.playbackQueueEndAt);
    source.start(startAt);
    this.playbackQueueEndAt = startAt + audioBuffer.duration;

    this.activeSources.push(source);
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
    };
  }

  stopPlayback(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // already stopped/ended
      }
    }
    this.activeSources = [];
    if (this.playbackContext) this.playbackQueueEndAt = this.playbackContext.currentTime;
  }
}
