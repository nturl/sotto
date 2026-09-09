/**
 * Transcript — F2 (run7/cards/F2-voice-screen.md directive 2): the voice
 * screen's middle section. Renders `session.captions` as learner/tutor
 * turns (not a caption strip), scrollable, latest turn kept in view.
 *
 * Run 9 lane D directives 2 and 4: the newest final learner turn (on the
 * paths where speech-to-text runs on this device) carries a "Not what you
 * said? Type it" link that prefills the text fallback with what STT heard,
 * so a misheard turn is correctable instead of just wrong; and lane A's
 * fixed English "didn't catch that" caption — posted from a worker that
 * has no locale — is rendered as the localized `voice.didNotCatch`.
 *
 * `notSpoken`/Replay affordance (run7/G directive 1(b), finishing what F2
 * flagged as blocked): a caption whose speech synthesis failed carries
 * `notSpoken: true` (threaded from `packages/voice`'s `VoiceEvent` through
 * `state/types.ts`'s `CaptionEntry`) — this renders a small label plus a
 * Replay button next to that turn instead of showing it as a normal spoken
 * one, calling `onReplaySentence(text)` (wired to
 * `session.replaySentence` in `app/voice/[bookId].tsx`, which
 * re-synthesizes and plays that exact sentence).
 */
import { Platform, Pressable, ScrollView, StyleSheet, View, type TextStyle } from 'react-native';
import { useEffect, useRef } from 'react';
import { radius, space } from '@sotto/core/theme';
import { useT } from '../../i18n/useT';
import { ReplayGlyph } from '../../ui/Glyphs';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { webCursor } from '../../ui/tokens';
import type { CaptionEntry } from '../../state/types';
import { isDidNotCatchCaption } from '../didNotCatch';
import { segmentTranscriptWords, type TranscriptWordSegment } from '../transcriptVocabulary';

export interface TranscriptProps {
  captions: CaptionEntry[];
  /** run7/G directive 1(b): called with a `notSpoken` turn's own text when
   * its Replay button is pressed. Optional so this component still renders
   * plainly wherever no replay action is wired. */
  onReplaySentence?: (text: string) => void;
  /** Run 9 lane D directive 2: the id of the one learner caption that gets
   * the "type it instead" affordance (`correctableCaptionId`), or null. */
  correctableId?: string | null;
  /** Called with that caption's text when the affordance is pressed. */
  onCorrectCaption?: (text: string) => void;
  sourceLocale?: string;
  onWordPress?: (word: TranscriptWordSegment) => void;
  isWordSaved?: (word: TranscriptWordSegment) => boolean;
}

export function Transcript({
  captions,
  onReplaySentence,
  correctableId,
  onCorrectCaption,
  sourceLocale = 'en-US',
  onWordPress,
  isWordSaved,
}: TranscriptProps) {
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
      {onWordPress ? (
        <Text role="caption" size={11} color="ink3">
          {t('voice.vocabulary.hint')}
        </Text>
      ) : null}
      {captions.map((c) => (
        <View
          key={c.id}
          style={[styles.turn, c.speaker === 'tutor' ? styles.turnTutor : styles.turnLearner]}
        >
          <Text role="mono" size={11} color="ink3" style={styles.speakerLabel}>
            {c.speaker === 'tutor' ? t('voice.tutorLabel') : t('voice.learnerLabel')}
          </Text>
          <Text role="ui" color="ink" style={styles.turnText} testID={`transcript-caption-${c.id}`}>
            {c.speaker === 'tutor' && isDidNotCatchCaption(c.text)
              ? t('voice.didNotCatch')
              : c.final && onWordPress
                ? segmentTranscriptWords(c.text, sourceLocale).map((word) => (
                    <Text
                      key={word.start}
                      role="ui"
                      selectable={false}
                      accessibilityRole={word.isWord ? 'button' : undefined}
                      accessibilityLabel={
                        word.isWord ? t('voice.vocabulary.select', { word: word.text }) : undefined
                      }
                      onPress={word.isWord ? () => onWordPress(word) : undefined}
                      {...(Platform.OS === 'web' && word.isWord
                        ? {
                            tabIndex: 0,
                            onKeyDown: (event: { key: string; preventDefault(): void }) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onWordPress(word);
                              }
                            },
                          }
                        : {})}
                      style={[
                        styles.turnText,
                        word.isWord && webCursor,
                        word.isWord &&
                          isWordSaved?.(word) && {
                            textDecorationLine: 'underline',
                            textDecorationColor: colors.accent,
                          },
                        Platform.OS === 'web' &&
                          ({ userSelect: 'none', WebkitTouchCallout: 'none' } as TextStyle),
                      ]}
                    >
                      {word.text}
                    </Text>
                  ))
                : c.text}
          </Text>
          {c.id === correctableId && onCorrectCaption ? (
            <Pressable
              onPress={() => onCorrectCaption(c.text)}
              accessibilityRole="button"
              accessibilityLabel={t('voice.correctCaption')}
              style={webCursor}
            >
              <Text role="caption" color="accent">
                {t('voice.correctCaption')}
              </Text>
            </Pressable>
          ) : null}
          {c.notSpoken ? (
            <View style={styles.notSpokenRow}>
              <Text role="caption" color="warn">
                {t('voice.notSpoken')}
              </Text>
              <Pressable
                onPress={() => onReplaySentence?.(c.text)}
                accessibilityRole="button"
                accessibilityLabel={t('voice.replay')}
                style={[styles.notSpokenReplay, webCursor]}
              >
                <ReplayGlyph size={14} color={colors.ink} />
                <Text role="caption" color="ink">
                  {t('voice.replay')}
                </Text>
              </Pressable>
            </View>
          ) : null}
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
    notSpokenRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      marginTop: 2,
    },
    notSpokenReplay: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
  });
}
