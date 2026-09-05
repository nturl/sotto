/**
 * Review — DESIGN.md "Review". CONTRACTS §6 route: /review?bookId=.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReviewRating } from '@sotto/core';
import { colors, radius, space } from '@sotto/core/theme';
import { useT } from '../src/i18n/useT';
import { Button } from '../src/ui/Button';
import { IconButton } from '../src/ui/IconButton';
import { CloseGlyph, SpeakerGlyph } from '../src/ui/Glyphs';
import { Shell, useLayoutMetrics } from '../src/ui/Shell';
import { Text } from '../src/ui/Text';
import { webCursor } from '../src/ui/tokens';
import { playAudioSlice } from '../src/platform/audio';
import { bookAssetUrl } from '../src/ui/data';
import { selectDueWords, selectVocabularyForBook } from '../src/state/selectors';
import { useSottoStore } from '../src/state/store';

const RATINGS: Array<{ value: ReviewRating; key: 'again' | 'hard' | 'easy' }> = [
  { value: 'again', key: 'again' },
  { value: 'hard', key: 'hard' },
  { value: 'easy', key: 'easy' },
];

export default function ReviewScreen() {
  const t = useT();
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId?: string }>();
  const savedWords = useSottoStore((s) => s.savedWords);
  const rateWord = useSottoStore((s) => s.rateWord);
  const bookLocale = useSottoStore((s) => s.bookLocale);
  const books = useSottoStore((s) => s.books);
  const chapters = useSottoStore((s) => s.chapters);
  const { isDesktop } = useLayoutMetrics();

  const scoped = bookId ? selectVocabularyForBook(savedWords, bookId) : savedWords;
  const [sessionKey, setSessionKey] = useState(0);
  const queue = useMemo(() => {
    const due = selectDueWords(scoped);
    return due.length > 0 ? due : scoped;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, bookId]);

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [counts, setCounts] = useState({ again: 0, hard: 0, easy: 0 });

  const current = queue[index];
  const done = index >= queue.length;

  const playCurrent = () => {
    if (!current) return;
    const locale = bookLocale(current.bookId);
    const book = books[current.bookId];
    const chapterSummary = book?.chapters.find((c) => c.id === current.chapterId);
    if (!locale || !chapterSummary?.audio) return;
    const chapter = chapters[`${current.bookId}:${current.chapterId}`];
    const token = chapter?.blocks
      .flatMap((b) => b.sentences.flatMap((s) => s.tokens))
      .find((tk) => tk.id === current.tokenId);
    if (token?.startMs === undefined) return;
    playAudioSlice(
      bookAssetUrl(current.bookId, chapterSummary.audio, locale),
      token.startMs,
      token.endMs ?? token.startMs + 700,
    );
  };

  const rate = (rating: ReviewRating) => {
    if (!current) return;
    rateWord(current.id, rating);
    setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  const restart = () => {
    setSessionKey((k) => k + 1);
    setIndex(0);
    setRevealed(false);
    setCounts({ again: 0, hard: 0, easy: 0 });
  };

  if (queue.length === 0) {
    return (
      <Shell>
        <View style={styles.headerRow}>
          <View />
          <IconButton
            icon={<CloseGlyph size={20} />}
            accessibilityLabel={t('common.close')}
            onPress={() => router.back()}
          />
        </View>
        <Text role="heading" style={styles.centerText}>
          {t('review.empty')}
        </Text>
      </Shell>
    );
  }

  if (done) {
    const summary = (
      <View style={styles.summaryCard}>
        <Text role="heading" style={styles.centerText}>
          {t('review.summaryTitle')}
        </Text>
        <Text role="ui" style={styles.centerText}>
          {t('review.summaryCounts', {
            again: counts.again,
            hard: counts.hard,
            easy: counts.easy,
          })}
        </Text>
        <Button title={t('review.restart')} onPress={restart} />
      </View>
    );
    return (
      <Shell>
        {isDesktop ? (
          <>
            <View style={styles.desktopCloseRow}>
              <IconButton
                icon={<CloseGlyph size={20} />}
                accessibilityLabel={t('common.close')}
                onPress={() => router.back()}
              />
            </View>
            <View style={styles.desktopCenter}>{summary}</View>
          </>
        ) : (
          <>
            <View style={styles.headerRow}>
              <View />
              <IconButton
                icon={<CloseGlyph size={20} />}
                accessibilityLabel={t('common.close')}
                onPress={() => router.back()}
              />
            </View>
            {summary}
          </>
        )}
      </Shell>
    );
  }

  const body = (
    <>
      <View style={styles.card}>
        <View style={styles.wordRow}>
          <Text role="display" size={30}>
            {current!.sourceWord}
          </Text>
          <IconButton
            variant="ring"
            icon={<SpeakerGlyph size={18} color={colors.accent} />}
            accessibilityLabel={t('book.a11y.playNarration')}
            onPress={playCurrent}
          />
        </View>

        {revealed ? (
          <Text role="ui" size={17} style={styles.translation}>
            {current!.translation}
          </Text>
        ) : (
          <Text
            role="uiButton"
            color="accent"
            style={[styles.reveal, webCursor]}
            onPress={() => setRevealed(true)}
          >
            {t('review.reveal')}
          </Text>
        )}
      </View>

      <View style={styles.ratings}>
        {RATINGS.map((r) => (
          <Text
            key={r.key}
            role="uiButton"
            onPress={() => rate(r.value)}
            style={[styles.ratingButton, webCursor]}
          >
            {t(`review.rating.${r.key}` as const)}
          </Text>
        ))}
      </View>

      {bookId ? (
        <Button
          variant="secondary"
          title={t('review.discussOutLoud')}
          onPress={() => router.push(`/voice/${bookId}?mode=discuss&review=1`)}
          style={styles.discussButton}
        />
      ) : null}
    </>
  );

  // DESKTOP.md §7: a single card centered in the content region, max 480px
  // — never stretched to the 760/1040 content width. The close X stays
  // top-right of the full content region; the progress label centers to
  // the same 480px measure as the card.
  if (isDesktop) {
    return (
      <Shell>
        <View style={styles.desktopCloseRow}>
          <IconButton
            icon={<CloseGlyph size={20} />}
            accessibilityLabel={t('common.close')}
            onPress={() => router.back()}
          />
        </View>
        <View style={styles.desktopCenter}>
          <Text role="mono" color="ink2" style={styles.desktopProgress}>
            {t('review.progress', { index: index + 1, total: queue.length })}
          </Text>
          {body}
        </View>
      </Shell>
    );
  }

  return (
    <Shell>
      <View style={styles.headerRow}>
        <Text role="mono" color="ink2">
          {t('review.progress', { index: index + 1, total: queue.length })}
        </Text>
        <IconButton
          icon={<CloseGlyph size={20} />}
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
        />
      </View>

      {body}
    </Shell>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xl,
  },
  centerText: {
    textAlign: 'center',
    marginTop: space.xxxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.xxl,
    alignItems: 'center',
    gap: space.md,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  reveal: {
    marginTop: space.sm,
  },
  translation: {
    marginTop: space.sm,
    textAlign: 'center',
  },
  ratings: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xl,
  },
  ratingButton: {
    flex: 1,
    textAlign: 'center',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingVertical: space.md,
  },
  discussButton: {
    marginTop: space.xl,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.xxl,
    gap: space.lg,
    marginTop: space.xxxl,
  },
  desktopCloseRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: space.xl,
  },
  desktopCenter: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 480,
  },
  desktopProgress: {
    textAlign: 'center',
    marginBottom: space.md,
  },
});
