/**
 * The LIVE tutor system-instruction builder: stable product rules (BRIEF.md
 * lines 407-425) plus a dynamic context block (mode, level, locales, dialect
 * note, title, chapter, passage sentences with their word -> tokenId map,
 * position, saved words, recent summary) and per-mode guidance.
 *
 * This lived in `apps/server/src/voice/prompt.ts` while the local-server
 * cascade was the only provider. `BrowserCascadeProvider` (packages/voice/
 * src/browser-cascade) runs the same four-mode tutor with no server at all,
 * so both providers now share one builder from here; apps/server's
 * prompt.ts is a re-export shim. A second, near-duplicate "portable"
 * builder (`buildTutorInstruction`) used to sit in this file and was never
 * called by anything but its own test — deleted with the move rather than
 * left as a third copy of the rules.
 */
import type { BookLevel, TutorMode } from './models.ts';

/** One word token of a passage sentence (punctuation omitted). */
export interface TutorPassageWord {
  id: string;
  text: string;
}

export interface TutorPassageSentence {
  id: string;
  text: string;
  tokenIds: string[];
  /** Word tokens in order. Empty for older callers; the prompt then falls
   * back to rendering the bare tokenId list. */
  words: TutorPassageWord[];
}

/** Structurally compatible with both @sotto/core's `PassageContextResult`
 * (`positionTokenId: string | null`) and apps/server's zod `PassageContext`
 * (`positionTokenId?: string`). */
export interface TutorPassageContext {
  chapterTitle: string;
  sentences: TutorPassageSentence[];
  positionTokenId?: string | null;
}

export interface TutorLearnerContext {
  level: BookLevel;
  learningLocale: string;
  explanationLocale: string;
}

export interface PromptContext {
  mode: TutorMode;
  learner: TutorLearnerContext;
  interfaceLocale?: string;
  bookTitle: string;
  passage: TutorPassageContext;
  savedWords: string[];
  recentSummary?: string;
}

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
    "Mode: discuss. Answer the learner's question about meaning, grammar, characters, or " +
    'events using only the supplied passage, then end your turn with exactly one short ' +
    'follow-up comprehension question — never more than one, and never leave a turn with no ' +
    'question unless the learner just asked you to stop.',
};

function dialectNote(locale: string): string {
  return DIALECT_NOTES[locale] ?? `Follow the standard conventions of ${locale}.`;
}

/**
 * One passage sentence as "id: text" plus, on the next line, its word->tokenId
 * map as `word=suffix` pairs (suffix = the tokenId with the sentence-id prefix
 * stripped, so `b1.s1.t6` renders as `cigarra=t6`). Two lines rather than
 * inline annotations so the text the model reads aloud verbatim stays clean.
 * This is also cheaper than the old bare `[b1.s1.t1,b1.s1.t2,...]` list,
 * which spent ~6 tokens per id (punctuation included) and still gave the
 * model no way to tell which id was which word.
 *
 * Sentences with no word map (older callers) keep the bare id list.
 */
function renderSentence(s: TutorPassageSentence): string {
  const head = `  - ${s.id}: ${s.text}`;
  if (s.words.length === 0) return `  - ${s.id} [${s.tokenIds.join(',')}]: ${s.text}`;
  const prefix = `${s.id}.`;
  const pairs = s.words
    .map((w) => `${w.text}=${w.id.startsWith(prefix) ? w.id.slice(prefix.length) : w.id}`)
    .join(' ');
  return `${head}\n    ${pairs}`;
}

export function buildSystemInstruction(ctx: PromptContext): string {
  const { learner, passage } = ctx;

  const stableRules = `You are a patient, concise ${learner.learningLocale} reading tutor for a learner who uses
${learner.explanationLocale} for explanations. Use the supplied passage as the source of truth;
only state facts that are in it, and if asked something it does not say, say so plainly rather
than inventing detail. Speak ${learner.learningLocale} at level ${learner.level} and use
${learner.explanationLocale} briefly when explanation is needed. Follow the selected region,
script, and pronunciation conventions: ${dialectNote(learner.learningLocale)} Never continue
narrating copyrighted text beyond the passage the application supplies. Let the learner
interrupt. During reading practice, wait through natural pauses.
Keep spoken turns short: at most two sentences, unless reading the passage aloud verbatim for
read_to_me. Correct at most one thing per turn, only when it meaningfully helps comprehension
or pronunciation; most turns have no correction at all. When you do, name the single most
useful issue, model it, invite one retry, never a numeric score. Use application tools for
saving vocabulary, moving the passage,
or showing an explanation; never claim an action succeeded until its tool returns success.
When a tool needs a tokenId, copy it from the passage's word list: each sentence lists its
words as word=suffix, and the full tokenId is the sentence id + "." + suffix (b1.s1 and
cigarra=t6 give b1.s1.t6). Never derive a tokenId by counting words; punctuation also has
ids, so counts are wrong. Pass the word itself as well whenever a tool accepts it.
Avoid unnecessary greetings or praise. If the learner switches language, reply in the language
the learner just used, then offer to return to ${learner.learningLocale}.

Before the learner has said anything, open the session with exactly one short spoken sentence
in ${learner.learningLocale} inviting them into the passage (its setting, a character, or its
first event), then stop and wait — no generic "hello", no more than that one invitation.

If the learner says "slower" or asks you to slow down, include the marker [[pace: slow]] at the
start of your next reply; if they ask for normal speed again, include [[pace: normal]]. These
markers are stripped before the learner sees or hears your reply.`;

  const sentenceLines = passage.sentences.map(renderSentence).join('\n');

  const dynamicContext = `--- Session context ---
Book: ${ctx.bookTitle}
Chapter: ${passage.chapterTitle}
Learner level: ${learner.level}
Interface language: ${ctx.interfaceLocale ?? learner.explanationLocale}
Current reading position (token id): ${passage.positionTokenId ?? 'start of chapter'}
Visible passage (sentence id: text, then its words as word=tokenId suffix):
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

/**
 * A soft decoding bias for STT, naming both locales a learner might speak
 * in this session. Every STT call site must let Whisper auto-detect the
 * spoken language rather than forcing `language` to `learningLocale` — a
 * forced language decodes whatever it hears into that locale instead of
 * transcribing it (BUGS-TUTOR-RUN5.md #1: an English answer during a
 * Spanish book came back as a Spanish paraphrase, never English). This
 * hint is deliberately just a naming of the two locales, not an
 * instruction — Whisper's `prompt` field biases vocabulary/spelling, it
 * does not force a language the way `language` does.
 */
export function sttLanguageHint(
  learner: Pick<TutorLearnerContext, 'learningLocale' | 'explanationLocale'>,
): string {
  return `The speaker may talk in ${learner.learningLocale} or ${learner.explanationLocale}.`;
}
