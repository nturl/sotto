#!/usr/bin/env tsx
/**
 * End-to-end smoke test for the voice pipeline: creates a session for a
 * fixture French passage, streams learner speech (from a wav file given on
 * the CLI, or synthesized via Kokoro if none is given), prints every event
 * with elapsed timestamps, answers tool_call with a canned success result,
 * and demonstrates barge-in by talking over the tutor mid-reply.
 *
 * Usage: pnpm --filter @sotto/server smoke [path/to/learner-speech.wav]
 */
import { readFileSync } from 'node:fs';

const SERVER_URL = process.env.SOTTO_SERVER_URL ?? 'http://127.0.0.1:8790';
const TTS_URL = process.env.SOTTO_TTS_URL ?? 'http://127.0.0.1:8880/v1';
const SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320; // 20ms @ 16kHz
const TRAILING_SILENCE_MS = 900; // > energy VAD's default 700ms silenceEndMs

const FIXTURE_PASSAGE = {
  chapterTitle: 'Le renard et sa tanière',
  sentences: [
    {
      id: 'b1.s1',
      text: 'Il était une fois un petit renard.',
      tokenIds: [
        'b1.s1.t1',
        'b1.s1.t2',
        'b1.s1.t3',
        'b1.s1.t4',
        'b1.s1.t5',
        'b1.s1.t6',
        'b1.s1.t7',
      ],
    },
    {
      id: 'b1.s2',
      text: 'Il vivait seul dans sa tanière, au fond de la forêt.',
      tokenIds: [
        'b1.s2.t1',
        'b1.s2.t2',
        'b1.s2.t3',
        'b1.s2.t4',
        'b1.s2.t5',
        'b1.s2.t6',
        'b1.s2.t7',
        'b1.s2.t8',
        'b1.s2.t9',
        'b1.s2.t10',
      ],
    },
    {
      id: 'b1.s3',
      text: 'Chaque matin, il sortait chercher de la nourriture.',
      tokenIds: [
        'b1.s3.t1',
        'b1.s3.t2',
        'b1.s3.t3',
        'b1.s3.t4',
        'b1.s3.t5',
        'b1.s3.t6',
        'b1.s3.t7',
      ],
    },
    {
      id: 'b1.s4',
      text: 'Un jour, il trouva un ami inattendu.',
      tokenIds: [
        'b1.s4.t1',
        'b1.s4.t2',
        'b1.s4.t3',
        'b1.s4.t4',
        'b1.s4.t5',
        'b1.s4.t6',
        'b1.s4.t7',
      ],
    },
  ],
  positionTokenId: 'b1.s1.t1',
};

const SESSION_OPTIONS = {
  bookId: 'fr-petit-chaperon-rouge',
  chapterId: 'ch1',
  mode: 'discuss' as const,
  learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en' },
  passage: FIXTURE_PASSAGE,
  savedWords: [] as string[],
};

const t0 = Date.now();
function log(...args: unknown[]): void {
  console.log(`[t+${(Date.now() - t0).toString().padStart(5, ' ')}ms]`, ...args);
}

// ---- WAV read (16-bit PCM only) ----

function decodeWav(buf: Buffer): { pcm: Int16Array; sampleRate: number } {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let offset = 12;
  let sampleRate = 16000;
  let dataStart = -1;
  let dataLength = 0;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      sampleRate = buf.readUInt32LE(offset + 12);
    } else if (chunkId === 'data') {
      dataStart = offset + 8;
      dataLength = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (dataStart === -1) throw new Error('no data chunk found');
  const pcm = new Int16Array(buf.buffer, buf.byteOffset + dataStart, dataLength / 2);
  return { pcm: new Int16Array(pcm), sampleRate };
}

// ---- Linear-interpolation resampler (good enough for a smoke test) ----

function resample(pcm: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return pcm;
  const ratio = fromRate / toRate;
  const outLength = Math.floor(pcm.length / ratio);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, pcm.length - 1);
    const frac = srcPos - i0;
    out[i] = Math.round(pcm[i0]! * (1 - frac) + pcm[i1]! * frac);
  }
  return out;
}

// ---- Kokoro TTS (used only to synthesize learner speech for this script) ----

async function synthesizeLearnerSpeech(text: string): Promise<Int16Array> {
  const res = await fetch(`${TTS_URL.replace(/\/$/, '')}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kokoro',
      input: text,
      voice: 'ff_siwis',
      lang_code: 'f',
      response_format: 'pcm',
      speed: 1.0,
    }),
  });
  if (!res.ok) throw new Error(`Kokoro TTS failed: ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const pcm24 = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  return resample(new Int16Array(pcm24), 24000, SAMPLE_RATE);
}

function silence(ms: number): Int16Array {
  return new Int16Array(Math.round((ms / 1000) * SAMPLE_RATE));
}

async function streamPcmFrames(ws: WebSocket, pcm: Int16Array, label: string): Promise<void> {
  let sent = 0;
  for (let i = 0; i < pcm.length; i += FRAME_SAMPLES) {
    const frame = pcm.subarray(i, Math.min(i + FRAME_SAMPLES, pcm.length));
    ws.send(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength));
    sent++;
  }
  log(
    `${label}: sent ${sent} frames (${((pcm.length / SAMPLE_RATE) * 1000).toFixed(0)}ms of audio)`,
  );
}

async function main(): Promise<void> {
  const wavArg = process.argv[2];

  let utterance1: Int16Array;
  let utterance2: Int16Array;

  if (wavArg) {
    log(`Loading learner speech from ${wavArg}`);
    const { pcm, sampleRate } = decodeWav(readFileSync(wavArg));
    const resampled = resample(pcm, sampleRate, SAMPLE_RATE);
    // Single file: use it for utterance 1, and reuse it for the barge-in demo.
    utterance1 = resampled;
    utterance2 = resampled;
  } else {
    log('No wav file given — synthesizing learner speech with Kokoro (fr-FR).');
    utterance1 = await synthesizeLearnerSpeech('Que veut dire tanière ?');
    utterance2 = await synthesizeLearnerSpeech('Enregistre le mot tanière.');
    log(
      `Synthesized utterance 1: ${((utterance1.length / SAMPLE_RATE) * 1000).toFixed(0)}ms, utterance 2: ${((utterance2.length / SAMPLE_RATE) * 1000).toFixed(0)}ms`,
    );
  }

  log(`Creating session at ${SERVER_URL}/voice/session`);
  const sessionRes = await fetch(`${SERVER_URL}/voice/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(SESSION_OPTIONS),
  });
  if (!sessionRes.ok) {
    throw new Error(`session create failed: ${sessionRes.status} ${await sessionRes.text()}`);
  }
  const session = (await sessionRes.json()) as {
    sessionId: string;
    wsUrl: string;
    sampleRate: number;
    limits: unknown;
  };
  log('Session created:', session);

  const ws = new WebSocket(session.wsUrl);
  ws.binaryType = 'arraybuffer';

  let totalAudioBytes = 0;
  let sawAudioStart = false;
  let sawCancelledAudioEnd = false;
  const bargeInSent = { done: false };

  const opened = new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', (ev) => reject(new Error(`ws error: ${JSON.stringify(ev)}`)));
  });

  const finished = new Promise<void>((resolve) => {
    ws.addEventListener('message', (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') {
        const byteLength = (ev.data as ArrayBuffer).byteLength;
        totalAudioBytes += byteLength;
        log(`<- binary audio frame (${byteLength} bytes), total so far: ${totalAudioBytes} bytes`);
        return;
      }

      const msg = JSON.parse(ev.data) as Record<string, unknown>;
      log('<-', msg);

      if (msg.t === 'audio_start') {
        sawAudioStart = true;
        if (!bargeInSent.done) {
          bargeInSent.done = true;
          void (async () => {
            log('--- Tutor is speaking: sending second utterance now to demonstrate barge-in ---');
            await streamPcmFrames(ws, utterance2, 'utterance 2 (barge-in)');
            await streamPcmFrames(ws, silence(TRAILING_SILENCE_MS), 'utterance 2 trailing silence');
          })();
        }
      }
      if (msg.t === 'audio_end' && msg.cancelled) {
        sawCancelledAudioEnd = true;
      }
      if (msg.t === 'tool_call') {
        const callId = msg.callId as string;
        log(
          `-> responding to tool_call ${callId} with { ok: true, result: { savedWordId: 'sw1' } }`,
        );
        ws.send(
          JSON.stringify({ t: 'tool_result', callId, ok: true, result: { savedWordId: 'sw1' } }),
        );
      }
      if (msg.t === 'limit' || (msg.t === 'state' && msg.state === 'ended')) {
        resolve();
      }
    });
    ws.addEventListener('close', () => resolve());
    // Safety timeout so the script always exits.
    setTimeout(resolve, 45_000);
  });

  await opened;
  log('WebSocket open.');

  await streamPcmFrames(ws, utterance1, 'utterance 1');
  await streamPcmFrames(ws, silence(TRAILING_SILENCE_MS), 'utterance 1 trailing silence');

  await finished;

  log('--- Summary ---');
  log('Total tutor audio bytes received:', totalAudioBytes);
  log('Saw at least one audio_start:', sawAudioStart);
  log('Saw a cancelled audio_end (barge-in worked):', sawCancelledAudioEnd);

  ws.close();
  // Give the socket a moment to close cleanly before exiting.
  setTimeout(() => process.exit(0), 500);
}

main().catch((err) => {
  console.error('smoke test failed:', err);
  process.exit(1);
});
