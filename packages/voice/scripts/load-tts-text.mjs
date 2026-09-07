/**
 * Lets `tts-roundtrip.mjs PREPARED=1` import the TypeScript
 * `prepareForSpeech` with no build step. `tts-text.ts` is deliberately
 * import-free and erasable-syntax-only, so Node's built-in type stripping
 * (on by default since Node 22.18) loads it as-is.
 */
export { prepareForSpeech, MAX_SPEECH_CHARS } from '../src/browser-cascade/tts-text.ts';
