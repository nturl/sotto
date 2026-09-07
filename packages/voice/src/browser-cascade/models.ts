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
 * ---- The two tutor tiers ----
 *
 * One catalog, two sizes, chosen by the learner ("Tutor size" in Settings >
 * Tutor models and in the download panel itself). The default is
 * `standard`; `large` is offered only where `deviceSupportsLargeTier()`
 * (apps/client/src/voice/availability.ts) says the machine can hold it.
 *
 * standard  whisper-base + Qwen3.5 2B + Kokoro — the phone/8 GB-laptop tier.
 * large     whisper-small + Qwen3.5 4B + Kokoro — noticeably better at
 *           picking speech up, and at answering, on a capable computer.
 *
 * Both LLM ids are in @mlc-ai/web-llm 0.2.84's `prebuiltAppConfig`, their
 * `model_lib` wasm URLs resolve, and their `mlc-ai/<id>` HF repos exist
 * (they ship the newer `tensor-cache.json` manifest, which is the only one
 * 0.2.84 reads — it has no `ndarray-cache.json` code path left). WebLLM
 * implements `extra_body.enable_thinking: false` itself, by pushing an
 * empty `<think>\n\n</think>` block into the prompt before decoding, so
 * worker.ts's no-think request is honoured by Qwen3.5 exactly as it was by
 * Qwen3 — it does not depend on either model's Jinja chat template (both of
 * which also branch on `enable_thinking`).
 *
 * Sizes below are MEASURED, not estimated: LLMs are the sum of `nbytes` in
 * `https://huggingface.co/mlc-ai/<id>/raw/main/tensor-cache.json` plus the
 * model_lib wasm; whisper is the exact ONNX files the dtypes below select
 * plus the tokenizer/vocab/config files transformers.js fetches alongside.
 *
 * Switching tiers does NOT delete the other tier's cached weights — the
 * libraries keep them, and only "Remove models" clears everything (see
 * `removeModels`). The panel says so rather than implying a swap is free.
 *
 * ---- Why these whisper dtypes ----
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
 * fp32 is now the encoder dtype on every device, in BOTH tiers — the
 * smaller fp16 export is not used at all. The decoder stays q8 (q8 costs
 * only punctuation/casing per the measurement above); wasm's CPU execution
 * provider additionally cannot build a session from a quantized
 * decoder_model_merged at all ("Can't create a session", a hard graph-build
 * failure, not a slowdown) — the wasm fallback in worker.ts's
 * `dtypeForDevice` upgrades the decoder to fp32 too, only for that device.
 * That rule is per-device, not per-tier, so it applies to whisper-small
 * unchanged.
 *
 * `TTS_MODEL` still downloads in both tiers even though the worker only
 * ever calls it for English books (see worker.ts's honest label above
 * `loadTts`): fr/es prompts still need the STT+LLM stages, and the panel
 * would otherwise have to explain a locale-conditional download list before
 * any book is chosen.
 */

/** Which download size the learner picked. Missing preference = 'standard'. */
export type TutorTier = 'standard' | 'large';

/** The three models one tier loads. */
export interface TutorTierSpec {
  tier: TutorTier;
  stt: TutorModelSpec;
  llm: TutorModelSpec;
  tts: TutorModelSpec;
}

/** Both tiers speak with the same voice; only STT and the LLM change. */
const KOKORO: TutorModelSpec = {
  id: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  name: 'Kokoro 82M (text to speech)',
  sizeMb: 90,
  stage: 'tts',
};

/** fp32 encoder / q8 decoder, for both whisper sizes — see the note above. */
const WHISPER_DTYPE = { encoder_model: 'fp32', decoder_model_merged: 'q8' };

export const TUTOR_TIERS: Record<TutorTier, TutorTierSpec> = {
  standard: {
    tier: 'standard',
    stt: {
      // 78.6 MB encoder_model.onnx + 51.2 MB decoder_model_merged_quantized
      // .onnx + 4.2 MB tokenizer/vocab/config = 134 MB.
      id: 'onnx-community/whisper-base',
      name: 'Whisper base (speech to text)',
      sizeMb: 134,
      stage: 'stt',
      dtype: WHISPER_DTYPE,
    },
    llm: {
      // 1010.2 MB of weights (tensor-cache.json) + 5.9 MB model_lib wasm.
      id: 'Qwen3.5-2B-q4f16_1-MLC',
      name: 'Qwen3.5 2B (tutor)',
      sizeMb: 1016,
      stage: 'llm',
    },
    tts: KOKORO,
  },
  large: {
    tier: 'large',
    stt: {
      // 336.5 MB encoder_model.onnx + 149.5 MB
      // decoder_model_merged_quantized.onnx + 4.2 MB tokenizer/vocab/config.
      id: 'onnx-community/whisper-small',
      name: 'Whisper small (speech to text)',
      sizeMb: 490,
      stage: 'stt',
      dtype: WHISPER_DTYPE,
    },
    llm: {
      // 2257.5 MB of weights (tensor-cache.json) + 6.2 MB model_lib wasm.
      id: 'Qwen3.5-4B-q4f16_1-MLC',
      name: 'Qwen3.5 4B (tutor)',
      sizeMb: 2264,
      stage: 'llm',
    },
    tts: KOKORO,
  },
};

/** What a learner who has never touched the setting gets. */
export const DEFAULT_TIER: TutorTier = 'standard';

/** Narrows a stored preference (which may be absent, or from an older or
 * newer build) to a tier this build knows about. */
export function resolveTier(tier: string | undefined | null): TutorTier {
  return tier === 'large' ? 'large' : DEFAULT_TIER;
}

/** The three models a tier downloads, in pipeline order (stt, llm, tts) —
 * the order the panel lists them in and the worker loads them in. */
export function modelsForTier(tier: TutorTier): TutorModelSpec[] {
  const spec = TUTOR_TIERS[tier];
  return [spec.stt, spec.llm, spec.tts];
}

/** The standard tier's models, as bare exports. Every real consumer is
 * tier-aware now (the provider, the worker payload, the capability gate,
 * the panel); these stay so that callers which only ever mean "the default
 * tutor" — the sample-audio helper, the unit tests — keep compiling. */
export const STT_MODEL: TutorModelSpec = TUTOR_TIERS[DEFAULT_TIER].stt;
export const LLM_MODEL: TutorModelSpec = TUTOR_TIERS[DEFAULT_TIER].llm;
export const TTS_MODEL: TutorModelSpec = TUTOR_TIERS[DEFAULT_TIER].tts;

/** What "Download tutor models" fetches at the default tier. */
export const TUTOR_MODELS: TutorModelSpec[] = modelsForTier(DEFAULT_TIER);

/** Every model the default tier needs, for the docs/panel. Same list as
 * `TUTOR_MODELS` now that all three stages ship; kept as a separate export
 * so callers that mean "the complete catalog" (docs, the Settings row)
 * don't depend on `TUTOR_MODELS` also being "what's downloaded today",
 * which was the slice-1 distinction this name preserves. */
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
