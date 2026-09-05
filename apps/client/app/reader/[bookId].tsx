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
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getLanguage, type Block, type Chapter, type Sentence, type Token } from '@sotto/core';
import { colors, radius, space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { BookTile } from '../../src/ui/BookTile';
import { Cover } from '../../src/ui/Cover';
import { bookAssetUrl, useLibrary } from '../../src/ui/data';
import {
  BookmarkGlyph,
  CloseGlyph,
  PauseGlyph,
  PlayGlyph,
  SkipNextGlyph,
  SkipPrevGlyph,
  SpeakerGlyph,
} from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import { Sheet } from '../../src/ui/Sheet';
import { SpeechFillText, type SpeechSentence } from '../../src/ui/SpeechFillText';
import { Text } from '../../src/ui/Text';
import { webCursor } from '../../src/ui/tokens';
import { playAudioSlice, useNarrationPlayer, type NarrationSpeed } from '../../src/platform/audio';
import { useSottoStore } from '../../src/state/store';
import { buildSavedWord } from '../../src/state/vocabulary';

const SPEEDS: NarrationSpeed[] = [0.75, 1, 1.25];

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
  const [selectedToken, setSelectedToken] = useState<{ token: Token; sentence: Sentence } | null>(
    null,
  );
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

  const chapterIndex = book?.chapters.findIndex((c) => c.id === chapterId) ?? -1;
  const isLastChapter = book ? chapterIndex === book.chapters.length - 1 : false;

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
      if (percentComplete >= 0.999 && isLastChapter) {
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
  useEffect(() => {
    if (
      narration.durationMs > 0 &&
      narration.positionMs >= narration.durationMs - 250 &&
      narration.playing
    ) {
      persistProgress(1, narration.positionMs);
    }
  }, [narration.positionMs, narration.durationMs, narration.playing, persistProgress]);

  const lastFractionRef = useRef(existingProgress?.percentComplete ?? 0);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const now = Date.now();
      if (now - scrollThrottle.current < 300) return;
      scrollThrottle.current = now;
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const maxScroll = Math.max(1, contentSize.height - layoutMeasurement.height);
      const fraction = Math.min(1, Math.max(0, contentOffset.y / maxScroll));
      lastFractionRef.current = fraction;
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
    const subject = encodeURIComponent(
      `Sotto — ${book?.title ?? bookId} / ${chapterSummary?.title ?? ''}`,
    );
    const body = encodeURIComponent(
      `Chapter: ${chapterSummary?.title ?? ''}\nToken: ${selectedToken?.token.text ?? ''}\n`,
    );
    void Linking.openURL(`mailto:feedback@sotto.app?subject=${subject}&body=${body}`).catch(() => {
      pushToast(t('reader.reportFailed'));
    });
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

  const translationPanel = selectedToken ? (
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
  ) : (
    <Text role="caption" color="ink3" style={styles.emptyState}>
      {t('reader.emptyState')}
    </Text>
  );

  return (
    <View style={styles.root} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={[styles.header, { paddingHorizontal: space.gutter.phone }]}>
        <Text role="mono" numberOfLines={1} style={styles.chapterLabel}>
          {chapterSummary?.title ?? ''}
        </Text>
        <IconButton
          icon={<CloseGlyph size={20} />}
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
        />
      </View>

      <View style={styles.body}>
        <ScrollView
          style={styles.flex}
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
          {chapter?.blocks.map((block) => (
            <ReaderBlock
              key={block.id}
              block={block}
              cjk={!!cjk}
              savedTokenIds={savedTokenIds}
              selectedTokenId={selectedToken?.token.id}
              narratingIndex={narratingIndex}
              flatTokens={flatTokens}
              onSelect={(token, sentence) => setSelectedToken({ token, sentence })}
              onLongPressSentence={(sentence) => {
                setSelectedToken({ token: sentence.tokens[0]!, sentence });
                setShowSentenceDetail(true);
              }}
            />
          ))}
        </ScrollView>

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

      {audioUri ? (
        <View style={styles.transport} onLayout={(e) => setTransportHeight(e.nativeEvent.layout.height)}>
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
                  <View
                    style={[styles.progressFill, { width: `${Math.round(fraction * 100)}%` }]}
                  />
                </View>
              );
            })}
          </View>
          <View style={styles.transportRow}>
            <IconButton
              icon={<SkipPrevGlyph size={22} />}
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
              icon={<SkipNextGlyph size={22} />}
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
      ) : null}
    </View>
  );
}

/** Builds the SpeechFillText input for one paragraph (block): every token's
 * `spoken` flag is resolved against the chapter-wide flatTokens/narratingIndex
 * (a block only holds a subset of sentences, so each token's position within
 * `flatTokens` — not its position within the block — is what "spoken"
 * narration progress compares against). */
function ReaderBlock({
  block,
  cjk,
  savedTokenIds,
  selectedTokenId,
  narratingIndex,
  flatTokens,
  onSelect,
  onLongPressSentence,
}: {
  block: Block;
  cjk: boolean;
  savedTokenIds: Set<string>;
  selectedTokenId: string | undefined;
  narratingIndex: number;
  flatTokens: Token[];
  onSelect: (token: Token, sentence: Sentence) => void;
  onLongPressSentence: (sentence: Sentence) => void;
}) {
  const sentences: SpeechSentence[] = block.sentences.map((sentence) => ({
    id: sentence.id,
    tokens: sentence.tokens.map((token) => {
      const globalIndex = flatTokens.indexOf(token);
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

  return (
    <View style={styles.block}>
      <SpeechFillText
        sentences={sentences}
        selectedId={selectedTokenId}
        cjk={cjk}
        underline
        onPressToken={(speechToken, speechSentence) => {
          const sentence = block.sentences.find((s) => s.id === speechSentence.id);
          const token = sentence?.tokens.find((tk) => tk.id === speechToken.id);
          if (sentence && token) onSelect(token, sentence);
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
  return (
    <View style={[styles.root, styles.completionRoot]}>
      <View style={styles.completionHeader}>
        <View />
        <IconButton
          icon={<CloseGlyph size={20} />}
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
      <Text role="display" size={24} style={styles.completionArrow}>
        ↓
      </Text>
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

const styles = StyleSheet.create({
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
  scrollContent: {
    paddingTop: space.sm,
  },
  block: {
    marginBottom: space.lg,
  },
  desktopPanel: {
    width: 360,
    borderLeftWidth: 1,
    borderLeftColor: colors.hairline,
    backgroundColor: colors.surface,
    padding: space.xl,
  },
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
  transport: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surface,
    paddingHorizontal: space.gutter.phone,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
  },
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
