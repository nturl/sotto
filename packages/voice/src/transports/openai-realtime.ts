/**
 * OpenAIRealtimeProvider — the speech-to-speech tutor over WebRTC (web).
 *
 * This replaces the R3 interface-only stub. The shape of the thing is set by
 * one rule: **the provider never sees a standard API key.** It is handed a
 * `mintSecret()` function; the app points that at the cloud broker's
 * `POST /voice/realtime/secret` (CLOUD-API.md), which returns an ephemeral
 * `ek_...` value that is good for ~2 minutes and carries the tutor's
 * instructions and tools already baked in by the server. The browser then talks
 * to OpenAI directly — one hop, no audio through our servers.
 *
 * Metering is the flip side of that: nobody but the client can see how long the
 * call ran, so the provider counts audio in both directions from the Realtime
 * event stream and reports it through `onEnd`, and enforces `maxSeconds`
 * locally. The server does not trust those numbers for the cap (it books wall
 * clock), but it records them as a cross-check.
 *
 * NATIVE IS NOT BUILT. On React Native this throws `NotSupportedError`:
 * react-native-webrtc is a native module, so it needs a dev client and a
 * config plugin, which is a build-system change rather than a code one.
 * `LocalCascadeProvider` over the broker's WebSocket path is what native uses.
 *
 * WHAT IS AND IS NOT VERIFIED: every mapping below is written from OpenAI's
 * Realtime WebRTC documentation and is covered by unit tests against a fake
 * peer connection. It has NOT been run against the live API — the account
 * available when this was written had no credits (see sotto-cloud
 * DECISIONS.md #17). The event names are the place to look first if a live
 * call misbehaves.
 */
import type { ToolName, ToolResult, TutorMode } from '@sotto/core';
import type { VoiceEvent, VoiceState } from '../events.ts';
import type { SessionOptions, VoiceProvider } from '../provider.ts';

/** What `POST /voice/realtime/secret` returns (CLOUD-API.md). */
export interface MintedRealtimeSecret {
  value: string;
  expiresAt: string;
  model: string;
  /** The client-enforced ceiling: the learner's remaining plan seconds. */
  maxSeconds: number;
  callId: string;
}

/** What the client reports back to `POST /voice/realtime/end`. */
export interface RealtimeCallReport {
  callId: string;
  audioSecondsIn: number;
  audioSecondsOut: number;
  reason: 'hangup' | 'max_duration' | 'error';
}

export class NotSupportedError extends Error {
  readonly platform: string;
  constructor(platform: string, message: string) {
    super(message);
    this.platform = platform;
    this.name = 'NotSupportedError';
  }
}

// ---------------------------------------------------------------------------
// The browser API surface this provider needs, narrowed so a test can fake it
// ---------------------------------------------------------------------------

export interface DataChannelLike {
  readyState: string;
  send(data: string): void;
  close(): void;
  onopen: ((this: unknown, ev: unknown) => void) | null;
  onmessage: ((this: unknown, ev: { data: unknown }) => void) | null;
  onclose: ((this: unknown, ev: unknown) => void) | null;
}

export interface MediaTrackLike {
  kind: string;
  enabled: boolean;
  stop(): void;
}

export interface MediaStreamLike {
  getTracks(): MediaTrackLike[];
  getAudioTracks(): MediaTrackLike[];
}

export interface PeerConnectionLike {
  createDataChannel(label: string): DataChannelLike;
  addTrack(track: MediaTrackLike, stream: MediaStreamLike): unknown;
  createOffer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(desc: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(desc: { type: string; sdp: string }): Promise<void>;
  close(): void;
  ontrack: ((ev: { streams: MediaStreamLike[] }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  connectionState: string;
}

export type PeerConnectionFactory = () => PeerConnectionLike;

export interface OpenAIRealtimeOptions {
  /** Asks the app's cloud adapter for a fresh ephemeral secret. */
  mintSecret: () => Promise<MintedRealtimeSecret>;
  /** Called once when the call ends, so the app can POST /voice/realtime/end. */
  onEnd?: (report: RealtimeCallReport) => void;
  /** Attaches the tutor's audio to a sink; the web app hands it an <audio>. */
  playRemoteStream?: (stream: MediaStreamLike) => void;
  /** `'native'` throws immediately: react-native-webrtc is not wired up. */
  platform?: 'web' | 'native';
  createPeerConnection?: PeerConnectionFactory;
  getUserMedia?: () => Promise<MediaStreamLike>;
  fetch?: typeof fetch;
  /** Where the SDP offer goes; overridable for tests only. */
  callsUrl?: string;
  now?: () => number;
  setTimeoutImpl?: (fn: () => void, ms: number) => unknown;
  clearTimeoutImpl?: (handle: unknown) => void;
}

export const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const DATA_CHANNEL_LABEL = 'oai-events';

interface RealtimeEvent {
  type?: string;
  delta?: string;
  transcript?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  error?: { message?: string; code?: string };
  response?: { usage?: unknown };
}

export class OpenAIRealtimeProvider implements VoiceProvider {
  readonly #options: OpenAIRealtimeOptions;
  readonly #listeners = new Set<(e: VoiceEvent) => void>();
  readonly #now: () => number;
  readonly #setTimeout: (fn: () => void, ms: number) => unknown;
  readonly #clearTimeout: (handle: unknown) => void;

  #pc: PeerConnectionLike | null = null;
  #channel: DataChannelLike | null = null;
  #micStream: MediaStreamLike | null = null;
  #secret: MintedRealtimeSecret | null = null;
  #state: VoiceState = 'idle';
  #maxDurationTimer: unknown = null;
  #ended = false;

  // Metering. Both are wall-clock spans between the Realtime events that
  // bracket speech, which is the only measurement available on this transport.
  #learnerSpeechStartedAt: number | null = null;
  #tutorSpeechStartedAt: number | null = null;
  #audioSecondsIn = 0;
  #audioSecondsOut = 0;
  /** The `usage` block from the last `response.done`, for cost cross-checks. */
  #lastUsage: unknown = null;

  #learnerTranscript = '';
  #tutorTranscript = '';

  constructor(options: OpenAIRealtimeOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#setTimeout = options.setTimeoutImpl ?? ((fn, ms) => setTimeout(fn, ms));
    this.#clearTimeout = options.clearTimeoutImpl ?? ((h) => clearTimeout(h as never));
  }

  // ---- Events -------------------------------------------------------------

  on(listener: (e: VoiceEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(event: VoiceEvent): void {
    if (event.type === 'state') this.#state = event.state;
    for (const listener of this.#listeners) listener(event);
  }

  #setState(state: VoiceState): void {
    if (this.#state === state) return;
    this.#emit({ type: 'state', state });
  }

  get state(): VoiceState {
    return this.#state;
  }

  /** Audio seconds counted so far, as reported to `onEnd`. */
  get measured(): { audioSecondsIn: number; audioSecondsOut: number } {
    return { audioSecondsIn: this.#audioSecondsIn, audioSecondsOut: this.#audioSecondsOut };
  }

  /** The last `response.done` usage block, if the model sent one. */
  get lastUsage(): unknown {
    return this.#lastUsage;
  }

  // ---- Connect ------------------------------------------------------------

  async connect(_opts: SessionOptions): Promise<void> {
    // `_opts` is deliberately unused: unlike the cascade, the session's
    // instructions, tools and voice are chosen by the broker when it mints the
    // secret, so the passage and learner context never pass through the
    // browser. The parameter stays for the VoiceProvider contract, and the app
    // passes the same object to `mintSecret`.
    if (this.#options.platform === 'native') {
      throw new NotSupportedError(
        'native',
        'The realtime tutor needs WebRTC, which is not built for native in this release. Use the cascade tutor.',
      );
    }

    const createPeerConnection =
      this.#options.createPeerConnection ?? defaultPeerConnectionFactory();
    const getUserMedia = this.#options.getUserMedia ?? defaultGetUserMedia();
    if (!createPeerConnection || !getUserMedia) {
      throw new NotSupportedError(
        'native',
        'The realtime tutor needs WebRTC, which this device does not provide.',
      );
    }

    this.#ended = false;
    this.#setState('connecting');

    const secret = await this.#options.mintSecret();
    this.#secret = secret;

    const pc = createPeerConnection();
    this.#pc = pc;
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) this.#options.playRemoteStream?.(stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.#emit({
          type: 'error',
          code: 'connection_lost',
          message: 'The connection to the tutor dropped.',
          recoverable: true,
        });
        void this.#end('error');
      }
    };

    const mic = await getUserMedia();
    this.#micStream = mic;
    for (const track of mic.getAudioTracks()) pc.addTrack(track, mic);

    const channel = pc.createDataChannel(DATA_CHANNEL_LABEL);
    this.#channel = channel;
    channel.onmessage = (event) => this.#handleEvent(event.data);
    channel.onclose = () => void this.#end('hangup');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const doFetch = this.#options.fetch ?? fetch;
    const res = await doFetch(this.#options.callsUrl ?? REALTIME_CALLS_URL, {
      method: 'POST',
      headers: {
        // The ephemeral secret, never a standard key.
        Authorization: `Bearer ${secret.value}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp ?? '',
    });
    if (!res.ok) {
      this.#emit({
        type: 'error',
        code: 'connect_failed',
        message: 'The tutor could not be reached. Try again.',
        recoverable: true,
      });
      await this.#end('error');
      throw new Error(`realtime call failed: ${res.status}`);
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });

    // The local half of the minute cap. The server's own ceiling is the
    // secret's expiry plus the reaper; this is what stops a call that is
    // already running.
    this.#maxDurationTimer = this.#setTimeout(() => {
      this.#emit({ type: 'limit', reason: 'max_duration' });
      void this.#end('max_duration');
    }, secret.maxSeconds * 1000);

    this.#setState('listening');
  }

  // ---- Event mapping ------------------------------------------------------

  #handleEvent(raw: unknown): void {
    let event: RealtimeEvent;
    try {
      event = typeof raw === 'string' ? JSON.parse(raw) : (raw as RealtimeEvent);
    } catch {
      return;
    }
    switch (event.type) {
      // ---- Learner ----
      case 'input_audio_buffer.speech_started':
        this.#learnerSpeechStartedAt = this.#now();
        this.#setState('listening');
        break;
      case 'input_audio_buffer.speech_stopped':
        if (this.#learnerSpeechStartedAt !== null) {
          this.#audioSecondsIn += (this.#now() - this.#learnerSpeechStartedAt) / 1000;
          this.#learnerSpeechStartedAt = null;
        }
        break;
      case 'conversation.item.input_audio_transcription.delta':
        this.#learnerTranscript += event.delta ?? '';
        this.#emit({
          type: 'caption',
          speaker: 'learner',
          text: this.#learnerTranscript,
          final: false,
        });
        break;
      case 'conversation.item.input_audio_transcription.completed':
        this.#emit({
          type: 'caption',
          speaker: 'learner',
          text: event.transcript ?? this.#learnerTranscript,
          final: true,
        });
        this.#learnerTranscript = '';
        break;

      // ---- Tutor ----
      case 'response.created':
        this.#setState('thinking');
        break;
      case 'response.output_audio.delta':
        // The audio itself arrives on the media track, not here; this is only
        // the signal that the tutor has started speaking.
        this.#tutorSpeechStartedAt ??= this.#now();
        this.#setState('speaking');
        break;
      case 'response.output_audio.done':
        if (this.#tutorSpeechStartedAt !== null) {
          this.#audioSecondsOut += (this.#now() - this.#tutorSpeechStartedAt) / 1000;
          this.#tutorSpeechStartedAt = null;
        }
        break;
      case 'response.output_audio_transcript.delta':
        this.#tutorTranscript += event.delta ?? '';
        this.#emit({
          type: 'caption',
          speaker: 'tutor',
          text: this.#tutorTranscript,
          final: false,
        });
        break;
      case 'response.output_audio_transcript.done':
        this.#emit({
          type: 'caption',
          speaker: 'tutor',
          text: event.transcript ?? this.#tutorTranscript,
          final: true,
        });
        this.#tutorTranscript = '';
        break;

      // ---- Tools ----
      case 'response.function_call_arguments.done': {
        const callId = event.call_id;
        const name = event.name as ToolName | undefined;
        if (!callId || !name) break;
        let args: unknown = {};
        try {
          args = event.arguments && event.arguments.trim() ? JSON.parse(event.arguments) : {};
        } catch {
          args = {};
        }
        this.#emit({ type: 'tool_call', callId, name, args });
        break;
      }

      case 'response.done':
        this.#lastUsage = (event.response as { usage?: unknown } | undefined)?.usage ?? null;
        if (this.#tutorSpeechStartedAt !== null) {
          // A response that ended without an explicit audio.done still spoke.
          this.#audioSecondsOut += (this.#now() - this.#tutorSpeechStartedAt) / 1000;
          this.#tutorSpeechStartedAt = null;
        }
        this.#setState('listening');
        break;

      case 'error':
        this.#emit({
          type: 'error',
          code: event.error?.code ?? 'realtime_error',
          message: event.error?.message ?? 'The tutor hit an error.',
          recoverable: true,
        });
        break;

      default:
        break;
    }
  }

  #send(payload: unknown): void {
    const channel = this.#channel;
    if (!channel || channel.readyState !== 'open') return;
    channel.send(JSON.stringify(payload));
  }

  // ---- VoiceProvider surface ---------------------------------------------

  setMode(mode: TutorMode): void {
    // Realtime has no server-side mode switch; the tutor's instructions were
    // fixed when the secret was minted. Telling it in-conversation is what the
    // cascade does too (apps/server's buildModeChangeInstruction), just with
    // the sentence assembled here.
    this.#sendUserText(`[mode] Switch to ${mode.replace(/_/g, ' ')} mode from now on.`);
  }

  setMuted(muted: boolean): void {
    for (const track of this.#micStream?.getAudioTracks() ?? []) track.enabled = !muted;
    this.#setState(muted ? 'muted' : 'listening');
  }

  pushToTalk(active: boolean): void {
    for (const track of this.#micStream?.getAudioTracks() ?? []) track.enabled = active;
    if (active) {
      this.#send({ type: 'input_audio_buffer.clear' });
      this.#setState('listening');
    } else {
      this.#send({ type: 'input_audio_buffer.commit' });
      this.#send({ type: 'response.create' });
    }
  }

  interrupt(): void {
    this.#send({ type: 'response.cancel' });
    if (this.#tutorSpeechStartedAt !== null) {
      this.#audioSecondsOut += (this.#now() - this.#tutorSpeechStartedAt) / 1000;
      this.#tutorSpeechStartedAt = null;
    }
    this.#setState('listening');
  }

  replayLast(): void {
    // There is no local buffer of the tutor's audio to replay: it went straight
    // from the peer connection to the speaker. Asking is the closest true
    // behaviour, and it is what a learner means by the button.
    this.#sendUserText('Please say that again.');
  }

  sendText(text: string): void {
    this.#emit({ type: 'caption', speaker: 'learner', text, final: true });
    this.#sendUserText(text);
  }

  #sendUserText(text: string): void {
    this.#send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    });
    this.#send({ type: 'response.create' });
  }

  respondTool(callId: string, result: ToolResult): void {
    this.#send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    this.#send({ type: 'response.create' });
  }

  async disconnect(): Promise<void> {
    await this.#end('hangup');
  }

  async #end(reason: RealtimeCallReport['reason']): Promise<void> {
    if (this.#ended) return;
    this.#ended = true;

    if (this.#maxDurationTimer !== null) {
      this.#clearTimeout(this.#maxDurationTimer);
      this.#maxDurationTimer = null;
    }
    // Close out any span that was still open, so the report is not short.
    if (this.#learnerSpeechStartedAt !== null) {
      this.#audioSecondsIn += (this.#now() - this.#learnerSpeechStartedAt) / 1000;
      this.#learnerSpeechStartedAt = null;
    }
    if (this.#tutorSpeechStartedAt !== null) {
      this.#audioSecondsOut += (this.#now() - this.#tutorSpeechStartedAt) / 1000;
      this.#tutorSpeechStartedAt = null;
    }

    try {
      this.#channel?.close();
    } catch {
      /* the channel may already be gone */
    }
    for (const track of this.#micStream?.getTracks() ?? []) track.stop();
    try {
      this.#pc?.close();
    } catch {
      /* likewise */
    }
    this.#channel = null;
    this.#pc = null;
    this.#micStream = null;

    this.#setState('ended');
    if (this.#secret) {
      this.#options.onEnd?.({
        callId: this.#secret.callId,
        audioSecondsIn: this.#audioSecondsIn,
        audioSecondsOut: this.#audioSecondsOut,
        reason,
      });
    }
  }
}

function defaultPeerConnectionFactory(): PeerConnectionFactory | null {
  const ctor = (globalThis as { RTCPeerConnection?: new () => PeerConnectionLike })
    .RTCPeerConnection;
  return ctor ? () => new ctor() : null;
}

function defaultGetUserMedia(): (() => Promise<MediaStreamLike>) | null {
  const media = (
    globalThis as {
      navigator?: { mediaDevices?: { getUserMedia(c: unknown): Promise<MediaStreamLike> } };
    }
  ).navigator?.mediaDevices;
  return media ? () => media.getUserMedia({ audio: true }) : null;
}
