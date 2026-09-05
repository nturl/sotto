/**
 * Strips `[[reading: id1 id2]]` and `[[pace: slow|normal]]` control markers
 * out of LLM output text, extracting their payloads. Direct port of
 * apps/server/src/voice/markers.ts (planning/BROWSER-TUTOR.md, Slice 2
 * checklist #2) — the worker's LLM is instructed with the same
 * `buildSystemInstruction` (@sotto/core) to emit these inline, and the
 * learner never sees the marker text itself.
 */

const READING_RE = /\[\[reading:\s*([^\]]*)\]\]/gi;
const PACE_RE = /\[\[pace:\s*(slow|normal)\]\]/gi;
const THINK_RE = /<think>[\s\S]*?<\/think>\s*/gi;

export interface StrippedMarkers {
  text: string;
  readingTokenIds: string[];
  pace: 'slow' | 'normal' | null;
}

/**
 * Removes complete `<think>...</think>` reasoning blocks. Qwen3 (the
 * in-browser LLM, worker.ts) is asked to skip these via WebLLM's
 * `extra_body.enable_thinking: false`, but that request field is
 * undocumented outside this one model family and unproven across future
 * MLC builds, so this is defense in depth: caught live in this lane's own
 * e2e run (a full `<think>` block streamed straight through as tutor
 * captions) before the `enable_thinking` fix landed.
 */
export function stripThinking(input: string): string {
  return input.replace(THINK_RE, '');
}

export function stripMarkers(input: string): StrippedMarkers {
  const readingTokenIds: string[] = [];
  let pace: 'slow' | 'normal' | null = null;

  let text = stripThinking(input).replace(READING_RE, (_m, ids: string) => {
    for (const id of ids.trim().split(/\s+/).filter(Boolean)) {
      readingTokenIds.push(id);
    }
    return '';
  });

  text = text.replace(PACE_RE, (_m, p: string) => {
    pace = p.toLowerCase() as 'slow' | 'normal';
    return '';
  });

  return { text, readingTokenIds, pace };
}

/**
 * Finds how much of a streamed text buffer is safe to release now, holding
 * back a trailing `[[...` that might be an incomplete control marker, or a
 * trailing `<think>` that hasn't been closed yet. Ported from
 * apps/server/src/voice/session.ts's `safeReleaseIndex`; the `<think>` half
 * has no server equivalent (the server disables thinking mode upstream —
 * see `stripThinking`'s comment) and is worker-only.
 */
export function safeReleaseIndex(buf: string): number {
  const openMarkerIdx = buf.lastIndexOf('[[');
  const markerSafe =
    openMarkerIdx === -1 || buf.indexOf(']]', openMarkerIdx) !== -1 ? buf.length : openMarkerIdx;

  const openThinkIdx = buf.toLowerCase().lastIndexOf('<think>');
  const thinkSafe =
    openThinkIdx === -1 || buf.toLowerCase().indexOf('</think>', openThinkIdx) !== -1
      ? buf.length
      : openThinkIdx;

  return Math.min(markerSafe, thinkSafe);
}
