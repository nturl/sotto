/**
 * Sentence tokenizers (planning/CONTRACTS.md §1, `tokenizer: 'latin' | 'presegmented'`).
 * Returns tokens without ids — the caller (the content builder) assigns
 * `b<n>.s<n>.t<n>` ids once it knows the token's position in the chapter.
 */
import type { TokenizerStrategy } from './languages.ts';

/** A token before id assignment; everything else a Token needs except glosses/pinyin/timing. */
export interface TokenDraft {
  text: string;
  normalized: string;
  isWord: boolean;
  spaceBefore: boolean;
}

// French/Catalan/Portuguese/Italian elision prefixes that turn "<prefix>'<rest>"
// into two tokens: the clitic ("l'", "qu'", ...) and the rest of the word.
// A cluster whose pre-apostrophe part is NOT one of these stays a single
// token — this is what keeps "aujourd'hui" together.
const CLITIC_PREFIXES = new Set([
  'l',
  'd',
  'j',
  'm',
  'n',
  's',
  't',
  'c',
  'qu',
  'jusqu',
  'lorsqu',
  'puisqu',
  'quoiqu',
]);

const STRAIGHT_APOSTROPHE = "'";
const CURLY_APOSTROPHE = '’';

function isApostrophe(ch: string): boolean {
  return ch === STRAIGHT_APOSTROPHE || ch === CURLY_APOSTROPHE;
}

function normalizeApostrophes(s: string): string {
  return s.split(CURLY_APOSTROPHE).join(STRAIGHT_APOSTROPHE);
}

function findApostropheIndex(s: string): number {
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== undefined && isApostrophe(ch)) return i;
  }
  return -1;
}

// A "cluster" is a run of letters/digits, optionally joined by internal
// hyphens or apostrophes (so "grand-mère" and "l'enfant" each match as one
// cluster before we decide whether to split on the apostrophe).
const CLUSTER_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

function tokenizeLatin(text: string): TokenDraft[] {
  const tokens: TokenDraft[] = [];
  let cursor = 0;
  let pendingSpace = false;

  const pushPunct = (ch: string): void => {
    tokens.push({
      text: ch,
      normalized: ch.toLowerCase(),
      isWord: false,
      spaceBefore: pendingSpace,
    });
    pendingSpace = false;
  };

  const pushWord = (surface: string): void => {
    tokens.push({
      text: surface,
      normalized: normalizeApostrophes(surface.toLowerCase()),
      isWord: true,
      spaceBefore: pendingSpace,
    });
    pendingSpace = false;
  };

  const consumeGap = (from: number, to: number): void => {
    for (let i = from; i < to; i++) {
      const ch = text[i];
      if (ch === undefined) continue;
      if (/\s/.test(ch)) {
        pendingSpace = true;
      } else {
        pushPunct(ch);
      }
    }
  };

  CLUSTER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CLUSTER_RE.exec(text))) {
    const start = match.index;
    consumeGap(cursor, start);

    const cluster = match[0];
    const apIdx = findApostropheIndex(cluster);
    if (apIdx !== -1) {
      const prefix = cluster.slice(0, apIdx);
      const rest = cluster.slice(apIdx + 1);
      if (rest.length > 0 && CLITIC_PREFIXES.has(prefix.toLowerCase())) {
        pushWord(cluster.slice(0, apIdx + 1)); // e.g. "l'"
        pushWord(rest); // e.g. "enfant"
      } else {
        pushWord(cluster);
      }
    } else {
      pushWord(cluster);
    }
    cursor = start + cluster.length;
  }
  consumeGap(cursor, text.length);

  return tokens;
}

const CJK_PUNCTUATION = new Set(['，', '。', '！', '？', '：', '；', '“', '”', '、']);

function tokenizePresegmented(text: string): TokenDraft[] {
  return text
    .split(' ')
    .filter((piece) => piece.length > 0)
    .map((piece) => {
      const isPunctuation = [...piece].every((ch) => CJK_PUNCTUATION.has(ch));
      return {
        text: piece,
        normalized: piece.toLowerCase(),
        isWord: !isPunctuation,
        spaceBefore: false,
      };
    });
}

export function tokenizeSentence(text: string, strategy: TokenizerStrategy): TokenDraft[] {
  return strategy === 'presegmented' ? tokenizePresegmented(text) : tokenizeLatin(text);
}
