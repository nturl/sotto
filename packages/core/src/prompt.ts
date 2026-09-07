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
  /**
   * Rewrite the instruction for a small model (run 9, lane B). The browser
   * cascade runs Qwen3.5-2B in the learner's own tab; at that size the model
   * reliably loses rules that sit ~2,000 characters above the passage, which
   * is how Noel's live Discuss turn came back as a filler line plus a
   * five-line markdown list (planning/run9/PLAN.md). Compact keeps the same
   * product rules but reorders them — session context first, then the mode,
   * then short numbered imperatives LAST, where recency puts them in reach —
   * and states the reply shape and the unusable-turn rule explicitly.
   *
   * Set by `packages/voice/src/browser-cascade/worker.ts` and nothing else:
   * the paid provider and the local server keep sending the prompt below
   * byte for byte (prompt.test.ts pins all four modes against a fixture).
   */
  compact?: boolean;
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

/** Compact mode's one-line-per-mode guidance. Deliberately imperative and
 * concrete; read_to_me keeps the `[[reading:]]` marker, which the worker's
 * `stripMarkers` needs to highlight the sentences being read. */
const COMPACT_MODE_GUIDANCE: Record<TutorMode, string> = {
  read_to_me:
    'Mode: read_to_me. Read the next 1-3 passage sentences aloud, word for word, then stop. ' +
    'Begin your reply with the marker [[reading: id1 id2]] listing the ids of the sentences ' +
    'you are about to read. Add nothing of your own.',
  read_with_me:
    'Mode: read_with_me. The learner reads a sentence aloud. Say one short encouraging line, ' +
    'correct at most one word, then stop.',
  pronunciation:
    'Mode: pronunciation. The learner reads the visible sentence aloud. Name the single most ' +
    'useful pronunciation issue, say the word correctly, and invite one retry.',
  discuss:
    "Mode: discuss. Answer the learner's question about the passage above, then ask exactly " +
    'one short follow-up question about it.',
};

/** Compact mode's per-mode reply-shape line, rule 6 below. */
const COMPACT_SHAPE: Record<TutorMode, string> = {
  read_to_me: 'Say only the passage sentences. Do not add sentences of your own.',
  read_with_me: 'At most two sentences.',
  pronunciation: 'At most two sentences. Never state a numeric or percentage accuracy score.',
  discuss:
    'Two sentences that answer, then one question. Never more than three sentences. Your ' +
    'reply is not finished until you have asked the learner one short question about the ' +
    'passage, so the last character of every reply is a question mark — unless the learner ' +
    'just asked you to stop.',
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

function renderDynamicContext(ctx: PromptContext): string {
  const { learner, passage } = ctx;
  const sentenceLines = passage.sentences.map(renderSentence).join('\n');
  return `--- Session context ---
Book: ${ctx.bookTitle}
Chapter: ${passage.chapterTitle}
Learner level: ${learner.level}
Interface language: ${ctx.interfaceLocale ?? learner.explanationLocale}
Current reading position (token id): ${passage.positionTokenId ?? 'start of chapter'}
Visible passage (sentence id: text, then its words as word=tokenId suffix):
${sentenceLines}
Saved words this session: ${ctx.savedWords.length > 0 ? ctx.savedWords.join(', ') : '(none)'}
${ctx.recentSummary ? `Recent turn summary: ${ctx.recentSummary}` : ''}`;
}

/**
 * The same product rules as `buildSystemInstruction`'s prose block, rewritten
 * for a 2B model: the passage comes first, the rules come last and numbered,
 * and the two things the live failure needed spelled out — "no lists, no
 * markdown, no emoji, no filler" and "ask for a repeat instead of summarizing
 * an unusable turn" — are their own rules rather than implications.
 */
function buildCompactInstruction(ctx: PromptContext): string {
  const { learner } = ctx;
  const head = `You are a patient ${learner.learningLocale} reading tutor. The learner uses ${learner.explanationLocale} for explanations. Everything you say about the story must come from the passage below.`;

  // Rule ORDER is load-bearing, not cosmetic. A 2B model weights the end of
  // a long prompt most, so the three rules the live failure actually broke —
  // no markdown, no filler, and the reply's shape — are the last three, with
  // the shape rule dead last. Measured on the real model (planning/run9/
  // B-report.md): with the shape rule in the middle, four of four discuss
  // replies answered in prose but never asked the follow-up question.
  const rules = `Rules. Follow every one.
1. Speak ${learner.learningLocale} at level ${learner.level}. ${dialectNote(learner.learningLocale)}
2. Use only the passage above. If it does not say something, say so plainly. Never invent detail, and never narrate copyrighted text beyond the passage.
3. Explain in ${learner.explanationLocale} only when a short explanation is needed. If the learner switches language, reply in the language they just used, then offer to return to ${learner.learningLocale}.
4. Correct at most one thing per turn, and only when it helps comprehension or pronunciation. Most turns have no correction.
5. To use a tool, copy the tokenId from the word list above: the full id is the sentence id + "." + suffix (b1.s1 with cigarra=t6 gives b1.s1.t6). Never derive a tokenId by counting words. Never claim an action succeeded until its tool returns success.
6. Three markers exist and no others: [[pace: slow]] and [[pace: normal]], which start your next reply when the learner asks you to slow down or to go at normal speed, and [[reading: ...]], which read_to_me begins its reply with. Never invent a different double-bracket marker.
7. Before the learner has said anything, open with exactly one short sentence in ${learner.learningLocale} inviting them into the passage, then stop and wait.
8. Reply in plain sentences only. Never use bullet points, numbered lists, headings, asterisks, or emoji.
9. Never begin with filler such as "Okay" or "Let's see". No greetings, no praise.
10. If the learner's message is empty, a single word, or does not make sense, do not summarize the passage; ask them to repeat the question in one sentence.
11. ${COMPACT_SHAPE[ctx.mode]}`;

  return `${head}\n\n${renderDynamicContext(ctx)}\n\n${COMPACT_MODE_GUIDANCE[ctx.mode]}\n\n${rules}`;
}

export function buildSystemInstruction(ctx: PromptContext): string {
  if (ctx.compact) return buildCompactInstruction(ctx);

  const { learner } = ctx;

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

  return `${stableRules}\n\n${MODE_GUIDANCE[ctx.mode]}\n\n${renderDynamicContext(ctx)}`;
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
