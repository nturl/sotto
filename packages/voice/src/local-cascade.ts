/**
 * LocalCascadeProvider: WebSocket VoiceProvider client for apps/server's
 * voice pipeline (planning/CONTRACTS.md §5a/§5b). This is the default
 * provider.
 */
import type { ToolName, ToolResult, TutorMode } from '@sotto/core';
import type { VoiceEvent, VoiceState } from './events.ts';
import type { PassageContext, SessionOptions, VoiceProvider } from './provider.ts';
import type { AudioAdapter } from './transports/audio-adapter.js';

// ---- Wire protocol (§5b) ----

interface SessionCreateResponse {
  sessionId: string;
  wsUrl: string;
  sampleRate: number;
  limits: { maxMs: number; idleMs: number };
}

type ServerMessage =
  | { t: 'state'; state: VoiceState }
  | { t: 'caption'; speaker: 'learner' | 'tutor'; text: string; final: boolean }
  | { t: 'tool_call'; callId: string; name: ToolName; args: unknown }
  | { t: 'reading'; tokenIds: string[] }
  // R3-S: the cloud voice path's server sends `reason: 'cap'` before
  // closing on minute-cap exhaustion (CLOUD-API.md), additive to the local
  // server's own 'max_duration'/'idle'.
  | { t: 'limit'; reason: 'max_duration' | 'idle' | 'cap' }
  // R3-S: cloud-only, every 30s (CLOUD-API.md's wire-protocol addendum).
  | { t: 'usage'; secondsUsed: number; remainingSeconds: number }
  | { t: 'error'; code: string; message: string; recoverable: boolean }
  | { t: 'audio_start'; utteranceId: string }
  | { t: 'audio_end'; utteranceId: string; cancelled?: boolean };

type ClientMessage =
  | { t: 'mode'; mode: TutorMode }
  | { t: 'mute'; muted: boolean }
  | { t: 'ptt'; active: boolean }
  | { t: 'interrupt' }
  | { t: 'replay' }
  | { t: 'text'; text: string }
  | { t: 'tool_result'; callId: string; ok: boolean; result?: unknown; error?: string }
  | { t: 'passage'; passage: PassageContext }
  | { t: 'end' };

const TUTOR_SAMPLE_RATE = 24000;
const RECONNECT_DELAY_MS = 1000;

export interface LocalCascadeOptions {
  serverUrl: string;
  audio: AudioAdapter;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  /**
   * R3-S additive hook: overrides how a session is created, skipping the
   * default `POST ${serverUrl}/voice/session`. The cloud voice path
   * (apps/client/src/voice/sessionManager.ts) already has a signed
   * `wsUrl` from `cloud.voiceSession()` (CLOUD-API.md's `/voice/session`
   * broker) and no local `apps/server` to POST to — reusing
   * LocalCascadeProvider's WS protocol handling for that path (rather than
   * a second parallel provider class) meant this needed to be pluggable.
   * Default behavior (every existing caller) is unchanged when omitted.
   */
  createSession?: (opts: SessionOptions) => Promise<SessionCreateResponse>;
}

export class LocalCascadeProvider implements VoiceProvider {
  private readonly serverUrl: string;
  private readonly audio: AudioAdapter;
  private readonly fetchImpl: typeof fetch;
  private readonly WebSocketImpl: typeof WebSocket;
  private readonly createSessionImpl?: (opts: SessionOptions) => Promise<SessionCreateResponse>;

  private ws: WebSocket | null = null;
  private listeners = new Set<(e: VoiceEvent) => void>();
  private lastOptions: SessionOptions | null = null;
  private state: VoiceState = 'idle';
  private reconnectAttempted = false;
  private intentionalDisconnect = false;

  private currentUtteranceId: string | null = null;
  private currentUtteranceChunks: ArrayBuffer[] = [];

  constructor(opts: LocalCascadeOptions) {
    this.serverUrl = opts.serverUrl.replace(/\/$/, '');
    this.audio = opts.audio;
    // Storing the bare global `fetch` reference and calling it later as
    // `this.fetchImpl(...)` throws "Illegal invocation" in real browsers —
    // fetch's spec implementation checks its receiver is a Window/Worker
    // global, and detaching it from `this` (which reassigning to a class
    // field does) breaks that check. Only surfaced once something actually
    // drove LocalCascadeProvider end-to-end in a browser (WS-6 live-voice
    // e2e); FakeVoiceProvider and the Node-side voice-smoke script never
    // exercised this path. `.bind(globalThis)` restores the receiver.
    this.fetchImpl = opts.fetch ?? fetch.bind(globalThis);
    this.WebSocketImpl = opts.WebSocket ?? (globalThis.WebSocket as typeof WebSocket);
    this.createSessionImpl = opts.createSession;
  }

  on(listener: (e: VoiceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: VoiceEvent): void {
    if (e.type === 'state') this.state = e.state;
    for (const l of this.listeners) l(e);
  }

  async connect(opts: SessionOptions): Promise<void> {
    this.lastOptions = opts;
    this.intentionalDisconnect = false;
    await this.openConnection(opts);
  }

  private async openConnection(opts: SessionOptions): Promise<void> {
    this.emit({ type: 'state', state: 'connecting' });

    let session: SessionCreateResponse;
    if (this.createSessionImpl) {
      // R3-S cloud path: `createSession` throws (typically a `CloudError`
      // with a `code`/`message`, e.g. 'cap_exhausted'/'plan_required') on
      // failure rather than returning a Response — propagate its code and
      // learner-facing message as-is instead of the generic HTTP-status
      // message below, so the voice screen can show the server's own text.
      try {
        session = await this.createSessionImpl(opts);
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code: unknown }).code)
            : 'session_create_failed';
        const message = err instanceof Error ? err.message : String(err);
        this.emit({ type: 'error', code, message, recoverable: false });
        this.emit({ type: 'state', state: 'error' });
        return;
      }
    } else {
      const res = await this.fetchImpl(`${this.serverUrl}/voice/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      if (!res.ok) {
        this.emit({
          type: 'error',
          code: 'session_create_failed',
          message: `${res.status}`,
          recoverable: false,
        });
        this.emit({ type: 'state', state: 'error' });
        return;
      }
      session = (await res.json()) as SessionCreateResponse;
    }

    const ws = new this.WebSocketImpl(session.wsUrl);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.reconnectAttempted = false;
      // A capture failure (mic permission denied, no input device, a
      // suspended AudioContext) used to be swallowed here, leaving the
      // session in 'listening' while no audio ever reached the server.
      this.audio
        .startCapture((buf) => {
          if (ws.readyState === ws.OPEN) ws.send(buf);
        })
        .catch((err: unknown) => {
          this.emit({
            type: 'error',
            code: 'mic_unavailable',
            message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
            recoverable: false,
          });
          this.emit({ type: 'state', state: 'error' });
        });
    });

    ws.addEventListener('message', (ev: MessageEvent) => {
      this.handleServerData(ev.data as string | ArrayBuffer);
    });

    ws.addEventListener('close', () => {
      this.audio.stopCapture();
      this.audio.stopPlayback();
      if (this.intentionalDisconnect) return;
      if (!this.reconnectAttempted && this.lastOptions) {
        this.reconnectAttempted = true;
        this.emit({ type: 'state', state: 'reconnecting' });
        setTimeout(() => {
          if (this.intentionalDisconnect || !this.lastOptions) return;
          void this.openConnection(this.lastOptions);
        }, RECONNECT_DELAY_MS);
      } else {
        this.emit({ type: 'state', state: 'ended' });
      }
    });

    ws.addEventListener('error', () => {
      this.emit({ type: 'error', code: 'ws_error', message: 'WebSocket error', recoverable: true });
    });
  }

  private handleServerData(data: string | ArrayBuffer): void {
    if (typeof data !== 'string') {
      if (this.currentUtteranceId) {
        this.currentUtteranceChunks.push(data);
        this.audio.playPcm(data, TUTOR_SAMPLE_RATE);
      }
      return;
    }

    let msg: ServerMessage;
    try {
      msg = JSON.parse(data) as ServerMessage;
    } catch {
      return;
    }

    switch (msg.t) {
      case 'state':
        this.emit({ type: 'state', state: msg.state });
        break;
      case 'caption':
        this.emit({ type: 'caption', speaker: msg.speaker, text: msg.text, final: msg.final });
        break;
      case 'tool_call':
        this.emit({ type: 'tool_call', callId: msg.callId, name: msg.name, args: msg.args });
        break;
      case 'reading':
        this.emit({ type: 'reading', tokenIds: msg.tokenIds });
        break;
      case 'limit':
        this.emit({ type: 'limit', reason: msg.reason });
        break;
      case 'usage':
        this.emit({
          type: 'usage',
          secondsUsed: msg.secondsUsed,
          remainingSeconds: msg.remainingSeconds,
        });
        break;
      case 'error':
        this.emit({
          type: 'error',
          code: msg.code,
          message: msg.message,
          recoverable: msg.recoverable,
        });
        break;
      case 'audio_start':
        this.currentUtteranceId = msg.utteranceId;
        this.currentUtteranceChunks = [];
        break;
      case 'audio_end':
        if (msg.cancelled) this.audio.stopPlayback();
        this.currentUtteranceId = null;
        this.currentUtteranceChunks = [];
        break;
    }
  }

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this.lastOptions = null;
    this.send({ t: 'end' });
    this.audio.stopCapture();
    this.audio.stopPlayback();
    this.ws?.close();
    this.ws = null;
  }

  setMode(mode: TutorMode): void {
    this.send({ t: 'mode', mode });
  }

  setMuted(muted: boolean): void {
    this.send({ t: 'mute', muted });
  }

  pushToTalk(active: boolean): void {
    this.send({ t: 'ptt', active });
  }

  interrupt(): void {
    this.audio.stopPlayback();
    this.send({ t: 'interrupt' });
  }

  replayLast(): void {
    this.send({ t: 'replay' });
  }

  sendText(text: string): void {
    this.send({ t: 'text', text });
  }

  respondTool(callId: string, result: ToolResult): void {
    // @sotto/core's ToolResult is a discriminated union of specific success
    // shapes (some carrying `ok: true`, get_current_passage's carrying none
    // at all) plus ToolFailure (`ok: false`); the wire protocol (§5b) wants
    // a flat { ok, result?, error? }, so only an explicit `ok: false` counts
    // as failure — everything else is forwarded as the success payload.
    if ('ok' in result && result.ok === false) {
      this.send({ t: 'tool_result', callId, ok: false, error: result.error });
    } else {
      this.send({ t: 'tool_result', callId, ok: true, result });
    }
  }
}
