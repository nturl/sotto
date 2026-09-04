/**
 * Builds the tutor system instruction: stable product rules (BRIEF.md lines
 * 407-425) plus a dynamic context block (mode, level, locales, dialect note,
 * title, chapter, passage sentences with ids, position, saved words, recent
 * summary) and per-mode guidance.
 */
import type { LearnerContext, PassageContext, TutorMode } from './types.js';

// Small per-locale dialect/pronunciation notes for the instruction's
// {{locale_and_dialect_notes}} slot. Falls back to a generic note.
const DIALECT_NOTES: Record<string, string> = {
  'fr-FR': 'Metropolitan French pronunciation and vocabulary.',
  'es-419': 'Latin American Spanish (seseo, "ustedes" for informal plural).',
  'es-ES': 'Peninsular Spanish (distinción, "vosotros" for informal plural).',
  'en-US': 'American English pronunciation and spelling.',
  'en-GB': 'British English pronunciation and spelling.',
  'pt-BR': 'Brazilian Portuguese pronunciation and vocabulary.',
  'pt-PT': 'European Portuguese pronunciation and vocabulary.',
  'it-IT': 'Standard Italian pronunciation.',
  'zh-CN': 'Mandarin, simplified script, Mainland pronunciation norms.',
  'zh-TW': 'Mandarin, traditional script, Taiwan pronunciation norms.',
  'ro-RO': 'Standard Romanian pronunciation.',
  'ca-ES': 'Central Catalan pronunciation.',
};

const MODE_GUIDANCE: Record<TutorMode, string> = {
  read_to_me:
    'Mode: read_to_me. Read the next 1-3 sentences of the passage verbatim, then stop and wait. ' +
    'Before reading, include the sentence ids you are about to read in a marker at the very start ' +
    'of your reply: [[reading: id1 id2]]. Do not narrate beyond the supplied passage.',
  read_with_me:
    'Mode: read_with_me. The learner reads a sentence aloud; you listen, then say one short ' +
    'encouraging line and correct at most one word if needed.',
  pronunciation:
    'Mode: pronunciation. The learner reads the visible sentence aloud; listen, pick the single ' +
    'most useful pronunciation issue, model it, and invite one retry. Never state a numeric or ' +
    'percentage accuracy score.',
  discuss:
    'Mode: discuss. Ask one short comprehension question at a time, or answer the learner\'s ' +
    'question about meaning, grammar, characters, or events using only the supplied passage.',
};

export interface PromptContext {
  mode: TutorMode;
  learner: LearnerContext;
  interfaceLocale?: string;
  bookTitle: string;
  passage: PassageContext;
  savedWords: string[];
  recentSummary?: string;
}

function dialectNote(locale: string): string {
  return DIALECT_NOTES[locale] ?? `Follow the standard conventions of ${locale}.`;
}

export function buildSystemInstruction(ctx: PromptContext): string {
  const { learner, passage } = ctx;

  const stableRules = `You are a patient, concise ${learner.learningLocale} reading tutor for a learner who uses
${learner.explanationLocale} for explanations. Use the supplied passage as the source of truth.
Speak ${learner.learningLocale} at level ${learner.level} and use ${learner.explanationLocale}
briefly when explanation is needed. Follow the selected region, script, and pronunciation
conventions: ${dialectNote(learner.learningLocale)} Never continue narrating copyrighted
text beyond the passage the application supplies. Let the learner interrupt. During reading
practice, wait through natural pauses. Correct only the most useful pronunciation issue first,
model it, and invite one retry. Use application tools for saving vocabulary, moving the passage,
or showing an explanation; never claim an action succeeded until its tool returns success.
Keep ordinary spoken responses short and avoid unnecessary greetings or praise.

If the learner says "slower" or asks you to slow down, include the marker [[pace: slow]] at the
start of your next reply; if they ask for normal speed again, include [[pace: normal]]. These
markers are stripped before the learner sees or hears your reply.`;

  const sentenceLines = passage.sentences
    .map((s) => `  - ${s.id} [${s.tokenIds.join(',')}]: ${s.text}`)
    .join('\n');

  const dynamicContext = `--- Session context ---
Book: ${ctx.bookTitle}
Chapter: ${passage.chapterTitle}
Learner level: ${learner.level}
Interface language: ${ctx.interfaceLocale ?? learner.explanationLocale}
Current reading position (token id): ${passage.positionTokenId ?? 'start of chapter'}
Visible passage:
${sentenceLines}
Saved words this session: ${ctx.savedWords.length > 0 ? ctx.savedWords.join(', ') : '(none)'}
${ctx.recentSummary ? `Recent turn summary: ${ctx.recentSummary}` : ''}`;

  return `${stableRules}\n\n${MODE_GUIDANCE[ctx.mode]}\n\n${dynamicContext}`;
}

/** Short instruction for the one-shot "acknowledge mode change" LLM call. */
export function buildModeChangeInstruction(mode: TutorMode, explanationLocale: string): string {
  return (
    `You just switched the tutor session to mode "${mode}". In ${explanationLocale}, say one short ` +
    'sentence acknowledging the new mode. No greeting, no markers, no tool calls.'
  );
}
