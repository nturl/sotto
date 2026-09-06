/**
 * STT client: POSTs a captured speech segment (wav) to the whisper-server /
 * speaches-compatible /v1/audio/transcriptions endpoint (planning/CONTRACTS.md
 * §5d). `language` is opt-in only: forcing it to the learner's learning
 * locale made Whisper decode whatever it heard into that locale instead of
 * transcribing it (BUGS-TUTOR-RUN5.md #1 — an English answer during a
 * Spanish book came back as a Spanish paraphrase, never English). The live
 * path (`transcribeWithFallback`) leaves `language` unset so Whisper
 * auto-detects, and biases decoding with a `prompt` naming both the
 * learning and explanation locale instead.
 */
import { sttLanguageHint } from '@sotto/core';
import { encodeWav } from './wav.js';

export interface SttConfig {
  url: string; // e.g. http://127.0.0.1:9001/v1
  model?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface SttResult {
  text: string;
}

function iso639(locale: string): string {
  return locale.split(/[-_]/)[0]!.toLowerCase();
}

export async function transcribe(
  pcm16: Uint8Array,
  sampleRate: number,
  language: string | undefined,
  config: SttConfig,
  prompt?: string,
  signal?: AbortSignal,
): Promise<SttResult> {
  const doFetch = config.fetchImpl ?? fetch;
  const wav = encodeWav(pcm16, sampleRate);

  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'segment.wav');
  if (language) form.set('language', iso639(language));
  if (prompt) form.set('prompt', prompt);
  form.set('response_format', 'json');
  if (config.model) form.set('model', config.model);

  const headers: Record<string, string> = {};
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const res = await doFetch(`${config.url.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    body: form,
    headers,
    signal,
  });
  if (!res.ok) {
    throw new Error(`STT request failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  const json = (await res.json()) as { text?: string };
  return { text: (json.text ?? '').trim() };
}

/**
 * Transcribes once with no forced language (auto-detect) and a `prompt`
 * naming both locales as a soft bias — see the file header for why a forced
 * `language`, and the emptiness-gated retry this replaced, let a garbled
 * but non-empty wrong-language transcript through uncaught.
 */
export async function transcribeWithFallback(
  pcm16: Uint8Array,
  sampleRate: number,
  learningLocale: string,
  explanationLocale: string,
  config: SttConfig,
  signal?: AbortSignal,
): Promise<SttResult> {
  return transcribe(
    pcm16,
    sampleRate,
    undefined,
    config,
    sttLanguageHint({ learningLocale, explanationLocale }),
    signal,
  );
}
