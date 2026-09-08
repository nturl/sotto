import type { AudioAdapter } from './transports/audio-adapter.ts';

/** Owns capture permission independently of processing/playback state. */
export class CaptureGate {
  private generation = 0;
  private enabled = false;
  private callback: ((pcm: ArrayBuffer) => void) | null = null;
  private audio: AudioAdapter;

  constructor(audio: AudioAdapter) {
    this.audio = audio;
  }

  start(callback: (pcm: ArrayBuffer) => void, enabled: boolean): Promise<void> {
    this.callback = callback;
    return this.setEnabled(enabled);
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    const generation = ++this.generation;
    if (!enabled) {
      this.audio.stopCapture();
      return;
    }
    try {
      await this.audio.startCapture((pcm) => {
        if (this.enabled && generation === this.generation) this.callback?.(pcm);
      });
    } catch (error) {
      if (generation !== this.generation) return;
      this.enabled = false;
      this.audio.stopCapture();
      throw error;
    }
  }

  stop(): void {
    this.enabled = false;
    ++this.generation;
    this.callback = null;
    this.audio.stopCapture();
  }
}
