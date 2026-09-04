/**
 * STT client: POSTs a captured speech segment (wav) to the whisper-server /
 * speaches-compatible /v1/audio/transcriptions endpoint (planning/CONTRACTS.md
 * §5d). `language` is the learner's learning-locale ISO 639-1 code; if the
 * first transcript looks empty the caller retries once with the explanation
 * locale (learner may have spoken the explanation language, e.g. asking for
 * help in English while learning French).
 */
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
  language: string,
  config: SttConfig,
  signal?: AbortSignal,
): Promise<SttResult> {
  const doFetch = config.fetchImpl ?? fetch;
  const wav = encodeWav(pcm16, sampleRate);

  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'segment.wav');
  form.set('language', iso639(language));
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
 * Transcribes with the learning locale first; if the result is empty, retries
 * once with the explanation locale (the learner may have switched languages).
 */
export async function transcribeWithFallback(
  pcm16: Uint8Array,
  sampleRate: number,
  learningLocale: string,
  explanationLocale: string,
  config: SttConfig,
  signal?: AbortSignal,
): Promise<SttResult> {
  const first = await transcribe(pcm16, sampleRate, learningLocale, config, signal);
  if (first.text.length > 0) return first;
  if (iso639(learningLocale) === iso639(explanationLocale)) return first;
  return transcribe(pcm16, sampleRate, explanationLocale, config, signal);
}
