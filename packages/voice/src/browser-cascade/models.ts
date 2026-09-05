/**
 * Tutor model catalog + browser cache bookkeeping for the in-browser tutor
 * (planning/BROWSER-TUTOR.md).
 *
 * IMPORTANT: nothing in this file may import an ML library. It is reachable
 * from the Expo/Metro app bundle (the capability gate, the download panel
 * and the Settings screen all read it); `worker.ts` is the only module that
 * touches @huggingface/transformers / @mlc-ai/web-llm / kokoro-js, and it is
 * bundled separately by esbuild.
 */

/** Which pipeline stage a model serves. */
export type TutorStage = 'stt' | 'llm' | 'tts';

export interface TutorModelSpec {
  /** Hugging Face / MLC repo id — also the download progress key. */
  id: string;
  /** Short human name for the panel (not translated: it's a model name). */
  name: string;
  /** Approximate download size, MB, for the files this stage actually pulls. */
  sizeMb: number;
  stage: TutorStage;
  /** transformers.js dtype, per sub-model (STT/TTS only). */
  dtype?: Record<string, string>;
}

/**
 * Slice 1 ships STT only. whisper-small would be better but its q8 export is
 * ~249 MB, far past the budget; whisper-base is the largest that fits.
 *
 * The dtype split is not arbitrary. Measured on the slice-1 fixture (a
 * Kokoro-synthesized "¿Qué significa la palabra cigarra?", 3.8 s of es-419)
 * with transformers.js on CPU:
 *   encoder q8   + decoder q8 -> "que significa la palabra sigara"    (wrong)
 *   encoder fp32 + decoder q8 -> "que significa la palabra cigarras"  (right)
 *   encoder fp32 + decoder fp32 -> "¿Qué significa la palabra cigarras?"
 * Quantizing the ENCODER is what loses the word; quantizing the decoder
 * costs only punctuation and casing.
 *
 * The encoder dtype was originally fp16 (41.3 MB, half the bytes of fp32,
 * "which WebGPU handles natively"). That was wrong in a way the slice-1
 * fixture never caught: with the fp16 encoder, this repo's own WebGPU
 * whisper decoding regressed into a token-repetition loop — "de de de
 * de..." — that runs to whatever max_new_tokens its generation_config.json
 * defaults to instead of stopping at EOS, which is also why it was ~20x
 * slower (more tokens decoded, not "the same work done slowly"). Root-caused
 * in docs/evidence/browser-tutor-stt-regression-2026-09-05.log: reproduced
 * with the LLM never loaded, with the machine's native llama-server
 * stopped, and on a completely fresh browser profile, ruling out every
 * GPU-contention hypothesis; a native ground-truth transcription of the
 * exact same audio file was correct, ruling out the audio; forcing the
 * encoder to fp32 while keeping WebGPU as the device and the decoder at q8
 * fixed it outright (confirmed live, same fresh-profile methodology). So
 * fp32 is now the encoder dtype on every device — the smaller fp16 export is
 * not used at all. The decoder stays q8 (85 MB combined, and q8 costs only
 * punctuation/casing per the measurement above); wasm's CPU execution
 * provider additionally cannot build a session from a quantized
 * decoder_model_merged at all ("Can't create a session", a hard graph-build
 * failure, not a slowdown) — the wasm fallback in worker.ts's
 * `dtypeForDevice` upgrades the decoder to fp32 too, only for that device.
 *
 * LLM and TTS now load too (slices 2/3), so `TUTOR_MODELS` — what the
 * download button actually fetches — covers all three. `TTS_MODEL` still
 * downloads even though the worker only ever calls it for English books
 * (see worker.ts's honest label above `loadTts`): fr/es prompts still need
 * the STT+LLM stages, and the panel would otherwise have to explain a
 * locale-conditional download list before any book is chosen.
 */
export const STT_MODEL: TutorModelSpec = {
  id: 'onnx-community/whisper-base',
  name: 'Whisper base (speech to text)',
  sizeMb: 136,
  stage: 'stt',
  dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
};

export const LLM_MODEL: TutorModelSpec = {
  id: 'Qwen3-1.7B-q4f16_1-MLC',
  name: 'Qwen3 1.7B (tutor)',
  sizeMb: 1100,
  stage: 'llm',
};

export const TTS_MODEL: TutorModelSpec = {
  id: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  name: 'Kokoro 82M (text to speech)',
  sizeMb: 90,
  stage: 'tts',
};

/** What "Download tutor models" fetches: every stage, slices 1-3. */
export const TUTOR_MODELS: TutorModelSpec[] = [STT_MODEL, LLM_MODEL, TTS_MODEL];

/** Every model the browser tutor will eventually need, for the docs/panel.
 * Same list as `TUTOR_MODELS` now that all three stages ship; kept as a
 * separate export so callers that mean "the complete catalog" (docs, the
 * Settings row) don't depend on `TUTOR_MODELS` also being "what's
 * downloaded today", which was the slice-1 distinction this name preserves. */
export const ALL_TUTOR_MODELS: TutorModelSpec[] = TUTOR_MODELS;

export function totalSizeMb(models: TutorModelSpec[]): number {
  return models.reduce((sum, m) => sum + m.sizeMb, 0);
}

// ---- Cache bookkeeping ----

/**
 * Our own marker cache. The libraries keep the actual weights in their own
 * caches (`transformers-cache`, `experimental_transformers-hash-cache`,
 * `kokoro-voices`, and WebLLM's IndexedDB/Cache entries), whose exact keys
 * are library implementation details and change between versions. Rather
 * than guessing at those keys to answer "are the models here?", the worker
 * writes a tiny marker Response per model id once a load has actually
 * succeeded, and the capability gate reads the markers.
 */
export const MARKER_CACHE = 'sotto-tutor-models';

/** Library caches that "Remove models" deletes outright. */
export const LIBRARY_CACHES = [
  'transformers-cache',
  'experimental_transformers-hash-cache',
  'kokoro-voices',
  'webllm/model',
  'webllm/wasm',
  'webllm/config',
];

function markerUrl(modelId: string): string {
  // Cache keys must be same-origin-parseable URLs; the path is never fetched.
  return `https://sotto.local/tutor-model/${encodeURIComponent(modelId)}`;
}

function cacheStorage(): CacheStorage | null {
  // `caches` needs a secure context; it is also absent under vitest/jsdom.
  return typeof caches === 'undefined' ? null : caches;
}

/** Ids of models whose weights have been downloaded and loaded at least once. */
export async function cachedModelIds(): Promise<string[]> {
  const cs = cacheStorage();
  if (!cs) return [];
  try {
    if (!(await cs.has(MARKER_CACHE))) return [];
    const cache = await cs.open(MARKER_CACHE);
    const keys = await cache.keys();
    return keys.map((req) => decodeURIComponent(req.url.split('/tutor-model/')[1] ?? ''));
  } catch {
    return [];
  }
}

export async function markModelCached(modelId: string): Promise<void> {
  const cs = cacheStorage();
  if (!cs) return;
  try {
    const cache = await cs.open(MARKER_CACHE);
    await cache.put(markerUrl(modelId), new Response('1'));
  } catch {
    // A private window or a browser with site data blocked: the model still
    // works this session, it just won't be remembered. Not worth surfacing.
  }
}

/** True when every model in `models` has a marker. */
export async function modelsReady(models: TutorModelSpec[]): Promise<boolean> {
  if (models.length === 0) return true;
  const cached = new Set(await cachedModelIds());
  return models.every((m) => cached.has(m.id));
}

/** Deletes the markers and every library cache. Returns the caches removed. */
export async function removeModels(): Promise<string[]> {
  const cs = cacheStorage();
  if (!cs) return [];
  const removed: string[] = [];
  for (const name of [MARKER_CACHE, ...LIBRARY_CACHES]) {
    try {
      if (await cs.delete(name)) removed.push(name);
    } catch {
      // ignore: nothing we can do, and the marker delete is what matters
    }
  }
  return removed;
}

/** WebGPU presence. The browser tutor's hard capability gate. */
export function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}
