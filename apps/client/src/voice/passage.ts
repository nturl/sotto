/**
 * Builds the ~12-sentence passage window around the learner's current
 * position (TASK §E: "passage = the current chapter's sentences window: 12
 * sentences around the reading position with ids and tokenIds"). Shared by
 * the session-connect SessionOptions.passage and the `get_current_passage`
 * tool.
 */
import type { Chapter, PassageContextResult } from '@sotto/core';

const WINDOW_SIZE = 12;

export function buildPassageWindow(
  chapter: Chapter,
  positionTokenId: string | undefined,
  windowSize: number = WINDOW_SIZE,
): PassageContextResult {
  const sentences = chapter.blocks.flatMap((b) => b.sentences);
  const posIndex = positionTokenId
    ? sentences.findIndex((s) => s.tokens.some((tk) => tk.id === positionTokenId))
    : 0;
  const centerIndex = posIndex < 0 ? 0 : posIndex;
  const half = Math.floor(windowSize / 2);
  const start = Math.max(
    0,
    Math.min(centerIndex - half, Math.max(0, sentences.length - windowSize)),
  );
  const end = Math.min(sentences.length, start + windowSize);
  const windowed = sentences.slice(start, end);

  return {
    chapterTitle: chapter.title,
    sentences: windowed.map((s) => ({
      id: s.id,
      text: s.text,
      tokenIds: s.tokens.map((tk) => tk.id),
    })),
    positionTokenId: positionTokenId ?? windowed[0]?.tokens[0]?.id ?? null,
  };
}
