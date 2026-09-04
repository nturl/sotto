/**
 * Native VoiceProvider AudioAdapter (CONTRACTS.md §5a/§5b): captures 16 kHz
 * mono PCM16 via @siteed/audio-studio's native module for LocalCascadeProvider,
 * and plays 24 kHz mono PCM16 tutor utterances by base64-encoding each
 * utterance's buffered chunks into a wav `data:` URI and playing it with
 * expo-audio when `audio_end` arrives (sentence-level latency is acceptable
 * per CONTRACTS §5b / TASK §E).
 *
 * @siteed/audio-studio ships a hook-based API (`useAudioRecorder`) meant for
 * React components; VoiceProvider needs an imperative start/stop, so this
 * talks to the lower-level `AudioStudioModule` + its `AudioData` event
 * directly (the same calls the hook makes internally — those internals are
 * not part of the package's typed public surface, so this is a best-effort
 * integration; see the WS-4 report). It has NOT been exercised in a
 * prebuilt dev client (no `expo prebuild`/pod install was run this session
 * — see the report), so `startCapture` is wrapped so any mismatch (missing
 * method, wrong event shape, module not linked) surfaces as a clean
 * rejection rather than a crash, which is what drives the voice screen's
 * "Lire seul" recovery path.
 *
 * `AudioAdapter.playPcm` is called once per binary frame as it streams in
 * (LocalCascadeProvider has no separate "utterance finished" hook into the
 * adapter — it only calls `stopPlayback()` on a *cancelled* barge-in). This
 * adapter buffers chunks and flushes them into one playable wav after a
 * short gap (no new chunk for `FLUSH_GAP_MS`), which is the closest
 * approximation of "utterance ended" available through the existing
 * AudioAdapter contract without changing packages/voice/src/transports/**
 * (WS-3-owned) — see the WS-4 report.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import type { AudioAdapter } from '@sotto/voice';

const CAPTURE_SAMPLE_RATE = 16000;
const DEFAULT_PLAYBACK_SAMPLE_RATE = 24000;
const FLUSH_GAP_MS = 400;

type AudioEventPayload = {
  encoded?: string;
};

type AudioStudioModuleLike = {
  requestPermissionsAsync?: () => Promise<{ granted: boolean }>;
  startRecording: (options: Record<string, unknown>) => Promise<unknown>;
  stopRecording: () => Promise<unknown>;
  addListener: (
    event: string,
    listener: (payload: AudioEventPayload) => void,
  ) => { remove: () => void };
};

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return globalThis.btoa(binary);
}

function wavHeader(pcmByteLength: number, sampleRate: number): ArrayBuffer {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmByteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (16-bit mono)
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, pcmByteLength, true);
  return header;
}

export function createAudioAdapter(): AudioAdapter {
  let subscription: { remove: () => void } | null = null;
  let module: AudioStudioModuleLike | null = null;
  let player: AudioPlayer | null = null;
  let utteranceChunks: ArrayBuffer[] = [];
  let lastSampleRate = DEFAULT_PLAYBACK_SAMPLE_RATE;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (utteranceChunks.length === 0) return;
    const totalLength = utteranceChunks.reduce((sum, c) => sum + c.byteLength, 0);
    const pcm = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of utteranceChunks) {
      pcm.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    utteranceChunks = [];

    const header = wavHeader(pcm.byteLength, lastSampleRate);
    const wav = new Uint8Array(header.byteLength + pcm.byteLength);
    wav.set(new Uint8Array(header), 0);
    wav.set(pcm, header.byteLength);

    const dataUri = `data:audio/wav;base64,${arrayBufferToBase64(wav.buffer)}`;
    player?.remove();
    player = createAudioPlayer({ uri: dataUri });
    player.play();
  };

  return {
    async startCapture(onPcm16: (buf: ArrayBuffer) => void): Promise<void> {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const audioStudio = require('@siteed/audio-studio') as {
        AudioStudioModule: AudioStudioModuleLike;
      };
      module = audioStudio.AudioStudioModule;
      if (!module || typeof module.startRecording !== 'function') {
        throw new Error(
          'audio-adapter.native: @siteed/audio-studio native module is not available (no prebuild/link)',
        );
      }
      const granted = (await module.requestPermissionsAsync?.())?.granted ?? true;
      if (!granted) throw new Error('audio-adapter.native: microphone permission denied');

      subscription = module.addListener('AudioData', (payload) => {
        if (payload.encoded) onPcm16(base64ToArrayBuffer(payload.encoded));
      });

      await module.startRecording({
        sampleRate: CAPTURE_SAMPLE_RATE,
        encoding: 'pcm_16bit',
        channels: 1,
        interval: 100,
      });
    },

    stopCapture(): void {
      subscription?.remove();
      subscription = null;
      void module?.stopRecording().catch(() => undefined);
    },

    playPcm(buf: ArrayBuffer, sampleRate: number): void {
      utteranceChunks.push(buf);
      lastSampleRate = sampleRate;
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, FLUSH_GAP_MS);
    },

    stopPlayback(): void {
      if (flushTimer) clearTimeout(flushTimer);
      utteranceChunks = [];
      player?.pause();
    },
  };
}
