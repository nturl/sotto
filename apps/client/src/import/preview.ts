/**
 * Client-side preview step (planning/design/IMPORT.md §3): parses+detects
 * a picked file locally via `@sotto/content/import/parse` — no network
 * call, since chapter/word counts and language detection don't need the
 * LLM/TTS/STT the full `POST /import` job spends time on.
 */
import {
  detectLanguage,
  parseSource,
  ImportError,
  type ParsedDocument,
} from '@sotto/content/import/parse';
import type { PickedFile } from './pickFile';

export { ImportError };

export interface ImportPreview {
  parsed: ParsedDocument;
  chapterCount: number;
  wordCount: number;
  detectedLocale: string;
  detectionConfidence: number;
  /** Matches pipeline.ts's own estimatedMinutes formula (130 wpm) so the
   * preview screen's number matches what the finished book ends up with. */
  estimatedMinutesPerChapter: number;
}

function wordCount(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

export function buildPreview(file: PickedFile): ImportPreview {
  const parsed = parseSource(file.bytes, file.filename);
  const totalWords = parsed.chapters.reduce(
    (sum, c) => sum + c.paragraphs.reduce((s, p) => s + wordCount(p), 0),
    0,
  );
  const fullText = parsed.chapters.flatMap((c) => c.paragraphs).join(' ');
  const detection = detectLanguage(fullText);
  const chapterCount = Math.max(1, parsed.chapters.length);
  return {
    parsed,
    chapterCount,
    wordCount: totalWords,
    detectedLocale: detection.locale,
    detectionConfidence: detection.confidence,
    estimatedMinutesPerChapter: Math.max(1, Math.round(totalWords / chapterCount / 130)),
  };
}
