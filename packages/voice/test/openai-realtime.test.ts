import { describe, expect, it, vi } from 'vitest';
import {
  NotSupportedError,
  OpenAIRealtimeProvider,
  REALTIME_CALLS_URL,
  type DataChannelLike,
  type MediaStreamLike,
  type MediaTrackLike,
  type MintedRealtimeSecret,
  type PeerConnectionLike,
  type RealtimeCallReport,
} from '../src/transports/openai-realtime.ts';
import type { VoiceEvent } from '../src/events.ts';
import type { SessionOptions } from '../src/provider.ts';

const SESSION: SessionOptions = {
  bookId: 'es-cigarra',
  chapterId: 'c1',
  mode: 'read_with_me',
  learner: { level: 'A1', learningLocale: 'es-ES', explanationLocale: 'en-US' },
  passage: { chapterTitle: 'La cigarra', sentences: [], positionTokenId: null },
  savedWords: [],
};

const SECRET: MintedRealtimeSecret = {
  value: 'ek_fake_secret',
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
  model: 'gpt-realtime-mini',
  maxSeconds: 600,
  callId: 'call-1',
};

class FakeTrack implements MediaTrackLike {
  kind = 'audio';
  enabled = true;
  stopped = false;
  stop(): void {
    this.stopped = true;
  }
}

class FakeStream implements MediaStreamLike {
  readonly track = new FakeTrack();
  getTracks(): MediaTrackLike[] {
    return [this.track];
  }
  getAudioTracks(): MediaTrackLike[] {
    return [this.track];
  }
}

class FakeChannel implements DataChannelLike {
  readyState = 'open';
  readonly sent: Record<string, unknown>[] = [];
  closed = false;
  onopen: DataChannelLike['onopen'] = null;
  onmessage: DataChannelLike['onmessage'] = null;
  onclose: DataChannelLike['onclose'] = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.closed = true;
  }
  /** Delivers a server event, as the oai-events channel would. */
  deliver(event: unknown): void {
    this.onmessage?.call(null, { data: JSON.stringify(event) });
  }
}

class FakePeerConnection implements PeerConnectionLike {
  readonly channels: FakeChannel[] = [];
  readonly addedTracks: MediaTrackLike[] = [];
  remote: { type: string; sdp: string } | null = null;
  closed = false;
  ontrack: PeerConnectionLike['ontrack'] = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = 'new';

  createDataChannel(label: string): DataChannelLike {
    expect(label).toBe('oai-events');
    const channel = new FakeChannel();
    this.channels.push(channel);
    return channel;
  }
  addTrack(track: MediaTrackLike): unknown {
    this.addedTracks.push(track);
    return {};
  }
  async createOffer(): Promise<{ type: string; sdp?: string }> {
    return { type: 'offer', sdp: 'v=0\r\nfake-offer' };
  }
  async setLocalDescription(): Promise<void> {}
  async setRemoteDescription(desc: { type: string; sdp: string }): Promise<void> {
    this.remote = desc;
  }
  close(): void {
    this.closed = true;
  }
  get channel(): FakeChannel {
    return this.channels[0]!;
  }
}

interface Harness {
  provider: OpenAIRealtimeProvider;
  pc: FakePeerConnection;
  channel: FakeChannel;
  stream: FakeStream;
  events: VoiceEvent[];
  ends: RealtimeCallReport[];
  fetchMock: ReturnType<typeof vi.fn>;
  timers: { fn: () => void; ms: number }[];
  clock: { value: number };
}

async function connect(
  overrides: {
    secret?: Partial<MintedRealtimeSecret>;
    sdpStatus?: number;
    platform?: 'web' | 'native';
  } = {},
): Promise<Harness> {
  const pc = new FakePeerConnection();
  const stream = new FakeStream();
  const events: VoiceEvent[] = [];
  const ends: RealtimeCallReport[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const clock = { value: 1_000_000 };
  const status = overrides.sdpStatus ?? 200;
  const fetchMock = vi.fn(async () => ({
    ok: status < 400,
    status,
    text: async () => 'v=0\r\nfake-answer',
  }));

  const provider = new OpenAIRealtimeProvider({
    mintSecret: async () => ({ ...SECRET, ...overrides.secret }),
    onEnd: (report) => ends.push(report),
    platform: overrides.platform ?? 'web',
    createPeerConnection: () => pc,
    getUserMedia: async () => stream,
    fetch: fetchMock as unknown as typeof fetch,
    now: () => clock.value,
    setTimeoutImpl: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length - 1;
    },
    clearTimeoutImpl: () => {},
  });
  provider.on((e) => events.push(e));
  await provider.connect(SESSION);
  return { provider, pc, channel: pc.channel, stream, events, ends, fetchMock, timers, clock };
}

describe('connect', () => {
  it('POSTs the SDP offer with the ephemeral secret and never a standard key', async () => {
    const h = await connect();
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = h.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(REALTIME_CALLS_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ek_fake_secret');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/sdp');
    expect(init.body).toBe('v=0\r\nfake-offer');
    expect(h.pc.remote).toEqual({ type: 'answer', sdp: 'v=0\r\nfake-answer' });
  });

  it('adds the microphone track and opens the oai-events channel', async () => {
    const h = await connect();
    expect(h.pc.addedTracks).toHaveLength(1);
    expect(h.pc.channels).toHaveLength(1);
  });

  it('reaches the listening state', async () => {
    const h = await connect();
    expect(h.events.map((e) => (e.type === 'state' ? e.state : null)).filter(Boolean)).toEqual([
      'connecting',
      'listening',
    ]);
  });

  it('refuses on native rather than pretending', async () => {
    await expect(connect({ platform: 'native' })).rejects.toBeInstanceOf(NotSupportedError);
  });

  it('reports a failed SDP exchange and ends the call', async () => {
    await expect(connect({ sdpStatus: 403 })).rejects.toThrow(/realtime call failed: 403/);
  });
});

describe('event mapping', () => {
  it('maps learner transcription to captions', async () => {
    const h = await connect();
    h.channel.deliver({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: 'La ci',
    });
    h.channel.deliver({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'La cigarra',
    });
    const captions = h.events.filter((e) => e.type === 'caption');
    expect(captions).toEqual([
      { type: 'caption', speaker: 'learner', text: 'La ci', final: false },
      { type: 'caption', speaker: 'learner', text: 'La cigarra', final: true },
    ]);
  });

  it('maps tutor transcript deltas to captions and accumulates them', async () => {
    const h = await connect();
    h.channel.deliver({ type: 'response.output_audio_transcript.delta', delta: 'Muy ' });
    h.channel.deliver({ type: 'response.output_audio_transcript.delta', delta: 'bien' });
    h.channel.deliver({ type: 'response.output_audio_transcript.done', transcript: 'Muy bien.' });
    const captions = h.events.filter((e) => e.type === 'caption');
    expect(captions.map((c) => (c.type === 'caption' ? c.text : ''))).toEqual([
      'Muy ',
      'Muy bien',
      'Muy bien.',
    ]);
    expect(captions.at(-1)).toMatchObject({ speaker: 'tutor', final: true });
  });

  it('moves through thinking and speaking, then back to listening', async () => {
    const h = await connect();
    h.channel.deliver({ type: 'response.created' });
    h.channel.deliver({ type: 'response.output_audio.delta' });
    h.channel.deliver({ type: 'response.output_audio.done' });
    h.channel.deliver({ type: 'response.done', response: {} });
    const states = h.events.filter((e) => e.type === 'state').map((e) => (e as never)['state']);
    expect(states).toEqual(['connecting', 'listening', 'thinking', 'speaking', 'listening']);
  });

  it('surfaces a server error as a recoverable VoiceEvent', async () => {
    const h = await connect();
    h.channel.deliver({ type: 'error', error: { code: 'rate_limit', message: 'slow down' } });
    expect(h.events.at(-1)).toEqual({
      type: 'error',
      code: 'rate_limit',
      message: 'slow down',
      recoverable: true,
    });
  });

  it('ignores an unparseable frame instead of throwing', async () => {
    const h = await connect();
    const before = h.events.length;
    h.channel.onmessage?.call(null, { data: 'not json' });
    expect(h.events).toHaveLength(before);
  });

  it('keeps the last response.done usage block for a cost cross-check', async () => {
    const h = await connect();
    h.channel.deliver({
      type: 'response.done',
      response: { usage: { input_tokens: 900, output_tokens: 1200 } },
    });
    expect(h.provider.lastUsage).toEqual({ input_tokens: 900, output_tokens: 1200 });
  });
});

describe('tool round trip', () => {
  it('emits tool_call and sends the result back with a new response', async () => {
    const h = await connect();
    h.channel.deliver({
      type: 'response.function_call_arguments.done',
      call_id: 'fc_1',
      name: 'save_vocabulary',
      arguments: '{"tokenId":"b1.s1.t2","word":"cigarra"}',
    });
    expect(h.events.at(-1)).toEqual({
      type: 'tool_call',
      callId: 'fc_1',
      name: 'save_vocabulary',
      args: { tokenId: 'b1.s1.t2', word: 'cigarra' },
    });

    h.provider.respondTool('fc_1', { ok: true, savedWordId: 'sw_1' });
    expect(h.channel.sent).toEqual([
      {
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: 'fc_1',
          output: '{"ok":true,"savedWordId":"sw_1"}',
        },
      },
      { type: 'response.create' },
    ]);
  });

  it('treats malformed tool arguments as empty rather than dropping the call', async () => {
    const h = await connect();
    h.channel.deliver({
      type: 'response.function_call_arguments.done',
      call_id: 'fc_2',
      name: 'get_current_passage',
      arguments: '{oops',
    });
    expect(h.events.at(-1)).toMatchObject({ type: 'tool_call', callId: 'fc_2', args: {} });
  });
});

describe('controls', () => {
  it('mutes by disabling the track, without tearing anything down', async () => {
    const h = await connect();
    h.provider.setMuted(true);
    expect(h.stream.track.enabled).toBe(false);
    expect(h.provider.state).toBe('muted');

    h.provider.setMuted(false);
    expect(h.stream.track.enabled).toBe(true);
    expect(h.provider.state).toBe('listening');
    expect(h.pc.closed).toBe(false);
  });

  it('cancels the response on interrupt', async () => {
    const h = await connect();
    h.provider.interrupt();
    expect(h.channel.sent).toEqual([{ type: 'response.cancel' }]);
  });

  it('commits the buffer when push-to-talk is released', async () => {
    const h = await connect();
    h.provider.pushToTalk(true);
    expect(h.stream.track.enabled).toBe(true);
    h.provider.pushToTalk(false);
    expect(h.stream.track.enabled).toBe(false);
    expect(h.channel.sent).toEqual([
      { type: 'input_audio_buffer.clear' },
      { type: 'input_audio_buffer.commit' },
      { type: 'response.create' },
    ]);
  });

  it('sends typed text as a conversation item and captions it', async () => {
    const h = await connect();
    h.provider.sendText('¿Qué significa cigarra?');
    expect(h.events.at(-1)).toMatchObject({ type: 'caption', speaker: 'learner', final: true });
    expect(h.channel.sent[0]).toMatchObject({
      type: 'conversation.item.create',
      item: { role: 'user' },
    });
  });
});

describe('maxSeconds and metering', () => {
  it('arms the ceiling from the minted secret', async () => {
    const h = await connect({ secret: { maxSeconds: 45 } });
    expect(h.timers).toEqual([{ fn: expect.any(Function), ms: 45_000 }]);
  });

  it('ends with limit max_duration when the ceiling fires', async () => {
    const h = await connect({ secret: { maxSeconds: 45 } });
    h.timers[0]!.fn();
    expect(h.events.find((e) => e.type === 'limit')).toEqual({
      type: 'limit',
      reason: 'max_duration',
    });
    expect(h.provider.state).toBe('ended');
    expect(h.ends[0]).toMatchObject({ callId: 'call-1', reason: 'max_duration' });
    // The microphone is released, not just muted.
    expect(h.stream.track.stopped).toBe(true);
    expect(h.pc.closed).toBe(true);
  });

  it('counts audio in both directions and reports it to onEnd', async () => {
    const h = await connect();
    h.channel.deliver({ type: 'input_audio_buffer.speech_started' });
    h.clock.value += 3_000;
    h.channel.deliver({ type: 'input_audio_buffer.speech_stopped' });

    h.channel.deliver({ type: 'response.output_audio.delta' });
    h.clock.value += 7_500;
    h.channel.deliver({ type: 'response.output_audio.done' });

    expect(h.provider.measured).toEqual({ audioSecondsIn: 3, audioSecondsOut: 7.5 });
    await h.provider.disconnect();
    expect(h.ends[0]).toEqual({
      callId: 'call-1',
      audioSecondsIn: 3,
      audioSecondsOut: 7.5,
      reason: 'hangup',
    });
  });

  it('closes an open speaking span when the call ends mid-utterance', async () => {
    const h = await connect();
    h.channel.deliver({ type: 'response.output_audio.delta' });
    h.clock.value += 2_000;
    await h.provider.disconnect();
    expect(h.ends[0]!.audioSecondsOut).toBe(2);
  });

  it('reports the call only once, however many times it is ended', async () => {
    const h = await connect();
    await h.provider.disconnect();
    await h.provider.disconnect();
    expect(h.ends).toHaveLength(1);
  });
});
