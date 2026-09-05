/**
 * Import progress (planning/design/IMPORT.md §4): per-stage progress via
 * SSE, "Read chapter 1" as soon as it lands, then "Book imported" once
 * everything is stored on-device.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import type { Book, Chapter } from '@sotto/core';
import { useT, type MessageKey } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';
import {
  fetchImportAudio,
  fetchImportResult,
  subscribeImportEvents,
  type ImportJobEvent,
} from '../../src/import/api';
import { registerImportJob } from '../../src/import/lazyNarrationRegistry';
import { storeAudioAsset } from '../../src/import/privateAudio';
import { useSottoStore } from '../../src/state/store';

type StageKey = 'parsing' | 'glossing' | 'translating' | 'narratingChapter1';
type StageState = 'pending' | 'active' | 'done';

const STAGE_ORDER: { key: StageKey; eventStage: ImportJobEvent['stage'] }[] = [
  { key: 'parsing', eventStage: 'parsing' },
  { key: 'glossing', eventStage: 'glossing' },
  { key: 'translating', eventStage: 'translating' },
  { key: 'narratingChapter1', eventStage: 'narrating' },
];

export default function ImportProgressScreen() {
  const t = useT();
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const addPrivateBook = useSottoStore((s) => s.addPrivateBook);

  const [stages, setStages] = useState<Record<StageKey, { state: StageState; percent: number }>>({
    parsing: { state: 'pending', percent: 0 },
    glossing: { state: 'pending', percent: 0 },
    translating: { state: 'pending', percent: 0 },
    narratingChapter1: { state: 'pending', percent: 0 },
  });
  const [bookDone, setBookDone] = useState<{ bookId: string; title: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const storedRef = useRef(false);

  useEffect(() => {
    if (!jobId) return;
    const unsubscribe = subscribeImportEvents(jobId, (event) => {
      if (event.stage === 'done') {
        if (event.status === 'error') {
          setFailed(true);
          return;
        }
        void finish();
        return;
      }
      const entry = STAGE_ORDER.find((s) => s.eventStage === event.stage);
      if (!entry) return;
      const percent = event.total > 0 ? Math.round((event.done / event.total) * 100) : 0;
      const isDone = event.total > 0 && event.done >= event.total;
      setStages((prev) => ({
        ...prev,
        [entry.key]: { state: isDone ? 'done' : 'active', percent },
      }));
    });

    async function finish(): Promise<void> {
      if (storedRef.current || !jobId) return;
      storedRef.current = true;
      const result = await fetchImportResult(jobId);
      if (!result) {
        setFailed(true);
        return;
      }
      const book = result.book as Book;
      const chapters = result.chapters as Chapter[];
      await Promise.all(
        book.chapters
          .filter((c) => c.audio)
          .map(async (c) => {
            const file = (c.audio as string).replace('audio/', '');
            const bytes = await fetchImportAudio(jobId, file);
            if (bytes) await storeAudioAsset(book.bookId, file, bytes);
          }),
      );
      await addPrivateBook(book, chapters);
      registerImportJob(book.bookId, jobId);
      setStages({
        parsing: { state: 'done', percent: 100 },
        glossing: { state: 'done', percent: 100 },
        translating: { state: 'done', percent: 100 },
        narratingChapter1: { state: 'done', percent: 100 },
      });
      setBookDone({ bookId: book.bookId, title: book.title });
    }

    return unsubscribe;
  }, [jobId, addPrivateBook]);

  if (failed) {
    return (
      <Shell>
        <View style={styles.center}>
          <Card style={styles.failureCard}>
            <Text role="heading" size={20} style={styles.centerText}>
              {t('import.error.invalid')}
            </Text>
            <Button
              variant="secondary"
              title={t('import.failure.chooseAnother')}
              onPress={() => router.replace('/import')}
            />
          </Card>
        </View>
      </Shell>
    );
  }

  return (
    <Shell>
      <View style={styles.stageCard}>
        {STAGE_ORDER.map((entry, index) => (
          <View
            key={entry.key}
            style={[styles.stageRow, index < STAGE_ORDER.length - 1 && styles.stageRowDivider]}
          >
            <Text role="ui" size={16}>
              {t(`import.progress.stage.${entry.key}` as MessageKey)}
            </Text>
            {stages[entry.key].state === 'pending' ? (
              <Text role="caption" color="ink3">
                {t('import.progress.state.pending')}
              </Text>
            ) : stages[entry.key].state === 'active' ? (
              <Text role="mono">{stages[entry.key].percent} %</Text>
            ) : (
              <Text role="mono">✓</Text>
            )}
          </View>
        ))}
      </View>

      {/* Chapter 1's narration is the last step importBook does before the
          job reports 'done' (opts.narrate: 'first' narrates only chapter 1,
          synchronously, as the pipeline's final stage — see pipeline.ts) —
          so in practice this "chapter 1 ready" state and the "book done"
          state below always arrive together for the free-tier default.
          Rendered as two blocks anyway, matching IMPORT.md §4, for when a
          future caller passes narrate: 'all' and the gap becomes real. */}
      {bookDone ? (
        <>
          <Card style={styles.readyCard}>
            <Text role="heading" size={20}>
              {t('import.progress.readReady.title')}
            </Text>
            <Text role="caption" color="ink2">
              {t('import.progress.readReady.body')}
            </Text>
            <Button
              variant="secondary"
              title={t('import.progress.readReady.button')}
              onPress={() => router.push(`/reader/${bookDone.bookId}`)}
            />
          </Card>
          <View style={styles.doneWrap}>
            <Text role="heading" size={20}>
              {t('import.progress.done.title')}
            </Text>
            <Button
              title={t('import.progress.done.button')}
              onPress={() => router.replace(`/book/${bookDone.bookId}`)}
            />
          </View>
        </>
      ) : null}
    </Shell>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    stageCard: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.hairline,
      maxWidth: 480,
    },
    stageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: space.lg,
    },
    stageRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    },
    readyCard: {
      marginTop: space.lg,
      gap: space.sm,
      maxWidth: 480,
    },
    doneWrap: {
      marginTop: space.lg,
      gap: space.md,
      maxWidth: 480,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centerText: {
      textAlign: 'center',
    },
    failureCard: {
      gap: space.lg,
      alignItems: 'center',
      maxWidth: 420,
    },
  });
}
