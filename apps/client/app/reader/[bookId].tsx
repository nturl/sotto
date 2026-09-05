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
import { radius, space, type schemes } from '@sotto/core/theme';
import { useTheme } from '../../src/ui/theme';
import { useT } from '../../src/i18n/useT';
import { BookTile } from '../../src/ui/BookTile';
import { Cover } from '../../src/ui/Cover';
import { bookAssetUrl, useLibrary } from '../../src/ui/data';
import {
  BookmarkGlyph,
  CloseGlyph,
  HandDrawnArrowGlyph,
  PauseGlyph,
  PlayGlyph,
  SkipNextGlyph,
  SkipPrevGlyph,
  SpeakerGlyph,
} from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import { Sheet } from '../../src/ui/Sheet';
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
import { webCursor } from '../../src/ui/tokens';
import { playAudioSlice, useNarrationPlayer, type NarrationSpeed } from '../../src/platform/audio';
import { useSottoStore } from '../../src/state/store';
import { buildSavedWord } from '../../src/state/vocabulary';
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
  const pushToast = useSottoStore((s) => s.pushToast);

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
  const chapterKey = bookId && chapterId ? `${bookId}:${chapterId}` : undefined;
  const chapter = chapterKey ? chapters[chapterKey] : undefined;

  useEffect(() => {
    if (bookId && chapterId && chapterSummary)
      void loadChapter(bookId, chapterId, chapterSummary.file);
  }, [bookId, chapterId, chapterSummary, loadChapter]);

  const isDesktop = width >= 900;
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

  const chapterIndex = book?.chapters.findIndex((c) => c.id === chapterId) ?? -1;
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
    }
  };

  const report = () => {
    // ADVERSARIAL-REVIEW.md §2 "fakes / dead controls": this used to be a
    // mailto: to a domain that doesn't resolve to a Sotto inbox, so reports
    // went nowhere. Opens the repo's bug-report issue template instead.
    void Linking.openURL('https://github.com/nturl/sotto/issues/new?template=bug_report.md').catch(
      () => {
        pushToast(t('reader.reportFailed'));
      },
    );
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

  const translationPanel = !selectedToken ? (
    <Text role="caption" color="ink3" style={styles.emptyState}>
      {t('reader.emptyState')}
    </Text>
  ) : isSpanSelection && wholeSentence ? (
    <View style={styles.panelInner}>
      <View style={styles.panelHeaderRow}>
        <Text role="reading" style={styles.flexShrink}>
          {wholeSentence.text}
        </Text>
        {spanFirst?.startMs !== undefined && audioUri ? (
          <IconButton
            variant="ring"
            size={44}
            icon={<SpeakerGlyph size={18} color={colors.accent} />}
            accessibilityLabel={t('book.a11y.playNarration')}
            onPress={playSpanAudio}
          />
        ) : null}
      </View>
      <Text role="ui">{wholeSentenceTranslation}</Text>
      {wholeSentenceUsedFallback ? (
        <Text role="caption" color="ink3">
          {t('reader.translatedToEnglish')}
        </Text>
      ) : null}
      <View style={styles.panelActions}>
        <Pressable onPress={report} style={webCursor}>
          <Text role="caption" color="ink2">
            {t('reader.report')}
          </Text>
        </Pressable>
      </View>
    </View>
  ) : isSpanSelection ? (
    <View style={styles.panelInner}>
      <View style={styles.panelHeaderRow}>
        <Text role="heading" size={24} style={styles.flexShrink}>
          {spanDisplayText}
        </Text>
        {spanFirst?.startMs !== undefined && audioUri ? (
          <IconButton
            variant="ring"
            size={44}
            icon={<SpeakerGlyph size={18} color={colors.accent} />}
            accessibilityLabel={t('book.a11y.playNarration')}
            onPress={playSpanAudio}
          />
        ) : null}
      </View>
      <Text role="ui">{spanGlossLine ?? ''}</Text>
      {spanGlossFallback ? (
        <Text role="caption" color="ink3">
          {t('reader.translatedToEnglish')}
        </Text>
      ) : null}
      <View style={styles.panelActions}>
        <Pressable onPress={report} style={webCursor}>
          <Text role="caption" color="ink2">
            {t('reader.report')}
          </Text>
        </Pressable>
      </View>
    </View>
  ) : (
    <View style={styles.panelInner}>
      <View style={styles.panelHeaderRow}>
        <Text role="heading" size={24}>
          {selectedToken.token.text}
        </Text>
        {selectedToken.token.startMs !== undefined && audioUri ? (
          <IconButton
            variant="ring"
            size={44}
            icon={<SpeakerGlyph size={18} color={colors.accent} />}
            accessibilityLabel={t('book.a11y.playNarration')}
            onPress={() =>
              playAudioSlice(
                audioUri,
                selectedToken.token.startMs!,
                selectedToken.token.endMs ?? selectedToken.token.startMs! + 600,
              )
            }
          />
        ) : null}
      </View>
      {cjk && selectedToken.token.pinyin ? (
        <Text role="caption" color="ink2">
          {selectedToken.token.pinyin}
        </Text>
      ) : null}
      <Text role="ui">{glossText}</Text>
      {glossFallback ? (
        <Text role="caption" color="ink3">
          {t('reader.translatedToEnglish')}
        </Text>
      ) : null}

      <View style={styles.panelActions}>
        <Pressable
          onPress={() => toggleSaved(selectedToken.token, selectedToken.sentence)}
          accessibilityRole="button"
          accessibilityLabel={t('reader.save')}
          style={[styles.saveButton, isSaved && styles.saveButtonActive, webCursor]}
        >
          <BookmarkGlyph size={16} color={isSaved ? colors.ink : colors.ink2} />
          <Text role="ui" size={14} color={isSaved ? 'ink' : 'ink2'}>
            {isSaved ? t('reader.saved') : t('reader.save')}
          </Text>
        </Pressable>
        <Pressable onPress={() => setShowSentenceDetail((v) => !v)} style={webCursor}>
          <Text role="caption" color="ink2">
            {t('reader.details')}
          </Text>
        </Pressable>
        <Pressable onPress={report} style={webCursor}>
          <Text role="caption" color="ink2">
            {t('reader.report')}
          </Text>
        </Pressable>
      </View>

      {showSentenceDetail ? (
        <Text role="ui" size={14} color="ink2" style={styles.sentenceDetail}>
          {sentenceTranslation}
        </Text>
      ) : null}
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
      <View style={styles.transportRow}>
        <IconButton
          icon={<SkipPrevGlyph size={22} color={colors.ink} />}
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
          size={56}
          icon={
            narration.playing ? (
              <PauseGlyph size={22} color={colors.accent} />
            ) : (
              <PlayGlyph size={22} color={colors.accent} />
            )
          }
          accessibilityLabel={narration.playing ? t('reader.pause') : t('reader.play')}
          onPress={() => (narration.playing ? narration.pause() : narration.play())}
        />
        <Pressable onPress={() => narration.seekBy(10)} style={webCursor}>
          <Text role="mono">+10</Text>
        </Pressable>
        <IconButton
          icon={<SkipNextGlyph size={22} color={colors.ink} />}
          accessibilityLabel={t('reader.nextChapter')}
          onPress={() => {
            const next = book?.chapters[chapterIndex + 1];
            if (next) setChapterId(next.id);
          }}
        />
      </View>
      <View style={styles.transportMeta}>
        <Text role="mono" color="ink2">
          {formatClock(narration.positionMs)}
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
        <Text role="mono" color="ink2">
          -{formatClock(Math.max(0, narration.durationMs - narration.positionMs))}
        </Text>
      </View>
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
              {chapterSummary?.title ?? ''}
            </Text>
            <IconButton
              icon={<CloseGlyph size={20} color={colors.ink} />}
              accessibilityLabel={t('common.close')}
              onPress={() => router.back()}
            />
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

          {isDesktop ? transportView : null}
        </View>

        {isDesktop ? <View style={styles.desktopPanel}>{translationPanel}</View> : null}
      </View>

      {!isDesktop ? (
        <Sheet
          visible={!!selectedToken}
          style={styles.mobileSheet}
          bottomOffset={transportHeight}
          onHeightChange={setSheetHeight}
        >
          {translationPanel}
        </Sheet>
      ) : null}

      {!isDesktop ? transportView : null}
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
          art={book.cover}
          width={140}
          height={210}
          cutout
          svgUrl={book.svgUrl}
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
    body: {
      flex: 1,
      flexDirection: 'row',
    },
    // Fills all space left of the docked 360px panel; its children cap at
    // 620 individually (styles.passageCapped) so the passage reads as
    // left-aligned within this wrapper rather than centered or stretched to
    // the panel's edge (DESKTOP.md §5).
    passageWrapper: {
      flex: 1,
    },
    passageCapped: {
      maxWidth: 620,
    },
    scrollContent: {
      paddingTop: space.sm,
    },
    desktopPanel: {
      width: 360,
      borderLeftWidth: 1,
      borderLeftColor: colors.hairline,
      backgroundColor: colors.surface,
      padding: space.xl,
      // DESKTOP.md §5: docked right, sticky to the viewport while the
      // passage column scrolls past on the left.
      ...(Platform.OS === 'web' ? { position: 'sticky', top: 0 } : null),
    } as ViewStyle,
    mobileSheet: {
      maxHeight: '60%',
    },
    panelInner: {
      gap: space.sm,
    },
    panelHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    panelActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.lg,
      marginTop: space.sm,
    },
    saveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      backgroundColor: colors.surface2,
      borderRadius: radius.md,
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
    },
    saveButtonActive: {
      backgroundColor: colors.mark,
      borderWidth: 1.5,
      borderColor: colors.ink,
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
    transport: {
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
      backgroundColor: colors.surface,
      paddingHorizontal: space.gutter.phone,
      paddingTop: space.md,
      paddingBottom: space.lg,
      gap: space.sm,
    },
    // DESKTOP.md §5: transport docks to the bottom of the passage column
    // only (620 max), not the full viewport width under the panel too.
    transportDesktop: {
      maxWidth: 620,
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
    transportRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xl,
    },
    transportMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
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
