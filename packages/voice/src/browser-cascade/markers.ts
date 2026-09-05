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
// Slice 2's JSON-tool fallback (worker.ts's `withJsonToolInstruction`/
// `parseJsonToolBlock`, for a WebLLM build that rejects native `tools`)
// asks the model for a fenced ```tool ... ``` block. That block is control
// structure for the worker, never learner-facing prose — but it was only
// ever stripped from the FINAL aggregated text inside `WebLlmEngine.chat`,
// after the whole reply already streamed out sentence-by-sentence as
// captions. Found live (docs/evidence/browser-tutor-slice5-2026-09-05.log):
// once the model actually attempted a tool call, the caption literally
// read "```tool" mid-JSON. Stripped here too, the same way `<think>` is,
// so the streamed captions never see it in the first place.
const TOOL_BLOCK_RE = /```tool\s*[\s\S]*?```\s*/gi;

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

/** Removes a complete fenced ```tool ... ``` block — see the comment on
 * TOOL_BLOCK_RE above. */
export function stripToolBlock(input: string): string {
  return input.replace(TOOL_BLOCK_RE, '');
}

export function stripMarkers(input: string): StrippedMarkers {
  const readingTokenIds: string[] = [];
  let pace: 'slow' | 'normal' | null = null;

  let text = stripToolBlock(stripThinking(input)).replace(READING_RE, (_m, ids: string) => {
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
 * The largest `k` (0..marker.length-1) such that `buf` ends with the first
 * `k` characters of `marker` — i.e. how much of `buf`'s tail could still
 * turn into `marker` once more deltas arrive. Needed because a full-marker
 * check like `buf.lastIndexOf('```tool')` only starts holding text back
 * once the ENTIRE marker string is already sitting in the buffer, and an
 * LLM stream rarely delivers 7-8 character markers as one atomic token.
 * Found live (docs/evidence/browser-tutor-slice5-2026-09-05.log): "```tool"
 * arrived as separate deltas ("```" then "tool"), and since each was
 * checked — and released — before the other arrived, the caption showed
 * the tool fence itself ("```tool") verbatim instead of holding it back.
 * `[[` (2 chars) and `<think>` (7 chars, but `<` alone is a very distinctive
 * single token in practice) haven't shown this failure mode live, so they
 * keep their existing simpler checks rather than risking new behavior on an
 * unproven path; this generalized guard is applied only where it was
 * actually observed to matter.
 */
function openingPrefixLen(buf: string, marker: string): number {
  const max = Math.min(marker.length - 1, buf.length);
  const bufLower = buf.toLowerCase();
  const markerLower = marker.toLowerCase();
  for (let k = max; k > 0; k--) {
    if (bufLower.slice(bufLower.length - k) === markerLower.slice(0, k)) return k;
  }
  return 0;
}

/** End index (exclusive) of the last COMPLETE ```tool...``` block in `buf`,
 * or 0 if there isn't one. Everything up to this point is either plain text
 * or an already-fully-matched block; only the remainder after it can still
 * contain an in-progress or not-yet-started fence. */
function lastCompleteToolBlockEnd(buf: string): number {
  let end = 0;
  for (const m of buf.matchAll(TOOL_BLOCK_RE)) {
    end = m.index! + m[0].length;
  }
  return end;
}

/**
 * Finds how much of a streamed text buffer is safe to release now, holding
 * back a trailing `[[...` that might be an incomplete control marker, a
 * trailing `<think>` that hasn't been closed yet, or a trailing fragment
 * that might still turn into (or complete) a ```tool fence. Ported from
 * apps/server/src/voice/session.ts's `safeReleaseIndex`; the `<think>` and
 * ```tool halves have no server equivalent (the server disables thinking
 * mode upstream and has no JSON-tool fallback — see `stripThinking`'s and
 * TOOL_BLOCK_RE's comments) and are worker-only.
 *
 * The ```tool check only looks at the buffer AFTER the last already-complete
 * block (`lastCompleteToolBlockEnd`), not the whole buffer. Found live
 * (docs/evidence/browser-tutor-slice5-2026-09-05.log): checking the whole
 * buffer for a trailing "```"-prefix made a block's own freshly-arrived
 * CLOSING fence look like the start of a hypothetical NEW opening fence,
 * holding back and splitting off those last 3 characters forever — which
 * meant the closing fence was never in the same released chunk as its
 * opening, so stripMarkers's regex (needing both in one string) never
 * matched, and the whole block leaked into a caption unstripped.
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

  const resolvedEnd = lastCompleteToolBlockEnd(buf);
  const rest = buf.slice(resolvedEnd);

  const openToolIdxRel = rest.lastIndexOf('```tool');
  const toolOpenSafeRel =
    openToolIdxRel === -1 || rest.indexOf('```', openToolIdxRel + '```tool'.length) !== -1
      ? rest.length
      : openToolIdxRel;
  // A trailing fragment of `rest` that could still become "```tool" once
  // more of the stream arrives (e.g. `rest` currently ends in just "```").
  const toolPrefixLenRel = openingPrefixLen(rest, '```tool');
  const toolPrefixSafeRel = rest.length - toolPrefixLenRel;
  const toolSafe = resolvedEnd + Math.min(toolOpenSafeRel, toolPrefixSafeRel);

  return Math.min(markerSafe, thinkSafe, toolSafe);
}
