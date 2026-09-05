/**
 * Sentence splitting for imported paragraphs. Seed bundles (CONTRACTS §2a)
 * are authored pre-split into sentences by a content contributor; an
 * imported book has no such author, so this is the one genuinely new
 * tokenization-adjacent step the importer needs before it can reuse
 * @sotto/core's `tokenizeSentence` (which tokenizes a single sentence, not
 * a paragraph) and the gloss/translation pipeline (which works sentence by
 * sentence, matching the source-bundle grain).
 */
import type { Typography } from '@sotto/core';

const LATIN_SENTENCE_RE = /[^.!?…]+(?:[.!?…]+(?=["'’”)\]]*(?:\s+|$))|$)/gu;
const CJK_SENTENCE_RE = /[^。！？…]+(?:[。！？…]+|$)/gu;

/** Splits one paragraph of plain text into trimmed, non-empty sentences. */
export function splitSentences(paragraph: string, typography: Typography): string[] {
  const re = typography === 'cjk' ? CJK_SENTENCE_RE : LATIN_SENTENCE_RE;
  re.lastIndex = 0;
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(paragraph))) {
    const sentence = match[0].trim();
    if (sentence.length > 0) out.push(sentence);
  }
  return out.length > 0 ? out : [paragraph.trim()].filter((s) => s.length > 0);
}
