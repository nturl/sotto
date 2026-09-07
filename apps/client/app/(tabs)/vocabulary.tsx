/**
 * Vocabulary — DESIGN.md "Vocabulary". CONTRACTS §6 route: /(tabs)/vocabulary.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import type { SavedWord } from '@sotto/core';
import { radius, space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { Cover } from '../../src/ui/Cover';
import { useLibrary, usePreferences } from '../../src/ui/data';
import { ChevronRightGlyph, SpeakerGlyph, TrashGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import { MarkerStroke } from '../../src/ui/MarkerStroke';
import { useBookGridTier } from '../../src/ui/Rail';
import { Sheet } from '../../src/ui/Sheet';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';
import { playAudioSlice } from '../../src/platform/audio';
import { bookAssetUrl } from '../../src/ui/data';
import {
  selectBooksWithVocabulary,
  selectDueWords,
  selectSavedWordsForLocale,
  selectVocabularyForBook,
} from '../../src/state/selectors';
import { useSottoStore } from '../../src/state/store';

function WordCard({
  word,
  hasAudio,
  onPlay,
  onDelete,
}: {
  word: SavedWord;
  hasAudio: boolean;
  onPlay: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.wordCard}>
      {hasAudio ? (
        <IconButton
          variant="ring"
          size={40}
          icon={<SpeakerGlyph size={16} color={colors.accent} />}
          accessibilityLabel={word.sourceWord}
          onPress={onPlay}
        />
      ) : (
        <View style={{ width: 40, height: 40 }} />
      )}
      <View style={styles.wordText}>
        <View style={styles.wordWrap}>
          <Text role="heading" size={20}>
            {word.sourceWord}
          </Text>
          <MarkerStroke active height={6} />
        </View>
        <Text role="ui" size={14} color="ink2">
          {word.translation}
        </Text>
      </View>
      <IconButton
        icon={<TrashGlyph size={18} color={colors.ink3} />}
        accessibilityLabel="delete"
        onPress={onDelete}
      />
    </View>
  );
}

/**
 * DESKTOP.md §7: word cards in a grid, same column counts as Home/Library
 * (3 at 900-1199, 4 at >= 1200); card width flexes to the column (unlike
 * BookTile's fixed cover sizes) so the column width is measured rather than
 * a fixed token.
 */
function WordGrid({
  words,
  renderWord,
}: {
  words: SavedWord[];
  renderWord: (word: SavedWord) => React.ReactNode;
}) {
  const grid = useBookGridTier();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (!grid) {
    return <View style={staticStyles.list}>{words.map((word) => renderWord(word))}</View>;
  }

  const itemWidth =
    width > 0 ? (width - grid.columnGap * (grid.columns - 1)) / grid.columns : undefined;

  return (
    <View
      onLayout={onLayout}
      style={[staticStyles.grid, { columnGap: grid.columnGap, rowGap: grid.rowGap }]}
    >
      {itemWidth
        ? words.map((word) => (
            <View key={word.id} style={{ width: itemWidth }}>
              {renderWord(word)}
            </View>
          ))
        : null}
    </View>
  );
}

export default function VocabularyScreen() {
  const t = useT();
  const router = useRouter();
  const library = useLibrary();
  const preferences = usePreferences();
  const allSavedWords = useSottoStore((s) => s.savedWords);
  const packs = useSottoStore((s) => s.packs);
  // CONTRACTS verification row 24: only show words for books in the
  // currently-selected learning locale (see selectSavedWordsForLocale) —
  // words saved under another locale stay stored, just hidden here.
  const savedWords = useMemo(
    () => selectSavedWordsForLocale(allSavedWords, packs, preferences.learningLocale),
    [allSavedWords, packs, preferences.learningLocale],
  );
  const removeWord = useSottoStore((s) => s.removeWord);
  const saveWord = useSottoStore((s) => s.saveWord);
  const books = useSottoStore((s) => s.books);
  const loadBook = useSottoStore((s) => s.loadBook);
  const bookLocale = useSottoStore((s) => s.bookLocale);
  const loadChapter = useSottoStore((s) => s.loadChapter);
  const chapters = useSottoStore((s) => s.chapters);
  const { isDesktop } = useLayoutMetrics();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const bookIds = useMemo(() => selectBooksWithVocabulary(savedWords), [savedWords]);
  const [selectedBookId, setSelectedBookId] = useState<string | undefined>(bookIds[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingUndo, setPendingUndo] = useState<SavedWord | null>(null);

  useEffect(() => {
    if (!selectedBookId && bookIds[0]) setSelectedBookId(bookIds[0]);
  }, [bookIds, selectedBookId]);

  useEffect(() => {
    if (selectedBookId) void loadBook(selectedBookId);
  }, [selectedBookId, loadBook]);

  useEffect(() => {
    if (!pendingUndo) return undefined;
    const timer = setTimeout(() => setPendingUndo(null), 4000);
    return () => clearTimeout(timer);
  }, [pendingUndo]);

  const words = selectedBookId ? selectVocabularyForBook(savedWords, selectedBookId) : [];
  const dueWords = selectDueWords(words);
  const reviewCount = dueWords.length > 0 ? dueWords.length : words.length;
  const selectedBook = selectedBookId ? library.byId(selectedBookId) : undefined;
  const book = selectedBookId ? books[selectedBookId] : undefined;

  const playWord = (word: SavedWord) => {
    const locale = bookLocale(word.bookId);
    const chapterSummary = book?.chapters.find((c) => c.id === word.chapterId);
    if (!locale || !chapterSummary?.audio) return;
    const key = `${word.bookId}:${word.chapterId}`;
    const chapter = chapters[key];
    const uri = bookAssetUrl(word.bookId, chapterSummary.audio, locale);
    const play = (startMs?: number, endMs?: number) => {
      if (startMs === undefined) return;
      playAudioSlice(uri, startMs, endMs ?? startMs + 700);
    };
    if (chapter) {
      const token = chapter.blocks
        .flatMap((b) => b.sentences.flatMap((s) => s.tokens))
        .find((tk) => tk.id === word.tokenId);
      play(token?.startMs, token?.endMs);
    } else {
      void loadChapter(word.bookId, word.chapterId, chapterSummary.file).then((c) => {
        const token = c?.blocks
          .flatMap((b) => b.sentences.flatMap((s) => s.tokens))
          .find((tk) => tk.id === word.tokenId);
        play(token?.startMs, token?.endMs);
      });
    }
  };

  const deleteWord = (word: SavedWord) => {
    removeWord({ savedWordId: word.id });
    setPendingUndo(word);
  };

  const undoDelete = () => {
    if (pendingUndo) {
      saveWord(pendingUndo);
      setPendingUndo(null);
    }
  };

  return (
    <Shell contentBottomPadding={100}>
      <Text role="display" style={styles.title}>
        {t('tabs.vocabulary')}
      </Text>

      {selectedBook ? (
        <Pressable onPress={() => setPickerOpen(true)} style={[styles.bookCard, webCursor]}>
          <Cover
            book={selectedBook}
            width={40}
            height={60}
            accessibilityLabel={selectedBook.title}
          />
          <View style={styles.bookCardText}>
            <Text role="ui" size={15}>
              {selectedBook.title}
            </Text>
            <Text role="caption" color="ink2">
              {t('vocabulary.wordCount', { count: words.length })}
            </Text>
          </View>
          <ChevronRightGlyph size={14} color={colors.ink2} />
        </Pressable>
      ) : (
        <Text role="caption" color="ink3" style={styles.empty}>
          {t('vocabulary.empty')}
        </Text>
      )}

      <WordGrid
        words={words}
        renderWord={(word) => (
          <WordCard
            key={word.id}
            word={word}
            hasAudio={!!book?.chapters.find((c) => c.id === word.chapterId)?.audio}
            onPlay={() => playWord(word)}
            onDelete={() => deleteWord(word)}
          />
        )}
      />

      {selectedBookId && words.length > 0 ? (
        <View style={[styles.ctaWrap, isDesktop && styles.ctaWrapDesktop]}>
          {dueWords.length === 0 ? (
            <Text role="caption" color="ink3" style={styles.ctaCaption}>
              {t('vocabulary.noneDue')}
            </Text>
          ) : null}
          <Button
            title={t('vocabulary.startReview', { count: reviewCount })}
            onPress={() => router.push(`/review?bookId=${selectedBookId}`)}
          />
        </View>
      ) : null}

      <Sheet visible={pickerOpen}>
        <View style={styles.pickerList}>
          {bookIds.map((id) => {
            const b = library.byId(id);
            if (!b) return null;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  setSelectedBookId(id);
                  setPickerOpen(false);
                }}
                style={[styles.pickerRow, webCursor]}
              >
                <Cover book={b} width={32} height={48} accessibilityLabel={b.title} />
                <Text role="ui" size={15}>
                  {b.title}
                </Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setPickerOpen(false)} style={webCursor}>
            <Text role="ui" color="ink2" style={styles.pickerClose}>
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>
      </Sheet>

      {pendingUndo ? (
        <View style={styles.undoToast}>
          <Text role="ui" color="surface">
            {t('vocabulary.deleted')}
          </Text>
          <Pressable onPress={undoDelete} style={webCursor}>
            <Text role="uiButton" color="surface">
              {t('common.undo')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Shell>
  );
}

// No color tokens — safe to share across schemes without re-invoking.
const staticStyles = StyleSheet.create({
  list: {
    gap: space.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    title: {
      marginBottom: space.lg,
    },
    bookCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: space.md,
      marginBottom: space.xl,
    },
    bookCardText: {
      flex: 1,
      gap: 2,
    },
    empty: {
      marginTop: space.xxxl,
      textAlign: 'center',
    },
    wordCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.md,
      padding: space.md,
    },
    wordText: {
      flex: 1,
      gap: 4,
    },
    wordWrap: {
      alignSelf: 'flex-start',
      position: 'relative',
    },
    ctaWrap: {
      marginTop: space.xl,
      gap: space.sm,
    },
    // DESKTOP.md §7: the CTA hugs the text-column measure it follows (max
    // 400), not the full grid width.
    ctaWrapDesktop: {
      maxWidth: 400,
    },
    ctaCaption: {
      textAlign: 'center',
    },
    pickerList: {
      gap: space.sm,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingVertical: space.sm,
    },
    pickerClose: {
      textAlign: 'center',
      paddingVertical: space.md,
    },
    undoToast: {
      position: 'absolute',
      bottom: space.xl,
      left: space.xl,
      right: space.xl,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.ink,
      borderRadius: radius.md,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      zIndex: 11,
    },
  });
}
