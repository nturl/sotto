import { describe, expect, it } from 'vitest';
import { FakeVoiceProvider, type VoiceClock } from '../src/fake.ts';
import type { VoiceEvent } from '../src/events.ts';
import type { SessionOptions } from '../src/provider.ts';

/** A manually-advanced clock: nothing fires until the test calls advance(). */
class ManualClock implements VoiceClock {
  private time = 0;
  private seq = 0;
  private queue: { at: number; seq: number; fn: () => void }[] = [];

  now(): number {
    return this.time;
  }

  setTimeout(fn: () => void, ms: number): number {
    const id = this.seq++;
    this.queue.push({ at: this.time + Math.max(0, ms), seq: id, fn });
    return id;
  }

  /** Advance time by ms, firing every due callback in (time, then schedule order). */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = this.queue[0];
      if (!next || next.at > target) break;
      this.queue.shift();
      this.time = next.at;
      next.fn();
    }
    this.time = target;
  }
}

const SESSION: SessionOptions = {
  bookId: 'fr-petit-chaperon-rouge',
  chapterId: 'fr-petit-chaperon-rouge-01',
  mode: 'read_to_me',
  learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en' },
  // read_to_me's fixture references sentences by index (WS-? fix: placeholder
  // tokenIds never matched a real chapter) — carry enough real sentences
  // here for its 3 "reading" steps to resolve against.
  passage: {
    chapterTitle: 'Chapitre 1',
    sentences: [
      { id: 'b1.s1', text: '', tokenIds: ['b1.s1.t1', 'b1.s1.t2', 'b1.s1.t3'], words: [] },
      { id: 'b1.s2', text: '', tokenIds: ['b1.s2.t1', 'b1.s2.t2'], words: [] },
      { id: 'b1.s3', text: '', tokenIds: ['b1.s3.t1', 'b1.s3.t2', 'b1.s3.t3'], words: [] },
    ],
    positionTokenId: null,
  },
  savedWords: [],
};

function collect(provider: FakeVoiceProvider): VoiceEvent[] {
  const events: VoiceEvent[] = [];
  provider.on((e) => events.push(e));
  return events;
}

describe('FakeVoiceProvider — read_to_me', () => {
  it('walks connecting -> listening -> speaking -> reading x3 -> caption -> listening, in order', async () => {
    const clock = new ManualClock();
    const provider = new FakeVoiceProvider(clock);
    const events = collect(provider);

    await provider.connect({ ...SESSION, mode: 'read_to_me' });
    clock.advance(5000);

    expect(events.map((e) => e.type)).toEqual([
      'state',
      'state',
      'state',
      'reading',
      'reading',
      'reading',
      'caption',
      'state',
    ]);
    expect((events[0] as { state: string }).state).toBe('connecting');
    expect((events[1] as { state: string }).state).toBe('listening');
    expect((events[2] as { state: string }).state).toBe('speaking');
    const readings = events.filter((e) => e.type === 'reading');
    expect(readings).toHaveLength(3);
    expect((events.at(-1) as { state: string }).state).toBe('listening');
  });

  it('produces nothing before the clock advances', async () => {
    const clock = new ManualClock();
    const provider = new FakeVoiceProvider(clock);
    const events = collect(provider);
    await provider.connect(SESSION);
    expect(events).toEqual([]);
  });
});

describe('FakeVoiceProvider — read_with_me', () => {
  it('waits for a learner turn, then replies with a tutor caption', async () => {
    const clock = new ManualClock();
    const provider = new FakeVoiceProvider(clock);
    const events = collect(provider);

    await provider.connect({ ...SESSION, mode: 'read_with_me' });
    clock.advance(1000);
    // connecting -> listening, then parked at waitForText.
    expect(events.map((e) => e.type)).toEqual(['state', 'state']);

    provider.sendText('Une jolie petite fille vit près du village.');
    clock.advance(1000);

    expect(events.map((e) => e.type)).toEqual([
      'state',
      'state',
      'caption', // learner echo
      'state', // thinking
      'caption', // tutor reply
      'state', // listening
    ]);
    expect(events[2]).toMatchObject({ type: 'caption', speaker: 'learner' });
    expect(events[4]).toMatchObject({ type: 'caption', speaker: 'tutor' });
  });
});

describe('FakeVoiceProvider — pronunciation', () => {
  it('emits a learner caption, a tutor correction, then a show_explanation tool_call', async () => {
    const clock = new ManualClock();
    const provider = new FakeVoiceProvider(clock);
    const events = collect(provider);

    await provider.connect({ ...SESSION, mode: 'pronunciation' });
    clock.advance(1000);
    provider.sendText('Une jolie petite fille');
    clock.advance(1000);

    const toolCall = events.find((e) => e.type === 'tool_call');
    expect(toolCall).toMatchObject({ type: 'tool_call', name: 'show_explanation' });
    expect(events.map((e) => e.type)).toEqual([
      'state',
      'state',
      'caption',
      'state',
      'caption',
      'tool_call',
    ]);

    // Nothing further happens until respondTool resolves it.
    clock.advance(5000);
    expect(events.map((e) => e.type)).toEqual([
      'state',
      'state',
      'caption',
      'state',
      'caption',
      'tool_call',
    ]);

    provider.respondTool((toolCall as { callId: string }).callId, { ok: true });
    clock.advance(1000);
    expect(events.at(-1)).toMatchObject({ type: 'state', state: 'listening' });
  });
});

describe('FakeVoiceProvider — discuss', () => {
  it('asks a question, then on a learner turn saves vocabulary and confirms after respondTool', async () => {
    const clock = new ManualClock();
    const provider = new FakeVoiceProvider(clock);
    const events = collect(provider);

    await provider.connect({ ...SESSION, mode: 'discuss' });
    clock.advance(1000);
    expect(events.map((e) => e.type)).toEqual(['state', 'state', 'state', 'caption', 'state']);

    provider.sendText('save this word please');
    clock.advance(1000);
    const toolCall = events.find((e) => e.type === 'tool_call');
    expect(toolCall).toMatchObject({ type: 'tool_call', name: 'save_vocabulary' });

    // Confirming caption only appears after respondTool resolves the call.
    expect(events.filter((e) => e.type === 'caption')).toHaveLength(2); // question + learner echo

    provider.respondTool((toolCall as { callId: string }).callId, { ok: true, savedWordId: 'w1' });
    clock.advance(1000);

    const captions = events.filter(
      (e): e is Extract<VoiceEvent, { type: 'caption' }> => e.type === 'caption',
    );
    expect(captions).toHaveLength(3);
    expect(captions[2]?.text).toContain('enregistré');
  });

  it('emits an error-branch confirming caption when the tool result reports ok:false', async () => {
    const clock = new ManualClock();
    const provider = new FakeVoiceProvider(clock);
    const events = collect(provider);

    await provider.connect({ ...SESSION, mode: 'discuss' });
    clock.advance(1000);
    provider.sendText('save this word please');
    clock.advance(1000);
    const toolCall = events.find((e) => e.type === 'tool_call');

    provider.respondTool((toolCall as { callId: string }).callId, { ok: false, error: 'boom' });
    clock.advance(1000);

    const captions = events.filter(
      (e): e is Extract<VoiceEvent, { type: 'caption' }> => e.type === 'caption',
    );
    expect(captions.at(-1)?.text).toContain('pas pu');
  });
});

describe('FakeVoiceProvider — interrupt / disconnect', () => {
  it('interrupt() stops the current playback and emits state:listening immediately', async () => {
    const clock = new ManualClock();
    const provider = new FakeVoiceProvider(clock);
    const events = collect(provider);

    await provider.connect({ ...SESSION, mode: 'read_to_me' });
    clock.advance(450); // past connecting -> listening -> speaking, mid-reading

    const countBeforeInterrupt = events.length;
    provider.interrupt();
    expect(events.at(-1)).toEqual({ type: 'state', state: 'listening' });

    // Further clock advancement must not resume the interrupted script.
    clock.advance(5000);
    expect(events.length).toBe(countBeforeInterrupt + 1);
  });

  it('disconnect() stops further playback and emits state:ended', async () => {
    const clock = new ManualClock();
    const provider = new FakeVoiceProvider(clock);
    const events = collect(provider);

    await provider.connect({ ...SESSION, mode: 'read_to_me' });
    clock.advance(300);

    await provider.disconnect();
    expect(events.at(-1)).toEqual({ type: 'state', state: 'ended' });

    const countAfterDisconnect = events.length;
    clock.advance(5000);
    expect(events.length).toBe(countAfterDisconnect);
  });

  it('on() unsubscribe stops delivering events to that listener', async () => {
    const clock = new ManualClock();
    const provider = new FakeVoiceProvider(clock);
    const events: VoiceEvent[] = [];
    const unsubscribe = provider.on((e) => events.push(e));

    await provider.connect({ ...SESSION, mode: 'read_to_me' });
    clock.advance(1); // only the delay:0 "connecting" event is due yet
    unsubscribe();
    clock.advance(5000);

    expect(events).toHaveLength(1);
  });
});
