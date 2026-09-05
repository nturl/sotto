/**
 * Reference/portable tutor-instruction builder (planning/CONTRACTS.md §5c
 * context). Stable rules + a compact dynamic block + per-mode guidance, kept
 * compact on purpose: target < 900 tokens for a 12-sentence passage.
 *
 * This is NOT the live server prompt — `apps/server` never imports it.
 * `buildTutorInstruction` below is exercised only by `prompt.test.ts` (and,
 * outside this package, is available to `@sotto/voice`'s fake/scripted
 * provider for tests that want a portable, dependency-free instruction
 * string without a running server). The prompt actually sent to the LLM at
 * runtime is built by `apps/server/src/voice/prompt.ts`, which additionally
 * renders the passage's word -> tokenId map (`renderSentence`) so tools like
 * `save_vocabulary`/`set_reading_position` can target the right token — a
 * capability `TutorPassageSentence` here (`{id, text}` only) doesn't carry.
 * Verified 2026-09-04 (planning/ADVERSARIAL-REVIEW.md finding 5): earlier
 * revisions of this comment described this function as the live prompt,
 * which was never true and pointed debugging at the wrong file.
 */
import { getLanguage } from './languages.ts';
import type { TutorMode } from './models.ts';

export interface TutorPassageSentence {
  id: string;
  text: string;
}

export interface TutorPromptContext {
  mode: TutorMode;
  level: 'A0' | 'A1' | 'A2';
  /** UI catalog code, e.g. "en". */
  interfaceLocale: string;
  /** Gloss/explanation locale code, e.g. "en". */
  explanationLocale: string;
  /** Full content locale being learned, e.g. "fr-FR". */
  learningLocale: string;
  bookTitle: string;
  chapterTitle: string;
  /** Sentences bounded to the current section, with stable ids. */
  passage: TutorPassageSentence[];
  positionSentenceId?: string;
  /** Short summary of recent turns, not a full transcript. */
  recentTurnsSummary?: string;
  savedWords: { word: string; translation: string }[];
}

const STABLE_RULES = [
  "You are Sotto's reading tutor: patient, warm, and concise.",
  'Speak in the LEARNING language, calibrated to the level below; use the EXPLANATION language only briefly, for translations or grammar notes.',
  'The passage is the source of truth: never invent text, and never continue reading beyond what is supplied.',
  'Let the learner interrupt at any time; in reading-practice modes, wait through their pauses instead of jumping in.',
  'When correcting pronunciation, fix only the single most useful issue first, model the correct sound, then invite one retry — do not stack corrections.',
  'Use the provided tools to save words, move position, or show an explanation, and never claim an action succeeded before its tool result comes back.',
  'Keep every spoken reply short: no filler praise, no long preambles.',
].join(' ');

const MODE_GUIDANCE: Record<TutorMode, string> = {
  read_to_me:
    'Mode guidance: read the passage aloud yourself, sentence by sentence, at a pace suited to the level. Pause briefly between sentences so the learner can follow along or interrupt.',
  read_with_me:
    'Mode guidance: the learner reads aloud; listen and only step in after they finish a sentence or clearly pause. Confirm a correct reading briefly before continuing.',
  pronunciation:
    'Mode guidance: focus entirely on pronunciation. Have the learner repeat short phrases, correct only the single most useful issue, model it, and invite one retry before moving on.',
  discuss:
    'Mode guidance: hold a light conversation about the passage in the learning language, asking simple comprehension or opinion questions suited to the level.',
};

// Display names for UI catalog / explanation locale codes. Deliberately
// separate from LanguageDefinition.localizedNames: those are indexed by
// content locale, and interfaceLocale/explanationLocale here are bare
// catalog codes that don't always have a single corresponding content locale.
const CATALOG_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  pt: 'Portuguese',
  it: 'Italian',
  'zh-Hans': 'Chinese (Simplified)',
  'zh-Hant': 'Chinese (Traditional)',
  ro: 'Romanian',
  ca: 'Catalan',
};

function catalogLabel(code: string): string {
  return CATALOG_LABELS[code] ?? code;
}

export function buildTutorInstruction(ctx: TutorPromptContext): string {
  const learning = getLanguage(ctx.learningLocale);
  const passageLines = ctx.passage.map((s) => `${s.id}: ${s.text}`).join('\n');
  const savedLine = ctx.savedWords.length
    ? ctx.savedWords.map((w) => `${w.word} = ${w.translation}`).join(', ')
    : 'none yet';

  const dynamicLines = [
    `Mode: ${ctx.mode}`,
    `Level: ${ctx.level}`,
    `Learning language: ${learning.nativeName} (${ctx.learningLocale}). ${learning.tutorNotes}`,
    `Explanation language: ${catalogLabel(ctx.explanationLocale)}`,
    `Interface language: ${catalogLabel(ctx.interfaceLocale)}`,
    `Book: ${ctx.bookTitle} — ${ctx.chapterTitle}`,
    `Passage (sentence id: text):\n${passageLines}`,
    ctx.positionSentenceId ? `Current position: ${ctx.positionSentenceId}` : undefined,
    ctx.recentTurnsSummary ? `Recent turns: ${ctx.recentTurnsSummary}` : undefined,
    `Saved words: ${savedLine}`,
  ].filter((line): line is string => Boolean(line));

  return [STABLE_RULES, dynamicLines.join('\n'), MODE_GUIDANCE[ctx.mode]].join('\n\n');
}
