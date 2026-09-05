/**
 * TTS client: POSTs one sentence to Kokoro's /v1/audio/speech
 * (planning/CONTRACTS.md §5d) and streams the raw PCM16 mono 24 kHz response
 * body back to the caller in ~100 ms (4800-byte) chunks, so playback can
 * start before the whole sentence has been synthesized.
 */

export interface TtsConfig {
  url: string; // e.g. http://127.0.0.1:8880/v1
  model?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

// voice/lang_code per learning locale base language (CONTRACTS §5d).
const VOICE_BY_LANG: Record<string, { voice: string; langCode: string }> = {
  fr: { voice: 'ff_siwis', langCode: 'f' },
  es: { voice: 'ef_dora', langCode: 'e' },
  en: { voice: 'af_heart', langCode: 'a' },
  it: { voice: 'if_sara', langCode: 'i' },
  pt: { voice: 'pf_dora', langCode: 'p' },
  zh: { voice: 'zf_xiaoxiao', langCode: 'z' },
};

export function voiceForLocale(locale: string): { voice: string; langCode: string } {
  const base = locale.split(/[-_]/)[0]!.toLowerCase();
  return VOICE_BY_LANG[base] ?? VOICE_BY_LANG.en!;
}

export const TTS_CHUNK_BYTES = 4800; // ~100ms of PCM16 mono @ 24kHz

// OpenAI's /v1/audio/speech takes a fixed voice enum (nova, shimmer, echo,
// onyx, fable, alloy, ash, sage, coral) with no per-locale mapping — it
// picks the language up from the input text itself — and rejects Kokoro's
// `lang_code` extension outright. Verified live 2026-09-05 (self-hosting
// proof, docs/evidence/selfhost-2026-09-05.log): sending Kokoro's
// locale-mapped voice name ('ef_dora' etc.) 400s.
const OPENAI_VOICE = 'alloy';

export async function synthesizeSpeech(
  text: string,
  learningLocale: string,
  speed: number,
  config: TtsConfig,
  onChunk: (chunk: Uint8Array) => void,
  signal?: AbortSignal,
): Promise<void> {
  const doFetch = config.fetchImpl ?? fetch;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const isOpenAi = /(^|\.)api\.openai\.com$/.test(new URL(config.url).hostname);
  const { voice, langCode } = voiceForLocale(learningLocale);

  const res = await doFetch(`${config.url.replace(/\/$/, '')}/audio/speech`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: config.model ?? 'kokoro',
      input: text,
      voice: isOpenAi ? OPENAI_VOICE : voice,
      ...(isOpenAi ? {} : { lang_code: langCode }),
      response_format: 'pcm',
      speed,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`TTS request failed: ${res.status} ${await res.text().catch(() => '')}`);
  }

  const reader = res.body.getReader();
  let pending = new Uint8Array(0);

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const merged = new Uint8Array(pending.byteLength + value.byteLength);
      merged.set(pending, 0);
      merged.set(value, pending.byteLength);
      pending = merged;

      let offset = 0;
      while (pending.byteLength - offset >= TTS_CHUNK_BYTES) {
        onChunk(pending.slice(offset, offset + TTS_CHUNK_BYTES));
        offset += TTS_CHUNK_BYTES;
      }
      pending = pending.slice(offset);
    }
  } finally {
    reader.releaseLock();
  }

  if (pending.byteLength > 0) onChunk(pending);
}
