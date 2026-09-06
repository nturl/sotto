/**
 * The three api.openai.com calls the bring-your-own-key tutor makes, plus
 * the key-validation call, as plain `fetch` functions.
 *
 * Everything here was measured browser-direct from an iPhone-shaped WebKit
 * page and desktop Chromium in lane R4-B1 phase 2
 * (docs/evidence/byok-cors-2026-09-05.log). The three facts that bind this
 * file, all from that log:
 *
 *  1. A bad key produces an UNREADABLE failure on the inference endpoints:
 *     the 401 authentication-failure response is the one response shape
 *     api.openai.com serves without `Access-Control-Allow-Origin`, so the
 *     browser discards it and `fetch` rejects with an opaque
 *     "Failed to fetch" / "Load failed". `GET /v1/models` does carry ACAO on
 *     its 401 and returns a readable `error.code: invalid_api_key`, so that
 *     is the only endpoint key validation may use.
 *  2. `POST /v1/audio/speech` with `response_format: 'pcm'` returns raw
 *     headerless bytes and NO sample-rate information in any header
 *     (content-type is a bare `audio/pcm`). The rate is 24000 Hz, mono,
 *     16-bit little-endian — established from the `wav` variant's RIFF
 *     header — so it is hardcoded here (`TUTOR_SAMPLE_RATE`).
 *  3. Streamed chat completions carry an extra `obfuscation` field on each
 *     SSE chunk. It is padding; ignore it.
 *
 * The API key reaches exactly one place: the `Authorization` header of a
 * request to `OPENAI_BASE_URL`. It is never logged, never put in a URL,
 * never stored by this module.
 */
import { TOOL_DEFINITIONS } from '@sotto/core';
import type {
  ChatMessage,
  EngineChatHandlers,
  EngineToolCall,
  LlmEngine,
} from '../browser-cascade/llm-turn.ts';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/** Headerless PCM from `/v1/audio/speech` is 24 kHz mono 16-bit LE — the
 * response carries no rate metadata at all (fact 2 above). */
export const TUTOR_SAMPLE_RATE = 24000;
/** What the AudioAdapter captures at (CONTRACTS §5b). */
export const CAPTURE_SAMPLE_RATE = 16000;

export const DEFAULT_STT_MODEL = 'gpt-4o-mini-transcribe';
export const DEFAULT_LLM_MODEL = 'gpt-4o-mini';
export const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';

/**
 * One voice per learning language.
 *
 * OpenAI's TTS voices are not language-specific — every one of them speaks
 * every supported language — so this map is a deliberate editorial choice
 * (a distinct, consistent tutor voice per language), not a capability
 * constraint. Keyed by ISO-639-1 base code; anything unlisted gets `alloy`.
 */
export const TTS_VOICES: Record<string, string> = {
  en: 'alloy',
  fr: 'ballad',
  es: 'coral',
  it: 'nova',
  pt: 'shimmer',
  ro: 'echo',
  ca: 'sage',
  zh: 'verse',
};

export const DEFAULT_TTS_VOICE = 'alloy';

export function iso639(locale: string): string {
  return locale.split(/[-_]/)[0]!.toLowerCase();
}

export function voiceForLocale(locale: string): string {
  return TTS_VOICES[iso639(locale)] ?? DEFAULT_TTS_VOICE;
}

// ---- Errors ----

export interface ByokErrorShape {
  code: string;
  message: string;
  recoverable: boolean;
}

/** An api.openai.com response we could read a status from. */
export class OpenAIHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OpenAIHttpError';
  }
}

/**
 * Maps any failure from the calls below onto the `error` VoiceEvent fields.
 *
 * 401/403 is a dead key — not recoverable, the learner has to fix it in
 * Settings. 429 is rate limiting or a spent quota, which retrying later
 * fixes. Anything else, including the opaque browser-CORS rejection that a
 * bad key produces on the inference endpoints (fact 1), is reported as
 * recoverable: the session stays alive and the learner can try again.
 */
export function byokError(err: unknown): ByokErrorShape {
  if (err instanceof OpenAIHttpError) {
    if (err.status === 401 || err.status === 403) {
      return { code: 'byok_invalid_key', message: err.message, recoverable: false };
    }
    if (err.status === 429) {
      return { code: 'byok_rate_limited', message: err.message, recoverable: true };
    }
    return { code: 'byok_request_failed', message: err.message, recoverable: true };
  }
  return {
    code: 'byok_network_failed',
    message: err instanceof Error ? err.message : String(err),
    recoverable: true,
  };
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

async function failure(res: Response): Promise<OpenAIHttpError> {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 200);
  } catch {
    // A body we cannot read is normal here (see fact 1); the status is enough.
  }
  return new OpenAIHttpError(res.status, `HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
}

// ---- Key validation ----

export type KeyValidation =
  { ok: true } | { ok: false; reason: 'invalid' | 'rate_limited' | 'network'; message: string };

/**
 * The only safe way to tell a learner their key is wrong.
 *
 * `GET /v1/models` returns a readable 401 with `error.code: invalid_api_key`
 * from a browser page; the inference endpoints do not (fact 1). Called by
 * the Settings screen on Save.
 */
export async function validateOpenAIKey(
  key: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = OPENAI_BASE_URL,
): Promise<KeyValidation> {
  if (!key.trim()) return { ok: false, reason: 'invalid', message: 'empty key' };
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/models`, { headers: authHeaders(key.trim()) });
  } catch (err) {
    return {
      ok: false,
      reason: 'network',
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (res.ok) return { ok: true };
  if (res.status === 429) return { ok: false, reason: 'rate_limited', message: 'HTTP 429' };
  return { ok: false, reason: 'invalid', message: `HTTP ${res.status}` };
}

// ---- STT ----

/**
 * Wraps mono PCM16 little-endian samples in a 44-byte canonical WAV header.
 * `/v1/audio/transcriptions` is a multipart endpoint that wants a real
 * audio file, and the AudioAdapter hands us bare frames.
 */
export function pcm16ToWav(pcm: Int16Array, sampleRate = CAPTURE_SAMPLE_RATE): ArrayBuffer {
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audioFormat = PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byteRate
  view.setUint16(32, 2, true); // blockAlign
  view.setUint16(34, 16, true); // bitsPerSample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  new Int16Array(buffer, 44).set(pcm);
  return buffer;
}

export interface TranscribeOptions {
  apiKey: string;
  pcm: Int16Array;
  /**
   * Optional ISO-639-1 override. Leave undefined (the default for every
   * live call site) so Whisper auto-detects the spoken language instead of
   * forcing every utterance into the learner's learning locale — a forced
   * language decodes whatever it hears into that locale instead of
   * transcribing it (BUGS-TUTOR-RUN5.md #1: an English answer during a
   * Spanish book came back as a Spanish paraphrase, never English).
   */
  language?: string;
  /** Soft decoding bias naming the locales in play, without forcing one
   * (see @sotto/core's `sttLanguageHint`). */
  prompt?: string;
  model?: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  signal?: AbortSignal;
  sampleRate?: number;
}

export async function transcribe(opts: TranscribeOptions): Promise<string> {
  const fetchImpl = opts.fetch ?? fetch;
  const baseUrl = opts.baseUrl ?? OPENAI_BASE_URL;
  const wav = pcm16ToWav(opts.pcm, opts.sampleRate ?? CAPTURE_SAMPLE_RATE);
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'utterance.wav');
  form.append('model', opts.model ?? DEFAULT_STT_MODEL);
  if (opts.language) form.append('language', iso639(opts.language));
  if (opts.prompt) form.append('prompt', opts.prompt);
  // No Content-Type header: the browser must set the multipart boundary
  // itself, which also keeps the preflight's Access-Control-Request-Headers
  // to `authorization` alone (byok-cors log, endpoint 1).
  const res = await fetchImpl(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: authHeaders(opts.apiKey),
    body: form,
    signal: opts.signal,
  });
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { text?: string };
  return (body.text ?? '').trim();
}

// ---- TTS ----

export interface SpeakOptions {
  apiKey: string;
  text: string;
  /** From TTS_VOICES. */
  voice: string;
  /** 0.25-4.0; the tutor uses 0.85 for the "slower" marker. */
  speed?: number;
  model?: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  signal?: AbortSignal;
}

/** Returns raw headerless PCM16 mono at TUTOR_SAMPLE_RATE (fact 2). */
export async function speak(opts: SpeakOptions): Promise<ArrayBuffer> {
  const fetchImpl = opts.fetch ?? fetch;
  const baseUrl = opts.baseUrl ?? OPENAI_BASE_URL;
  const res = await fetchImpl(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: { ...authHeaders(opts.apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_TTS_MODEL,
      voice: opts.voice,
      input: opts.text,
      response_format: 'pcm',
      ...(opts.speed != null ? { speed: opts.speed } : {}),
    }),
    signal: opts.signal,
  });
  if (!res.ok) throw await failure(res);
  return res.arrayBuffer();
}

// ---- LLM ----

interface StreamDelta {
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

export interface OpenAIChatEngineOptions {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * `LlmEngine` (browser-cascade/llm-turn.ts) backed by streaming
 * `POST /v1/chat/completions`, so `TutorTurnRunner` — the same turn loop the
 * in-browser tutor and apps/server both use — drives this provider unchanged.
 */
export class OpenAIChatEngine implements LlmEngine {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly opts: OpenAIChatEngineOptions) {
    // Same "Illegal invocation" hazard LocalCascadeProvider documents: a
    // bare global `fetch` stored on a class field loses its Window receiver.
    this.fetchImpl = opts.fetch ?? fetch.bind(globalThis);
    this.baseUrl = opts.baseUrl ?? OPENAI_BASE_URL;
  }

  async chat(
    messages: ChatMessage[],
    handlers: EngineChatHandlers,
    signal: AbortSignal,
  ): Promise<{ text: string; toolCalls: EngineToolCall[] }> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { ...authHeaders(this.opts.apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.opts.model ?? DEFAULT_LLM_MODEL,
        messages,
        tools: TOOL_DEFINITIONS,
        stream: true,
        temperature: this.opts.temperature ?? 0.4,
        // Same ceiling the server's llm.ts uses for spoken turns.
        max_tokens: this.opts.maxTokens ?? 200,
      }),
      signal,
    });
    if (!res.ok) throw await failure(res);
    if (!res.body) throw new OpenAIHttpError(res.status, 'no response body to stream');

    const toolCallsByIndex = new Map<number, { id: string; name: string; arguments: string }>();
    let text = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        if (signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line. Anything not yet
        // terminated stays in `buffer` for the next chunk.
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let chunk: { choices?: Array<{ delta?: StreamDelta }> };
            try {
              // The `obfuscation` field on every chunk is padding
              // (byok-cors log, endpoint 2b). Reading only `choices`
              // ignores it by construction.
              chunk = JSON.parse(payload);
            } catch {
              continue;
            }
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;
            if (typeof delta.content === 'string' && delta.content.length > 0) {
              text += delta.content;
              await handlers.onTextDelta?.(delta.content);
            }
            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const existing = toolCallsByIndex.get(tc.index) ?? {
                  id: '',
                  name: '',
                  arguments: '',
                };
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                toolCallsByIndex.set(tc.index, existing);
              }
            }
          }
        }
      }
    } finally {
      // Releasing the lock lets an aborted fetch's stream be torn down
      // instead of leaking a half-read body.
      try {
        reader.releaseLock();
      } catch {
        // Already released by an abort — nothing to do.
      }
    }

    const toolCalls: EngineToolCall[] = [...toolCallsByIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, tc]) => ({
        id: tc.id || `call_${index}`,
        name: tc.name,
        arguments: tc.arguments,
      }))
      .filter((tc) => tc.name.length > 0);

    return { text, toolCalls };
  }
}
