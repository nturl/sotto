/**
 * Web VoiceProvider AudioAdapter: thin re-export of @sotto/voice's
 * WebAudioAdapter (AudioWorklet capture + AudioContext playback).
 */
import { WebAudioAdapter, type AudioAdapter } from '@sotto/voice';

export function createAudioAdapter(): AudioAdapter {
  return new WebAudioAdapter();
}
