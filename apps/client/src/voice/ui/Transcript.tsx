/**
 * Transcript — F2 (run7/cards/F2-voice-screen.md directive 2): the voice
 * screen's middle section. Renders `session.captions` as learner/tutor
 * turns (not a caption strip), scrollable, latest turn kept in view.
 *
 * `notSpoken`/Replay affordance: `packages/voice`'s `CaptionEntry`-shaped
 * events grew a `notSpoken?: boolean` field in F1's in-flight work (a
 * sentence whose TTS failed but whose text still reached the transcript),
 * but that field is not yet threaded through `apps/client/src/state/
 * types.ts`'s `CaptionEntry` or `createStore.ts`'s `pushCaption` (neither
 * file is owned by this lane) — so it never reaches this component today.
 * This renders every turn as a normal spoken turn until that lands; see
 * F2-report.md for the exact addition needed.
 */
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { radius, space } from '@sotto/core/theme';
import { useT } from '../../i18n/useT';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import type { CaptionEntry } from '../../state/types';

export interface TranscriptProps {
  captions: CaptionEntry[];
}

export function Transcript({ captions }: TranscriptProps) {
  const t = useT();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Latest turn stays visible — the whole point of a transcript over a
    // 6-line caption strip is that the learner never loses the thread, but
    // the newest line still has to be the one they see without scrolling.
    scrollRef.current?.scrollToEnd({ animated: captions.length > 0 });
  }, [captions.length]);

  if (captions.length === 0) {
    return (
      <View style={styles.empty}>
        <Text role="caption" color="ink3">
          {t('voice.transcriptEmpty')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content}>
      {captions.map((c) => (
        <View
          key={c.id}
          style={[styles.turn, c.speaker === 'tutor' ? styles.turnTutor : styles.turnLearner]}
        >
          <Text role="mono" size={11} color="ink3" style={styles.speakerLabel}>
            {c.speaker === 'tutor' ? t('voice.tutorLabel') : t('voice.learnerLabel')}
          </Text>
          <Text role="ui" color="ink" style={styles.turnText}>
            {c.text}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      minHeight: 0,
    },
    content: {
      gap: space.sm,
      paddingVertical: space.sm,
    },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space.lg,
    },
    turn: {
      maxWidth: '86%',
      borderRadius: radius.md,
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
      gap: 2,
    },
    turnTutor: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    turnLearner: {
      alignSelf: 'flex-end',
      backgroundColor: colors.surface2,
    },
    speakerLabel: {
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    turnText: {
      lineHeight: 20,
    },
  });
}
