/**
 * Reader — DESIGN.md "Reader" + "Completion". CONTRACTS §6 route:
 * /reader/[bookId]?mode=read|narration.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ViewStyle,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getLanguage, type Block, type Chapter, type Sentence, type Token } from '@sotto/core';
import { radius, shadow, space, type schemes } from '@sotto/core/theme';
import { useTheme } from '../../src/ui/theme';
import { useT } from '../../src/i18n/useT';
import { BookTile } from '../../src/ui/BookTile';
import { Cover } from '../../src/ui/Cover';
import { bookAssetUrl, useLibrary } from '../../src/ui/data';
import {
  BookmarkGlyph,
  CloseGlyph,
  HandDrawnArrowGlyph,
  MicGlyph,
  PauseGlyph,
  PlayGlyph,
  SettingsGlyph,
  SkipNextGlyph,
  SkipPrevGlyph,
  SpeakerGlyph,
} from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import { Sheet } from '../../src/ui/Sheet';
import { Toast } from '../../src/ui/Toast';
import type { SpeechSentence } from '../../src/ui/SpeechFillText';
import { SelectableSpeechText } from '../../src/ui/reader/SelectableSpeechText';
import {
  composedGlossLine,
  composedGlossUsedFallback,
  computeSpan,
  flattenBlockTokens,
  isSingleSentenceSpan,
  isWholeSentenceSpan,
  spanText,
  type FlatBlockToken,
} from '../../src/ui/reader/selection';
import {
  panelRowOrder,
  savedWordsLine,
  sentenceHighlight,
  type PanelRowId,
} from '../../src/ui/reader/readerPanel';
import { DESKTOP_BREAKPOINT } from '../../src/ui/Shell';
import { webCursor } from '../../src/ui/tokens';
import {
  playAudioSlice,
  playWordAudio,
  useNarrationPlayer,
  type NarrationSpeed,
  type WordAudioOptions,
} from '../../src/platform/audio';
import { useSottoStore } from '../../src/state/store';
import { buildSavedWord } from '../../src/state/vocabulary';
import { useLazyNarration } from '../../src/import/useLazyNarration';
// ThemedText resolves color against the active scheme (unlike the plain
// `Text` component, which stays statically light — see
// ui/theme/ThemedText.tsx's doc comment for why); aliased so every
// existing `<Text ...>` call site in this file picks it up without a
// rename.
import { ThemedText as Text } from '../../src/ui/theme';

const SPEEDS: NarrationSpeed[] = [0.75, 1, 1.25];

type ThemeColors = Record<keyof (typeof schemes)['light'], string>;

/** Styles with no color token in them — safe as a plain module-scope
 * constant (unlike `createStyles` below, they never need to change with
 * the active scheme), so ReaderBlock (which doesn't call useTheme) can use
 * them directly. */
const staticStyles = StyleSheet.create({
  block: {
    marginBottom: space.lg,
  },
});

function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** All tokens across every block/sentence, in reading order — used for the
 * global "current index = last token with startMs <= positionMs" rule and
 * for the simple scroll-based progress fraction. */
function flattenTokens(chapter: Chapter): Token[] {
  return chapter.blocks.flatMap((b) => b.sentences.flatMap((s) => s.tokens));
}

type WordAudioIndex = Record<string, [number, number]>;

/** Module-level cache for `audio/words.json` (R3-W): loaded once per book
 * and kept for the app's lifetime — it's small (one entry per unique word
 * token) and never changes for a given pack build. `null` means "loaded,
 * but the book has no usable index" (fetch failed or no wordAudio yet). */
const wordAudioIndexCache = new Map<string, WordAudioIndex | null>();
/** In-flight fetches, keyed by bookId, memoized so a tap that arrives
 * while the index is still loading (see `resolveWordPlayback` below) can
 * await the same request the hook's effect already kicked off, instead of
 * firing a second one. */
const wordAudioIndexPromises = new Map<string, Promise<WordAudioIndex | null>>();

function loadWordAudioIndex(
  bookId: string,
  locale: string,
  indexPath: string,
): Promise<WordAudioIndex | null> {
  if (wordAudioIndexCache.has(bookId)) {
    return Promise.resolve(wordAudioIndexCache.get(bookId) ?? null);
  }
  const pending = wordAudioIndexPromises.get(bookId);
  if (pending) return pending;
  const promise = fetch(bookAssetUrl(bookId, indexPath, locale))
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((json: { words?: WordAudioIndex }) => {
      const index = json.words ?? {};
      wordAudioIndexCache.set(bookId, index);
      return index;
    })
    .catch(() => {
      wordAudioIndexCache.set(bookId, null);
      return null;
    })
    .finally(() => {
      wordAudioIndexPromises.delete(bookId);
    });
  wordAudioIndexPromises.set(bookId, promise);
  return promise;
}

function useWordAudioIndex(
  bookId: string | undefined,
  locale: string | undefined,
  indexPath: string | undefined,
): WordAudioIndex | undefined {
  const [, forceRender] = useState(0);
  useEffect(() => {
    if (!bookId || !locale || !indexPath) return;
    if (wordAudioIndexCache.has(bookId)) return;
    let cancelled = false;
    void loadWordAudioIndex(bookId, locale, indexPath).then(() => {
      if (!cancelled) forceRender((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [bookId, locale, indexPath]);
  return bookId ? (wordAudioIndexCache.get(bookId) ?? undefined) : undefined;
}

export type WordPlaybackDecision = { kind: 'ready'; options: WordAudioOptions } | { kind: 'wait' };

/** Decides whether a single-word tap can play now or must wait on the
 * word-audio index (TASK R6-C2 commit 2). `index` is `undefined` only
 * while `words.json` is still loading (see the cache above) — `null`
 * would mean "loaded, but unusable", which is a legitimate reason to fall
 * back to the narration slice immediately, not to wait. Waiting only
 * matters when the book actually has a sprite (`spriteUri` set); a book
 * with no word-audio at all should never delay the fallback. */
export function resolveWordPlayback(
  spriteUri: string | undefined,
  index: WordAudioIndex | null | undefined,
  normalized: string,
  fallback: WordAudioOptions['fallback'],
): WordPlaybackDecision {
  if (spriteUri && index === undefined) return { kind: 'wait' };
  return { kind: 'ready', options: { spriteUri, index: index ?? undefined, normalized, fallback } };
}

export default function ReaderScreen() {
  const t = useT();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { bookId, mode } = useLocalSearchParams<{ bookId: string; mode?: string }>();
  const library = useLibrary();

  const preferences = useSottoStore((s) => s.preferences);
  const loadBook = useSottoStore((s) => s.loadBook);
  const loadChapter = useSottoStore((s) => s.loadChapter);
  const bookLocale = useSottoStore((s) => s.bookLocale);
  const packsStatus = useSottoStore((s) => s.packsStatus);
  const books = useSottoStore((s) => s.books);
  const chapters = useSottoStore((s) => s.chapters);
  const progressByBook = useSottoStore((s) => s.progress);
  const savedWords = useSottoStore((s) => s.savedWords);
  const saveWord = useSottoStore((s) => s.saveWord);
  const removeWord = useSottoStore((s) => s.removeWord);
  const setProgress = useSottoStore((s) => s.setProgress);
  const markCompleted = useSottoStore((s) => s.markCompleted);
  // Local toast state, matching the convention used elsewhere in the app
  // (profile.tsx, home.tsx: a `useState<string | null>` rendered through
  // `<Toast>`) rather than the store's `pushToast`/`toasts` array — nothing
  // in the app renders `state.toasts` (verified: no other file reads it),
  // so routing reader feedback through it would be silently invisible, the
  // same as the pre-existing "report" failure toast was.
  const [toast, setToast] = useState<string | null>(null);

  const book = books[bookId ?? ''];
  const locale = bookLocale(bookId ?? '') ?? preferences.learningLocale;
  const existingProgress = progressByBook[bookId ?? ''];

  const [chapterId, setChapterId] = useState<string | undefined>(existingProgress?.chapterId);
  // A "selection" is one or more tokens in reading order within a single
  // block: a single tap keeps producing a 1-token selection (today's
  // behaviour, unchanged); a click-drag (mouse) or long-press-drag (touch)
  // can produce a multi-token span (O2-C task C1). `sentence` is the
  // selection's own sentence for a single-sentence span, or the *first*
  // sentence touched when a span crosses a sentence boundary within the
  // block (only used as a fallback; span rendering below never reads its
  // `.translations` when the span isn't a whole single sentence).
  const [selectedToken, setSelectedToken] = useState<{
    token: Token;
    sentence: Sentence;
    spanTokens?: Token[];
    /** Set only when spanTokens exactly covers one whole sentence. */
    wholeSentence?: Sentence;
  } | null>(null);
  const [showSentenceDetail, setShowSentenceDetail] = useState(false);
  const [width, setWidth] = useState(390);
  const [showCompletion, setShowCompletion] = useState(false);
  // Both dock at the bottom, sheet above the transport (DESIGN.md: "Narration
  // transport below the panel") — measured so the sheet can sit flush above
  // the transport instead of the two overlapping, and so the reading area
  // can reserve exactly enough bottom padding to keep its last lines
  // reachable above the docked stack.
  const [transportHeight, setTransportHeight] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);
  const scrollThrottle = useRef(0);

  useEffect(() => {
    // Deep-linking straight to /reader/[bookId] (a full page load, or this
    // e2e script) mounts before `packs` has loaded, so `bookLocale(bookId)`
    // resolves to undefined and loadBook's own locale lookup silently bails
    // — retry once packsStatus reaches 'ready' (WS-6 fix: was `[bookId,
    // loadBook]` only, so a book opened this way never loaded).
    if (bookId) void loadBook(bookId);
  }, [bookId, loadBook, packsStatus]);

  useEffect(() => {
    if (book && !chapterId) setChapterId(book.chapters[0]?.id);
  }, [book, chapterId]);

  const chapterSummary = book?.chapters.find((c) => c.id === chapterId);
  const chapterIndex = book?.chapters.findIndex((c) => c.id === chapterId) ?? -1;
  const chapterKey = bookId && chapterId ? `${bookId}:${chapterId}` : undefined;
  const chapter = chapterKey ? chapters[chapterKey] : undefined;

  useEffect(() => {
    if (bookId && chapterId && chapterSummary)
      void loadChapter(bookId, chapterId, chapterSummary.file);
  }, [bookId, chapterId, chapterSummary, loadChapter]);

  // R3-I gap (LEDGER: "lazy narration not yet wired into the reader's
  // chapter switch"): a private book imported with narrate:'first' only
  // has chapter 1 narrated up front; later chapters have no `.audio` until
  // narrated on demand. Trigger that here whenever the chapter switches to
  // one still missing audio — the hook mutates the store's book/chapter
  // entries in place, so `chapterSummary`/`audioUri` below pick up the
  // result once it lands, same as switching to an already-narrated chapter.
  const { narrating: narratingOnDemand, narrateChapter: narrateOnDemand } = useLazyNarration();
  const attemptedNarrationRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!bookId || !book?.private || chapterIndex < 0 || chapterSummary?.audio) return;
    const key = `${bookId}:${chapterIndex}`;
    if (attemptedNarrationRef.current.has(key)) return;
    attemptedNarrationRef.current.add(key);
    void narrateOnDemand(bookId, chapterIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, book?.private, chapterIndex, chapterSummary?.audio]);

  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const language = locale ? getLanguage(locale) : undefined;
  const cjk = language?.typography === 'cjk';

  const flatTokens = useMemo(() => (chapter ? flattenTokens(chapter) : []), [chapter]);
  // ADVERSARIAL-REVIEW.md §2 "fragility": `flatTokens.indexOf(token)` used
  // to run per token per render inside ReaderBlock, and narration updates
  // `positionMs` every ~60ms — an O(n²) scan per frame on a long chapter.
  // Precomputed once per chapter instead.
  const tokenIndexById = useMemo(() => {
    const map = new Map<string, number>();
    flatTokens.forEach((tk, i) => map.set(tk.id, i));
    return map;
  }, [flatTokens]);
  const audioUri =
    chapterSummary?.audio && locale
      ? bookAssetUrl(bookId ?? '', chapterSummary.audio, locale)
      : undefined;
  const narration = useNarrationPlayer(audioUri, preferences.narrationSpeed as NarrationSpeed);

  // R3-W: the speaker button prefers a clean, standalone word-pronunciation
  // sprite over a slice of the chapter narration. `words.json` is loaded
  // once per book and kept in a small module-level cache (below) so
  // switching chapters within the same book doesn't refetch it.
  const wordAudioUri =
    book?.wordAudio && bookId && locale
      ? bookAssetUrl(bookId, book.wordAudio.file, locale)
      : undefined;
  const wordAudioIndex = useWordAudioIndex(bookId, locale, book?.wordAudio?.index);

  // ?mode=narration (CONTRACTS §6 route) starts narration automatically.
  useEffect(() => {
    if (mode === 'narration' && narration.isLoaded && !narration.playing) narration.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, narration.isLoaded]);

  const narratingIndex = useMemo(() => {
    if (!narration.playing && narration.positionMs === 0) return -1;
    let idx = -1;
    for (let i = 0; i < flatTokens.length; i += 1) {
      const startMs = flatTokens[i]?.startMs;
      if (startMs !== undefined && startMs <= narration.positionMs) idx = i;
    }
    return idx;
  }, [flatTokens, narration.positionMs, narration.playing]);

  const savedTokenIds = useMemo(
    () => new Set(savedWords.filter((w) => w.bookId === bookId).map((w) => w.tokenId)),
    [savedWords, bookId],
  );

  // Every token id that should render the peach selection fill: just the
  // tapped word for a single-tap selection, or every token in a drag span.
  const selectedSpanTokenIds = useMemo(() => {
    if (!selectedToken) return undefined;
    return new Set((selectedToken.spanTokens ?? [selectedToken.token]).map((tk) => tk.id));
  }, [selectedToken]);

  const isLastChapter = book ? chapterIndex === book.chapters.length - 1 : false;

  // ADVERSARIAL-REVIEW.md §2 "fragility": completion used to fire on
  // `percentComplete >= 0.999` derived from the scroll fraction alone, so
  // scrolling to the bottom of the last chapter (even a quick flick, or
  // overscroll bounce) marked the book complete without the last block ever
  // being on screen. Instead, the last block of the last chapter records
  // its own bottom edge on layout, and completion requires that edge to
  // have actually scrolled into the viewport at least once.
  const lastBlockBottomRef = useRef<number | null>(null);
  const lastBlockSeenRef = useRef(false);

  const persistProgress = useCallback(
    (fraction: number, positionMs: number) => {
      if (!bookId || !chapterId || !book) return;
      const perChapter = 1 / book.chapters.length;
      const percentComplete = Math.min(1, chapterIndex * perChapter + fraction * perChapter);
      setProgress({
        bookId,
        chapterId,
        audioPositionMs: positionMs,
        percentComplete,
        updatedAt: new Date().toISOString(),
      });
      if (isLastChapter && lastBlockSeenRef.current) {
        markCompleted(bookId);
        setProgress({
          bookId,
          chapterId,
          audioPositionMs: positionMs,
          percentComplete: 1,
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
        setShowCompletion(true);
      }
    },
    [bookId, chapterId, book, chapterIndex, isLastChapter, setProgress, markCompleted],
  );

  // Narration reaching the end of the passage advances/completes progress.
  // Listening to the whole chapter's audio is itself sufficient evidence of
  // having gone through the last block (the learner need not also have
  // scrolled), so this path counts as "seen" for the completion gate above.
  useEffect(() => {
    if (
      narration.durationMs > 0 &&
      narration.positionMs >= narration.durationMs - 250 &&
      narration.playing
    ) {
      if (isLastChapter) lastBlockSeenRef.current = true;
      persistProgress(1, narration.positionMs);
    }
  }, [
    narration.positionMs,
    narration.durationMs,
    narration.playing,
    persistProgress,
    isLastChapter,
  ]);

  const lastFractionRef = useRef(existingProgress?.percentComplete ?? 0);

  // Reset the "last block seen" gate whenever the chapter changes — it
  // must be re-earned for each chapter, and a stale bottom from the
  // previous chapter would otherwise complete the book on the first scroll.
  useEffect(() => {
    lastBlockBottomRef.current = null;
    lastBlockSeenRef.current = false;
  }, [chapterId]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const now = Date.now();
      if (now - scrollThrottle.current < 300) return;
      scrollThrottle.current = now;
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const maxScroll = Math.max(1, contentSize.height - layoutMeasurement.height);
      const fraction = Math.min(1, Math.max(0, contentOffset.y / maxScroll));
      lastFractionRef.current = fraction;
      if (
        lastBlockBottomRef.current !== null &&
        contentOffset.y + layoutMeasurement.height >= lastBlockBottomRef.current - 4
      ) {
        lastBlockSeenRef.current = true;
      }
      persistProgress(fraction, narration.positionMs);
    },
    [persistProgress, narration.positionMs],
  );

  // When narrating, the audio position is a more reliable progress signal
  // than scroll (speech fill means the learner often never scrolls at all);
  // prefer it over the last scroll fraction whenever a duration is known.
  const currentFraction = useCallback(
    () =>
      narration.durationMs > 0
        ? narration.positionMs / narration.durationMs
        : lastFractionRef.current,
    [narration.durationMs, narration.positionMs],
  );

  // Save audioPositionMs on pause and on leaving the reader (TASK §C).
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (wasPlayingRef.current && !narration.playing) {
      persistProgress(currentFraction(), narration.positionMs);
    }
    wasPlayingRef.current = narration.playing;
  }, [narration.playing, narration.positionMs, persistProgress, currentFraction]);

  // The cleanup below must read the *latest* positionMs/persistProgress at
  // whatever moment it actually fires (unmount, or bookId/chapterId
  // changing), not whatever they were when the effect was last (re)created
  // — a ref sidesteps the stale-closure trap without adding
  // narration.positionMs (which changes every ~60ms while playing) to the
  // effect's own dependency array.
  const latestRef = useRef({ persistProgress, currentFraction, positionMs: narration.positionMs });
  latestRef.current = { persistProgress, currentFraction, positionMs: narration.positionMs };

  useEffect(() => {
    return () => {
      latestRef.current.persistProgress(
        latestRef.current.currentFraction(),
        latestRef.current.positionMs,
      );
    };
  }, [bookId, chapterId]);

  // Web keyboard shortcuts (TASK §C): space play/pause, arrows ±10s, Escape.
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.target && (event.target as HTMLElement).tagName === 'INPUT') return;
      if (event.code === 'Space' && audioUri) {
        event.preventDefault();
        if (narration.playing) narration.pause();
        else narration.play();
      } else if (event.code === 'ArrowRight' && audioUri) {
        narration.seekBy(10);
      } else if (event.code === 'ArrowLeft' && audioUri) {
        narration.seekBy(-10);
      } else if (event.code === 'Escape') {
        setSelectedToken(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUri, narration.playing]);

  const toggleSaved = (token: Token, sentence: Sentence) => {
    if (!bookId || !chapterId || !locale) return;
    const already = savedTokenIds.has(token.id);
    if (already) {
      const word = savedWords.find((w) => w.bookId === bookId && w.tokenId === token.id);
      if (word) removeWord({ savedWordId: word.id });
      setToast(t('reader.removedToast'));
    } else {
      const word = buildSavedWord({
        bookId,
        chapterId,
        sourceLocale: locale,
        explanationLocale: preferences.explanationLocale,
        token,
        sentence,
      });
      saveWord(word);
      setToast(t('reader.savedToast'));
    }
  };

  const report = () => {
    // ADVERSARIAL-REVIEW.md §2 "fakes / dead controls": this used to be a
    // mailto: to a domain that doesn't resolve to a Sotto inbox, so reports
    // went nowhere. Opens the repo's bug-report issue template instead.
    void Linking.openURL('https://github.com/nturl/sotto/issues/new?template=bug_report.md').catch(
      () => {
        setToast(t('reader.reportFailed'));
      },
    );
  };

  const talkAboutPassage = () => {
    if (!bookId) return;
    router.push(`/voice/${bookId}?mode=discuss`);
  };

  if (!bookId) return null;

  if (showCompletion) {
    return (
      <CompletionView
        book={library.byId(bookId)}
        onClose={() => router.replace('/(tabs)/home')}
        recommended={library.recommended.slice(0, 2)}
      />
    );
  }

  const explanationLocale = preferences.explanationLocale;
  const gloss = selectedToken?.token.glosses?.[explanationLocale];
  const glossFallback = !gloss && selectedToken?.token.glosses?.en;
  const glossText = gloss ?? glossFallback ?? selectedToken?.token.normalized ?? '';
  const sentenceTranslation =
    selectedToken?.sentence.translations[explanationLocale] ??
    selectedToken?.sentence.translations.en ??
    '';
  const isSaved = selectedToken ? savedTokenIds.has(selectedToken.token.id) : false;

  // Mockup frame 3's top-left label: "{book title} · Chapter {n} of {m}"
  // (the chapter's own title is longer than the measure allows and repeats
  // what the segmented progress row already shows).
  const chapterLabel =
    book && chapterIndex >= 0
      ? t('reader.chapterLabel', {
          title: library.byId(bookId)?.title ?? book.title,
          n: String(chapterIndex + 1),
          m: String(book.chapters.length),
        })
      : (chapterSummary?.title ?? '');

  // O2-C task C1: a drag span (more than one token) gets its own panel —
  // the pre-built sentence translation when the span covers a whole
  // sentence, otherwise a composed gloss line for just the span. Single
  // taps (spanTokens undefined, or length 1) keep the panel above
  // unchanged.
  const spanTokens = selectedToken?.spanTokens;
  const isSpanSelection = !!spanTokens && spanTokens.length > 1;
  const wholeSentence = selectedToken?.wholeSentence;
  const spanFlat: FlatBlockToken[] =
    spanTokens && selectedToken
      ? spanTokens.map((token, index) => ({ token, sentence: selectedToken.sentence, index }))
      : [];
  const spanGlossLine = composedGlossLine(spanFlat, explanationLocale);
  const spanGlossFallback = composedGlossUsedFallback(spanFlat, explanationLocale);
  const spanDisplayText = spanText(spanFlat);
  const wholeSentenceTranslation = wholeSentence
    ? (wholeSentence.translations[explanationLocale] ?? wholeSentence.translations.en ?? '')
    : '';
  const wholeSentenceUsedFallback =
    !!wholeSentence &&
    !wholeSentence.translations[explanationLocale] &&
    !!wholeSentence.translations.en;
  const spanFirst = spanTokens?.[0];
  const spanLast = spanTokens?.at(-1);
  const playSpanAudio = () => {
    if (!audioUri || spanFirst?.startMs === undefined) return;
    playAudioSlice(audioUri, spanFirst.startMs, spanLast?.endMs ?? spanFirst.startMs + 600);
  };

  // Run 8 (PLAN.md decision 11): the four mutually-exclusive panel shapes
  // the reader used to render collapse into one. Every shape resolves to the
  // same six values below, then `panelRowOrder` decides which rows appear and
  // in what order, and the JSX renders them in exactly that order — so the
  // DOM order is the tested order, not a second hand-maintained copy of it.
  const isWholeSentenceSelection = isSpanSelection && !!wholeSentence;
  const headword = isWholeSentenceSelection
    ? (wholeSentence?.text ?? '')
    : isSpanSelection
      ? spanDisplayText
      : (selectedToken?.token.text ?? '');
  const panelGloss = isWholeSentenceSelection
    ? wholeSentenceTranslation
    : isSpanSelection
      ? (spanGlossLine ?? '')
      : glossText;
  const panelGlossFallback = isWholeSentenceSelection
    ? wholeSentenceUsedFallback
    : isSpanSelection
      ? spanGlossFallback
      : !!glossFallback;
  // The mockup's `.ph` form line ("trouver · third person, present"). The
  // Token model (packages/core/src/models.ts) carries neither `lemma` nor a
  // part-of-speech field, so the only per-token form data that exists today
  // is CJK pinyin — see planning/run8/D-report.md. No placeholder otherwise.
  const formLine = !isSpanSelection && cjk ? selectedToken?.token.pinyin : undefined;
  const speakerStartMs = isSpanSelection ? spanFirst?.startMs : selectedToken?.token.startMs;
  const hasSpeaker = speakerStartMs !== undefined && !!audioUri;
  const selectedTokenIdList = selectedToken
    ? (selectedToken.spanTokens ?? [selectedToken.token]).map((tk) => tk.id)
    : [];
  // "In this passage" would be the selection itself when the selection *is*
  // the whole sentence, so that shape omits the block.
  const passageParts =
    selectedToken && !isWholeSentenceSelection
      ? sentenceHighlight(selectedToken.sentence, selectedTokenIdList)
      : undefined;
  const yourWords = savedWordsLine(savedWords.filter((w) => w.bookId === bookId));

  const panelRows = panelRowOrder({
    hasSelection: !!selectedToken,
    isSingleWord: !isSpanSelection,
    hasForm: !!formLine,
    hasSpeaker,
    hasPassage: !!passageParts,
    hasYourWords: !!yourWords,
  });

  const shows = (id: PanelRowId) => panelRows.includes(id);

  const playSelectionAudio = () => {
    if (!selectedToken || !audioUri) return;
    if (isSpanSelection) {
      playSpanAudio();
      return;
    }
    const token = selectedToken.token;
    if (token.startMs === undefined) return;
    const normalized = token.normalized;
    const fallback = {
      uri: audioUri,
      startMs: token.startMs,
      endMs: token.endMs ?? token.startMs + 600,
    };
    const decision = resolveWordPlayback(wordAudioUri, wordAudioIndex, normalized, fallback);
    if (decision.kind === 'wait') {
      // Sprite exists but words.json hasn't resolved yet — wait for it
      // instead of silently taking the narration fallback (the bug: the
      // render gate only checks startMs/audioUri, not whether the index
      // has loaded).
      if (bookId && locale && book?.wordAudio) {
        void loadWordAudioIndex(bookId, locale, book.wordAudio.index).then((index) => {
          playWordAudio({ spriteUri: wordAudioUri, index: index ?? undefined, normalized, fallback });
        });
      }
      return;
    }
    playWordAudio(decision.options);
  };

  const talkRow = (
    <Pressable
      testID="reader-panel-talk"
      accessibilityRole="button"
      accessibilityLabel={t('book.a11y.talkAboutPassage')}
      onPress={talkAboutPassage}
      style={[styles.talkRow, webCursor]}
    >
      <MicGlyph size={18} color={colors.ink} />
      <Text role="uiButton" size={15}>
        {t('book.a11y.talkAboutPassage')}
      </Text>
    </Pressable>
  );

  const translationPanel = (
    <View style={styles.panelInner}>
      {!selectedToken ? (
        <Text role="caption" color="ink3" style={styles.emptyState}>
          {t('reader.emptyState')}
        </Text>
      ) : (
        <>
          {/* word · gloss · form line in one column, speaker ring pinned to
              that block's top-right — the DOM order inside this row is
              word, gloss, form, speaker, matching panelRowOrder(). */}
          <View style={styles.panelHeaderRow}>
            <View style={styles.panelHeaderText}>
              <Text
                testID="reader-panel-word"
                role={isWholeSentenceSelection ? 'reading' : 'heading'}
                size={isWholeSentenceSelection ? undefined : 28}
              >
                {headword}
              </Text>
              <Text testID="reader-panel-gloss" role="ui" size={16} color="ink2">
                {panelGloss}
              </Text>
              {panelGlossFallback ? (
                <Text role="caption" color="ink3">
                  {t('reader.translatedToEnglish')}
                </Text>
              ) : null}
              {shows('reader-panel-form') && formLine ? (
                <Text
                  testID="reader-panel-form"
                  role="mono"
                  size={12}
                  color="ink2"
                  style={styles.formLine}
                >
                  {formLine}
                </Text>
              ) : null}
            </View>
            {shows('reader-panel-speaker') ? (
              <IconButton
                variant="ring"
                size={44}
                icon={<SpeakerGlyph size={18} color={colors.accent} />}
                accessibilityLabel={t('book.a11y.playNarration')}
                onPress={playSelectionAudio}
                style={styles.panelSpeaker}
              />
            ) : null}
          </View>

          <View style={styles.panelActions}>
            {shows('reader-panel-save') ? (
              <Pressable
                testID="reader-panel-save"
                onPress={() => toggleSaved(selectedToken.token, selectedToken.sentence)}
                accessibilityRole="button"
                accessibilityLabel={t('reader.save')}
                style={webCursor}
              >
                <View>
                  {isSaved ? (
                    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.saveCutout]} />
                  ) : null}
                  <View style={[styles.saveButton, isSaved && styles.saveButtonActive]}>
                    <BookmarkGlyph size={15} color={isSaved ? colors.ink : colors.ink2} />
                    <Text role="uiButton" size={14} color={isSaved ? 'ink' : 'ink2'}>
                      {isSaved ? t('reader.saved') : t('reader.save')}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ) : null}
            {shows('reader-panel-details') ? (
              <Pressable
                testID="reader-panel-details"
                accessibilityRole="button"
                accessibilityLabel={t('reader.details')}
                onPress={() => setShowSentenceDetail((v) => !v)}
                style={[styles.textLink, webCursor]}
              >
                <Text role="caption" color="ink2">
                  {t('reader.details')}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              testID="reader-panel-report"
              accessibilityRole="button"
              accessibilityLabel={t('reader.report')}
              onPress={report}
              style={[styles.textLink, webCursor]}
            >
              <Text role="caption" color="ink2">
                {t('reader.report')}
              </Text>
            </Pressable>
          </View>

          {showSentenceDetail && !isSpanSelection ? (
            <Text role="ui" size={14} color="ink2" style={styles.sentenceDetail}>
              {sentenceTranslation}
            </Text>
          ) : null}

          {shows('reader-panel-passage') && passageParts ? (
            <View testID="reader-panel-passage" style={styles.panelSection}>
              <Text role="mono" color="ink2" style={styles.panelEyebrow}>
                {t('reader.inThisPassage')}
              </Text>
              <Text role="reading" size={15}>
                {passageParts.before}
                <Text role="reading" size={15} style={styles.passageMark}>
                  {passageParts.word}
                </Text>
                {passageParts.after}
              </Text>
            </View>
          ) : null}

          {shows('reader-panel-your-words') && yourWords ? (
            <View testID="reader-panel-your-words" style={styles.panelSection}>
              <Text role="mono" color="ink2" style={styles.panelEyebrow}>
                {t('reader.yourWordsInBook')}
              </Text>
              <Text role="reading" size={15}>
                {yourWords}
              </Text>
            </View>
          ) : null}
        </>
      )}
      {talkRow}
    </View>
  );

  // DESKTOP.md §5: passage column caps at 620 (left-aligned within the
  // remaining space left of the docked panel — a plain maxWidth on each
  // block inside a flex:1 column wrapper achieves this without a manual
  // spacer, since flexbox's default stretch+flex-start already leaves any
  // capped item flush left). Transport docks to the bottom of the passage
  // column only (not the full viewport, which would run it under the
  // panel too) — same flex-pinned-bottom technique as the phone layout,
  // just scoped inside the passage wrapper instead of the screen root.
  const transportView = audioUri ? (
    <View
      style={[styles.transport, isDesktop && styles.transportDesktop]}
      onLayout={(e) => setTransportHeight(e.nativeEvent.layout.height)}
    >
      <View style={styles.transportRow}>
        <Text role="mono" color="ink2">
          {formatClock(narration.positionMs)}
        </Text>
        <View style={styles.transportControls}>
          <IconButton
            icon={<SkipPrevGlyph size={18} color={colors.ink} />}
            accessibilityLabel={t('reader.prevChapter')}
            onPress={() => {
              const prev = book?.chapters[chapterIndex - 1];
              if (prev) setChapterId(prev.id);
            }}
          />
          <Pressable onPress={() => narration.seekBy(-10)} style={webCursor}>
            <Text role="mono">-10</Text>
          </Pressable>
          <IconButton
            variant="ring"
            size={44}
            icon={
              narration.playing ? (
                <PauseGlyph size={18} color={colors.accent} />
              ) : (
                <PlayGlyph size={18} color={colors.accent} />
              )
            }
            accessibilityLabel={narration.playing ? t('reader.pause') : t('reader.play')}
            onPress={() => (narration.playing ? narration.pause() : narration.play())}
          />
          <Pressable onPress={() => narration.seekBy(10)} style={webCursor}>
            <Text role="mono">+10</Text>
          </Pressable>
          <IconButton
            icon={<SkipNextGlyph size={18} color={colors.ink} />}
            accessibilityLabel={t('reader.nextChapter')}
            onPress={() => {
              const next = book?.chapters[chapterIndex + 1];
              if (next) setChapterId(next.id);
            }}
          />
        </View>
        <View style={styles.transportMeta}>
          <Text role="mono" color="ink2">
            -{formatClock(Math.max(0, narration.durationMs - narration.positionMs))}
          </Text>
          <Text role="mono" color="ink2">
            ·
          </Text>
          <Pressable
            onPress={() => {
              const idx = SPEEDS.indexOf(preferences.narrationSpeed as NarrationSpeed);
              const next = SPEEDS[(idx + 1) % SPEEDS.length]!;
              useSottoStore.getState().setPreference('narrationSpeed', next);
            }}
            style={webCursor}
          >
            <Text role="mono" color="ink2">
              {preferences.narrationSpeed}x
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.progressTrack}>
        {chapter?.blocks.map((block) => {
          const tokens = block.sentences.flatMap((s) => s.tokens);
          const first = tokens.find((tk) => tk.startMs !== undefined)?.startMs ?? 0;
          const last =
            [...tokens].reverse().find((tk) => tk.endMs !== undefined)?.endMs ?? first + 1;
          const fraction =
            narration.positionMs <= first
              ? 0
              : narration.positionMs >= last
                ? 1
                : (narration.positionMs - first) / Math.max(1, last - first);
          return (
            <View key={block.id} style={styles.progressSegment}>
              <View style={[styles.progressFill, { width: `${Math.round(fraction * 100)}%` }]} />
            </View>
          );
        })}
      </View>
    </View>
  ) : null;

  // No audio yet for this private-book chapter, and narration was just
  // kicked off on demand (the effect above) — same caption style IMPORT.md
  // §4 uses for "the remaining chapters keep preparing in the background".
  const narratingOnDemandCaption =
    !audioUri && book?.private && narratingOnDemand ? (
      <View style={[styles.transport, isDesktop && styles.transportDesktop]}>
        <Text role="caption" color="ink2">
          {t('import.reader.narratingChapter')}
        </Text>
      </View>
    ) : null;

  return (
    <View style={styles.root} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.body}>
        {/* Passage wrapper fills all space left of the docked panel; its
            children (header/scroll/transport) each cap at 620 so the
            column reads as left-aligned instead of centered or stretched. */}
        <View style={styles.passageWrapper}>
          <View
            style={[
              styles.header,
              { paddingHorizontal: space.gutter.phone },
              isDesktop && styles.passageCapped,
            ]}
          >
            <Text role="mono" numberOfLines={1} style={styles.chapterLabel}>
              {chapterLabel}
            </Text>
            <View style={styles.headerActions}>
              <IconButton
                size={40}
                icon={<SettingsGlyph size={18} color={colors.ink2} />}
                accessibilityLabel={t('book.a11y.settings')}
                onPress={() => router.push('/settings')}
              />
              <IconButton
                size={40}
                icon={<CloseGlyph size={20} color={colors.ink} />}
                accessibilityLabel={t('common.close')}
                onPress={() => router.back()}
              />
            </View>
          </View>

          <ScrollView
            style={[styles.flex, isDesktop && styles.passageCapped]}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingHorizontal: space.gutter.phone,
                paddingBottom: transportHeight + (isDesktop ? 0 : sheetHeight) + space.xxl,
              },
            ]}
            onScroll={onScroll}
            scrollEventThrottle={64}
          >
            {chapter?.blocks.map((block, index) => (
              <ReaderBlock
                key={block.id}
                block={block}
                cjk={!!cjk}
                savedTokenIds={savedTokenIds}
                selectedTokenIds={selectedSpanTokenIds}
                narratingIndex={narratingIndex}
                tokenIndexById={tokenIndexById}
                onSelect={(token, sentence) => {
                  setShowSentenceDetail(false);
                  setSelectedToken({ token, sentence });
                }}
                onSpanSelect={(span) => {
                  if (span.length === 0) return;
                  const tokens = span.map((f) => f.token);
                  const firstToken = span[0] as FlatBlockToken;
                  const wholeSentence =
                    isSingleSentenceSpan(span) &&
                    isWholeSentenceSpan(
                      firstToken.sentence,
                      tokens.map((tk) => tk.id),
                    )
                      ? firstToken.sentence
                      : undefined;
                  setShowSentenceDetail(false);
                  setSelectedToken({
                    token: firstToken.token,
                    sentence: firstToken.sentence,
                    spanTokens: tokens,
                    wholeSentence,
                  });
                }}
                onLongPressSentence={(sentence) => {
                  setSelectedToken({ token: sentence.tokens[0]!, sentence });
                  setShowSentenceDetail(true);
                }}
                onLayout={
                  index === chapter.blocks.length - 1
                    ? (e) => {
                        lastBlockBottomRef.current =
                          e.nativeEvent.layout.y + e.nativeEvent.layout.height;
                      }
                    : undefined
                }
              />
            ))}
          </ScrollView>

          {isDesktop ? (transportView ?? narratingOnDemandCaption) : null}
        </View>

        {isDesktop ? (
          <ScrollView
            style={styles.desktopPanel}
            contentContainerStyle={styles.desktopPanelContent}
          >
            {translationPanel}
          </ScrollView>
        ) : null}
      </View>

      {!isDesktop ? (
        <Sheet
          // Run 8 lane D: always docked on phone. The header mic button is
          // gone (its action is now the panel's last row), so the sheet must
          // be present with the empty state + "Talk about this passage" even
          // before a word is tapped. The run-7 `bottomOffset` logic is
          // untouched — the transport still docks below the sheet.
          visible
          style={styles.mobileSheet}
          bottomOffset={transportHeight}
          onHeightChange={setSheetHeight}
        >
          {translationPanel}
        </Sheet>
      ) : null}

      {!isDesktop ? (transportView ?? narratingOnDemandCaption) : null}

      <Toast message={toast} onHide={() => setToast(null)} />
    </View>
  );
}

/** Builds the SpeechFillText input for one paragraph (block): every token's
 * `spoken` flag is resolved against the chapter-wide tokenIndexById/narratingIndex
 * (a block only holds a subset of sentences, so each token's position within
 * the whole chapter — not its position within the block — is what "spoken"
 * narration progress compares against). `tokenIndexById` is precomputed once
 * per chapter by the parent rather than an `indexOf` scan per token per
 * render (ADVERSARIAL-REVIEW.md §2 "fragility"). */
function ReaderBlock({
  block,
  cjk,
  savedTokenIds,
  selectedTokenIds,
  narratingIndex,
  tokenIndexById,
  onSelect,
  onSpanSelect,
  onLongPressSentence,
  onLayout,
}: {
  block: Block;
  cjk: boolean;
  savedTokenIds: Set<string>;
  selectedTokenIds: Set<string> | undefined;
  narratingIndex: number;
  tokenIndexById: Map<string, number>;
  onSelect: (token: Token, sentence: Sentence) => void;
  onSpanSelect: (span: FlatBlockToken[]) => void;
  onLongPressSentence: (sentence: Sentence) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const sentences: SpeechSentence[] = block.sentences.map((sentence) => ({
    id: sentence.id,
    tokens: sentence.tokens.map((token) => {
      const globalIndex = tokenIndexById.get(token.id) ?? -1;
      return {
        id: token.id,
        text: token.text,
        spaceBefore: token.spaceBefore,
        isWord: token.isWord,
        spoken: narratingIndex < 0 ? true : globalIndex <= narratingIndex,
        saved: savedTokenIds.has(token.id),
      };
    }),
  }));

  // Recomputed once per render (block sentences rarely change): the flat
  // reading-order token list this block's drag-selection resolves against.
  const flatBlockTokens = flattenBlockTokens(block);

  return (
    <View style={staticStyles.block} onLayout={onLayout}>
      <SelectableSpeechText
        sentences={sentences}
        selectedSpanTokenIds={selectedTokenIds}
        cjk={cjk}
        underline
        onTap={(speechToken, speechSentence) => {
          const sentence = block.sentences.find((s) => s.id === speechSentence.id);
          const token = sentence?.tokens.find((tk) => tk.id === speechToken.id);
          if (sentence && token) onSelect(token, sentence);
        }}
        onSpanSelect={(anchorTokenId, focusTokenId) => {
          onSpanSelect(computeSpan(flatBlockTokens, anchorTokenId, focusTokenId));
        }}
        onLongPressSentence={(speechSentence) => {
          const sentence = block.sentences.find((s) => s.id === speechSentence.id);
          if (sentence) onLongPressSentence(sentence);
        }}
      />
    </View>
  );
}

function CompletionView({
  book,
  onClose,
  recommended,
}: {
  book: ReturnType<typeof useLibrary>['daily'] | undefined;
  onClose: () => void;
  recommended: ReturnType<typeof useLibrary>['recommended'];
}) {
  const t = useT();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.root, styles.completionRoot]}>
      <View style={styles.completionHeader}>
        <View />
        <IconButton
          icon={<CloseGlyph size={20} color={colors.ink} />}
          accessibilityLabel={t('common.close')}
          onPress={onClose}
        />
      </View>
      {book ? (
        <Cover
          book={book}
          width={140}
          height={210}
          cutout
          accessibilityLabel={book.title}
        />
      ) : null}
      <View style={styles.completionArrow}>
        <HandDrawnArrowGlyph color={colors.ink} />
      </View>
      <View style={styles.completionCard}>
        <Text role="heading" style={styles.completionTitle}>
          {t('reader.chooseNext')}
        </Text>
        <View style={styles.completionTiles}>
          {recommended.map((b) => (
            <BookTile key={b.id} book={b} onPress={() => router.replace(`/book/${b.id}`)} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** Dark-mode note: this is a function (not a module-scope constant) so it
 * can be re-invoked with the active scheme's colors — a plain
 * `StyleSheet.create({...colors.x})` at module load bakes in whatever
 * palette was active at import time and never updates again (the same
 * limitation every other screen's static styles have; see
 * ui/theme/ThemeProvider.tsx's doc comment). ReaderScreen/CompletionView
 * call this via `useMemo(() => createStyles(colors), [colors])` so the
 * reader specifically stays reactive to Appearance changes. */
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.canvas,
    },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: space.xl,
      paddingBottom: space.md,
    },
    chapterLabel: {
      flex: 1,
      marginRight: space.md,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    body: {
      flex: 1,
      flexDirection: 'row',
    },
    // Fills all space left of the docked 360px panel; its children cap at
    // 640 individually (styles.passageCapped), centered in that space —
    // run 8 APP-V2-SPEC.md: "reader passage column 640 centered".
    passageWrapper: {
      flex: 1,
    },
    passageCapped: {
      maxWidth: 640,
      width: '100%',
      alignSelf: 'center',
    },
    scrollContent: {
      paddingTop: space.sm,
    },
    desktopPanel: {
      width: 360,
      borderLeftWidth: 1,
      borderLeftColor: colors.hairline,
      backgroundColor: colors.surface,
      // DESKTOP.md §5: docked right, sticky to the viewport while the
      // passage column scrolls past on the left. A ScrollView (not a plain
      // View) so a long gloss/span translation that exceeds the viewport
      // height scrolls internally instead of bleeding past the panel's
      // bottom edge (matches the mobile sheet's internal scroll).
      ...(Platform.OS === 'web' ? { position: 'sticky', top: 0, maxHeight: '100vh' } : null),
    } as ViewStyle,
    desktopPanelContent: {
      padding: 28,
      // Lets panelInner stretch to the panel's full height so the talk row's
      // `marginTop: auto` actually pins it to the bottom.
      flexGrow: 1,
    },
    mobileSheet: {
      maxHeight: '60%',
    },
    panelInner: {
      flexGrow: 1,
    },
    panelHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.md,
    },
    panelHeaderText: {
      flexShrink: 1,
      gap: space.xs,
    },
    panelSpeaker: {
      marginLeft: 'auto',
    },
    formLine: {
      // Mockup `.ph`: mono 12, tracking .04em (Text's mono role tracks at
      // .08em, so this narrows it back down for this one line).
      letterSpacing: 0.04 * 12,
    },
    panelActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      marginTop: space.lg,
    },
    // PLAN.md decision 14: every text link gets a 40px hit height.
    textLink: {
      minHeight: 40,
      justifyContent: 'center',
    },
    saveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: colors.surface2,
      borderRadius: radius.md,
      paddingVertical: 11,
      paddingHorizontal: 14,
    },
    saveButtonActive: {
      backgroundColor: colors.mark,
      borderWidth: 1.5,
      borderColor: colors.ink,
    },
    // Saved state carries the 4px ink cutout (mockup `.save.done`), drawn as
    // an offset View behind the face — the same technique Button.tsx uses,
    // since RN has no hard-edged box-shadow.
    saveCutout: {
      backgroundColor: colors.ink,
      borderRadius: radius.md,
      transform: [{ translateX: shadow.cutoutInk.offsetX }, { translateY: shadow.cutoutInk.offsetY }],
    },
    panelSection: {
      marginTop: 26,
      paddingTop: 18,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
      gap: space.sm,
    },
    panelEyebrow: {
      textTransform: 'uppercase',
    },
    passageMark: {
      backgroundColor: colors.mark,
    },
    talkRow: {
      marginTop: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      backgroundColor: colors.surface2,
      borderRadius: radius.md,
      paddingVertical: 14,
      paddingHorizontal: space.md,
    },
    sentenceDetail: {
      marginTop: space.sm,
    },
    emptyState: {
      padding: space.lg,
      textAlign: 'center',
    },
    flexShrink: {
      flexShrink: 1,
    },
    // Run 8 mockup `.transport`: a hairline-topped thin bar under the
    // passage, inside the same 640 measure.
    transport: {
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
      backgroundColor: colors.surface,
      paddingHorizontal: space.gutter.phone,
      paddingTop: 14,
      paddingBottom: space.lg,
      gap: space.md,
    },
    transportDesktop: {
      maxWidth: 640,
      width: '100%',
      alignSelf: 'center',
      ...(Platform.OS === 'web' ? { position: 'sticky', bottom: 0 } : null),
    } as ViewStyle,
    progressTrack: {
      flexDirection: 'row',
      gap: 2,
      height: 3,
    },
    progressSegment: {
      flex: 1,
      backgroundColor: colors.surface2,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.ink,
    },
    // Mockup grid `auto 1fr auto`: elapsed left, controls centered in the
    // remaining space, remaining time + speed right.
    transportRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.lg,
    },
    transportControls: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.md,
    },
    transportMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    completionRoot: {
      alignItems: 'center',
      paddingTop: space.xl,
      paddingHorizontal: space.gutter.phone,
    },
    completionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
    },
    completionArrow: {
      marginVertical: space.lg,
    },
    completionCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: space.xl,
      alignSelf: 'stretch',
      gap: space.lg,
    },
    completionTitle: {
      textAlign: 'center',
    },
    completionTiles: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
  });
}
