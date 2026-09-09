import { describe, expect, it } from 'vitest';
import { createVoiceSessionTiming } from './sessionTiming';

describe('createVoiceSessionTiming', () => {
  it('records each diagnostic stage once with a deterministic clock', () => {
    let now = 1_000;
    const lines: string[] = [];
    const timing = createVoiceSessionTiming({
      enabled: true,
      now: () => now,
      report: (line) => lines.push(line),
    });

    now = 1_010;
    timing.captureRequested();
    now = 1_035;
    timing.captureReady();
    now = 1_052;
    timing.connectionReady();
    now = 1_108;
    timing.playbackAccepted();
    now = 1_130;
    timing.playbackBlocked();
    timing.playbackBlocked();

    expect(lines).toEqual([
      '[sotto-tutor] capture_requested=10ms',
      '[sotto-tutor] capture_ready=35ms start_to_ready=25ms',
      '[sotto-tutor] connection_ready=52ms',
      '[sotto-tutor] first_playback_accepted=108ms',
      '[sotto-tutor] playback_blocked=130ms',
    ]);
  });

  it('stays silent unless an existing tutor debug run opted in', () => {
    const lines: string[] = [];
    const timing = createVoiceSessionTiming({ enabled: false, report: (line) => lines.push(line) });
    timing.captureRequested();
    timing.captureReady();
    timing.connectionReady();
    timing.playbackAccepted();
    timing.playbackBlocked();
    expect(lines).toEqual([]);
  });
});
