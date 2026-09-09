/**
 * Opt-in, local timing marks for a real tutor attempt. They deliberately
 * describe handoffs rather than promise an end-to-end speed: microphone
 * readiness, server/worker readiness, and the first PCM accepted by playback
 * are separate stages. Nothing is sent off-device.
 */
export interface VoiceSessionTimingOptions {
  enabled: boolean;
  now?: () => number;
  report?: (line: string) => void;
}

export interface VoiceSessionTiming {
  captureRequested(): void;
  captureReady(): void;
  connectionReady(): void;
  playbackAccepted(): void;
  playbackBlocked(): void;
}

function monotonicNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function createVoiceSessionTiming({
  enabled,
  now = monotonicNow,
  report = (line) => console.info(line),
}: VoiceSessionTimingOptions): VoiceSessionTiming {
  const startedAt = now();
  let captureRequestedAt: number | null = null;
  let connectionReady = false;
  let playbackAccepted = false;
  let playbackBlocked = false;

  const mark = (name: string, detail?: string) => {
    if (!enabled) return;
    const elapsed = now() - startedAt;
    report(`[sotto-tutor] ${name}=${elapsed}ms${detail ? ` ${detail}` : ''}`);
  };

  return {
    captureRequested() {
      captureRequestedAt = now();
      mark('capture_requested');
    },
    captureReady() {
      const readyAt = now();
      const startToReady = captureRequestedAt === null ? undefined : readyAt - captureRequestedAt;
      mark(
        'capture_ready',
        startToReady === undefined ? undefined : `start_to_ready=${startToReady}ms`,
      );
      captureRequestedAt = null;
    },
    connectionReady() {
      if (connectionReady) return;
      connectionReady = true;
      mark('connection_ready');
    },
    playbackAccepted() {
      if (playbackAccepted) return;
      playbackAccepted = true;
      mark('first_playback_accepted');
    },
    playbackBlocked() {
      if (playbackBlocked) return;
      playbackBlocked = true;
      mark('playback_blocked');
    },
  };
}
