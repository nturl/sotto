/**
 * Vocabulary — DESIGN.md "Vocabulary". CONTRACTS §6 route: /(tabs)/vocabulary.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { SavedWord } from '@sotto/core';
import { colors, radius, space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { Cover } from '../../src/ui/Cover';
import { useLibrary } from '../../src/ui/data';
import { ChevronRightGlyph, SpeakerGlyph, TrashGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import { MarkerStroke } from '../../src/ui/MarkerStroke';
import { Sheet } from '../../src/ui/Sheet';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { webCursor } from '../../src/ui/tokens';
import { playAudioSlice } from '../../src/platform/audio';
import { bookAssetUrl } from '../../src/ui/data';
import {
  selectBooksWithVocabulary,
  selectDueWords,
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

export default function VocabularyScreen() {
  const t = useT();
  const router = useRouter();
  const library = useLibrary();
  const savedWords = useSottoStore((s) => s.savedWords);
  const removeWord = useSottoStore((s) => s.removeWord);
  const saveWord = useSottoStore((s) => s.saveWord);
  const books = useSottoStore((s) => s.books);
  const loadBook = useSottoStore((s) => s.loadBook);
  const bookLocale = useSottoStore((s) => s.bookLocale);
  const loadChapter = useSottoStore((s) => s.loadChapter);
  const chapters = useSottoStore((s) => s.chapters);

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
            art={selectedBook.cover}
            width={40}
            height={60}
            svgUrl={selectedBook.svgUrl}
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

      <View style={styles.list}>
        {words.map((word) => (
          <WordCard
            key={word.id}
            word={word}
            hasAudio={!!book?.chapters.find((c) => c.id === word.chapterId)?.audio}
            onPlay={() => playWord(word)}
            onDelete={() => deleteWord(word)}
          />
        ))}
      </View>

      {selectedBookId && words.length > 0 ? (
        <View style={styles.ctaWrap}>
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
                <Cover
                  art={b.cover}
                  width={32}
                  height={48}
                  svgUrl={b.svgUrl}
                  accessibilityLabel={b.title}
                />
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

const styles = StyleSheet.create({
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
  list: {
    gap: space.sm,
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
